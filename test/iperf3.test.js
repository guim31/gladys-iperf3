// -----------------------------------------------------------------------------
// The iperf3 client, on real reports of iperf3 3.20 (test/fixtures/iperf3,
// anonymized): TCP and UDP in both directions, and the errors a server gives
// when it is busy, refuses, does not answer or has no DNS name.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IperfError,
  buildArgs,
  classifyError,
  measure,
  parseReport,
  runIperf3,
  TEMP_DIR,
} from '../src/iperf3.js';
import { report } from './helpers/world.js';

const TCP = { protocol: 'tcp', duration: 5, streams: 1, udpBitrate: 100 };
const UDP = { ...TCP, protocol: 'udp' };
const SERVER = { host: '192.0.2.10', port: 5201 };

test('the command line: JSON, client, port, duration, streams, then -R and UDP options', () => {
  assert.deepEqual(buildArgs(SERVER, TCP, { reverse: false }), [
    '-J',
    '-c',
    '192.0.2.10',
    '-p',
    '5201',
    '-t',
    '5',
    '-P',
    '1',
    '--connect-timeout',
    '5000',
  ]);
  const udpDown = buildArgs(
    { host: '2001:db8::10', port: 5202 },
    { ...UDP, streams: 4 },
    { reverse: true },
  );
  // -b is per stream: 100 Mbit/s split between 4 streams.
  assert.deepEqual(udpDown.slice(-4), ['-u', '-b', '25000K', '-R']);
  assert.ok(udpDown.includes('2001:db8::10'));
  assert.ok(!udpDown.includes('-s'), 'never a server');
});

test('TCP reports: receiver rate in Mbit/s and the sender retransmissions', () => {
  assert.deepEqual(parseReport(report('tcp-up')), {
    mbps: 31932.8,
    retransmits: 0,
    jitter: null,
    loss: null,
  });
  // In reverse mode the server sends: its retransmissions are reported too.
  const down = parseReport(report('tcp-down'));
  assert.equal(down.mbps, 32212.5);
  assert.equal(down.retransmits, 0);
});

test('UDP reports: receiver rate, jitter and loss', () => {
  assert.deepEqual(parseReport(report('udp-up')), {
    mbps: 50,
    retransmits: null,
    jitter: 0.016,
    loss: 0,
  });
  const down = parseReport(report('udp-down'));
  assert.equal(down.mbps, 50);
  assert.equal(down.jitter, 0.003);
});

test('error reports are classified', () => {
  const kind = (name) => {
    try {
      parseReport(report(name));
    } catch (err) {
      assert.ok(err instanceof IperfError);
      return err.kind;
    }
    return 'no error';
  };
  assert.equal(kind('err-busy'), 'busy');
  assert.equal(kind('err-refused'), 'unreachable');
  assert.equal(kind('err-timeout'), 'unreachable');
  assert.equal(kind('err-dns'), 'unreachable');
  assert.equal(classifyError('something else'), 'error');
  assert.throws(() => parseReport({ start: {}, end: {} }), { kind: 'error' });
  assert.throws(() => parseReport(null), { kind: 'error' });
});

test('a measurement runs upload then download, and sums or takes the worst', async () => {
  const runs = [];
  const run = async (args) => {
    runs.push(args.includes('-R') ? 'down' : 'up');
    const value = report(`tcp-${args.includes('-R') ? 'down' : 'up'}`);
    value.end.sum_sent.retransmits = args.includes('-R') ? 3 : 4;
    return value;
  };
  const result = await measure(SERVER, TCP, { run, sleep: async () => {} });
  assert.deepEqual(runs, ['up', 'down']);
  assert.deepEqual(result, {
    download: 32212.5,
    upload: 31932.8,
    retransmits: 7,
    jitter: null,
    loss: null,
  });

  const udp = await measure(SERVER, UDP, {
    run: async (args) => report(`udp-${args.includes('-R') ? 'down' : 'up'}`),
    sleep: async () => {},
  });
  assert.deepEqual(udp, { download: 50, upload: 50, retransmits: null, jitter: 0.016, loss: 0 });
});

test('a busy server is tried once more, five seconds later', async () => {
  const sleeps = [];
  let calls = 0;
  const run = async (args) => {
    calls += 1;
    return calls === 1 ? report('err-busy') : report(`tcp-${args.includes('-R') ? 'down' : 'up'}`);
  };
  const result = await measure(SERVER, TCP, { run, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(result.upload, 31932.8);
  assert.deepEqual(sleeps, [5000, 1000]);

  await assert.rejects(
    measure(SERVER, TCP, { run: async () => report('err-busy'), sleep: async () => {} }),
    { kind: 'busy' },
  );
});

test('an unreachable server fails at once, without the second direction', async () => {
  let calls = 0;
  await assert.rejects(
    measure(SERVER, TCP, {
      run: async () => {
        calls += 1;
        return report('err-refused');
      },
      sleep: async () => {},
    }),
    { kind: 'unreachable' },
  );
  assert.equal(calls, 1);
});

// runIperf3 with stand-in binaries: node itself prints a report, or hangs.
test('runIperf3 parses the output even when iperf3 exits with an error code', async () => {
  const script = `process.stdout.write(JSON.stringify({ error: 'the server is busy running a test. try again later' })); process.exit(1)`;
  const parsed = await runIperf3(['-e', script], { timeoutMs: 5000, binary: process.execPath });
  assert.equal(parsed.error, 'the server is busy running a test. try again later');
});

test('runIperf3 kills a run past its deadline, and reports a missing binary', async () => {
  await assert.rejects(
    runIperf3(['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200, binary: process.execPath }),
    { kind: 'timeout' },
  );
  await assert.rejects(runIperf3([], { timeoutMs: 1000, binary: '/nonexistent/iperf3' }), {
    kind: 'missing',
  });
  await assert.rejects(
    runIperf3(['-e', 'console.log("not json")'], { timeoutMs: 5000, binary: process.execPath }),
    { kind: 'error' },
  );
});

test('iperf3 gets a writable TMPDIR (the rootfs of the sandbox is read-only)', async () => {
  const parsed = await runIperf3(
    ['-e', 'process.stdout.write(JSON.stringify({ tmp: process.env.TMPDIR }))'],
    {
      timeoutMs: 5000,
      binary: process.execPath,
    },
  );
  assert.equal(parsed.tmp, TEMP_DIR);
});
