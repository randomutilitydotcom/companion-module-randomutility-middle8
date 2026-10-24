import { EventEmitter } from 'events'
import type { SharedUdpSocket } from '@companion-module/base'

// Adapt Companion's EventEmitter3 socket to the Node socket event interface.
export class SharedFeedbackSocket extends EventEmitter {
  constructor(private readonly socket: SharedUdpSocket) {
    super()
    // EJSON IPC can decode binary packets as Uint8Array rather than Node Buffer.
    socket.on('message', (packet, peer) => this.emit('message', Buffer.from(packet), peer))
    socket.on('error', (error) => this.emit('error', error))
    socket.on('close', () => this.emit('close'))
    socket.on('listening', () => this.emit('listening'))
  }

  bind(port: number, address: string, callback: () => void): void {
    this.once('listening', callback)
    this.socket.bind(port, address)
  }

  close(callback: () => void): void {
    this.once('close', callback)
    this.socket.close()
  }
}
