# RandomUtility Middle8

This module controls **Middle8** using its Remote Control system (UDP / TCP / OSC).

## Connection settings

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

## Actions

- **Preset: Fire** (by index)
- **Sessions: On/Off**
- **Panic: On/Off**
- **Input NIC: Set**
- **Output NIC: Set**
- **Source A/B: Protocol**
- **Source A/B: IP**
- **Source A/B: sACN Priority**
- **Universe: Clear all**
- **Universe: Clear current**
- **Universe: Clear by ID**
- **Session: Join / Leave / Priority / Refresh NICs / Auto priorities by IP**
- **Raw command** (advanced): send any command string from the Middle8 documentation

