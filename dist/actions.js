"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActionDefinitions = getActionDefinitions;
const commands_js_1 = require("./commands.js");
function dropdown(id, label, choices, def) {
    return {
        type: 'dropdown',
        id,
        label,
        choices,
        default: def,
    };
}
function num(id, label, def, min, max) {
    return {
        type: 'number',
        id,
        label,
        default: def,
        step: 1,
        min: min ?? 0,
        max: max ?? 65535,
    };
}
function text(id, label, def = '') {
    return {
        type: 'textinput',
        id,
        label,
        default: def,
    };
}
function getActionDefinitions(self) {
    const sourceSide = dropdown('side', 'Source', [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
    ], 'A');
    return {
        preset_fire: {
            name: 'Preset: Fire (by index)',
            options: [num('index', 'Preset index', 0, 0, 9999)],
            callback: async (action) => {
                const idx = Number(action.options.index);
                await self.sendPresetFire(idx);
            },
        },
        preset_trigger: {
            name: 'Preset: Trigger (DMX value)',
            options: [num('value', 'Trigger value (0-255)', 127, 0, 255)],
            callback: async (action) => {
                const value = Number(action.options.value);
                await self.sendPresetTrigger(value);
            },
        },
        sessions_onoff: {
            name: 'Sessions: On/Off',
            options: [dropdown('state', 'State', [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }], 'on')],
            callback: async (action) => {
                const on = action.options.state === 'on';
                await self.sendTextCommand((0, commands_js_1.cmdSessions)(on));
            },
        },
        panic_onoff: {
            name: 'Panic: On/Off',
            options: [dropdown('state', 'State', [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }], 'off')],
            callback: async (action) => {
                const on = action.options.state === 'on';
                await self.sendTextCommand((0, commands_js_1.cmdPanic)(on));
            },
        },
        input_nic: {
            name: 'Input NIC: Set',
            options: [text('name', 'NIC name (exact)')],
            callback: async (action) => {
                await self.sendTextCommand((0, commands_js_1.cmdInputNic)(String(action.options.name ?? '').trim()));
            },
        },
        output_nic: {
            name: 'Output NIC: Set',
            options: [text('name', 'NIC name (exact)')],
            callback: async (action) => {
                await self.sendTextCommand((0, commands_js_1.cmdOutputNic)(String(action.options.name ?? '').trim()));
            },
        },
        source_protocol: {
            name: 'Source: Protocol',
            options: [
                sourceSide,
                dropdown('proto', 'Protocol', [
                    { id: 'artnet', label: 'Art-Net' },
                    { id: 'sacn', label: 'sACN' },
                ], 'sacn'),
            ],
            callback: async (action) => {
                const side = String(action.options.side);
                const proto = String(action.options.proto);
                await self.sendTextCommand((0, commands_js_1.cmdSourceProtocol)(side, proto));
            },
        },
        source_ip: {
            name: 'Source: IP',
            options: [sourceSide, text('ip', 'IP address')],
            callback: async (action) => {
                const side = String(action.options.side);
                const ip = String(action.options.ip ?? '').trim();
                await self.sendTextCommand((0, commands_js_1.cmdSourceIp)(side, ip));
            },
        },
        source_prio: {
            name: 'Source: sACN Priority',
            options: [sourceSide, num('prio', 'Priority', 100, 0, 200)],
            callback: async (action) => {
                const side = String(action.options.side);
                const prio = Number(action.options.prio);
                await self.sendTextCommand((0, commands_js_1.cmdSourcePriority)(side, prio));
            },
        },
        universe_clear_all: {
            name: 'Universe: Clear all',
            options: [],
            callback: async () => {
                await self.sendTextCommand((0, commands_js_1.cmdUniverseClearAll)());
            },
        },
        universe_clear_current: {
            name: 'Universe: Clear current',
            options: [],
            callback: async () => {
                await self.sendTextCommand((0, commands_js_1.cmdUniverseClearCurrent)());
            },
        },
        universe_clear_id: {
            name: 'Universe: Clear by ID',
            options: [num('id', 'Universe ID', 0, 0, 65535)],
            callback: async (action) => {
                await self.sendTextCommand((0, commands_js_1.cmdUniverseClearId)(Number(action.options.id)));
            },
        },
        session_join_named: {
            name: 'Session: Join/Create (name + optional priority)',
            options: [
                text('name', 'Session name', 'Main Show'),
                num('prio', 'Priority (0-200) (optional)', 150, 0, 200),
                dropdown('use_prio', 'Include priority?', [{ id: 'no', label: 'No' }, { id: 'yes', label: 'Yes' }], 'no'),
            ],
            callback: async (action) => {
                const name = String(action.options.name ?? '').trim();
                const usePrio = action.options.use_prio === 'yes';
                const prio = usePrio ? Number(action.options.prio) : undefined;
                await self.sendTextCommand((0, commands_js_1.cmdSessionJoinNamed)(name, prio));
            },
        },
        session_leave: {
            name: 'Session: Leave',
            options: [],
            callback: async () => self.sendTextCommand((0, commands_js_1.cmdSessionLeave)()),
        },
        session_prio: {
            name: 'Session: Set local priority',
            options: [num('prio', 'Priority', 180, 0, 200)],
            callback: async (action) => self.sendTextCommand((0, commands_js_1.cmdSessionPrio)(Number(action.options.prio))),
        },
        session_refresh_nics: {
            name: 'Session: Refresh NICs',
            options: [],
            callback: async () => self.sendTextCommand((0, commands_js_1.cmdSessionRefreshNics)()),
        },
        session_auto_ip: {
            name: 'Session: Auto priorities by IP',
            options: [],
            callback: async () => self.sendTextCommand((0, commands_js_1.cmdSessionAutoIp)()),
        },
        raw_command: {
            name: 'Advanced: Send raw command',
            options: [text('cmd', 'Command (without token)', 'preset fire 0')],
            callback: async (action) => {
                const cmd = String(action.options.cmd ?? '').trim();
                await self.sendTextCommand(cmd);
            },
        },
    };
}
//# sourceMappingURL=actions.js.map