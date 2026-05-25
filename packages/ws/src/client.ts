import { randomUUID } from 'crypto'
import { connect as tcpConnect } from 'net'
import { connect as tlsConnect } from 'tls'
import { URL } from 'url'
import type { WSEventMap } from './types.js'
import { WSConnection } from './connection.js'

export type ResumableWSOptions = {
  maxReconnectAttempts?: number
  reconnectDelay?: number
  queueWhileDisconnected?: boolean
}

export class ResumableWS {
  #url: URL
  #maxReconnect: number
  #baseDelay: number
  #queueWhileDisconnected: boolean
  #shouldReconnect = true
  #closed = false
  #reconnectAttempts = 0
  #queue: (string | Buffer)[] = []
  #conn: WSConnection | null = null
  #listeners = new Map<string, Set<Function>>()

  constructor(url: string, opts?: ResumableWSOptions) {
    this.#url = new URL(url)
    this.#maxReconnect = opts?.maxReconnectAttempts ?? Infinity
    this.#baseDelay = opts?.reconnectDelay ?? 1000
    this.#queueWhileDisconnected = opts?.queueWhileDisconnected ?? true
  }

  get connected(): boolean {
    return this.#conn?.connected ?? false
  }

  on<K extends keyof WSEventMap>(event: K, listener: (...args: WSEventMap[K]) => void): this {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set())
    this.#listeners.get(event)!.add(listener as Function)
    return this
  }

  off<K extends keyof WSEventMap>(event: K, listener: (...args: WSEventMap[K]) => void): this {
    this.#listeners.get(event)?.delete(listener as Function)
    return this
  }

  async connect(): Promise<void> {
    this.#closed = false
    this.#shouldReconnect = true
    return this.#doConnect()
  }

  async send(data: string | Buffer): Promise<void> {
    if (this.#conn?.connected) {
      this.#conn.send(data)
    } else if (this.#queueWhileDisconnected) {
      this.#queue.push(data)
    }
  }

  async close(code = 1000, reason = ''): Promise<void> {
    this.#closed = true
    this.#shouldReconnect = false
    this.#queue = []
    if (this.#conn) {
      this.#conn.close(code, reason)
      this.#conn = null
    }
  }

  #dispatch<K extends keyof WSEventMap>(event: K, ...args: WSEventMap[K]): void {
    this.#listeners.get(event)?.forEach(fn => fn(...args))
  }

  #doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
      const keyEncoded = Buffer.from(key).toString('base64')
      const isTls = this.#url.protocol === 'wss:'
      const port = Number(this.#url.port) || (isTls ? 443 : 80)
      const self = this

      let response = Buffer.alloc(0)
      let headersRead = false

      const sock = isTls
        ? tlsConnect({ host: this.#url.hostname, port, rejectUnauthorized: false }, () => sendUpgrade())
        : tcpConnect(port, this.#url.hostname, () => sendUpgrade())

      function sendUpgrade() {
        sock.write(
          `GET ${self.#url.pathname + self.#url.search} HTTP/1.1\r\n` +
          `Host: ${self.#url.hostname}\r\n` +
          'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${keyEncoded}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        )
      }

      function onData(chunk: Buffer) {
        response = Buffer.concat([response, chunk])
        if (headersRead) {
          sock.emit('data', chunk)
          return
        }

        const idx = response.indexOf('\r\n\r\n')
        if (idx === -1) return
        headersRead = true

        const headerStr = response.subarray(0, idx).toString('utf8')
        const rest = response.subarray(idx + 4)

        const statusLine = headerStr.split('\r\n')[0]
        if (!statusLine.includes('101')) {
          sock.destroy()
          reject(new Error(`Upgrade failed: ${statusLine}`))
          return
        }

        let accept = ''
        for (const line of headerStr.split('\r\n')) {
          if (line.toLowerCase().startsWith('sec-websocket-accept:')) {
            accept = line.split(':')[1].trim()
          }
        }
        if (!accept) {
          sock.destroy()
          reject(new Error('Missing Sec-WebSocket-Accept'))
          return
        }

        self.#reconnectAttempts = 0
        sock.removeListener('data', onData)

        self.#conn = new WSConnection(sock, true)
        self.#conn.on('close', (code, reason) => self.#onClose(code, reason))
        self.#conn.on('error', (err) => self.#dispatch('error', err))
        self.#conn.on('message', (data) => self.#dispatch('message', data))
        self.#conn.on('ping', () => self.#dispatch('ping'))
        self.#conn.on('pong', () => self.#dispatch('pong'))

        self.#dispatch('open')
        self.#flushQueue()
        resolve()

        if (rest.length > 0) sock.emit('data', rest)
      }

      sock.on('data', onData)
      sock.on('error', (err: Error) => reject(err))
      sock.on('close', () => {
        if (!headersRead) reject(new Error('Connection closed before upgrade'))
      })
    })
  }

  #onClose(code: number, reason: string) {
    this.#conn = null
    this.#dispatch('close', code, reason)
    if (!this.#closed && this.#shouldReconnect) this.#reconnect()
  }

  async #reconnect() {
    this.#reconnectAttempts++
    if (this.#reconnectAttempts > this.#maxReconnect) {
      this.#dispatch('error', new Error('Max reconnect attempts reached'))
      return
    }
    const delay = Math.min(this.#baseDelay * Math.pow(2, this.#reconnectAttempts - 1), 30000)
    await new Promise(r => setTimeout(r, delay))
    if (!this.#closed && this.#shouldReconnect) {
      this.#doConnect().catch(() => {})
    }
  }

  #flushQueue() {
    const q = this.#queue.slice()
    this.#queue = []
    for (const msg of q) this.send(msg)
  }
}
