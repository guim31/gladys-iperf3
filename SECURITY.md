# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores under `/data` only the last result of each server and the state of its
scene triggers (`state.json`): no secret, no credential. It only opens outgoing connections to the
iperf3 servers listed in its configuration, on their port (TCP, and UDP in UDP mode), with the
`iperf3` client of the image; it never listens on a port and never starts an iperf3 server.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)), iperf3 itself (see
[esnet/iperf](https://github.com/esnet/iperf)), and the iperf3 servers the integration talks to.
