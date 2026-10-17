// -----------------------------------------------------------------------------
// The iperf3 client: runs the `iperf3` binary of the image (Alpine package,
// client mode only: the container never starts a server) with `-J`, and turns
// its JSON report into numbers.
//
// One measurement of a server = two runs, upload (the container sends) then
// download (`-R`, the server sends), one second apart: an iperf3 server only
// accepts one test at a time and needs a moment to listen again.
//
// Rates come from the receiver side (`sum_received`), the one that counts what
// actually arrived. TCP retransmissions are counted by the sender of each
// direction (`sum_sent.retransmits`, also reported in reverse mode). UDP
// jitter and loss come from the receiver (`sum_received`).
// -----------------------------------------------------------------------------

import { spawn } from 'node:child_process';

export const BINARY = process.env.IPERF3_BINARY || 'iperf3';
export const CONNECT_TIMEOUT_MS = 5000;
export const PAUSE_BETWEEN_RUNS_MS = 1000;
export const BUSY_RETRY_MS = 5000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/** Why a run failed: `unreachable`, `busy`, `timeout`, `missing` or `error`. */
export class IperfError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** The command line of one run. */
export function buildArgs(server, options, { reverse }) {
  const args = [
    '-J',
    '-c',
    server.host,
    '-p',
    String(server.port),
    '-t',
    String(options.duration),
    '-P',
    String(options.streams),
    '--connect-timeout',
    String(CONNECT_TIMEOUT_MS),
  ];
  if (options.protocol === 'udp') {
    args.push('-u', '-b', `${options.udpBitrate}M`);
  }
  if (reverse) {
    args.push('-R');
  }
  return args;
}

/** Classifies the `error` text of an iperf3 report. */
export function classifyError(text) {
  if (/busy/i.test(text)) {
    return 'busy';
  }
  if (/unable to connect|unable to receive|connection refused|timed out|no route/i.test(text)) {
    return 'unreachable';
  }
  return 'error';
}

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Reads one iperf3 JSON report (a parsed object).
 * @returns {{ mbps: number, retransmits: number|null, jitter: number|null, loss: number|null }}
 * @throws {IperfError} when the report carries an error or no result
 */
export function parseReport(report) {
  if (!report || typeof report !== 'object') {
    throw new IperfError('error', 'iperf3 returned no report');
  }
  if (typeof report.error === 'string' && report.error !== '') {
    throw new IperfError(classifyError(report.error), report.error);
  }
  const end = report.end ?? {};
  const received = end.sum_received ?? end.sum;
  if (!Number.isFinite(received?.bits_per_second)) {
    throw new IperfError('error', 'iperf3 report without a result');
  }
  const udp = report.start?.test_start?.protocol === 'UDP';
  return {
    mbps: round(received.bits_per_second / 1e6, 1),
    retransmits:
      !udp && Number.isFinite(end.sum_sent?.retransmits) ? end.sum_sent.retransmits : null,
    jitter: udp && Number.isFinite(received.jitter_ms) ? round(received.jitter_ms, 3) : null,
    loss: udp && Number.isFinite(received.lost_percent) ? round(received.lost_percent, 2) : null,
  };
}

/**
 * Runs the binary once and resolves with its parsed JSON report. iperf3 exits
 * with 1 and still prints a JSON report on a test error: the report decides.
 */
export function runIperf3(args, { timeoutMs, binary = BINARY } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new IperfError('missing', `cannot start iperf3: ${err.message}`));
      return;
    }
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (output.length < MAX_OUTPUT_BYTES) {
        output += chunk;
      }
    });
    child.stderr.resume();
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        err.code === 'ENOENT'
          ? new IperfError('missing', 'the iperf3 binary is missing')
          : new IperfError('error', `cannot start iperf3: ${err.message}`),
      );
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new IperfError('timeout', `no answer within ${Math.round(timeoutMs / 1000)} s`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new IperfError('error', 'iperf3 printed no JSON report'));
      }
    });
  });
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Measures one server in both directions.
 * @param {{host, port}} server
 * @param {{protocol, duration, streams, udpBitrate}} options
 * @param {{ run?: Function, sleep?: Function }} [seams] test seams
 * @returns {Promise<{download, upload, retransmits, jitter, loss}>}
 */
export async function measure(server, options, { run = runIperf3, sleep = defaultSleep } = {}) {
  // The duration, the connection, the exchange of the results, and a margin.
  const timeoutMs = options.duration * 1000 + CONNECT_TIMEOUT_MS + 10_000;
  const once = async (reverse) => {
    const args = buildArgs(server, options, { reverse });
    try {
      return parseReport(await run(args, { timeoutMs }));
    } catch (err) {
      if (err.kind !== 'busy') {
        throw err;
      }
      // Someone else is testing against the same server: one more try.
      await sleep(BUSY_RETRY_MS);
      return parseReport(await run(args, { timeoutMs }));
    }
  };
  const upload = await once(false);
  await sleep(PAUSE_BETWEEN_RUNS_MS);
  const download = await once(true);
  const worst = (a, b) => (a === null && b === null ? null : Math.max(a ?? 0, b ?? 0));
  return {
    download: download.mbps,
    upload: upload.mbps,
    retransmits:
      options.protocol === 'udp' ? null : (upload.retransmits ?? 0) + (download.retransmits ?? 0),
    jitter: options.protocol === 'udp' ? worst(upload.jitter, download.jitter) : null,
    loss: options.protocol === 'udp' ? worst(upload.loss, download.loss) : null,
  };
}
