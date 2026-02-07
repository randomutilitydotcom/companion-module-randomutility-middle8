"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Middle8Instance = void 0;
const base_1 = require("@companion-module/base");
const actions_js_1 = require("./actions.js");
const presets_js_1 = require("./presets.js");
const commands_js_1 = require("./commands.js");
const network_js_1 = require("./network.js");
class Middle8Instance extends base_1.InstanceBase {
    config;
    constructor(internal) {
        super(internal);
        this.config = {
            host: '127.0.0.1',
            transport: 'udp',
            udpPort: 9000,
            tcpPort: 9001,
            oscPort: 9002,
            token: '',
            includeTokenInOsc: false,
            oscPresetUsesShortcut: true,
        };
    }
    async init(config) {
        this.config = config;
        this.updateStatus(base_1.InstanceStatus.Ok);
        this.setActionDefinitions((0, actions_js_1.getActionDefinitions)(this));
        this.setPresetDefinitions((0, presets_js_1.getPresets)(this));
    }
    async configUpdated(config) {
        this.config = config;
        this.updateStatus(base_1.InstanceStatus.Ok);
    }
    async destroy() {
        // nothing persistent to close
    }
    getConfigFields() {
        return [
            {
                type: 'textinput',
                id: 'host',
                label: 'Middle8 Host/IP',
                width: 8,
                default: '127.0.0.1',
            },
            {
                type: 'dropdown',
                id: 'transport',
                label: 'Protocol',
                width: 4,
                default: 'udp',
                choices: [
                    { id: 'udp', label: 'UDP' },
                    { id: 'tcp', label: 'TCP' },
                    { id: 'osc', label: 'OSC' },
                ],
            },
            {
                type: 'number',
                id: 'udpPort',
                label: 'UDP Port',
                width: 4,
                default: 9000,
                min: 1,
                max: 65535,
            },
            {
                type: 'number',
                id: 'tcpPort',
                label: 'TCP Port',
                width: 4,
                default: 9001,
                min: 1,
                max: 65535,
            },
            {
                type: 'number',
                id: 'oscPort',
                label: 'OSC Port',
                width: 4,
                default: 9002,
                min: 1,
                max: 65535,
            },
            {
                type: 'textinput',
                id: 'token',
                label: 'Remote token (optional)',
                width: 12,
                default: '',
            },
            {
                type: 'checkbox',
                id: 'includeTokenInOsc',
                label: 'Include token in OSC (/cmd or shortcuts)',
                width: 6,
                default: false,
            },
            {
                type: 'checkbox',
                id: 'oscPresetUsesShortcut',
                label: 'OSC preset fire uses /preset/fire shortcut',
                width: 6,
                default: true,
            },
        ];
    }
    /**
     * Send a Middle8 plain-text command (no token).
     * Token handling depends on transport and config.
     */
    async sendTextCommand(command) {
        const host = this.config.host?.trim();
        if (!host) {
            this.updateStatus(base_1.InstanceStatus.BadConfig, 'Missing host');
            return;
        }
        try {
            if (this.config.transport === 'udp') {
                const payload = (0, commands_js_1.withToken)(command, this.config.token?.trim() || undefined);
                await (0, network_js_1.sendUdpText)({ host, port: this.config.udpPort }, payload);
            }
            else if (this.config.transport === 'tcp') {
                const payload = (0, commands_js_1.withToken)(command, this.config.token?.trim() || undefined);
                await (0, network_js_1.sendTcpText)({ host, port: this.config.tcpPort }, payload);
            }
            else {
                // OSC: /cmd mode. Middle8 does not require token here, but allow it if user wants.
                const token = this.config.includeTokenInOsc ? (this.config.token?.trim() || undefined) : undefined;
                await (0, network_js_1.sendOscCmd)({ host, port: this.config.oscPort }, command, token);
            }
            this.updateStatus(base_1.InstanceStatus.Ok);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.updateStatus(base_1.InstanceStatus.ConnectionFailure, msg);
            this.log('error', `Send failed: ${msg}`);
        }
    }
    async sendPresetFire(index) {
        const host = this.config.host?.trim();
        if (!host) {
            this.updateStatus(base_1.InstanceStatus.BadConfig, 'Missing host');
            return;
        }
        try {
            if (this.config.transport === 'osc' && this.config.oscPresetUsesShortcut) {
                const token = this.config.includeTokenInOsc ? (this.config.token?.trim() || undefined) : undefined;
                await (0, network_js_1.sendOscPresetFire)({ host, port: this.config.oscPort }, index, token);
            }
            else {
                await this.sendTextCommand((0, commands_js_1.cmdPresetFire)(index));
            }
            this.updateStatus(base_1.InstanceStatus.Ok);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.updateStatus(base_1.InstanceStatus.ConnectionFailure, msg);
            this.log('error', `Preset fire failed: ${msg}`);
        }
    }
    async sendPresetTrigger(value) {
        const host = this.config.host?.trim();
        if (!host) {
            this.updateStatus(base_1.InstanceStatus.BadConfig, 'Missing host');
            return;
        }
        const v = Math.max(0, Math.min(255, Math.trunc(value)));
        try {
            if (this.config.transport === 'osc') {
                const token = this.config.includeTokenInOsc ? (this.config.token?.trim() || undefined) : undefined;
                await (0, network_js_1.sendOscPresetTrigger)({ host, port: this.config.oscPort }, v, token);
            }
            else {
                await this.sendTextCommand((0, commands_js_1.cmdPresetTrigger)(v)); // UDP/TCP text command
            }
            this.updateStatus(base_1.InstanceStatus.Ok);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.updateStatus(base_1.InstanceStatus.ConnectionFailure, msg);
            this.log('error', `Preset trigger failed: ${msg}`);
        }
    }
}
exports.Middle8Instance = Middle8Instance;
(0, base_1.runEntrypoint)(Middle8Instance, []);
//# sourceMappingURL=index.js.map