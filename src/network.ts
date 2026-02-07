import * as dgram from 'dgram'
import * as net from 'net'
import osc from 'osc'

export interface UdpOptions {
  host: string
  port: number
  timeoutMs?: number
}

export async function sendUdpText(opts: UdpOptions, message: string): Promise<void> {
  const socket = dgram.createSocket('udp4')
  const buf = Buffer.from(message, 'utf8')

  await new Promise<void>((resolve, reject) => {
    socket.send(buf, opts.port, opts.host, (err) => {
      socket.close()
      if (err) reject(err)
      else resolve()
    })
  })
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
export async function sendOscCmd(opts: OscCmdOptions, command: string, token?: string): Promise<void> {
  const udpPort = new osc.UDPPort({
    remoteAddress: opts.host,
    remotePort: opts.port,
    metadata: false,
  })

  await new Promise<void>((resolve, reject) => {
    udpPort.on('ready', () => {
      try {
        const args: any[] = token ? [token, command] : [command]
        udpPort.send({ address: '/cmd', args })
        udpPort.close()
        resolve()
      } catch (e: any) {
        try {
          udpPort.close()
        } catch {}
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })

    udpPort.on('error', (e: any) => {
      try {
        udpPort.close()
      } catch {}
      reject(e instanceof Error ? e : new Error(String(e)))
    })

    udpPort.open()
  })
}

/**
 * Send OSC shortcut: `/preset/fire` (args: index or [token, index])
 */
export async function sendOscPresetFire(opts: OscCmdOptions, index: number, token?: string): Promise<void> {
  const udpPort = new osc.UDPPort({
    remoteAddress: opts.host,
    remotePort: opts.port,
    metadata: false,
  })

  await new Promise<void>((resolve, reject) => {
    udpPort.on('ready', () => {
      try {
        const args: any[] = token ? [token, index] : [index]
        udpPort.send({ address: '/preset/fire', args })
        udpPort.close()
        resolve()
      } catch (e: any) {
        try {
          udpPort.close()
        } catch {}
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })

    udpPort.on('error', (e: any) => {
      try {
        udpPort.close()
      } catch {}
      reject(e instanceof Error ? e : new Error(String(e)))
    })

    udpPort.open()
  })
}

/**
 * Send OSC shortcut: `/preset/trigger` (args: value or [token, value])
 */
export async function sendOscPresetTrigger(opts: OscCmdOptions, value: number, token?: string): Promise<void> {
  const udpPort = new osc.UDPPort({
    remoteAddress: opts.host,
    remotePort: opts.port,
    metadata: false,
  })

  await new Promise<void>((resolve, reject) => {
    udpPort.on('ready', () => {
      try {
        const args: any[] = token ? [token, value] : [value]
        udpPort.send({ address: '/preset/trigger', args })
        udpPort.close()
        resolve()
      } catch (e: any) {
        try {
          udpPort.close()
        } catch {}
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })

    udpPort.on('error', (e: any) => {
      try {
        udpPort.close()
      } catch {}
      reject(e instanceof Error ? e : new Error(String(e)))
    })

    udpPort.open()
  })
}
