import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField, type CompanionBooleanFeedbackDefinition, type CompanionValueFeedbackDefinition, type CompanionVariableValues } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getPresets } from './presets.js'
import { withToken, cmdPresetFire, cmdPresetTrigger } from './commands.js'
import { sendUdpText, sendTcpText, sendOscCmd, sendOscPresetFire, sendOscPresetTrigger } from './network.js'

import { FIELDS, compare, variableId, type StatusRecords, type StatusValue } from './status.js'
import { StatusReceiver, statusPort, type StatusConfig } from './status-receiver.js'

export type Transport = 'udp' | 'tcp' | 'osc'

export interface Middle8Config extends StatusConfig {
  host: string
  transport: Transport
  udpPort: number
  tcpPort: number
  oscPort: number
  token?: string
  // OSC does not require token, but allow it if user wants /cmd token mode or shortcut token mode:
  includeTokenInOsc?: boolean
  // For preset fire over OSC: use shortcut `/preset/fire` (recommended) vs `/cmd`
  oscPresetUsesShortcut?: boolean
}

export class Middle8Instance extends InstanceBase<Middle8Config> {
  public config: Middle8Config
  private _statusReceiver: StatusReceiver | null = null
  private _statusTimer: ReturnType<typeof setInterval> | null = null
  public _statusValues = new Map<string, { value: StatusValue; received: number }>()
  private _statusFields = new Set(FIELDS)
  public _lastStatus = 0
  private _statusGeneration = 0

  constructor(internal: unknown) {
    super(internal)
    this.config = {
      host: '127.0.0.1',
      transport: 'udp',
      udpPort: 9000,
      tcpPort: 9001,
      oscPort: 9002,
      token: '',
      includeTokenInOsc: false,
      oscPresetUsesShortcut: true,
    }
  }

  async init(config: Middle8Config): Promise<void> {
    this.config = { ...config }
    this.updateStatus(InstanceStatus.Ok)
    this.setActionDefinitions(getActionDefinitions(this))
    this.setPresetDefinitions(getPresets(this))
    await this._initStatus()
  }

  async configUpdated(config: Middle8Config): Promise<void> {
    this.config = { ...config }
    await this._initStatus()
  }

  async destroy(): Promise<void> {
    ++this._statusGeneration
    await this._closeStatus()
  }

  async _closeStatus() {
    if (this._statusTimer) clearInterval(this._statusTimer)
    this._statusTimer = null
    const receiver = this._statusReceiver
    this._statusReceiver = null
    if (receiver) await receiver.close()
  }

  async _initStatus() {
    const generation = ++this._statusGeneration
    const config = { ...this.config }
    await this._closeStatus()
    if (generation !== this._statusGeneration) return
    this._statusValues.clear()
    this._lastStatus = 0
    this._defineStatus()
    this.setVariableValues(Object.fromEntries([
      ...[...this._statusFields].map((path) => [variableId(path), undefined]),
      ['status_available', false],
    ]))
    this.checkFeedbacks()
    if (!config.status_enabled) {
      this.updateStatus(InstanceStatus.Ok, 'Commands ready; status reception disabled')
      return
    }
    this.updateStatus(InstanceStatus.Connecting, 'Waiting for Middle8 status')
    try {
      const endpoint = `${config.status_transport || 'udp'} ${config.status_bind || '0.0.0.0'}:${statusPort(config)}`
      this.log('info', `Starting feedback listener on ${endpoint}; sender ${config.status_source_host || config.host || '*'}`)
      const receiver = new StatusReceiver(config,
        (records) => { if (generation === this._statusGeneration) this._receiveStatus(records) },
        (error, fatal) => {
          if (generation !== this._statusGeneration) return
          this.log(fatal ? 'error' : 'debug', `Status receiver: ${error.message}`)
          if (fatal) {
            this._statusValues.clear()
            this._lastStatus = 0
            this.setVariableValues(Object.fromEntries([
              ...[...this._statusFields].map((path) => [variableId(path), undefined]),
              ['status_available', false],
            ]))
            this.checkFeedbacks()
            this.updateStatus(InstanceStatus.ConnectionFailure, `Feedback listener ${endpoint}: ${error.message}`)
          }
        },
        () => { if (generation === this._statusGeneration) this.log('info', `Feedback listener ready on ${endpoint}`) })
      this._statusReceiver = receiver
      const ready = await receiver.ready
      if (!ready || generation !== this._statusGeneration) return
      this._statusTimer = setInterval(() => this._expireStatus(), 250)
    } catch (error) {
      if (generation !== this._statusGeneration) return
      this.updateStatus(InstanceStatus.BadConfig, `Status listener: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  _defineStatus() {
    this.setVariableDefinitions([
      { variableId: 'status_available', name: 'Middle8 status available' },
      ...[...this._statusFields].map((path) => ({ variableId: variableId(path), name: `Status: ${path}` })),
    ])
    const style = { bgcolor: 0x008000, color: 0xffffff }
    const comparisonOptions: CompanionBooleanFeedbackDefinition['options'] = [
      { type: 'dropdown', id: 'operator', label: 'Comparison', default: 'eq', choices: [
        { id: 'eq', label: 'Equals' }, { id: 'ne', label: 'Does not equal' },
        { id: 'contains', label: 'Contains' }, { id: 'not_contains', label: 'Does not contain' },
        { id: 'gt', label: 'Greater than' }, { id: 'gte', label: 'Greater than or equal' },
        { id: 'lt', label: 'Less than' }, { id: 'lte', label: 'Less than or equal' },
      ] },
      { type: 'textinput', id: 'value', label: 'Expected value (booleans: true/false)', default: 'true' },
    ]
    const definition = (path?: string): CompanionBooleanFeedbackDefinition => ({
      type: 'boolean', name: `Status: ${path || 'Compare any field'}`, defaultStyle: style,
      description: 'Compare a received status value. Missing or expired values return false.',
      options: path ? comparisonOptions : [
        { type: 'textinput', id: 'path', label: 'Status path (e.g. output/artnet_targets/0)', default: 'sources/a_receiving' },
        ...comparisonOptions,
      ],
      callback: (event) => compare(this._statusValues.get(path || String(event.options.path)
        .replace(/^\/middle8\/status\//, ''))?.value, event.options.operator, event.options.value),
    })
    const valueDefinition = (path?: string): CompanionValueFeedbackDefinition => ({
      type: 'value', name: `Status value: ${path || 'Get any field'}`,
      description: 'Returns the received value for a local variable, button text or expression. Missing or expired data returns null.',
      options: path ? [] : [
        { type: 'textinput', id: 'path', label: 'Status path', default: 'output/interface' },
      ],
      callback: (event) => this._statusValues.get(path || String(event.options.path)
        .replace(/^\/middle8\/status\//, ''))?.value ?? null,
    })
    this.setFeedbackDefinitions({
      status_available: { type: 'boolean', name: 'Status: Data available', defaultStyle: style,
        options: [], callback: () => this._lastStatus > 0 },
      status_compare: definition(),
      status_value: valueDefinition(),
      ...Object.fromEntries([...this._statusFields].map((path) => [variableId(path), definition(path)])),
      ...Object.fromEntries([...this._statusFields].map((path) => [`value_${variableId(path)}`, valueDefinition(path)])),
    })
  }

  _receiveStatus(records: StatusRecords) {
    const now = Date.now()
    const variables: CompanionVariableValues = { status_available: true }
    let definitionsChanged = false
    for (const [path, value] of records) {
      if (!path) continue
      // A new list (or empty-list marker) replaces its previous elements.
      if (Array.isArray(value) || value === '-') {
        for (const key of this._statusValues.keys()) {
          if (key.startsWith(`${path}/`)) {
            this._statusValues.delete(key)
            variables[variableId(key)] = undefined
          }
        }
      }
      if (!this._statusFields.has(path)) {
        this._statusFields.add(path)
        definitionsChanged = true
      }
      this._statusValues.set(path, { value, received: now })
      variables[variableId(path)] = value !== null && typeof value === 'object' ? JSON.stringify(value) : value === null ? '-' : value
    }
    if (definitionsChanged) this._defineStatus()
    this._lastStatus = now
    this.setVariableValues(variables)
    this.checkFeedbacks()
    this.updateStatus(InstanceStatus.Ok, 'Receiving Middle8 status')
  }

  _expireStatus() {
    const timeout = Number(this.config.status_timeout ?? 5) * 1000
    if (!timeout) return
    const now = Date.now()
    const variables: CompanionVariableValues = {}
    for (const [path, record] of this._statusValues) {
      if (now - record.received > timeout) {
        this._statusValues.delete(path)
        variables[variableId(path)] = undefined
      }
    }
    if (this._lastStatus && now - this._lastStatus > timeout) {
      this._lastStatus = 0
      variables.status_available = false
      this.updateStatus(InstanceStatus.Disconnected, 'Middle8 status expired')
    }
    if (Object.keys(variables).length) {
      this.setVariableValues(variables)
      this.checkFeedbacks()
    }
  }


  getConfigFields(): SomeCompanionConfigField[] {
    return [
      {
        type: 'textinput',
        id: 'host',
        label: 'Middle8 remote Host/IP',
        width: 8,
        default: '127.0.0.1',
      },
      {
        type: 'dropdown',
        id: 'transport',
        label: 'Command protocol',
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
        label: 'Remote UDP command port',
        width: 4,
        default: 9000,
        min: 1,
        max: 65535,
      },
      {
        type: 'number',
        id: 'tcpPort',
        label: 'Remote TCP command port',
        width: 4,
        default: 9001,
        min: 1,
        max: 65535,
      },
      {
        type: 'number',
        id: 'oscPort',
        label: 'Remote OSC command port',
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
      { type: 'checkbox', id: 'status_enabled', label: 'Receive Middle8 status', default: false, width: 12 },
      { type: 'dropdown', id: 'status_transport', label: 'Feedback protocol', default: 'udp', width: 4,
        choices: [{ id: 'udp', label: 'UDP (JSON/raw)' }, { id: 'tcp', label: 'TCP (JSON/raw)' },
          { id: 'osc', label: 'OSC over UDP' }] },
      ...(['udp', 'tcp', 'osc'] as const).map((protocol, index): SomeCompanionConfigField => ({
        type: 'number', id: `status_${protocol}_port`, label: `Local ${protocol.toUpperCase()} feedback port`,
        default: this.config[`status_${protocol}_port`] ??
          ((this.config.status_transport || 'udp') === protocol ? this.config.status_port : undefined) ?? (9010 + index),
        min: 1, max: 65535, width: 4,
        tooltip: 'A port on the Companion computer. Give each connection its own feedback port and match it in Middle8 Status Output.',
      })),
      { type: 'textinput', id: 'status_bind', label: 'Companion local listen IP', default: '0.0.0.0', width: 6,
        tooltip: 'An IP belonging to the Companion computer, or 0.0.0.0 for all its IPv4 interfaces. Do not enter the remote Middle8 IP.' },
      { type: 'textinput', id: 'status_source_host', label: 'Feedback sender Host/IP (blank = Middle8 host)', default: '', width: 6,
        tooltip: 'Only accept status from this Middle8 host. Use * to accept any sender, or specify its status-output interface IP.' },
      { type: 'number', id: 'status_timeout', label: 'Status expiry (seconds; 0 = never)',
        default: 5, min: 0, max: 3600, width: 6,
        tooltip: 'Use 0 for change-only output. Periodic output should arrive faster than this timeout.' }
    ]
  }

  /**
   * Send a Middle8 plain-text command (no token).
   * Token handling depends on transport and config.
   */
  async sendTextCommand(command: string): Promise<void> {
    const host = this.config.host?.trim()
    if (!host) {
      this.updateStatus(InstanceStatus.BadConfig, 'Missing host')
      return
    }

    try {
      if (this.config.transport === 'udp') {
        const payload = withToken(command, this.config.token?.trim() || undefined)
        await sendUdpText({ host, port: this.config.udpPort }, payload)
      } else if (this.config.transport === 'tcp') {
        const payload = withToken(command, this.config.token?.trim() || undefined)
        await sendTcpText({ host, port: this.config.tcpPort }, payload)
      } else {
        // OSC: /cmd mode. Middle8 does not require token here, but allow it if user wants.
        const token = this.config.includeTokenInOsc ? (this.config.token?.trim() || undefined) : undefined
        await sendOscCmd({ host, port: this.config.oscPort }, command, token)
      }

      if (!this.config.status_enabled) this.updateStatus(InstanceStatus.Ok)
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      this.updateStatus(InstanceStatus.ConnectionFailure, msg)
      this.log('error', `Send failed: ${msg}`)
    }
  }

  async sendPresetFire(index: number): Promise<void> {
    const host = this.config.host?.trim()
    if (!host) {
      this.updateStatus(InstanceStatus.BadConfig, 'Missing host')
      return
    }

    try {
      if (this.config.transport === 'osc' && this.config.oscPresetUsesShortcut) {
        const token = this.config.includeTokenInOsc ? (this.config.token?.trim() || undefined) : undefined
        await sendOscPresetFire({ host, port: this.config.oscPort }, index, token)
      } else {
        await this.sendTextCommand(cmdPresetFire(index))
      }
      if (!this.config.status_enabled) this.updateStatus(InstanceStatus.Ok)
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      this.updateStatus(InstanceStatus.ConnectionFailure, msg)
      this.log('error', `Preset fire failed: ${msg}`)
    }
  }
  async sendPresetTrigger(value: number): Promise<void> {
    const host = this.config.host?.trim()
    if (!host) {
      this.updateStatus(InstanceStatus.BadConfig, 'Missing host')
      return
    }

    const v = Math.max(0, Math.min(255, Math.trunc(value)))

    try {
      if (this.config.transport === 'osc') {
        const token = this.config.includeTokenInOsc ? (this.config.token?.trim() || undefined) : undefined
        await sendOscPresetTrigger({ host, port: this.config.oscPort }, v, token)
      } else {
        await this.sendTextCommand(cmdPresetTrigger(v)) // UDP/TCP text command
      }
      if (!this.config.status_enabled) this.updateStatus(InstanceStatus.Ok)
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      this.updateStatus(InstanceStatus.ConnectionFailure, msg)
      this.log('error', `Preset trigger failed: ${msg}`)
    }
  }


}

runEntrypoint(Middle8Instance, [])
