"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withToken = withToken;
exports.cmdPresetFire = cmdPresetFire;
exports.cmdSessions = cmdSessions;
exports.cmdPanic = cmdPanic;
exports.cmdInputNic = cmdInputNic;
exports.cmdOutputNic = cmdOutputNic;
exports.cmdSourceProtocol = cmdSourceProtocol;
exports.cmdSourceIp = cmdSourceIp;
exports.cmdSourcePriority = cmdSourcePriority;
exports.cmdUniverseClearAll = cmdUniverseClearAll;
exports.cmdUniverseClearCurrent = cmdUniverseClearCurrent;
exports.cmdUniverseClearId = cmdUniverseClearId;
exports.cmdSessionLeave = cmdSessionLeave;
exports.cmdSessionPrio = cmdSessionPrio;
exports.cmdSessionRefreshNics = cmdSessionRefreshNics;
exports.cmdSessionAutoIp = cmdSessionAutoIp;
exports.cmdPresetTrigger = cmdPresetTrigger;
exports.cmdSessionJoinNamed = cmdSessionJoinNamed;
/**
 * Build a plain-text command for UDP/TCP.
 * If token is set, it must be prepended as: "<token> <command>"
 */
function withToken(command, token) {
    const cmd = command.trim();
    if (!token)
        return cmd;
    return `${token} ${cmd}`.trim();
}
function cmdPresetFire(index) {
    return `preset fire ${index}`;
}
function cmdSessions(on) {
    return on ? 'sessions on' : 'sessions off';
}
function cmdPanic(on) {
    return on ? 'panic on' : 'panic off';
}
function cmdInputNic(name) {
    return `input nic ${name}`;
}
function cmdOutputNic(name) {
    return `output nic ${name}`;
}
function cmdSourceProtocol(side, protocol) {
    return `source ${side.toLowerCase()} proto ${protocol}`;
}
function cmdSourceIp(side, ip) {
    return `source ${side.toLowerCase()} ip ${ip}`;
}
function cmdSourcePriority(side, prio) {
    return `source ${side.toLowerCase()} prio ${prio}`;
}
function cmdUniverseClearAll() {
    return `universe clear all`;
}
function cmdUniverseClearCurrent() {
    return `universe clear current`;
}
function cmdUniverseClearId(id) {
    return `universe clear ${id}`;
}
function cmdSessionLeave() {
    return `session leave`;
}
function cmdSessionPrio(prio) {
    return `session prio ${prio}`;
}
function cmdSessionRefreshNics() {
    return `session refresh nics`;
}
function cmdSessionAutoIp() {
    return `session auto ip`;
}
function cmdPresetTrigger(value) {
    return `preset trigger ${value}`;
}
/**
 * Join/create a named session. If prio is provided, include it.
 * Middle8 accepts:
 *   session join "Main Show" 150
 *   session join "Main Show" prio 150
 */
function cmdSessionJoinNamed(name, prio) {
    const safeName = name.trim();
    if (!safeName)
        return `session join`;
    // Quote if it contains spaces
    const nameArg = /\s/.test(safeName) ? `"${safeName.replaceAll('"', '\\"')}"` : safeName;
    if (prio === undefined || Number.isNaN(prio)) {
        return `session join ${nameArg}`;
    }
    // Use the form shown in docs: session join "Main Show" prio 150
    return `session join ${nameArg} prio ${Math.trunc(prio)}`;
}
//# sourceMappingURL=commands.js.map