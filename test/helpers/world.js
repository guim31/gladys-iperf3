// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a simulated iperf3 binary that
// replays real reports (test/fixtures/iperf3, captured with iperf3 3.20 against
// a real server, anonymized), a manual clock, a temporary /data, and the
// integration wired on top through registerHandlers. Nothing touches the
// network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { measure } from '../../src/iperf3.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';

/** A real iperf3 JSON report, by fixture name (tcp-up, udp-down, err-busy...). */
export const report = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/iperf3/${name}.json`, import.meta.url), 'utf8'));

/**
 * Simulated iperf3: `servers[host] = 'ok' | 'refused' | 'timeout' | 'busy'`,
 * or a function (args) => report. Records every command line in `runs`.
 */
export function createIperf(servers = {}) {
  const iperf = {
    servers: { ...servers },
    runs: [],
    async run(args) {
      iperf.runs.push(args);
      const host = args[args.indexOf('-c') + 1];
      const udp = args.includes('-u');
      const reverse = args.includes('-R');
      const behaviour = iperf.servers[host] ?? 'refused';
      if (typeof behaviour === 'function') {
        return behaviour(args);
      }
      if (behaviour === 'ok') {
        return report(`${udp ? 'udp' : 'tcp'}-${reverse ? 'down' : 'up'}`);
      }
      return report(`err-${behaviour}`);
    },
  };
  iperf.measure = (server, options) =>
    measure(server, options, { run: iperf.run, sleep: async () => {} });
  return iperf;
}

/** A manual clock. */
export function createClock(start = 1_700_000_000_000) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  config = { servers: 'NAS=192.0.2.10, 192.0.2.11:5202' },
  iperf = createIperf({ '192.0.2.10': 'ok', '192.0.2.11': 'ok' }),
  devices = [],
  saved,
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-iperf3-')),
  actionWaitMs,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  if (saved) {
    await store.save(saved);
    await store.flush();
  }
  const clock = createClock();
  const app = registerHandlers(gladys, {
    store,
    measure: iperf.measure,
    timers: false,
    now: clock.now,
    actionWaitMs,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, iperf, clock, store, dataDir };
}

/** The device published for a name, from the last discovery list. */
export const discovered = (world, name) =>
  world.fake.discoveredDevices.find((device) => device.name === name);

/** Create a device in Gladys, as the user would. */
export async function create(world, name) {
  const device = discovered(world, name);
  if (!device) {
    throw new Error(`${name} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Waits until the measurement queue is empty. */
export async function settle(world) {
  while (world.monitor.busyLoop) {
    await world.monitor.busyLoop;
  }
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
