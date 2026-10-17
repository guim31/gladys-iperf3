# iPerf3

Measure the speed of your **local network** from Gladys: the Wi-Fi link to the office, the powerline
adapters to the garage, the cable to the NAS. The integration runs the
[iperf3](https://iperf.fr/) client against iperf3 servers **you** run on your machines, on a schedule
and on demand, and keeps the history of each link.

It does not measure your internet connection: for that, see the Speedtest.net integration. Here,
every measurement stays on your network.

## What you get

- **One device per iperf3 server**, with download and upload speeds (Mbit/s, with history), TCP
  retransmissions (or jitter and packet loss in UDP), and "last measurement succeeded".
- **Automatic measurements** every 1 to 24 hours (6 by default), or on demand only.
- A **dashboard widget**: the last speeds of every server, or the tiles and the week chart of one,
  with a button to measure again.
- Two **scene triggers**: a server becomes unreachable, a speed drops below a threshold.
- A **scene action**: measure a server and use the speeds in the next steps.

## Requirements

- Gladys Assistant **5.1.0** or later.
- An **iperf3 server** on each machine to measure: `iperf3 -s` (port 5201 by default). iperf3 exists
  for Linux, Windows, macOS, most NAS (Synology and QNAP packages, Docker image
  `networkstatic/iperf3`) and OpenWrt routers. Start it as a service so it survives a reboot.
- The server must be reachable from the Gladys machine on its TCP port (and UDP port in UDP mode).

The iperf3 client is included in the integration image: nothing to install on the Gladys side. The
integration never starts an iperf3 server.

## Configuration

| Field                        | Meaning                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| iperf3 servers               | Comma-separated list: `address`, or `name=address`, with `:port` when it is not 5201.  |
| Automatic measurement        | Never (on demand only), every 1, 2, 3, 6, 12 hours, or once a day. Default: 6 hours.   |
| Protocol                     | TCP (real throughput, retransmissions) or UDP (fixed bitrate, jitter and packet loss). |
| Duration per direction (s)   | 3 to 20 seconds, 5 by default. A measurement lasts about twice that, plus 2 seconds.   |
| Parallel streams             | 1 to 8. Several streams fill fast links (2.5 Gbit/s and up) better.                    |
| UDP bitrate (Mbit/s)         | UDP only: the bitrate sent. Above what the link carries, the loss rises.               |
| Low speed threshold (Mbit/s) | For the "Speed below the threshold" trigger. 0 turns it off.                           |
| Language of the names        | Language of the feature names and of the messages. Default: French.                    |

Example: `NAS=192.168.1.10, Office=192.168.1.20:5202, [fd00::30]`. Up to 10 servers. A wrong entry is
ignored and listed in the answer of the **Measure all servers now** button and in the logs.

Then open the **Discovery** tab of the integration and add the devices you want to follow. Only the
devices added to Gladys are measured automatically; the **Measure all servers now** button measures
every server of the list, which lets you check the configuration first.

## Devices

Each server gives a device named after it ("iPerf3 192.168.1.10" without a name), with:

| Feature                    | Type          | Notes                                                  |
| -------------------------- | ------------- | ------------------------------------------------------ |
| Download                   | Rate (Mbit/s) | Server → Gladys, measured by the receiver.             |
| Upload                     | Rate (Mbit/s) | Gladys → server, measured by the receiver.             |
| TCP retransmissions        | Counter       | TCP only: segments sent again, both directions summed. |
| Jitter                     | Duration (ms) | UDP only: the worst of the two directions.             |
| Packet loss                | Percentage    | UDP only: the worst of the two directions.             |
| Last measurement succeeded | Binary        | 0 when the last measurement failed (speeds are kept).  |

The values are updated after each measurement, never polled by Gladys. Changing the protocol changes
the features: the Discovery tab then offers to **Update** the devices.

## Dashboard widget

Add the **Local network speed** widget. Without a setting it lists every server with its last
download and upload speeds (or why the last measurement failed), with a **Measure all** button. Choose
one server in its settings (or have only one) to see its live download and upload tiles, the chart of
the last week, the time of the last measurement and a **Measure now** button. The buttons start the
measurement in the background; the widget updates when it ends.

## Scene triggers

- **iperf3 server unreachable**: a measurement could not reach a server that answered before (refused,
  no answer, unknown name). It fires once per outage, again only after a successful measurement. A
  server busy with another test does not count. Filter: the server. Variables: server name, address,
  reason.
- **Speed below the threshold**: the download or upload speed of a measurement is below the threshold
  of the configuration. It fires once per direction, and again only after the speed went back above.
  Filters: the server, the direction. Variables: server name, speed, threshold.

You can also use the usual Gladys trigger "a device value changes" on the Download or Upload feature.

## Scene action

**Measure an iperf3 server** measures the chosen server right away (before any scheduled
measurement) and returns `success` (1 or 0), `download_mbps` and `upload_mbps` for the next steps: a
"Continue only if" on `success`, a message with the speeds. A failed measurement returns `success` = 0
rather than an error, so the scene can react to it.

## Scene examples

- **Powerline watch**: when "Speed below the threshold" fires for the garage adapter, send a message
  "Powerline slow" with the speed variable.
- **NAS down**: when "iperf3 server unreachable" fires for the NAS, send a Telegram message with the
  reason.
- **Nightly check**: every night at 3:00, measure the office Wi-Fi, then send the result in a message.

## Troubleshooting

- **"server unreachable"**: check that `iperf3 -s` runs on the server, that its port (5201 by default)
  is open in its firewall, and that the address is right. From another machine,
  `iperf3 -c <address>` must work.
- **"server busy with another test"**: an iperf3 server serves one client at a time. The integration
  tries again after 5 seconds; another client (or a second Gladys) is probably testing at the same
  time.
- **Low speeds on a fast link**: raise the parallel streams to 4, and the duration. The Gladys machine
  itself (a Raspberry Pi, for example) may be the bottleneck.
- **UDP shows heavy loss**: the UDP bitrate is above what the link carries; lower it.
- More details with `LOG_LEVEL=debug` in the logs of the integration.

## Limits

- One measurement at a time, servers one after the other: 10 servers take a few minutes.
- A measurement loads the measured link: keep the automatic interval reasonable on a busy Wi-Fi.
- The speeds are those between the Gladys machine and the server, not between two other machines.
- The Gladys container runs on a bridged network: an IPv6 server needs IPv6 enabled in Docker.
- With "Never", values do not change by themselves and Gladys may show them as not recent after 48
  hours.
