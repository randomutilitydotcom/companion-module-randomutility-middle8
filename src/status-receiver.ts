import * as dgram from 'dgram'
import * as net from 'net'
import { StringDecoder } from 'string_decoder'
import { parseOSC, parseText, type StatusRecords } from './status.js'

export interface StatusConfig {
  status_enabled?: boolean
  status_transport?: 'udp' | 'tcp' | 'osc'
  status_port?: number
  status_bind?: string
  status_timeout?: number
}

export class StatusReceiver {
  public socket: net.Server | dgram.Socket
  private clients: Set<net.Socket>
  private closed: boolean

  constructor(config: StatusConfig, onRecords: (records: StatusRecords) => void,
    onError: (error: Error, fatal: boolean) => void, onReady: () => void) {
    this.clients = new Set()
    this.closed = false
    const transport = config.status_transport || 'udp'
    const port = Number(config.status_port ?? (transport === 'tcp' ? 9011 : transport === 'osc' ? 9012 : 9010))
    const host = config.status_bind || '0.0.0.0'
    const parse = (payload: Buffer | string) => {
      try {
        const records = transport === 'osc' ? parseOSC(Buffer.isBuffer(payload) ? payload : Buffer.from(payload)) : parseText(typeof payload === 'string' ? payload : payload.toString('utf8'))
        if (records.size && !this.closed) onRecords(records)
      } catch (error) {
        if (!this.closed) onError(error instanceof Error ? error : new Error(String(error)), false)
      }
    }
    if (transport === 'tcp') {
      this.socket = net.createServer((client) => {
        this.clients.add(client)
        const decoder = new StringDecoder('utf8')
        let pending = ''
        client.on('data', (chunk) => {
          pending += decoder.write(chunk)
          if (Buffer.byteLength(pending) > 1024 * 1024) {
            onError(new Error('Status TCP record exceeds 1 MiB'), false)
            client.destroy()
            return
          }
          let newline
          while ((newline = pending.indexOf('\n')) >= 0) {
            parse(pending.slice(0, newline))
            pending = pending.slice(newline + 1)
          }
        })
        client.on('error', (error) => { if (!this.closed) onError(error, false) })
        client.on('close', () => this.clients.delete(client))
      })
      this.socket.on('error', (error) => { if (!this.closed) onError(error, true) })
      this.socket.listen(port, host, onReady)
    } else {
      this.socket = dgram.createSocket('udp4')
      this.socket.on('message', parse)
      this.socket.on('error', (error) => { if (!this.closed) onError(error, true) })
      this.socket.bind(port, host, onReady)
    }
  }

  async close() {
    this.closed = true
    for (const client of this.clients) client.destroy()
    await new Promise<void>((resolve) => {
      try { this.socket.close(resolve) } catch (_) { resolve() }
    })
  }
}


