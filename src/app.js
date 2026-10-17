// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the monitor, so index.js stays a few lines and the tests drive
// the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { displayName } from './devices.js';
import { Monitor } from './monitor.js';
import { SCENE_ACTIONS } from './scenes.js';
import { Store } from './store.js';
import { FAILURES, INIT_FAILED, MESSAGES, localized } from './texts.js';
import { WIDGETS, formatMbps } from './widgets.js';

const logger = createLogger({ name: 'iperf3-app' });

// The Configuration button waits this long, under its 120 s timeout.
export const ACTION_WAIT_MS = 100_000;

/** The answer of the Configuration button, in the four languages. */
export function measureReport(monitor, servers, results, timedOut) {
  return Object.fromEntries(
    Object.entries(MESSAGES).map(([lang, table]) => {
      const lines = servers.map((server, index) => {
        const name = displayName(server);
        const result = results[index];
        if (!result) {
          return null;
        }
        return result.ok
          ? table.result({
              name,
              download: formatMbps(result.values.download),
              upload: formatMbps(result.values.upload),
            })
          : table.failed({ name, reason: FAILURES[lang][result.error] ?? FAILURES[lang].error });
      });
      if (monitor.config.invalid.length > 0) {
        lines.push(table.invalid({ entries: monitor.config.invalid.join(', ') }));
      }
      if (timedOut) {
        lines.push(table.stillRunning);
      }
      return [lang, lines.filter(Boolean).join('\n')];
    }),
  );
}

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, measure, timers, now, actionWaitMs
 */
export function registerHandlers(gladys, options = {}) {
  const monitor = new Monitor({
    gladys,
    store: options.store ?? new Store(),
    config: normalizeConfig(),
    measure: options.measure,
    timers: options.timers ?? true,
    now: options.now,
  });
  const actionWaitMs = options.actionWaitMs ?? ACTION_WAIT_MS;

  // Resolved once the monitor has started; every handler waits for it, so a
  // request arriving during the start is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): publish everything again.
        await monitor.reconfigure(config);
        return;
      }
      await monitor.start(config);
      // Only now: a start that failed is tried again at the next connection.
      started = true;
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => monitor.publishDiscovered()));

  gladys.onSetValue(async (device, feature) => {
    // Throw: the SDK sends a success:false acknowledgement to Gladys.
    throw new Error(`iperf3 sensors are read-only (${feature.external_id})`);
  });

  gladys.onDeviceCreated(whenReady((device) => monitor.onDeviceCreated(device)));

  gladys.onConfigUpdated(whenReady((newConfig) => monitor.reconfigure(normalizeConfig(newConfig))));

  const actions = {
    async measure_now() {
      const servers = monitor.config.servers;
      if (servers.length === 0) {
        return localized('noServer');
      }
      logger.info(`Measurement of ${servers.length} server(s) requested`);
      const results = servers.map(() => null);
      const all = Promise.all(
        servers.map((server, index) =>
          monitor.enqueue(server, { priority: true }).then((result) => {
            results[index] = result;
          }),
        ),
      );
      let timer;
      const timedOut = await Promise.race([
        all.then(() => false),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(true), actionWaitMs);
        }),
      ]);
      clearTimeout(timer);
      return measureReport(monitor, servers, results, timedOut);
    },
  };
  for (const [key, handler] of Object.entries(actions)) {
    gladys.onAction(key, whenReady(handler));
  }

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(monitor, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(monitor, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, context = {}) =>
        widget.action(monitor, { actionKey, params, ...context }),
      ),
    );
  }

  return {
    monitor,
    ready,
    actions: Object.keys(actions),
    stop: () => monitor.stop(),
  };
}
