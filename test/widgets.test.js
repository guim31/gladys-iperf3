// -----------------------------------------------------------------------------
// The `speeds` widget: content valid for the core (vocabulary and budget), the
// tiles bound to features that exist, the one-server and several-server views,
// and its buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/monitor.js';
import { create, createIperf, createWorld, settle } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const get = async (w, settings = {}, language = 'en') => {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language, units: {} });
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  return ack.data.content;
};
const types = (content) => content.components.map((c) => c.type);

test('without any server, a text says where to add one', async (t) => {
  const w = await world(t, { config: {} });
  for (const language of LANGUAGES) {
    const content = await get(w, {}, language);
    assert.deepEqual(types(content), ['text']);
  }
});

test('several servers: one status line each, and "Measure all"', async (t) => {
  const w = await world(t);
  w.iperf.servers['192.0.2.11'] = 'refused';
  await w.fake.action('measure_now');
  const content = await get(w, {}, 'fr');
  assert.deepEqual(types(content), ['status', 'button']);
  assert.deepEqual(
    content.components[0].items.map((item) => [item.label, item.value, item.color]),
    [
      ['NAS', '↓ 32213 · ↑ 31933 Mbit/s', 'success'],
      ['192.0.2.11:5202', 'serveur injoignable', 'danger'],
    ],
  );
  assert.equal(content.components[1].action.key, 'measure_all');
});

test('one created server: live tiles and chart bound to its features', async (t) => {
  const w = await world(t);
  const nas = await create(w, 'NAS');
  await w.fake.action('measure_now');
  for (const language of LANGUAGES) {
    const content = await get(w, { device: nas.external_id }, language);
    assert.deepEqual(types(content), ['value', 'value', 'chart', 'status', 'button']);
    const featureIds = new Set(nas.features.map((f) => f.external_id));
    assert.ok(featureIds.has(content.components[0].device_feature));
    assert.ok(featureIds.has(content.components[1].device_feature));
    for (const id of content.components[2].device_features) {
      assert.ok(featureIds.has(id), id);
    }
    assert.deepEqual(content.components[4].action, {
      key: 'measure_1',
      params: { server: '192.0.2.10-5201' },
    });
  }
  // With only one created server, no setting is needed.
  assert.deepEqual(types(await get(w)), ['value', 'value', 'chart', 'status', 'button']);
});

test('a UDP server shows jitter and loss; a failed one says why', async (t) => {
  const w = await world(t, { config: { servers: 'NAS=192.0.2.10', protocol: 'udp' } });
  await w.fake.action('measure_now');
  let content = await get(w);
  const labels = content.components.find((c) => c.type === 'status').items.map((i) => i.label);
  assert.deepEqual(labels, ['Last measurement', 'Jitter', 'Packet loss']);
  w.iperf.servers['192.0.2.10'] = 'busy';
  await w.fake.action('measure_now');
  content = await get(w);
  const items = content.components.find((c) => c.type === 'status').items;
  assert.equal(items[1].value, 'server busy with another test');
});

test('the buttons start a measurement in the background', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction(WIDGET_KEY, 'measure_all', {}, { settings: {} });
  assert.match(ack.data.en ?? ack.data.message?.en ?? JSON.stringify(ack.data), /started/);
  await settle(w);
  assert.equal(w.iperf.runs.length, 4);
  await w.fake.widgetAction(
    WIDGET_KEY,
    'measure_1',
    { server: '192.0.2.11-5202' },
    { settings: {} },
  );
  await settle(w);
  assert.equal(w.iperf.runs.length, 6);
  const gone = await w.fake.widgetAction(WIDGET_KEY, 'measure_1', { server: 'nope' }, {});
  assert.match(JSON.stringify(gone.data), /no longer/);
});

test('"Measuring…" while the server is in the queue', async (t) => {
  let release;
  const iperf = createIperf({ '192.0.2.10': () => new Promise((resolve) => (release = resolve)) });
  const w = await world(t, { iperf, config: { servers: 'NAS=192.0.2.10, 192.0.2.11' } });
  w.monitor.enqueue(w.monitor.config.servers[0]);
  const content = await get(w);
  assert.equal(content.components[0].items[0].value, 'Measuring…');
  const { report } = await import('./helpers/world.js');
  release(report('err-refused'));
  await settle(w);
});
