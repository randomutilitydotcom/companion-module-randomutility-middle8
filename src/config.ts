import type { Middle8Config } from './index.js'

const DEFAULT_CONFIG: Middle8Config = {
  host: '127.0.0.1',
  transport: 'udp',
  udpPort: 9000,
  tcpPort: 9001,
  oscPort: 9002,
  token: '',
  includeTokenInOsc: false,
  oscPresetUsesShortcut: true,
  status_enabled: false,
  status_transport: 'udp',
  status_udp_port: 9010,
  status_tcp_port: 9011,
  status_osc_port: 9012,
  status_bind: '0.0.0.0',
  status_source_host: '',
  status_timeout: 5,
}

export function normalizeConfig(config: Partial<Middle8Config>): Middle8Config {
  const saved = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined && value !== null))
  const result: Middle8Config = { ...DEFAULT_CONFIG, ...saved }
  // Existing connections are not first-init connections: Companion does not
  // populate defaults for fields introduced by a newer module. Carry their
  // original single listen port into the selected protocol before persisting.
  const key = `status_${result.status_transport || 'udp'}_port` as const
  if (config[key] == null && config.status_port != null) result[key] = config.status_port
  return result
}
