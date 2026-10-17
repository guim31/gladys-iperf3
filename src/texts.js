// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface (test/i18n.test.js keeps them complete). A device integration
// does not receive the user's language: the `language` field of the
// configuration picks it (a widget request carries its own).
// -----------------------------------------------------------------------------

/** Feature names, frozen at creation in Gladys. */
export const NAMES = {
  en: {
    download: 'Download',
    upload: 'Upload',
    retransmits: 'TCP retransmissions',
    jitter: 'Jitter',
    loss: 'Packet loss',
    success: 'Last measurement succeeded',
  },
  fr: {
    download: 'Débit descendant',
    upload: 'Débit montant',
    retransmits: 'Retransmissions TCP',
    jitter: 'Gigue',
    loss: 'Pertes de paquets',
    success: 'Dernière mesure réussie',
  },
  de: {
    download: 'Download',
    upload: 'Upload',
    retransmits: 'TCP-Neuübertragungen',
    jitter: 'Jitter',
    loss: 'Paketverlust',
    success: 'Letzte Messung erfolgreich',
  },
  es: {
    download: 'Descarga',
    upload: 'Subida',
    retransmits: 'Retransmisiones TCP',
    jitter: 'Jitter',
    loss: 'Pérdida de paquetes',
    success: 'Última medición correcta',
  },
};

/** Why a measurement failed, by IperfError kind. */
export const FAILURES = {
  en: {
    unreachable: 'server unreachable',
    busy: 'server busy with another test',
    timeout: 'no answer in time',
    missing: 'iperf3 is missing from the image',
    error: 'iperf3 error',
  },
  fr: {
    unreachable: 'serveur injoignable',
    busy: 'serveur occupé par un autre test',
    timeout: 'pas de réponse à temps',
    missing: "iperf3 manque dans l'image",
    error: 'erreur iperf3',
  },
  de: {
    unreachable: 'Server nicht erreichbar',
    busy: 'Server durch anderen Test belegt',
    timeout: 'keine Antwort rechtzeitig',
    missing: 'iperf3 fehlt im Image',
    error: 'iperf3-Fehler',
  },
  es: {
    unreachable: 'servidor inaccesible',
    busy: 'servidor ocupado con otra prueba',
    timeout: 'sin respuesta a tiempo',
    missing: 'falta iperf3 en la imagen',
    error: 'error de iperf3',
  },
};

/** Messages of the Configuration button and of the connection status. */
export const MESSAGES = {
  en: {
    noServer: 'No iperf3 server configured: fill in the "iperf3 servers" field.',
    invalid: ({ entries }) => `Ignored entries: ${entries}.`,
    result: ({ name, download, upload }) => `${name}: ↓ ${download} · ↑ ${upload} Mbit/s`,
    failed: ({ name, reason }) => `${name}: ${reason}`,
    stillRunning:
      'Measurements are still running: the results will appear on the devices and the widget.',
    unknownServer: 'This server is no longer in the configuration.',
  },
  fr: {
    noServer: 'Aucun serveur iperf3 configuré : remplissez le champ « Serveurs iperf3 ».',
    invalid: ({ entries }) => `Entrées ignorées : ${entries}.`,
    result: ({ name, download, upload }) => `${name} : ↓ ${download} · ↑ ${upload} Mbit/s`,
    failed: ({ name, reason }) => `${name} : ${reason}`,
    stillRunning:
      'Les mesures continuent : les résultats apparaîtront sur les appareils et dans le widget.',
    unknownServer: "Ce serveur n'est plus dans la configuration.",
  },
  de: {
    noServer: 'Kein iperf3-Server konfiguriert: Füll das Feld „iperf3-Server“ aus.',
    invalid: ({ entries }) => `Ignorierte Einträge: ${entries}.`,
    result: ({ name, download, upload }) => `${name}: ↓ ${download} · ↑ ${upload} Mbit/s`,
    failed: ({ name, reason }) => `${name}: ${reason}`,
    stillRunning:
      'Die Messungen laufen noch: Die Ergebnisse erscheinen an den Geräten und im Widget.',
    unknownServer: 'Dieser Server ist nicht mehr in der Konfiguration.',
  },
  es: {
    noServer: 'No hay ningún servidor iperf3 configurado: rellene el campo «Servidores iperf3».',
    invalid: ({ entries }) => `Entradas ignoradas: ${entries}.`,
    result: ({ name, download, upload }) => `${name}: ↓ ${download} · ↑ ${upload} Mbit/s`,
    failed: ({ name, reason }) => `${name}: ${reason}`,
    stillRunning:
      'Las mediciones siguen en curso: los resultados aparecerán en los dispositivos y en el widget.',
    unknownServer: 'Este servidor ya no está en la configuración.',
  },
};

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, prüf die Logs der Integration.',
  es: 'La inicialización falló, consulte los registros de la integración.',
};

/** A `{ en, fr, de, es }` object from a MESSAGES entry. */
export function localized(key, vars = {}) {
  return Object.fromEntries(
    Object.entries(MESSAGES).map(([lang, table]) => {
      const entry = table[key];
      return [lang, typeof entry === 'function' ? entry(vars[lang] ?? vars) : entry];
    }),
  );
}
