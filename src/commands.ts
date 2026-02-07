export type SourceSide = 'A' | 'B'

export type Protocol = 'udp' | 'tcp' | 'osc'

export interface Middle8CommandParts {
  token?: string
}

/**
 * Build a plain-text command for UDP/TCP.
 * If token is set, it must be prepended as: "<token> <command>"
 */
export function withToken(command: string, token?: string): string {
  const cmd = command.trim()
  if (!token) return cmd
  return `${token} ${cmd}`.trim()
}

export function cmdPresetFire(index: number): string {
  return `preset fire ${index}`
}

export function cmdSessions(on: boolean): string {
  return on ? 'sessions on' : 'sessions off'
}

export function cmdPanic(on: boolean): string {
  return on ? 'panic on' : 'panic off'
}

export function cmdInputNic(name: string): string {
  return `input nic ${name}`
}

export function cmdOutputNic(name: string): string {
  return `output nic ${name}`
}

export function cmdSourceProtocol(side: SourceSide, protocol: string): string {
  return `source ${side.toLowerCase()} proto ${protocol}`
}

export function cmdSourceIp(side: SourceSide, ip: string): string {
  return `source ${side.toLowerCase()} ip ${ip}`
}

export function cmdSourcePriority(side: SourceSide, prio: number): string {
  return `source ${side.toLowerCase()} prio ${prio}`
}

export function cmdUniverseClearAll(): string {
  return `universe clear all`
}

export function cmdUniverseClearCurrent(): string {
  return `universe clear current`
}

export function cmdUniverseClearId(id: number): string {
  return `universe clear ${id}`
}

export function cmdSessionLeave(): string {
  return `session leave`
}

export function cmdSessionPrio(prio: number): string {
  return `session prio ${prio}`
}

export function cmdSessionRefreshNics(): string {
  return `session refresh nics`
}

export function cmdSessionAutoIp(): string {
  return `session auto ip`
}

export function cmdPresetTrigger(value: number): string {
  return `preset trigger ${value}`
}

/**
 * Join/create a named session. If prio is provided, include it.
 * Middle8 accepts:
 *   session join "Main Show" 150
 *   session join "Main Show" prio 150
 */
export function cmdSessionJoinNamed(name: string, prio?: number): string {
  const safeName = name.trim()
  if (!safeName) return `session join`

  // Quote if it contains spaces
  const nameArg = /\s/.test(safeName) ? `"${safeName.replaceAll('"', '\\"')}"` : safeName

  if (prio === undefined || Number.isNaN(prio)) {
    return `session join ${nameArg}`
  }

  // Use the form shown in docs: session join "Main Show" prio 150
  return `session join ${nameArg} prio ${Math.trunc(prio)}`
}
