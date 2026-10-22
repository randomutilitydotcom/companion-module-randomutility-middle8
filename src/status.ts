export type StatusValue = null | string | number | boolean | StatusValue[] | { [key: string]: StatusValue }
export type StatusRecords = Map<string, StatusValue>

const PREFIX = '/middle8/status/'

// Keep these paths aligned with MainWindow._build_shared_status in main.py.
export const FIELDS = [
  'timestamp', 'version', 'show', 'sources/input_interface', 'sources/input_interface_id',
  ...['a', 'b'].flatMap((source) => ['receiving', 'protocol', 'name', 'selection', 'sender_ip',
    'artnet_any', 'sacn_priority'].map((key) => `sources/${source}_${key}`)),
  ...['enabled', 'working', 'interface', 'interface_id', 'rate_hz', 'packets', 'artnet_targets']
    .map((key) => `output/${key}`),
  'session/enabled', 'session/role', 'session/panic', 'preset/name', 'preset/index',
  'control/source', 'control/universe', 'control/channel', 'control/value', 'universes',
]

export function flatten(value: StatusValue, path = '', result: StatusRecords = new Map()): StatusRecords {
  if (value !== null && typeof value === 'object') {
    // Also expose arrays as JSON variables; their elements have individual paths.
    if (path && (Array.isArray(value) || Object.keys(value).length === 0)) result.set(path, value)
    for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}/${key}` : key, result)
  } else {
    result.set(path, value)
  }
  return result
}

function readString(buffer: Buffer, offset: number): [string, number] {
  const end = buffer.indexOf(0, offset)
  if (end < offset) throw new Error('Unterminated OSC string')
  const next = offset + Math.ceil((end - offset + 1) / 4) * 4
  if (next > buffer.length) throw new Error('Truncated OSC string')
  return [buffer.toString('utf8', offset, end), next]
}

export function parseOSC(buffer: Buffer, depth = 0): StatusRecords {
  if (depth > 16) throw new Error('OSC bundle nesting limit exceeded')
  const [address, offset] = readString(buffer, 0)
  if (address === '#bundle') {
    if (buffer.length < 16) throw new Error('Truncated OSC bundle')
    const records: StatusRecords = new Map()
    let cursor = 16
    while (cursor < buffer.length) {
      const length = buffer.readUInt32BE(cursor)
      cursor += 4
      if (!length || cursor + length > buffer.length) throw new Error('Invalid OSC bundle element')
      for (const [key, value] of parseOSC(buffer.subarray(cursor, cursor + length), depth + 1)) records.set(key, value)
      cursor += length
    }
    return records
  }
  if (!address.startsWith(PREFIX)) return new Map()
  const [tags, start] = readString(buffer, offset)
  let value: StatusValue
  switch (tags) {
    case ',T': value = true; break
    case ',F': value = false; break
    case ',N': value = null; break
    case ',i': value = buffer.readInt32BE(start); break
    case ',f': value = buffer.readFloatBE(start); break
    case ',s': [value] = readString(buffer, start); break
    default: throw new Error(`Unsupported status OSC type ${tags}`)
  }
  return new Map([[address.slice(PREFIX.length), value]])
}

export function parseText(text: string): StatusRecords {
  const trimmed = text.trim()
  if (!trimmed) return new Map()
  if (trimmed.startsWith('{')) {
    const value = JSON.parse(trimmed)
    return flatten(value)
  }
  const records: StatusRecords = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const match = line.match(/^\/middle8\/status\/(\S+) (.*)$/)
    if (!match) throw new Error('Expected Middle8 JSON or raw status record')
    let value: StatusValue = match[2]
    if (value === 'true' || value === 'false') value = value === 'true'
    // Preserve text (including numeric-looking show names and IP addresses).
    records.set(match[1], value)
  }
  return records
}

export function compare(actual: StatusValue | undefined, operator: unknown, expected: unknown): boolean {
  if (actual === undefined) return false
  const text = actual === null ? '-' : typeof actual === 'object' ? JSON.stringify(actual) : String(actual)
  const target = String(expected ?? '')
  switch (operator) {
    case 'eq': return text === target
    case 'ne': return text !== target
    case 'contains': return text.includes(target)
    case 'not_contains': return !text.includes(target)
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (!text.trim() || !target.trim()) return false
      const a = Number(text), b = Number(target)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      return operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : a <= b
    }
    default: return false
  }
}

export function variableId(path: string): string { return `status_${path.replace(/[^a-zA-Z0-9_]/g, '_')}` }


