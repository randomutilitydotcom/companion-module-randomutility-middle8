import * as dgram from 'dgram'
import * as net from 'net'
import osc from 'osc'

export interface UdpOptions {
  host: string
  port: number
  timeoutMs?: number
}

async function sendUdpPacket(opts: UdpOptions, buf: Buffer): Promise<void> {
  const socket = dgram.createSocket('udp4')

  await new Promise<void>((resolve, reject) => {
    socket.send(buf, opts.port, opts.host, (err) => {
      socket.close()
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function sendUdpText(opts: UdpOptions, message: string): Promise<void> {
  await sendUdpPacket(opts, Buffer.from(message, 'utf8'))
}

export interface TcpOptions {
  host: string
  port: number
  timeoutMs?: number
}

export async function sendTcpText(opts: TcpOptions, message: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const client = new net.Socket()
    let done = false

    const finish = (err?: Error) => {
      if (done) return
      done = true
      try {
        client.destroy()
      } catch {}
      if (err) reject(err)
      else resolve()
    }

    client.setTimeout(opts.timeoutMs ?? 2000)
    client.on('timeout', () => finish(new Error('TCP timeout')))
    client.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))))

    client.connect(opts.port, opts.host, () => {
      client.write(message, 'utf8', () => {
        // Middle8 wants single-command connections: close right after write.
        client.end()
        finish()
      })
    })
  })
}

export interface OscCmdOptions {
  host: string
  port: number
}

/**
 * Send OSC `/cmd` with 1 arg (command string) or 2 args (token + command string).
 */
// Encode OSC without creating a receive port. An unbound UDP socket uses an
// OS-assigned source port and the route to the selected remote host, so multiple
// module instances never compete for osc.UDPPort's default localhost:57121.
async function sendOscPacket(opts: OscCmdOptions, address: string, args: (string | number)[]): Promise<void> {
  const packet = osc.writePacket({ address, args }, { metadata: false }) as Uint8Array
  await sendUdpPacket(opts, Buffer.from(packet))
}

export async function sendOscCmd(opts: OscCmdOptions, command: string, token?: string): Promise<void> {
  await sendOscPacket(opts, '/cmd', token ? [token, command] : [command])
}

export async function sendOscPresetFire(opts: OscCmdOptions, index: number, token?: string): Promise<void> {
  await sendOscPacket(opts, '/preset/fire', token ? [token, index] : [index])
}

export async function sendOscPresetTrigger(opts: OscCmdOptions, value: number, token?: string): Promise<void> {
  await sendOscPacket(opts, '/preset/trigger', token ? [token, value] : [value])
}
