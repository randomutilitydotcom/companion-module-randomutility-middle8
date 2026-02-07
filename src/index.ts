import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getPresets } from './presets.js'
import { withToken, cmdPresetFire, cmdPresetTrigger } from './commands.js'
import { sendUdpText, sendTcpText, sendOscCmd, sendOscPresetFire, sendOscPresetTrigger } from './network.js'

export type Transport = 'udp' | 'tcp' | 'osc'

export interface Middle8Config {
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
    this.config = config
    this.updateStatus(InstanceStatus.Ok)
    this.setActionDefinitions(getActionDefinitions(this))
    this.setPresetDefinitions(getPresets(this))
  }

  async configUpdated(config: Middle8Config): Promise<void> {
    this.config = config
    this.updateStatus(InstanceStatus.Ok)
  }

  async destroy(): Promise<void> {
    // nothing persistent to close
  }

  getConfigFields(): SomeCompanionConfigField[] {
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

      this.updateStatus(InstanceStatus.Ok)
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
      this.updateStatus(InstanceStatus.Ok)
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
      this.updateStatus(InstanceStatus.Ok)
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      this.updateStatus(InstanceStatus.ConnectionFailure, msg)
      this.log('error', `Preset trigger failed: ${msg}`)
    }
  }


}

runEntrypoint(Middle8Instance, [])
