# iPerf3 for Gladys Assistant

Measure the speed of your **local network** from [Gladys Assistant](https://gladysassistant.com):
Wi-Fi, powerline, the link to the NAS. The integration runs the [iperf3](https://iperf.fr/) client
against iperf3 servers you run on your own machines, on a schedule and on demand, and gives each
server a Gladys device with its history.

It does not test your internet connection (see
[gladys-speedtest](https://github.com/guim31/gladys-speedtest) for that): every measurement stays
on your network.

## Features

- **One device per iperf3 server**: download and upload speeds (Mbit/s, with history), TCP
  retransmissions, or jitter and packet loss in UDP mode, and "last measurement succeeded".
- **Automatic measurements** every 1 to 24 hours (6 by default) or on demand only, one server at a
  time, upload then download (`-R`), TCP or UDP, 1 to 8 parallel streams.
- **Dashboard widget**: the last speeds of every server, or the live tiles and week chart of one,
  with a button to measure again.
- **Scene triggers**: _iperf3 server unreachable_ (once per outage) and _Speed below the threshold_
  (once per direction, until it goes back up).
- **Scene action**: _Measure an iperf3 server_, with `success`, `download_mbps` and `upload_mbps`
  as outputs.
- Four languages: English, French, German, Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- An iperf3 server (`iperf3 -s`, port 5201 by default) on each machine to measure, reachable from
  the Gladys machine. The client is in the Docker image; the integration never starts a server.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-iperf3` (or install it from the catalog once it is listed).
2. In **Configuration**, list your servers, e.g. `NAS=192.168.1.10, Office=192.168.1.20:5202`, and
   press **Measure all servers now** to check them.
3. Open the **Discover** tab and press **Add to Gladys** for the servers to follow.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## Limitations

- One measurement at a time; an iperf3 server also serves one client at a time (a busy server is
  retried once after 5 seconds).
- The speeds are measured between the Gladys machine and each server, and load that link while
  they run.
- The Gladys sandbox runs on a bridged Docker network: IPv6 servers need IPv6 enabled in Docker.
- Tested against a real iperf3 3.20 server in Docker, not on a real Wi-Fi or powerline network:
  feedback welcome.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js); the
Docker image adds Alpine's `iperf3` package.

```bash
npm install
npm test              # node --test: unit tests + the SDK's fake Gladys and a simulated iperf3
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store --skip-image-check .   # store validator
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            handlers → monitor, Configuration button
src/monitor.js        servers, queue, schedule, states, scene triggers
src/iperf3.js         iperf3 client: command line, JSON reports, errors
src/devices.js        Gladys device of a server (features, names)
src/scenes.js         scene action
src/widgets.js        dashboard widget
src/texts.js          texts sent from the container, four languages
src/store.js          /data persistence
src/config.js         configuration defaults, normalization, server list
```

The test fixtures in `test/fixtures/iperf3/` are real iperf3 3.20 JSON reports (TCP and UDP, both
directions, and the busy, refused, timeout and DNS errors), captured against a server in Docker and
anonymized.

## Credits

- [iperf3](https://github.com/esnet/iperf) (ESnet, BSD-3-Clause): the measurement tool, shipped in
  the Docker image as the Alpine package.
- [Home Assistant](https://www.home-assistant.io)
  ([`iperf3`](https://www.home-assistant.io/integrations/iperf3/), Apache-2.0) for what users
  expect from such an integration: one sensor per direction and host, TCP or UDP, parallel
  streams, a measurement on demand.

Not affiliated with ESnet, iperf3 or Home Assistant.

## License

Apache-2.0, see [LICENSE](LICENSE).
