// -----------------------------------------------------------------------------
// The monitor: the servers of the configuration, the measurement queue, the
// schedule, the publication of the results and the scene triggers.
//
// - One measurement at a time, whatever asks for it (schedule, Configuration
//   button, scene, widget): two tests at once would share the link and lie,
//   and an iperf3 server refuses a second client. A server already waiting or
//   running is not queued twice; manual requests go before scheduled ones.
// - The schedule runs in the container (devices are published with
//   should_poll: false): a one-minute tick starts a round of every server
//   created in Gladys when the interval has elapsed since the last round,
//   remembered under /data so a restart neither skips nor repeats a round.
// - States: only changes are published, plus a heartbeat every 12 hours so a
//   steady value never shows as "no recent value"; everything is published
//   again when a device is created (Gladys drops the states of a feature that
//   does not exist yet).
// - Scene triggers fire on a transition only (reachable → unreachable,
//   above → below the threshold), the state being kept under /data.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, displayName, serverIdOf, serverIds, statesOf } from './devices.js';
import { measure as defaultMeasure } from './iperf3.js';
import { FAILURES, localized } from './texts.js';

const logger = createLogger({ name: 'iperf3' });

export const WIDGET_KEY = 'speeds';
export const UNREACHABLE_TRIGGER = 'server_unreachable';
export const LOW_SPEED_TRIGGER = 'speed_low';
export const DIRECTIONS = ['download', 'upload'];

export const TICK_MS = 60_000;
// Without any round on record, the first one starts two minutes after the
// start: Gladys and the network settle, and a restart loop does not flood.
export const FIRST_ROUND_DELAY_MS = 2 * 60_000;
export const HEARTBEAT_MS = 12 * 3600_000;
const HOUR_MS = 3600_000;

// Kinds of failure that mean "the server does not answer".
const UNREACHABLE_KINDS = new Set(['unreachable', 'timeout']);

export class Monitor {
  constructor({ gladys, store, measure = defaultMeasure, timers = true, now = Date.now }) {
    this.gladys = gladys;
    this.store = store;
    this.measureFn = measure;
    this.timers = timers;
    this.now = now;
    this.config = null;
    this.state = { lastRoundAt: null, servers: {} };
    this.queue = [];
    this.pending = new Map(); // server id → promise of its result
    this.current = null; // server id being measured
    this.timer = null;
    this.startedAt = now();
    this.busyLoop = null;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.state = {
      lastRoundAt: Number.isFinite(saved.lastRoundAt) ? saved.lastRoundAt : null,
      servers: saved.servers && typeof saved.servers === 'object' ? saved.servers : {},
    };
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const first = this.config === null;
    this.config = config;
    if (config.invalid.length > 0) {
      logger.warn(`Ignored server entries: ${config.invalid.join(', ')}`);
    }
    if (first || config.servers.length > 0) {
      logger.info(
        `${config.servers.length} iperf3 server(s), ${config.protocol.toUpperCase()}, ` +
          (config.intervalHours > 0 ? `every ${config.intervalHours} h` : 'on demand only'),
      );
    }
    await this.publishDiscovered();
    await this.gladys.setConnectionStatus(
      config.servers.length > 0,
      config.servers.length > 0 ? undefined : localized('noServer'),
    );
    this.startTimer();
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.timers && this.config.intervalHours > 0) {
      this.timer = setInterval(() => {
        this.tick().catch((err) => logger.error('Scheduled round failed', err));
      }, TICK_MS);
      this.timer.unref?.();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    await this.store.flush();
  }

  // --- Servers and devices ---------------------------------------------------

  publishDiscovered() {
    return this.gladys.publishDiscoveredDevices(
      this.config.servers.map((server) => buildDevice(this.gladys, server, this.config)),
    );
  }

  server(id) {
    return this.config.servers.find((server) => server.id === id) ?? null;
  }

  serverOfDevice(externalId) {
    return this.server(serverIdOf(this.gladys, externalId));
  }

  deviceIdOf(server) {
    return serverIds(this.gladys, server.id).device;
  }

  isCreated(server) {
    const id = this.deviceIdOf(server);
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  createdServers() {
    return this.config.servers.filter((server) => this.isCreated(server));
  }

  serverState(server) {
    this.state.servers[server.id] ??= { result: null, reachable: null, low: {} };
    return this.state.servers[server.id];
  }

  lastResult(server) {
    return this.state.servers[server.id]?.result ?? null;
  }

  isMeasuring(server) {
    return this.pending.has(server.id);
  }

  async onDeviceCreated(device) {
    const server = this.serverOfDevice(device.external_id);
    const result = server && this.lastResult(server);
    if (result) {
      await this.gladys.publishChangedStates(
        statesOf(this.gladys, server, result, this.config.protocol),
        { heartbeat: HEARTBEAT_MS },
      );
    }
    this.refreshWidget();
  }

  // --- Schedule --------------------------------------------------------------

  nextRoundAt() {
    const interval = this.config.intervalHours * HOUR_MS;
    return this.state.lastRoundAt === null
      ? this.startedAt + FIRST_ROUND_DELAY_MS
      : this.state.lastRoundAt + interval;
  }

  /** One tick of the schedule; resolves once the round (if any) is over. */
  async tick() {
    if (this.config.intervalHours <= 0 || this.now() < this.nextRoundAt()) {
      return;
    }
    const servers = this.createdServers();
    this.state.lastRoundAt = this.now();
    this.store.save(this.state);
    if (servers.length === 0) {
      return;
    }
    logger.debug(`Scheduled round of ${servers.length} server(s)`);
    await Promise.all(servers.map((server) => this.enqueue(server)));
  }

  // --- Queue -----------------------------------------------------------------

  /**
   * Queues a measurement of a server (or joins the one already queued) and
   * resolves with its result `{ at, ok, values?, error?, message? }`.
   */
  enqueue(server, { priority = false } = {}) {
    const known = this.pending.get(server.id);
    if (known) {
      if (priority && this.current !== server.id) {
        // Move it to the front of the queue.
        const index = this.queue.findIndex((item) => item.server.id === server.id);
        if (index > 0) {
          this.queue.unshift(...this.queue.splice(index, 1));
        }
      }
      return known;
    }
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    const item = { server, resolve };
    if (priority) {
      // After the other manual requests, before the scheduled ones.
      const firstScheduled = this.queue.findIndex((queued) => !queued.priority);
      item.priority = true;
      this.queue.splice(firstScheduled === -1 ? this.queue.length : firstScheduled, 0, item);
    } else {
      this.queue.push(item);
    }
    this.pending.set(server.id, promise);
    this.refreshWidget();
    this.busyLoop ??= this.drain().finally(() => {
      this.busyLoop = null;
    });
    return promise;
  }

  async drain() {
    while (this.queue.length > 0) {
      const { server, resolve } = this.queue.shift();
      this.current = server.id;
      let result;
      try {
        result = await this.runOne(server);
      } catch (err) {
        logger.error(`Publication of ${displayName(server)} failed`, err);
        result = this.lastResult(server);
      } finally {
        this.current = null;
        this.pending.delete(server.id);
      }
      resolve(result);
      this.refreshWidget();
    }
  }

  async runOne(server) {
    const at = new Date(this.now()).toISOString();
    let result;
    try {
      const values = await this.measureFn(server, this.config);
      result = { at, ok: true, values };
      logger.debug(`${displayName(server)}: ↓ ${values.download} ↑ ${values.upload} Mbit/s`);
    } catch (err) {
      result = { at, ok: false, error: err.kind ?? 'error', message: String(err.message) };
    }
    const state = this.serverState(server);
    this.logTransition(server, state.result, result);
    state.result = result;
    // Only the devices Gladys knows: the others are published on creation.
    const created = this.isCreated(server);
    if (created) {
      await this.gladys.publishChangedStates(
        statesOf(this.gladys, server, result, this.config.protocol),
        { heartbeat: HEARTBEAT_MS },
      );
    }
    await this.fireTriggers(server, state, result, created);
    this.store.save(this.state);
    return result;
  }

  // A failure that repeats is logged once, and once when it works again.
  logTransition(server, previous, result) {
    const name = displayName(server);
    if (!result.ok && (previous === null || previous.ok || previous.error !== result.error)) {
      logger.warn(`${name}: measurement failed (${result.error}): ${result.message}`);
    } else if (!result.ok) {
      logger.debug(`${name}: measurement failed again (${result.error})`);
    } else if (previous && !previous.ok) {
      logger.info(`${name}: measurements work again`);
    }
  }

  // --- Scene triggers --------------------------------------------------------

  async fireTriggers(server, state, result, created) {
    const device = this.deviceIdOf(server);
    const name = displayName(server);
    const events = [];

    let reachable = state.reachable;
    if (result.ok) {
      reachable = true;
    } else if (UNREACHABLE_KINDS.has(result.error)) {
      reachable = false;
    }
    if (reachable === false && state.reachable !== false) {
      events.push([
        UNREACHABLE_TRIGGER,
        {
          device,
          name,
          address: server.host,
          reason: FAILURES[this.config.language][result.error] ?? result.error,
        },
      ]);
    }
    state.reachable = reachable;

    const threshold = this.config.lowSpeedThreshold;
    if (result.ok) {
      for (const direction of DIRECTIONS) {
        const low = threshold > 0 && result.values[direction] < threshold;
        if (low && !state.low[direction]) {
          events.push([
            LOW_SPEED_TRIGGER,
            {
              device,
              direction,
              name,
              speed_mbps: result.values[direction],
              threshold_mbps: threshold,
            },
          ]);
        }
        state.low[direction] = low;
      }
    }

    // A device the user has not added cannot be chosen in a scene.
    if (!created) {
      return;
    }
    for (const [key, data] of events) {
      try {
        await this.gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.error(`Scene event ${key} failed`, err);
      }
    }
  }

  // --- Widget ----------------------------------------------------------------

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh?.(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh request failed: ${err.message}`);
    }
  }
}
