"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendUdpText = sendUdpText;
exports.sendTcpText = sendTcpText;
exports.sendOscCmd = sendOscCmd;
exports.sendOscPresetFire = sendOscPresetFire;
exports.sendOscPresetTrigger = sendOscPresetTrigger;
const dgram = __importStar(require("dgram"));
const net = __importStar(require("net"));
const osc_1 = __importDefault(require("osc"));
async function sendUdpText(opts, message) {
    const socket = dgram.createSocket('udp4');
    const buf = Buffer.from(message, 'utf8');
    await new Promise((resolve, reject) => {
        socket.send(buf, opts.port, opts.host, (err) => {
            socket.close();
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
async function sendTcpText(opts, message) {
    await new Promise((resolve, reject) => {
        const client = new net.Socket();
        let done = false;
        const finish = (err) => {
            if (done)
                return;
            done = true;
            try {
                client.destroy();
            }
            catch { }
            if (err)
                reject(err);
            else
                resolve();
        };
        client.setTimeout(opts.timeoutMs ?? 2000);
        client.on('timeout', () => finish(new Error('TCP timeout')));
        client.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
        client.connect(opts.port, opts.host, () => {
            client.write(message, 'utf8', () => {
                // Middle8 wants single-command connections: close right after write.
                client.end();
                finish();
            });
        });
    });
}
/**
 * Send OSC `/cmd` with 1 arg (command string) or 2 args (token + command string).
 */
async function sendOscCmd(opts, command, token) {
    const udpPort = new osc_1.default.UDPPort({
        remoteAddress: opts.host,
        remotePort: opts.port,
        metadata: false,
    });
    await new Promise((resolve, reject) => {
        udpPort.on('ready', () => {
            try {
                const args = token ? [token, command] : [command];
                udpPort.send({ address: '/cmd', args });
                udpPort.close();
                resolve();
            }
            catch (e) {
                try {
                    udpPort.close();
                }
                catch { }
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
        udpPort.on('error', (e) => {
            try {
                udpPort.close();
            }
            catch { }
            reject(e instanceof Error ? e : new Error(String(e)));
        });
        udpPort.open();
    });
}
/**
 * Send OSC shortcut: `/preset/fire` (args: index or [token, index])
 */
async function sendOscPresetFire(opts, index, token) {
    const udpPort = new osc_1.default.UDPPort({
        remoteAddress: opts.host,
        remotePort: opts.port,
        metadata: false,
    });
    await new Promise((resolve, reject) => {
        udpPort.on('ready', () => {
            try {
                const args = token ? [token, index] : [index];
                udpPort.send({ address: '/preset/fire', args });
                udpPort.close();
                resolve();
            }
            catch (e) {
                try {
                    udpPort.close();
                }
                catch { }
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
        udpPort.on('error', (e) => {
            try {
                udpPort.close();
            }
            catch { }
            reject(e instanceof Error ? e : new Error(String(e)));
        });
        udpPort.open();
    });
}
/**
 * Send OSC shortcut: `/preset/trigger` (args: value or [token, value])
 */
async function sendOscPresetTrigger(opts, value, token) {
    const udpPort = new osc_1.default.UDPPort({
        remoteAddress: opts.host,
        remotePort: opts.port,
        metadata: false,
    });
    await new Promise((resolve, reject) => {
        udpPort.on('ready', () => {
            try {
                const args = token ? [token, value] : [value];
                udpPort.send({ address: '/preset/trigger', args });
                udpPort.close();
                resolve();
            }
            catch (e) {
                try {
                    udpPort.close();
                }
                catch { }
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
        udpPort.on('error', (e) => {
            try {
                udpPort.close();
            }
            catch { }
            reject(e instanceof Error ? e : new Error(String(e)));
        });
        udpPort.open();
    });
}
//# sourceMappingURL=network.js.map