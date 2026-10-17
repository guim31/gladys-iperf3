// -----------------------------------------------------------------------------
// The monitor end to end, against the SDK's fake Gladys and the simulated
// iperf3: devices, schedule, queue, states, scene triggers, scene action, the
// Configuration button, and what reaches `docker logs`.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_ROUND_DELAY_MS, HEARTBEAT_MS } from '../src/monitor.js';
import {
  captureLogs,
  create,
  createIperf,
  createWorld,
  discovered,
  featureId,
  settle,
} from './helpers/world.js';

const HOUR = 3600_000;

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('one device per server, never polled by Gladys, and a connection status', async (t) => {
  const w = await world(t);
  const names = w.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names, ['NAS', 'iPerf3 192.0.2.11:5202']);
  for (const device of w.fake.discoveredDevices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('without any server the connection status says what to do', async (t) => {
  const w = await world(t, { config: {} });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /No iperf3 server/);
  const ack = await w.fake.action('measure_now');
  assert.match(ack.data.message?.fr ?? JSON.stringify(ack.data), /Aucun serveur/);
});

test('the schedule measures the created servers only, first two minutes after the start', async (t) => {
  const w = await world(t);
  const nas = await create(w, 'NAS');
  await w.monitor.tick();
  assert.equal(w.iperf.runs.length, 0, 'not yet');
  w.clock.advance(FIRST_ROUND_DELAY_MS);
  await w.monitor.tick();
  assert.equal(w.iperf.runs.length, 2, 'upload and download of NAS only');
  assert.equal(w.fake.lastState(featureId(nas, 'download')), 32212.5);
  assert.equal(w.fake.lastState(featureId(nas, 'upload')), 31932.8);
  assert.equal(w.fake.lastState(featureId(nas, 'retransmits')), 0);
  assert.equal(w.fake.lastState(featureId(nas, 'success')), 1);

  w.clock.advance(5 * HOUR);
  await w.monitor.tick();
  assert.equal(w.iperf.runs.length, 2, 'six hours by default');
  w.clock.advance(HOUR);
  await w.monitor.tick();
  assert.equal(w.iperf.runs.length, 4);
});

test('a restart neither repeats nor skips a round (time kept under /data)', async (t) => {
  const first = await world(t);
  await create(first, 'NAS');
  first.clock.advance(FIRST_ROUND_DELAY_MS);
  await first.monitor.tick();
  await first.app.stop();

  const nas = discovered(first, 'NAS');
  const second = await world(t, { dataDir: first.dataDir, devices: [nas] });
  second.clock.time = first.clock.time + FIRST_ROUND_DELAY_MS;
  await second.monitor.tick();
  assert.equal(second.iperf.runs.length, 0, 'no round right after the restart');
  second.clock.time = first.clock.time + 6 * HOUR;
  await second.monitor.tick();
  assert.equal(second.iperf.runs.length, 2);
});

test('"on demand only" never measures by itself', async (t) => {
  const w = await world(t, { config: { servers: '192.0.2.10', interval_hours: '0' } });
  await create(w, 'iPerf3 192.0.2.10');
  w.clock.advance(48 * HOUR);
  await w.monitor.tick();
  assert.equal(w.iperf.runs.length, 0);
});

test('one measurement at a time, a server is never queued twice', async (t) => {
  let running = 0;
  let maxRunning = 0;
  const iperf = createIperf();
  const slow = async (args) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    const { report } = await import('./helpers/world.js');
    return report(`tcp-${args.includes('-R') ? 'down' : 'up'}`);
  };
  iperf.servers = { '192.0.2.10': slow, '192.0.2.11': slow };
  const w = await world(t, { iperf });
  const [nas, other] = w.monitor.config.servers;
  const a = w.monitor.enqueue(nas);
  const b = w.monitor.enqueue(nas, { priority: true });
  const c = w.monitor.enqueue(other);
  assert.equal(a, b);
  await Promise.all([a, c]);
  assert.equal(maxRunning, 1);
  assert.equal(iperf.runs.length, 4);
});

test('manual requests go before the scheduled ones', async (t) => {
  const order = [];
  const iperf = createIperf();
  const track = (host) => async (args) => {
    order.push(host);
    const { report } = await import('./helpers/world.js');
    return report(`tcp-${args.includes('-R') ? 'down' : 'up'}`);
  };
  iperf.servers = { a: track('a'), b: track('b'), c: track('c') };
  const w = await world(t, { iperf, config: { servers: 'a, b, c' } });
  const [a, b, c] = w.monitor.config.servers;
  w.monitor.enqueue(a);
  w.monitor.enqueue(b);
  w.monitor.enqueue(c, { priority: true });
  await settle(w);
  assert.deepEqual(order, ['a', 'a', 'c', 'c', 'b', 'b']);
});

test('only changes are published, with a heartbeat every 12 hours', async (t) => {
  const w = await world(t);
  const nas = await create(w, 'NAS');
  await w.fake.action('measure_now');
  const count = () =>
    w.fake.states.filter((s) => s.device_feature_external_id === featureId(nas, 'success')).length;
  assert.equal(count(), 1);
  w.clock.advance(HOUR);
  await w.fake.action('measure_now');
  assert.equal(count(), 1, 'same value, not sent again');
  assert.equal(HEARTBEAT_MS, 12 * HOUR);
});

test('a created device receives the last result at once', async (t) => {
  const w = await world(t);
  await w.fake.action('measure_now');
  const nas = discovered(w, 'NAS');
  assert.equal(w.fake.lastState(featureId(nas, 'download')), undefined, 'not created yet');
  await create(w, 'NAS');
  assert.equal(w.fake.lastState(featureId(nas, 'download')), 32212.5);
  assert.ok(w.fake.widgetRefreshes.length > 0);
});

test('a failure publishes "last measurement succeeded" = 0 and keeps the speeds', async (t) => {
  const w = await world(t);
  const nas = await create(w, 'NAS');
  await w.fake.action('measure_now');
  w.iperf.servers['192.0.2.10'] = 'refused';
  await w.fake.action('measure_now');
  assert.equal(w.fake.lastState(featureId(nas, 'success')), 0);
  assert.equal(w.fake.lastState(featureId(nas, 'download')), 32212.5);
});

test('UDP publishes jitter and loss, no retransmissions', async (t) => {
  const w = await world(t, { config: { servers: 'NAS=192.0.2.10', protocol: 'udp' } });
  const nas = await create(w, 'NAS');
  await w.fake.action('measure_now');
  assert.equal(featureId(nas, 'retransmits'), undefined);
  assert.equal(w.fake.lastState(featureId(nas, 'jitter')), 0.016);
  assert.equal(w.fake.lastState(featureId(nas, 'loss')), 0);
  assert.ok(w.iperf.runs.every((args) => args.includes('-u')));
});

test('"unreachable" fires once per outage, and not for a busy server', async (t) => {
  const w = await world(t);
  const nas = await create(w, 'NAS');
  const unreachable = () => w.fake.sceneEvents.filter((e) => e.key === 'server_unreachable');
  w.iperf.servers['192.0.2.10'] = 'busy';
  await w.fake.action('measure_now');
  assert.equal(unreachable().length, 0);
  w.iperf.servers['192.0.2.10'] = 'timeout';
  await w.fake.action('measure_now');
  await w.fake.action('measure_now');
  assert.equal(unreachable().length, 1);
  assert.deepEqual(unreachable()[0].data, {
    device: nas.external_id,
    name: 'NAS',
    address: '192.0.2.10',
    reason: 'serveur injoignable',
  });
  w.iperf.servers['192.0.2.10'] = 'ok';
  await w.fake.action('measure_now');
  w.iperf.servers['192.0.2.10'] = 'refused';
  await w.fake.action('measure_now');
  assert.equal(unreachable().length, 2);
});

test('"speed below the threshold" fires once per direction until it goes back up', async (t) => {
  const w = await world(t, { config: { servers: 'NAS=192.0.2.10', low_speed_threshold: 32000 } });
  await create(w, 'NAS');
  const low = () => w.fake.sceneEvents.filter((e) => e.key === 'speed_low');
  await w.fake.action('measure_now');
  assert.deepEqual(
    low().map((e) => [e.data.direction, e.data.speed_mbps, e.data.threshold_mbps]),
    [['upload', 31932.8, 32000]],
  );
  await w.fake.action('measure_now');
  assert.equal(low().length, 1, 'not again while it stays low');
});

test('no trigger and no state for a server not added to Gladys', async (t) => {
  const w = await world(t);
  w.iperf.servers['192.0.2.10'] = 'refused';
  await w.fake.action('measure_now');
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.deepEqual(w.fake.states, []);
});

test('triggers do not fire again after a restart (state kept under /data)', async (t) => {
  const first = await world(t);
  const nas = await create(first, 'NAS');
  first.iperf.servers['192.0.2.10'] = 'refused';
  await first.fake.action('measure_now');
  await first.app.stop();
  const second = await world(t, {
    dataDir: first.dataDir,
    devices: [nas],
    iperf: createIperf({ '192.0.2.10': 'refused' }),
  });
  await second.fake.action('measure_now');
  assert.deepEqual(second.fake.sceneEvents, []);
});

test('the scene action measures and returns numbers; a failure is an output', async (t) => {
  const w = await world(t);
  const nas = await create(w, 'NAS');
  const ok = await w.fake.sceneAction('run_measurement', { device: nas.external_id });
  assert.deepEqual(ok.data.outputs, { success: 1, download_mbps: 32212.5, upload_mbps: 31932.8 });
  w.iperf.servers['192.0.2.10'] = 'refused';
  const failed = await w.fake.sceneAction('run_measurement', { device: nas.external_id });
  assert.deepEqual(failed.data.outputs, { success: 0 });
  const gone = await w.fake.sceneAction('run_measurement', { device: 'iperf3:unknown' });
  assert.equal(gone.success, false);
});

test('the Configuration button reports every server in the four languages', async (t) => {
  const w = await world(t, { config: { servers: 'NAS=192.0.2.10, 192.0.2.11:5202, bad host' } });
  w.iperf.servers['192.0.2.11'] = 'refused';
  const ack = await w.fake.action('measure_now');
  assert.equal(ack.success, true);
  const message = ack.data.message ?? ack.data;
  assert.equal(
    message.fr,
    'NAS : ↓ 32213 · ↑ 31933 Mbit/s\n192.0.2.11:5202 : serveur injoignable\nEntrées ignorées : bad host.',
  );
  assert.deepEqual(Object.keys(message).sort(), ['de', 'en', 'es', 'fr']);
});

test('the Configuration button stops waiting before its timeout', async (t) => {
  const iperf = createIperf({ '192.0.2.10': () => new Promise(() => {}) });
  const w = await world(t, { iperf, config: { servers: 'NAS=192.0.2.10' }, actionWaitMs: 20 });
  const ack = await w.fake.action('measure_now');
  assert.match((ack.data.message ?? ack.data).en, /still running/);
});

test('a configuration change publishes the devices again, in the new protocol', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ servers: 'NAS=192.0.2.10', protocol: 'udp' });
  const [nas] = w.fake.discoveredDevices;
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.ok(featureId(nas, 'jitter'));
});

test('a normal round writes nothing at info; a failure once, and its end once', async (t) => {
  const w = await world(t);
  await create(w, 'NAS');
  const lines = captureLogs(t, 'info');
  await w.fake.action('measure_now');
  await w.fake.action('measure_now');
  const quiet = lines.filter((line) => !/requested/.test(line.text));
  assert.deepEqual(quiet, [], 'only the user action line');
  w.iperf.servers['192.0.2.10'] = 'refused';
  for (let i = 0; i < 3; i += 1) {
    await w.fake.action('measure_now');
  }
  w.iperf.servers['192.0.2.10'] = 'ok';
  await w.fake.action('measure_now');
  const nasLines = lines.filter((line) => line.text.includes('NAS:'));
  assert.equal(nasLines.length, 2, nasLines.map((l) => l.text).join('\n'));
  assert.match(nasLines[0].text, /measurement failed \(unreachable\)/);
  assert.match(nasLines[1].text, /work again/);
});
