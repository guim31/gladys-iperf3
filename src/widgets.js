// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `speeds`.
//
// - One server (chosen in the widget settings, or the only one): download and
//   upload tiles bound to the device (live), their chart over the last week, a
//   status list (last measurement, retransmissions or jitter and loss) and a
//   "Measure now" button.
// - Several servers: one status line per server with its last speeds, and a
//   "Measure all" button.
// Budget (8 components, 1 status, 2 texts): 5 components at most.
//
// Buttons start the measurement in the background and answer at once: the
// measurement takes up to a minute, and the queue refreshes the widget when it
// ends. The server travels in `params`, which the core echoes from the
// content, never from the request.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { displayName, serverIds } from './devices.js';
import { WIDGET_KEY } from './monitor.js';
import { FAILURES } from './texts.js';

export const MAX_STATUS_ITEMS = 10;
export const TTL_SECONDS = 60;
export const ACTION = { MEASURE_ONE: 'measure_1', MEASURE_ALL: 'measure_all' };

export const TEXT = {
  empty: {
    en: 'No iperf3 server yet: add one in the configuration of the iPerf3 integration.',
    fr: "Aucun serveur iperf3 pour l'instant : ajoutez-en un dans la configuration de l'intégration iPerf3.",
    de: 'Noch kein iperf3-Server: Füge einen in der Konfiguration der Integration iPerf3 hinzu.',
    es: 'Aún no hay servidores iperf3: añada uno en la configuración de la integración iPerf3.',
  },
  download: { en: 'Download', fr: 'Descendant', de: 'Download', es: 'Descarga' },
  upload: { en: 'Upload', fr: 'Montant', de: 'Upload', es: 'Subida' },
  last: {
    en: 'Last measurement',
    fr: 'Dernière mesure',
    de: 'Letzte Messung',
    es: 'Última medición',
  },
  never: {
    en: 'Not measured yet',
    fr: 'Pas encore mesuré',
    de: 'Noch nicht gemessen',
    es: 'Aún sin medir',
  },
  measuring: { en: 'Measuring…', fr: 'Mesure en cours…', de: 'Messung läuft…', es: 'Midiendo…' },
  failed: { en: 'Failed', fr: 'Échec', de: 'Fehlgeschlagen', es: 'Error' },
  retransmits: {
    en: 'Retransmissions',
    fr: 'Retransmissions',
    de: 'Neuübertragungen',
    es: 'Retransmisiones',
  },
  jitter: { en: 'Jitter', fr: 'Gigue', de: 'Jitter', es: 'Jitter' },
  loss: { en: 'Packet loss', fr: 'Pertes', de: 'Paketverlust', es: 'Pérdidas' },
  measureOne: { en: 'Measure now', fr: 'Mesurer', de: 'Jetzt messen', es: 'Medir ahora' },
  measureAll: { en: 'Measure all', fr: 'Tout mesurer', de: 'Alle messen', es: 'Medir todos' },
  started: {
    en: 'Measurement started: the widget updates when it ends.',
    fr: 'Mesure lancée : le widget se mettra à jour à la fin.',
    de: 'Messung gestartet: Das Widget aktualisiert sich am Ende.',
    es: 'Medición iniciada: el widget se actualizará al terminar.',
  },
  gone: {
    en: 'This server is no longer in the configuration.',
    fr: "Ce serveur n'est plus dans la configuration.",
    de: 'Dieser Server ist nicht mehr in der Konfiguration.',
    es: 'Este servidor ya no está en la configuración.',
  },
};

const t = (text, language) => text[language] ?? text.en;

/** A speed for a short text: no decimal from 100 Mbit/s up. */
export const formatMbps = (value) => (value >= 100 ? String(Math.round(value)) : String(value));

function formatDate(iso, language) {
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

/** One status line of a server: its speeds, or why it has none (≤ 40 characters). */
export function statusValue(monitor, server, language) {
  if (monitor.isMeasuring(server)) {
    return { value: t(TEXT.measuring, language), color: WIDGET_COLORS.INFO };
  }
  const result = monitor.lastResult(server);
  if (!result) {
    return { value: t(TEXT.never, language), color: WIDGET_COLORS.NEUTRAL };
  }
  if (!result.ok) {
    const reasons = FAILURES[language] ?? FAILURES.en;
    return {
      value: (reasons[result.error] ?? reasons.error).slice(0, 40),
      color: WIDGET_COLORS.DANGER,
    };
  }
  const { download, upload } = result.values;
  return {
    value: `↓ ${formatMbps(download)} · ↑ ${formatMbps(upload)} Mbit/s`,
    color: WIDGET_COLORS.SUCCESS,
  };
}

/** The servers a widget instance shows. */
export function selectedServers(monitor, settings) {
  if (typeof settings?.device === 'string' && settings.device !== '') {
    const server = monitor.serverOfDevice(settings.device);
    return server ? [server] : [];
  }
  const created = monitor.createdServers();
  return (created.length > 0 ? created : monitor.config.servers).slice(0, MAX_STATUS_ITEMS);
}

function singleServer(monitor, server, language) {
  const result = monitor.lastResult(server);
  // A result of the other protocol (just switched) shows its speeds only.
  const { protocol } = monitor.config;
  const components = [];
  if (monitor.isCreated(server)) {
    const ids = serverIds(monitor.gladys, server.id);
    components.push(
      {
        type: 'value',
        label: t(TEXT.download, language),
        device_feature: ids.download,
        icon: 'arrow-down',
      },
      {
        type: 'value',
        label: t(TEXT.upload, language),
        device_feature: ids.upload,
        icon: 'arrow-up',
      },
      {
        type: 'chart',
        device_features: [ids.download, ids.upload],
        interval: 'last-week',
        chart_type: 'line',
        unit: 'Mbit/s',
      },
    );
  } else if (result?.ok) {
    components.push(
      {
        type: 'value',
        label: t(TEXT.download, language),
        value: result.values.download,
        unit: 'Mbit/s',
      },
      {
        type: 'value',
        label: t(TEXT.upload, language),
        value: result.values.upload,
        unit: 'Mbit/s',
      },
    );
  }
  const status = statusValue(monitor, server, language);
  const items = [
    {
      label: t(TEXT.last, language),
      value:
        result && !monitor.isMeasuring(server) ? formatDate(result.at, language) : status.value,
      color: status.color,
    },
  ];
  if (result && !result.ok && !monitor.isMeasuring(server)) {
    items.push({ label: t(TEXT.failed, language), value: status.value, color: status.color });
  }
  if (result?.ok && protocol === 'tcp' && Number.isFinite(result.values.retransmits)) {
    items.push({ label: t(TEXT.retransmits, language), value: result.values.retransmits });
  }
  if (result?.ok && protocol === 'udp' && Number.isFinite(result.values.jitter)) {
    items.push({ label: t(TEXT.jitter, language), value: `${result.values.jitter} ms` });
  }
  if (result?.ok && protocol === 'udp' && Number.isFinite(result.values.loss)) {
    items.push({ label: t(TEXT.loss, language), value: `${result.values.loss} %` });
  }
  components.push({ type: 'status', items });
  components.push({
    type: 'button',
    label: t(TEXT.measureOne, language),
    icon: 'activity',
    style: 'secondary',
    action: { key: ACTION.MEASURE_ONE, params: { server: server.id } },
  });
  return components;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language = 'en' }) {
      const servers = selectedServers(monitor, settings);
      if (servers.length === 0) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', variant: 'body', text: t(TEXT.empty, language) }],
        };
      }
      if (servers.length === 1) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: singleServer(monitor, servers[0], language),
        };
      }
      return {
        ttl_seconds: TTL_SECONDS,
        components: [
          {
            type: 'status',
            items: servers.map((server) => ({
              label: displayName(server).slice(0, 40),
              ...statusValue(monitor, server, language),
            })),
          },
          {
            type: 'button',
            label: t(TEXT.measureAll, language),
            icon: 'activity',
            style: 'secondary',
            action: { key: ACTION.MEASURE_ALL },
          },
        ],
      };
    },

    async action(monitor, { actionKey, params, settings }) {
      let servers = [];
      if (actionKey === ACTION.MEASURE_ONE) {
        const server = monitor.server(params?.server);
        servers = server ? [server] : [];
      } else if (actionKey === ACTION.MEASURE_ALL) {
        servers = selectedServers(monitor, settings);
      }
      if (servers.length === 0) {
        return TEXT.gone;
      }
      // In the background: the queue refreshes the widget at the end.
      for (const server of servers) {
        monitor.enqueue(server, { priority: true });
      }
      return TEXT.started;
    },
  },
};
