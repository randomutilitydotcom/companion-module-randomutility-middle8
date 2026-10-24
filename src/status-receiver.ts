import * as dgram from 'dgram'
import * as net from 'net'
import { StringDecoder } from 'string_decoder'
import { EventEmitter } from 'events'
import { lookup } from 'dns/promises'
import type { SharedUdpSocket } from '@companion-module/base'
import { SharedFeedbackSocket } from './shared-feedback-socket.js'
import { parseOSC, parseText, type StatusRecords } from './status.js'

export interface StatusConfig {
  host?: string
  status_enabled?: boolean
  status_transport?: 'udp' | 'tcp' | 'osc'
  status_port?: number
  status_udp_port?: number
  status_tcp_port?: number
  status_osc_port?: number
  status_bind?: string
  status_source_host?: string
  status_timeout?: number
}

export function statusPort(config: StatusConfig): number {
  const protocol = config.status_transport || 'udp'
  return Number(config[`status_${protocol}_port`] ?? config.status_port ??
    (protocol === 'tcp' ? 9011 : protocol === 'osc' ? 9012 : 9010))
}

export class StatusReceiver {
  public socket: net.Server | dgram.Socket | SharedFeedbackSocket
  private clients: Set<net.Socket>
  private closed = false
  public ready: Promise<boolean>
  private closePromise?: Promise<void>

  constructor(config: StatusConfig, onRecords: (records: StatusRecords) => void,
    onError: (error: Error, fatal: boolean) => void, onReady: () => void,
    createSharedSocket?: () => SharedUdpSocket) {
    this.clients = new Set()
    const transport = config.status_transport || 'udp'
    const port = statusPort(config)
    const host = config.status_bind?.trim() || '0.0.0.0'
    let sourceAddresses: Set<string> | undefined
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
        if (this.closed || (sourceAddresses && !sourceAddresses.has((client.remoteAddress || '').replace(/^::ffff:/, '')))) {
          client.destroy()
          return
        }
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
    } else {
      // Companion owns the shared socket across module processes. Every subscriber
      // gets the datagram; each instance's source filter selects its Middle8 host.
      // The shared API always listens on all interfaces, so explicit local IPs
      // continue to use a dedicated socket.
      this.socket = host === '0.0.0.0' && createSharedSocket ? new SharedFeedbackSocket(createSharedSocket()) : dgram.createSocket('udp4')
      this.socket.on('message', (packet: Buffer, peer: dgram.RemoteInfo) => {
        if (!sourceAddresses || sourceAddresses.has(peer.address)) parse(packet)
      })
    }
    let complete: (value: boolean) => void = () => undefined
    const socket = this.socket
    const events: EventEmitter = socket
    this.ready = new Promise<boolean>((resolve) => { complete = resolve })
    events.on('error', (error: Error) => {
      complete(false)
      if (!this.closed) onError(error, true)
    })
    // Wait for source-host resolution and bind completion before closing. Closing
    // an as-yet unbound UDP socket throws and can leave a queued bind alive.
    void (async () => {
      try {
        const source = config.status_source_host?.trim() || config.host?.trim() || ''
        if (source && source !== '*') {
          sourceAddresses = new Set(net.isIP(source) === 4 ? [source] :
            (await lookup(source, { family: 4, all: true })).map((entry) => entry.address))
        }
        if (this.closed) { complete(false); return }
        const onListening = () => {
          complete(true)
          if (!this.closed) onReady()
        }
        if (socket instanceof net.Server) socket.listen(port, host, onListening)
        else socket.bind(port, host, onListening)
      } catch (error) {
        complete(false)
        if (!this.closed) onError(error instanceof Error ? error : new Error(String(error)), true)
      }
    })()
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closed = true
    for (const client of this.clients) client.destroy()
    this.closePromise = (async () => {
      await this.ready
      await new Promise<void>((resolve) => {
        const events: EventEmitter = this.socket
        const finished = () => {
          events.removeListener('close', finished)
          events.removeListener('error', finished)
          resolve()
        }
        events.once('close', finished)
        events.once('error', finished)
        try { this.socket.close(finished) } catch (_) { finished() }
      })
    })()
    return this.closePromise
  }
}


