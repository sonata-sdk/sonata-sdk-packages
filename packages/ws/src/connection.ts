import type * as net from 'net'
import type * as tls from 'tls'
import type { WSEventMap } from './types.js'
import { OP_TEXT, OP_BIN, OP_CLOSE, OP_PING, OP_PONG } from './types.js'
import { readFrame, encodeFrame } from './frame.js'

type Listener = (...args: any[]) => void

export class WSConnection {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  #sock: net.Socket | tls.TLSSocket
  #maskOutput: boolean
  #buffer = Buffer.alloc(0)
  #listeners = new Map<string, Set<Listener>>()
  #destroyed = false
  #closeSent = false

  constructor(sock: net.Socket | tls.TLSSocket, maskOutput: boolean) {
    this.#sock = sock
    this.#maskOutput = maskOutput

    sock.on('data', (chunk: Buffer) => this.#onData(chunk))
    sock.on('error', (err: Error) => this.#dispatch('error', err))
    sock.on('close', () => {
      this.#destroyed = true
      this.#dispatch('close', 1006, 'connection closed')
    })
  }

  get readyState(): number {
    if (this.#destroyed || this.#sock.destroyed) return WSConnection.CLOSED
    return WSConnection.OPEN
  }

  get connected(): boolean {
    return !this.#destroyed && !this.#sock.destroyed
  }

  get sock(): net.Socket | tls.TLSSocket {
    return this.#sock
  }

  on<K extends keyof WSEventMap>(event: K, listener: (...args: WSEventMap[K]) => void): this {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set())
    this.#listeners.get(event)!.add(listener as Listener)
    return this
  }

  off<K extends keyof WSEventMap>(event: K, listener: (...args: WSEventMap[K]) => void): this {
    this.#listeners.get(event)?.delete(listener as Listener)
    return this
  }

  send(data: string | Buffer): void {
    if (!this.connected) return
    const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
    const opcode = typeof data === 'string' ? OP_TEXT : OP_BIN
    this.#write(opcode, payload)
  }

  close(code = 1000, reason = ''): void {
    if (this.#closeSent || !this.connected) {
      this.#destroy()
      return
    }
    this.#closeSent = true
    const reasonBuf = Buffer.from(reason, 'utf8')
    const payload = Buffer.alloc(2 + reasonBuf.length)
    payload.writeUInt16BE(code, 0)
    reasonBuf.copy(payload, 2)
    this.#write(OP_CLOSE, payload)
    this.#destroy()
  }

  ping(data?: Buffer): void {
    this.#write(OP_PING, data ?? Buffer.alloc(0))
  }

  pong(data?: Buffer): void {
    this.#write(OP_PONG, data ?? Buffer.alloc(0))
  }

  terminate(): void {
    this.#destroy()
  }

  #write(opcode: number, payload: Buffer): void {
    if (!this.#sock.writable) return
    const frame = encodeFrame(opcode, payload, this.#maskOutput)
    this.#sock.write(frame)
  }

  #onData(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    while (this.#buffer.length > 0) {
      const result = readFrame(this.#buffer)
      if (!result) break
      this.#buffer = this.#buffer.subarray(result.consumed)
      this.#handleFrame(result.frame.opcode, result.frame.payload)
    }
  }

  #handleFrame(opcode: number, payload: Buffer): void {
    switch (opcode) {
      case OP_TEXT:
        this.#dispatch('message', payload.toString('utf8'))
        break
      case OP_BIN:
        this.#dispatch('message', payload)
        break
      case OP_PING:
        this.#write(OP_PONG, payload)
        this.#dispatch('ping')
        break
      case OP_PONG:
        this.#dispatch('pong')
        break
      case OP_CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
        const reason = payload.length > 2 ? payload.slice(2).toString('utf8') : ''
        this.#dispatch('close', code, reason)
        this.#destroy()
        break
      }
    }
  }

  #destroy(): void {
    this.#destroyed = true
    try { this.#sock.destroy() } catch {}
  }

  #dispatch<K extends keyof WSEventMap>(event: K, ...args: WSEventMap[K]): void {
    this.#listeners.get(event)?.forEach(fn => fn(...args))
  }
}
