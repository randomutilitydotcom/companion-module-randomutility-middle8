# RandomUtility Middle8 Companion module

Control RandomUtility Middle8 using UDP, TCP or OSC. Existing command actions and
preset buttons remain available. Status fields are available as variables, value
feedbacks and comparison feedbacks. Version 1.2.4 fixes saved-setting application and
uses Companion's shared UDP feedback socket for multiple connections. It also
initializes and persists new config fields on upgraded connections so Companion
5.1.1 can validate and save edited settings.

Command transport and status transport are configured independently.

## Install or update in Companion 4.x / 5.x

1. Open **Modules**, click **Import module package**, and select
   `companion-module-randomutility-middle8-1.2.4.tgz` without extracting it.
2. For an existing Middle8 connection, open **Connections**, select it, click the
   pencil beside the module version, select **1.2.4**, and save.
3. For a new connection, search for **Middle8** in **Connections**, add it, and
   select version **1.2.4**.
4. Configure the Middle8 command host and ports, then enable status reception as
   described below.

The versioned archive is produced by the official Companion build tool and includes
the manifest, bundled runtime and help. Run `yarn build` to regenerate it.

## Upgrading existing connections

Version 1.2.4 fixes the disabled Save button on upgraded connections in Companion
5.1.1. Previous releases declared defaults for new protocol-specific feedback-port
fields, but did not populate those fields in an already-saved config. Companion
validates the actual stored values, including ports for inactive protocols.

On module initialization, missing fields are now filled and saved automatically.
Existing hosts, protocols, custom command/feedback ports, tokens and timeout
settings are preserved. The original single feedback port is carried into the
selected protocol if its new field is absent. Reopen the connection settings after
selecting version 1.2.4 to load the completed configuration.

## Command connection settings

- **Host**: IP address (or hostname) of the computer running Middle8
- **Protocol**: UDP, TCP, or OSC
- **Ports** (defaults):
  - UDP: `9000`
  - TCP: `9001`
  - OSC: `9002`
- **Token** (optional): If Middle8 Remote Control is configured with a token, you must supply it here.
  - Token is prepended automatically for **UDP/TCP** commands.
  - OSC does not require a token, but you can optionally include it in OSC `/cmd` mode.

## Notes

- Middle8 expects **one command per UDP packet**.
- For TCP, Middle8 expects a **single-command connection**: connect → send one command string → close.


## Connect status output

1. In the Companion connection settings, enable **Receive Middle8 status**.
2. Choose a status transport and listen port. Suggested settings match Middle8:

   | Status transport | Listen port | Middle8 output |
   | --- | --- | --- |
   | UDP (JSON/raw) | 9010 | UDP, JSON or Raw strings |
   | TCP (JSON/raw) | 9011 | TCP, JSON or Raw strings |
   | OSC over UDP | 9012 | OSC |

   Each feedback protocol now has its own saved local listen port. Switching
   protocols uses that protocol's port; older saved single-port settings are
   preserved for the previously selected protocol.
3. Leave **Companion local listen IP** at `0.0.0.0` to listen on all local IPv4
   interfaces, or select an IP belonging to the Companion computer.
4. In Middle8's **Status Output** dialog, enable ongoing status output and the
   matching protocol. Set its destination to the **Companion computer's IP** and
   its port to the Companion status listen port. On the same computer, use
   `127.0.0.1`. For TCP, Companion listens and Middle8 connects to it.
5. Select the status groups to publish in Middle8. Enable periodic output,
   typically every 1000 ms, and use a Companion status expiry such as 5 seconds.
   For change-only output, set expiry to **0**; values then remain until another
   update or a connection configuration change. With expiry disabled, silence
   cannot indicate a disconnected sender.

JSON and raw strings are detected automatically for UDP/TCP. TCP records are
newline-delimited. OSC uses `/middle8/status/...` addresses over UDP; OSC over TCP
is not emitted by Middle8. Each module connection listens to one status transport.
With **Companion local listen IP** set to `0.0.0.0`, UDP and OSC feedback use
Companion's shared socket API. Multiple connections can use the same incoming
port; each connection only accepts its configured Middle8 sender. TCP feedback
and listeners bound to a specific local IP use dedicated sockets.

## Multiple Middle8 computers

Remote command ports belong to each Middle8 computer. They can be identical when
those computers have different IPs. Local feedback ports belong to the Companion
computer. UDP/OSC connections can share a feedback port when the local listen IP
is `0.0.0.0`. Each connection selects packets by the configured Middle8 host/IP.
TCP connections need different local feedback ports.

For example, if Companion is `10.0.0.100`:

| Setting | Middle8 A connection | Middle8 B connection |
| --- | --- | --- |
| Middle8 remote Host/IP | `10.0.0.10` | `10.0.0.11` |
| Command protocol | UDP | UDP |
| Remote UDP command port | `9000` | `9000` |
| Feedback protocol | UDP | UDP |
| Local UDP feedback port | `9010` | `9010` |
| Companion local listen IP | `0.0.0.0` | `0.0.0.0` |
| Middle8 status-output destination | `10.0.0.100:9010` | `10.0.0.100:9010` |

The `0.0.0.0:9010` endpoint in logs is an **incoming feedback listener**; it is
independent of the remote command destination. Changing the remote UDP/TCP/OSC
command port changes where commands are sent. Changing the corresponding **Local
feedback port** changes where status is received.

When upgrading from 1.2.1 or earlier, select **1.2.4 on every Middle8 connection**.
Disable all older instances using the feedback port, then enable the updated
connections (or restart Companion once after updating every connection). An older
instance's dedicated socket cannot share a port with the new host-managed socket.
Other applications using the same port also need to release it.

Saving config closes the old listener subscription and applies the latest settings. Bind errors
include the actual local endpoint in connection status and logs. If a local port is
already occupied, choose another port and save; a Companion restart is not required.

Feedback is accepted only from the configured Middle8 host by default. If Middle8
publishes through a different interface, enter that source IP in **Feedback sender
Host/IP**. Use `*` to accept any sender; on a shared port this receives every host publishing
to that port. This filter updates when settings are saved.
OSC commands use an OS-assigned source port, allowing concurrent module instances
without competing for a fixed local port.

## Display received values in text and other properties

Every status field automatically updates a connection variable as data arrives.
No comparison feedback or action is needed to populate these variables.

For example, with your connection labelled `middle8`, set button text to:

```text
Output: $(middle8:status_output_interface)
```

If Middle8 sends `Ethernet Show Network` as its output interface, the button
displays `Output: Ethernet Show Network` and changes automatically on updates.
You can insert the same variable into any field that supports variables, including
action options and expressions. Other useful examples are:

| Received value | Connection variable |
| --- | --- |
| Output network card name | `$(middle8:status_output_interface)` |
| Input network card name | `$(middle8:status_sources_input_interface)` |
| Source A name | `$(middle8:status_sources_a_name)` |
| Last preset name | `$(middle8:status_preset_name)` |
| Active show | `$(middle8:status_show)` |
| Output rate | `$(middle8:status_output_rate_hz)` |

Replace `middle8` with your actual connection label. Find and copy the available
variables under Companion's **Variables** page, in your connection's section.

To obtain the value through a feedback, use a **Status value: ...** feedback
(Companion 4.1+). In the button's **Local Variables**, add a variable named
`output_card`, choose **Feedback** as its source and select
**Status value: output/interface** from your Middle8 connection. Use
`$(local:output_card)` in the button text or another field supporting local
variables. **Status value: Get any field** accepts a custom status path instead.

Value feedbacks return the actual received string, number, boolean, list or null;
they do not perform a comparison. Missing or expired fields return null. Connection
variables expose lists as JSON text, while value feedbacks preserve lists as arrays.
Raw transport sends numbers as strings, which can be converted in expressions.
Comparison feedbacks remain available for color rules and trigger conditions.

## Source A and Source B feedbacks

Both sources provide the same seven status fields: receiving, protocol, name,
selection, sender IP, Art-Net any sender and sACN priority. Their comparison
feedbacks expose the same eight operators and the same Inverted option.

For one consistent editor, select **Sources: Compare status (A/B)**, choose
**Source A** or **Source B**, select the field, then set the comparison and value.
For example: Source B / Receiving / Equals / `true`.

Individual feedbacks are named **Status comparison: Source A: Receiving** and
**Status comparison: Source B: Receiving**, with matching names for every other
source field. These are boolean conditions for styles and triggers.

**Status value: Source A: Receiving**, **Status value: Source B: Receiving**, and
**Sources: Get status value (A/B)** return the received value for variables, text
and expressions. Value feedbacks have no comparison operator by design.
Existing feedback IDs and variable names are unchanged.

## Use status as conditions

Select any **Status comparison: ...** feedback on a Companion button or as a boolean feedback
condition in a trigger. Every field in Middle8's shared status has a feedback,
including source signal, network interfaces, output health/rate, session role and
panic, last preset, DMX control, show, version, timestamp and universe count.

Examples:

| Feedback | Comparison | Expected value |
| --- | --- | --- |
| Status comparison: Source A: Receiving | Equals | `true` |
| Status comparison: Source B: Receiving | Equals | `false` |
| Status comparison: output/working | Equals | `true` |
| Status comparison: session/role | Equals | `Master` |
| Status comparison: session/panic | Equals | `true` |
| Status comparison: preset/index | Equals | `3` |
| Status comparison: control/value | Greater than or equal | `128` |
| Status comparison: universes | Greater than | `0` |

Equality and substring comparisons are case-sensitive. Numeric comparisons require
numeric values. Booleans use `true`/`false`. **Status: Data available** reports
whether any valid status has arrived and has not expired. Each field expires
independently, so continued updates to other fields cannot keep an old value alive.
Missing or expired fields return false for all comparisons (before Companion's
optional Inverted setting). They are also cleared from variables.

**Status comparison: Compare any field** accepts paths such as `output/artnet_targets/0`, or
the full `/middle8/status/output/artnet_targets/0` address. New received fields and
list indices also receive individual feedbacks and variable definitions.
JSON exposes `output/artnet_targets` as a JSON array as well as its indexed paths.
Raw/OSC publish list elements individually; use their indexed paths. JSON is the
best choice for lists that change length, because each array replaces its previous
elements. Raw/OSC have no snapshot boundary for detecting removed trailing elements;
those elements clear on expiry (or when an empty-list marker arrives).

## Variables

Use `$(connection_label:status_sources_a_receiving)` or
`$(connection_label:status_session_role)` in button text or expressions, replacing
`connection_label` with your connection label. All paths use a `status_` prefix
with slashes replaced by underscores. For example:

- `output/rate_hz` becomes `status_output_rate_hz`
- `preset/name` becomes `status_preset_name`
- `output/artnet_targets/0` becomes `status_output_artnet_targets_0`
- `status_available` reports overall status availability

Before any data arrives, field variables are unset. Raw numeric values remain
strings; numeric comparison feedbacks convert them when evaluating. For raw/OSC,
an empty collection is represented by `-`. JSON null values are shown as `-`, and
Middle8 OSC null values arrive as the string `None`.

## Development

Run `yarn install --frozen-lockfile` and `yarn test`. Run `yarn build` to compile TypeScript and package the module. Tests cover JSON/raw/OSC parsing, OSC bundles,
comparisons, actual UDP/TCP reception, TCP fragmentation, feedback registration,
per-field expiry, recovery and configuration reset. The IPC integration test starts separate real module processes, exercises the
actual module/base shared-socket implementation, receives UDP on a host broker,
checks peer filtering, saves new ports/protocols and restarts from saved config.
It can also run against the bundled `pkg/main.js` by setting
`MIDDLE8_TEST_ENTRYPOINT` to its absolute path. A live Companion UI and Middle8
application session are still required to verify the complete operator workflow.
