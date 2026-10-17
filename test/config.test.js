import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServers, serverId } from '../src/config.js';

test('the server list: names, ports, IPv6, separators, duplicates and mistakes', () => {
  const { servers, invalid } = parseServers(
    ' NAS = 192.0.2.10 ; 192.0.2.11:5202\nnas.example.org, Wi-Fi=[2001:db8::10]:5203, 192.0.2.10:5201, bad host, x:99999, [zz]',
  );
  assert.deepEqual(servers, [
    { id: '192.0.2.10-5201', name: 'NAS', host: '192.0.2.10', port: 5201 },
    { id: '192.0.2.11-5202', name: null, host: '192.0.2.11', port: 5202 },
    { id: 'nas.example.org-5201', name: null, host: 'nas.example.org', port: 5201 },
    { id: '2001-db8--10-5203', name: 'Wi-Fi', host: '2001:db8::10', port: 5203 },
  ]);
  assert.deepEqual(invalid, ['bad host', 'x:99999', '[zz]']);
});

test('ten servers at most', () => {
  const list = Array.from({ length: 12 }, (_, i) => `192.0.2.${i + 1}`).join(',');
  const { servers, invalid } = parseServers(list);
  assert.equal(servers.length, 10);
  assert.deepEqual(invalid, ['192.0.2.11', '192.0.2.12']);
});

test('server ids are stable and lowercase (external ids are forever)', () => {
  assert.equal(serverId({ host: 'NAS.Example.org', port: 5201 }), 'nas.example.org-5201');
});

test('normalization: defaults, clamped numbers, known options only', () => {
  const empty = normalizeConfig();
  assert.deepEqual(empty, {
    servers: [],
    invalid: [],
    intervalHours: 6,
    protocol: 'tcp',
    duration: DEFAULT_CONFIG.duration,
    streams: 1,
    udpBitrate: 100,
    lowSpeedThreshold: 0,
    language: 'fr',
  });
  const raw = normalizeConfig({
    interval_hours: '0',
    protocol: 'udp',
    duration: '99',
    streams: 0,
    udp_bitrate: '250,4',
    low_speed_threshold: 'abc',
    language: 'it',
  });
  assert.equal(raw.intervalHours, 0);
  assert.equal(raw.protocol, 'udp');
  assert.equal(raw.duration, 20);
  assert.equal(raw.streams, 1);
  assert.equal(raw.udpBitrate, 250);
  assert.equal(raw.lowSpeedThreshold, 0);
  assert.equal(raw.language, 'fr');
  assert.equal(normalizeConfig({ protocol: 'sctp', interval_hours: 5 }).protocol, 'tcp');
});
