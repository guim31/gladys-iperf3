// -----------------------------------------------------------------------------
// One Gladys device per iperf3 server of the configuration.
//
// Features (couples checked against the Gladys front, v5.2.0):
//   - download, upload  datarate/rate in Mbit/s (receiver side);
//   - retransmits       counter-sensor/integer, TCP only: retransmitted
//                       segments of the last measurement, both directions;
//   - jitter            duration/decimal in ms, UDP only (worst direction);
//   - loss              unknown/unknown in percent, UDP only (worst direction):
//                       Gladys has no percentage category for it;
//   - success           input/binary: 1 when the last measurement worked.
// The TCP-only and UDP-only features follow the `protocol` of the
// configuration: switching it offers "Update" in the Discovery tab.
//
// Published with should_poll: false: the schedule runs in the container
// (src/monitor.js), every few hours.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { DEFAULT_PORT } from './config.js';
import { NAMES } from './texts.js';

export const DEVICE_TYPE = 'server';
export const FEATURE_KEYS = ['download', 'upload', 'retransmits', 'jitter', 'loss', 'success'];

// Display bounds (Gladys never enforces them): 100 Gbit/s covers any LAN.
export const MAX_MBPS = 100000;

const FEATURES = {
  download: {
    category: C.DATARATE,
    type: T.DATARATE.RATE,
    unit: U.MEGABITS_PER_SECOND,
    max: MAX_MBPS,
  },
  upload: {
    category: C.DATARATE,
    type: T.DATARATE.RATE,
    unit: U.MEGABITS_PER_SECOND,
    max: MAX_MBPS,
  },
  retransmits: {
    category: C.COUNTER_SENSOR,
    type: T.SENSOR.INTEGER,
    max: 100000000,
    protocol: 'tcp',
  },
  jitter: {
    category: C.DURATION,
    type: T.DURATION.DECIMAL,
    unit: U.MILLISECONDS,
    max: 10000,
    protocol: 'udp',
  },
  loss: {
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    unit: U.PERCENT,
    max: 100,
    protocol: 'udp',
  },
  success: { category: C.INPUT, type: T.INPUT.BINARY, max: 1, history: false },
};

/** The features a device carries for a protocol. */
export const featureKeysFor = (protocol) =>
  FEATURE_KEYS.filter((key) => !FEATURES[key].protocol || FEATURES[key].protocol === protocol);

/** External ids of a server device and of its features. */
export function serverIds(gladys, id) {
  const ids = gladys.externalIds(DEVICE_TYPE, id);
  return {
    device: ids.device,
    ...Object.fromEntries(FEATURE_KEYS.map((key) => [key, ids.feature(key)])),
  };
}

/** The server id of a device external id (null when not ours). */
export function serverIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

/** The name shown for a server: its label, else its address. */
export function displayName(server) {
  if (server.name) {
    return server.name;
  }
  const host = server.host.includes(':') ? `[${server.host}]` : server.host;
  return server.port === DEFAULT_PORT ? host : `${host}:${server.port}`;
}

export function buildDevice(gladys, server, config) {
  const ids = serverIds(gladys, server.id);
  const names = NAMES[config.language] ?? NAMES.en;
  return {
    name: server.name ?? `iPerf3 ${displayName(server)}`,
    external_id: ids.device,
    model: config.protocol === 'udp' ? 'iperf3 UDP' : 'iperf3 TCP',
    should_poll: false,
    params: [
      { name: 'host', value: server.host },
      { name: 'port', value: String(server.port) },
    ],
    features: featureKeysFor(config.protocol).map((key) => {
      const spec = FEATURES[key];
      return {
        name: names[key],
        external_id: ids[key],
        category: spec.category,
        type: spec.type,
        ...(spec.unit ? { unit: spec.unit } : {}),
        min: 0,
        max: spec.max,
        read_only: true,
        has_feedback: false,
        keep_history: spec.history !== false,
      };
    }),
  };
}

/** The states of a result, for the features of the protocol. */
export function statesOf(gladys, server, result, protocol) {
  const ids = serverIds(gladys, server.id);
  const values = result.ok ? { ...result.values, success: 1 } : { success: 0 };
  return featureKeysFor(protocol)
    .filter((key) => Number.isFinite(values[key]))
    .map((key) => ({ device_feature_external_id: ids[key], state: values[key] }));
}
