# iPerf3

Miss die Geschwindigkeit deines **Heimnetzes** aus Gladys: das WLAN bis ins Büro, die
Powerline-Adapter bis in die Garage, das Kabel zum NAS. Die Integration startet den
[iperf3](https://iperf.fr/)-Client gegen iperf3-Server, die **du** auf deinen Geräten betreibst,
regelmäßig und auf Anfrage, und speichert den Verlauf jeder Verbindung.

Die Integration misst nicht deinen Internetanschluss: Dafür gibt es die Integration Speedtest.net. Hier bleibt
jede Messung in deinem Netz.

## Was du bekommst

- **Ein Gerät pro iperf3-Server**, mit Download- und Upload-Geschwindigkeit (Mbit/s, mit Verlauf),
  TCP-Neuübertragungen (oder Jitter und Paketverlust bei UDP) und „Letzte Messung erfolgreich“.
- **Automatische Messungen** alle 1 bis 24 Stunden (standardmäßig 6) oder nur auf Anfrage.
- Ein **Dashboard-Widget**: die letzten Werte aller Server oder die Kacheln und das Wochendiagramm
  eines Servers, mit einer Schaltfläche für eine neue Messung.
- Zwei **Szenen-Auslöser**: Ein Server ist nicht mehr erreichbar, eine Geschwindigkeit fällt unter
  eine Schwelle.
- Eine **Szenen-Aktion**: einen Server messen und die Werte in den nächsten Schritten nutzen.

## Voraussetzungen

- Gladys Assistant **5.1.0** oder neuer.
- Ein **iperf3-Server** auf jedem Gerät, das du messen willst: `iperf3 -s` (standardmäßig Port 5201).
  iperf3 gibt es für Linux, Windows, macOS, die meisten NAS (Pakete für Synology und QNAP,
  Docker-Image `networkstatic/iperf3`) und OpenWrt-Router. Starte ihn als Dienst, damit er einen
  Neustart übersteht.
- Der Server muss vom Gladys-Rechner über seinen TCP-Port (und im UDP-Modus über UDP) erreichbar sein.

Der iperf3-Client steckt im Image der Integration: Auf der Gladys-Seite musst du nichts
installieren. Die Integration startet nie einen iperf3-Server.

## Konfiguration

| Feld                                  | Bedeutung                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| iperf3-Server                         | Kommagetrennte Liste: `Adresse` oder `Name=Adresse`, mit `:Port`, wenn er nicht 5201 ist.  |
| Automatische Messung                  | Nie (nur auf Anfrage), alle 1, 2, 3, 6, 12 Stunden oder einmal am Tag. Standard: 6 h.      |
| Protokoll                             | TCP (echter Durchsatz, Neuübertragungen) oder UDP (feste Bitrate, Jitter, Paketverlust).   |
| Dauer pro Richtung (s)                | 3 bis 20 Sekunden, standardmäßig 5. Eine Messung dauert etwa das Doppelte plus 2 Sekunden. |
| Parallele Streams                     | 1 bis 8. Mehrere Streams lasten schnelle Leitungen (ab 2,5 Gbit/s) besser aus.             |
| UDP-Bitrate (Mbit/s)                  | Nur UDP: die gesendete Bitrate. Über dem, was die Leitung schafft, steigt der Verlust.     |
| Schwelle für niedrige Geschwindigkeit | Für den Auslöser „Geschwindigkeit unter der Schwelle“, in Mbit/s. 0 schaltet ihn ab.       |
| Sprache der Namen                     | Sprache der Funktionsnamen und der Nachrichten. Standard: Französisch.                     |

Beispiel: `NAS=192.168.1.10, Büro=192.168.1.20:5202, [fd00::30]`. Bis zu 10 Server. Ein falscher
Eintrag wird ignoriert und in der Antwort der Schaltfläche **Alle Server jetzt messen** sowie in den
Logs genannt.

Öffne dann den Tab **Entdecken** der Integration und füge die Geräte hinzu, die du verfolgen willst.
Nur die zu Gladys hinzugefügten Geräte werden automatisch gemessen; die Schaltfläche **Alle Server
jetzt messen** misst alle Server der Liste, so kannst du die Konfiguration vorher prüfen.

## Geräte

Jeder Server ergibt ein Gerät mit seinem Namen („iPerf3 192.168.1.10“ ohne Namen), mit:

| Funktion                   | Typ                | Hinweise                                                        |
| -------------------------- | ------------------ | --------------------------------------------------------------- |
| Download                   | Datenrate (Mbit/s) | Server → Gladys, vom Empfänger gemessen.                        |
| Upload                     | Datenrate (Mbit/s) | Gladys → Server, vom Empfänger gemessen.                        |
| TCP-Neuübertragungen       | Zähler             | Nur TCP: erneut gesendete Segmente, beide Richtungen summiert.  |
| Jitter                     | Dauer (ms)         | Nur UDP: der schlechtere Wert der beiden Richtungen.            |
| Paketverlust               | Prozent            | Nur UDP: der schlechtere Wert der beiden Richtungen.            |
| Letzte Messung erfolgreich | Binär              | 0, wenn die letzte Messung fehlschlug (Werte bleiben erhalten). |

Die Werte werden nach jeder Messung aktualisiert, nie von Gladys abgefragt. Ein Wechsel des
Protokolls ändert die Funktionen: Der Tab Entdecken bietet dann an, die Geräte zu **aktualisieren**.

## Dashboard-Widget

Füge das Widget **Heimnetz-Geschwindigkeit** hinzu. Ohne Einstellung listet es alle Server mit ihren
letzten Werten (oder dem Grund, warum die letzte Messung fehlschlug), mit einer Schaltfläche **Alle
messen**. Wähle in seinen Einstellungen einen Server (oder hab nur einen), um seine Live-Kacheln, das
Diagramm der letzten Woche, die Zeit der letzten Messung und eine Schaltfläche **Jetzt messen** zu
sehen. Die Schaltflächen starten die Messung im Hintergrund; das Widget aktualisiert sich am Ende.

## Szenen-Auslöser

- **iperf3-Server nicht erreichbar**: Eine Messung konnte einen Server nicht erreichen (abgelehnt, keine Antwort, unbekannter Name). Er startet einmal pro Ausfall und erst nach
  einer erfolgreichen Messung wieder. Ein durch einen anderen Test belegter Server zählt nicht.
  Filter: der Server. Variablen: Servername, Adresse, Grund.
- **Geschwindigkeit unter der Schwelle**: Download oder Upload einer Messung liegt unter der Schwelle
  der Konfiguration. Er startet einmal pro Richtung und erst wieder, wenn der Wert darüber lag.
  Filter: der Server, die Richtung. Variablen: Servername, Geschwindigkeit, Schwelle.

Der übliche Gladys-Auslöser „Ein Gerätewert ändert sich“ funktioniert auch mit Download und Upload.

## Szenen-Aktion

**iperf3-Server messen** misst den gewählten Server sofort (vor geplanten Messungen) und gibt
`success` (1 oder 0), `download_mbps` und `upload_mbps` an die nächsten Schritte weiter: ein „Nur
fortfahren, wenn“ auf `success`, eine Nachricht mit den Werten. Eine fehlgeschlagene Messung gibt
`success` = 0 statt eines Fehlers zurück, damit die Szene darauf reagieren kann.

## Szenen-Beispiele

- **Powerline überwachen**: Wenn „Geschwindigkeit unter der Schwelle“ für den Garagen-Adapter startet,
  schick eine Nachricht „Powerline langsam“ mit der Variable der Geschwindigkeit.
- **NAS ausgefallen**: Wenn „iperf3-Server nicht erreichbar“ für das NAS startet, schick eine
  Telegram-Nachricht mit dem Grund.
- **Nächtliche Prüfung**: Jede Nacht um 3 Uhr das Büro-WLAN messen und das Ergebnis per Nachricht
  schicken.

## Fehlerbehebung

- **„Server nicht erreichbar“**: Prüf, ob `iperf3 -s` auf dem Server läuft, ob sein Port
  (standardmäßig 5201) in seiner Firewall offen ist und ob die Adresse stimmt. Von einem anderen
  Rechner aus muss `iperf3 -c <Adresse>` funktionieren.
- **„Server durch anderen Test belegt“**: Ein iperf3-Server bedient nur einen Client gleichzeitig. Die
  Integration versucht es nach 5 Sekunden erneut; vermutlich testet gerade ein anderer Client (oder
  ein zweites Gladys).
- **Niedrige Werte auf einer schnellen Leitung**: Stell 4 parallele Streams ein und verlängere die
  Dauer. Der Gladys-Rechner selbst (etwa ein Raspberry Pi) kann der Engpass sein.
- **Viel Verlust bei UDP**: Die UDP-Bitrate liegt über dem, was die Leitung schafft; senk sie.
- Mehr Details mit `LOG_LEVEL=debug` in den Logs der Integration.

## Grenzen

- Eine Messung nach der anderen, Server für Server: 10 Server brauchen einige Minuten.
- Eine Messung lastet die gemessene Verbindung aus: Wähl auf einem vollen WLAN ein vernünftiges
  Intervall.
- Gemessen wird zwischen dem Gladys-Rechner und dem Server, nicht zwischen zwei anderen Geräten.
- Der Gladys-Container läuft in einem Bridge-Netz: Ein IPv6-Server braucht IPv6 in Docker.
- Mit „Nie“ ändern sich die Werte nicht von selbst, und Gladys kann sie nach 48 Stunden als veraltet
  anzeigen.
