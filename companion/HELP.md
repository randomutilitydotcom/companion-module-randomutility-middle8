# RandomUtility Middle8 Companion module

Control RandomUtility Middle8 using UDP, TCP or OSC. Existing command actions and
preset buttons remain available. Status fields are available as variables, value
feedbacks and comparison feedbacks. Version 1.2.1 fixes saved-setting application and
OSC bind conflicts for multiple connections.

Command transport and status transport are configured independently.

## Install or update in Companion 4.x

1. Open **Modules**, click **Import module package**, and select
   `companion-module-randomutility-middle8-1.2.1.tgz` without extracting it.
2. For an existing Middle8 connection, open **Connections**, select it, click the
   pencil beside the module version, select **1.2.1**, and save.
3. For a new connection, search for **Middle8** in **Connections**, add it, and
   select version **1.2.1**.
4. Configure the Middle8 command host and ports, then enable status reception as
   described below.

The versioned archive is produced by the official Companion build tool and includes
the manifest, bundled runtime and help. Run `yarn build` to regenerate it.

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
Use a separate local feedback port for each connection or other application.
UDP feedback and OSC feedback both use UDP sockets.

## Multiple Middle8 computers

Remote command ports belong to each Middle8 computer. They can be identical when
those computers have different IPs. Local feedback ports belong to the Companion
computer, so give each active connection a distinct feedback listen port.

For example, if Companion is `10.0.0.100`:

| Setting | Middle8 A connection | Middle8 B connection |
| --- | --- | --- |
| Middle8 remote Host/IP | `10.0.0.10` | `10.0.0.11` |
| Command protocol | UDP | UDP |
| Remote UDP command port | `9000` | `9000` |
| Feedback protocol | UDP | UDP |
| Local UDP feedback port | `9010` | `9110` |
| Companion local listen IP | `0.0.0.0` | `0.0.0.0` |
| Middle8 status-output destination | `10.0.0.100:9010` | `10.0.0.100:9110` |

Saving config closes the old listener and applies the latest settings. Bind errors
include the actual local endpoint in connection status and logs. If a local port is
already occupied, choose another port and save; a Companion restart is not required.

Feedback is accepted only from the configured Middle8 host by default. If Middle8
publishes through a different interface, enter that source IP in **Feedback sender
Host/IP**. Use `*` to accept any sender. This filter updates when settings are saved.
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

## Use status as conditions

Select any **Status: ...** feedback on a Companion button or as a boolean feedback
condition in a trigger. Every field in Middle8's shared status has a feedback,
including source signal, network interfaces, output health/rate, session role and
panic, last preset, DMX control, show, version, timestamp and universe count.

Examples:

| Feedback | Comparison | Expected value |
| --- | --- | --- |
| Status: sources/a_receiving | Equals | `true` |
| Status: sources/b_receiving | Equals | `false` |
| Status: output/working | Equals | `true` |
| Status: session/role | Equals | `Master` |
| Status: session/panic | Equals | `true` |
| Status: preset/index | Equals | `3` |
| Status: control/value | Greater than or equal | `128` |
| Status: universes | Greater than | `0` |

Equality and substring comparisons are case-sensitive. Numeric comparisons require
numeric values. Booleans use `true`/`false`. **Status: Data available** reports
whether any valid status has arrived and has not expired. Each field expires
independently, so continued updates to other fields cannot keep an old value alive.
Missing or expired fields return false for all comparisons (before Companion's
optional Inverted setting). They are also cleared from variables.

**Status: Compare any field** accepts paths such as `output/artnet_targets/0`, or
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
per-field expiry, recovery and configuration reset. A live Companion UI and
Middle8 application session are required to verify the complete operator workflow.
