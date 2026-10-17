# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-17

### Added

- One device per iperf3 server of the configuration (`name=address:port`, 10 at most): download
  and upload speeds in Mbit/s, TCP retransmissions or UDP jitter and packet loss, and "last
  measurement succeeded".
- Automatic measurements every 1 to 24 hours (6 by default) or on demand only, one at a time,
  upload then download, TCP or UDP, 1 to 8 parallel streams.
- A "Measure all servers now" button in the Configuration screen, with the results of every server.
- The "Local network speed" dashboard widget: the last speeds of every server, or the tiles and
  week chart of one, with a button to measure again.
- Scene triggers "iperf3 server unreachable" and "Speed below the threshold", and the scene action
  "Measure an iperf3 server" returning the speeds.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/guim31/gladys-iperf3/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-iperf3/releases/tag/v1.0.0
