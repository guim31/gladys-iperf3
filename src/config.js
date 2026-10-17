// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js), normalization, and the
// parsing of the server list, so the rest of the code never deals with
// strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Hours between two automatic rounds; '0' = on demand only. The schedule runs
// in the container (devices are published with should_poll: false).
export const INTERVALS = ['0', '1', '2', '3', '6', '12', '24'];

export const PROTOCOLS = ['tcp', 'udp'];

export const DEFAULT_PORT = 5201;
export const MAX_SERVERS = 10;

export const LIMITS = {
  duration: { min: 3, max: 20 }, // seconds per direction
  streams: { min: 1, max: 8 },
  udp_bitrate: { min: 1, max: 10000 }, // Mbit/s
  low_speed_threshold: { min: 0, max: 100000 }, // Mbit/s, 0 = off
};

export const DEFAULT_CONFIG = {
  servers: '',
  interval_hours: '6',
  protocol: 'tcp',
  duration: 5,
  streams: 1,
  udp_bitrate: 100,
  low_speed_threshold: 0,
  language: 'fr',
};

function toInteger(raw, key) {
  const { min, max } = LIMITS[key];
  const value = Number(typeof raw === 'string' ? raw.trim().replace(',', '.') : raw);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(value)) {
    return DEFAULT_CONFIG[key];
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

const HOST_NAME =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const IPV6 = /^[0-9A-Fa-f:.]+$/;

/**
 * One entry of the server list: `[name=]host[:port]`, IPv6 in brackets.
 * @returns {{ name: string|null, host: string, port: number } | null}
 */
export function parseServer(entry) {
  let rest = entry.trim();
  let name = null;
  const equal = rest.indexOf('=');
  if (equal !== -1) {
    name = rest.slice(0, equal).trim() || null;
    rest = rest.slice(equal + 1).trim();
  }
  let host;
  let port;
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest);
  if (bracketed) {
    host = bracketed[1];
    if (!IPV6.test(host) || !host.includes(':')) {
      return null;
    }
    port = bracketed[2] === undefined ? DEFAULT_PORT : Number(bracketed[2]);
  } else {
    const match = /^([^:\s]+)(?::(\d+))?$/.exec(rest);
    if (!match || !HOST_NAME.test(match[1])) {
      return null;
    }
    host = match[1];
    port = match[2] === undefined ? DEFAULT_PORT : Number(match[2]);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return { name: name ? name.slice(0, 60) : null, host, port };
}

/**
 * The platform id of a server: stable, lowercase, without the `:` the
 * external ids use as separator. External ids are forever: never change this.
 */
export function serverId({ host, port }) {
  return `${host.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}-${port}`;
}

/**
 * The server list of the configuration: entries separated by commas,
 * semicolons or line breaks. Duplicates (same host and port) keep the first.
 * @returns {{ servers: Array<{id, name, host, port}>, invalid: string[] }}
 */
export function parseServers(raw) {
  const servers = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of String(raw ?? '').split(/[,;\n]+/)) {
    if (entry.trim() === '') {
      continue;
    }
    const server = parseServer(entry);
    if (!server) {
      invalid.push(entry.trim().slice(0, 60));
      continue;
    }
    const id = serverId(server);
    if (seen.has(id) || servers.length >= MAX_SERVERS) {
      if (!seen.has(id)) {
        invalid.push(entry.trim().slice(0, 60));
      }
      continue;
    }
    seen.add(id);
    servers.push({ id, ...server });
  }
  return { servers, invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { servers, invalid } = parseServers(source.servers);
  const interval = INTERVALS.includes(String(source.interval_hours))
    ? String(source.interval_hours)
    : DEFAULT_CONFIG.interval_hours;
  return {
    servers,
    invalid,
    intervalHours: Number(interval),
    protocol: PROTOCOLS.includes(source.protocol) ? source.protocol : DEFAULT_CONFIG.protocol,
    duration: toInteger(source.duration, 'duration'),
    streams: toInteger(source.streams, 'streams'),
    udpBitrate: toInteger(source.udp_bitrate, 'udp_bitrate'),
    lowSpeedThreshold: toInteger(source.low_speed_threshold, 'low_speed_threshold'),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
