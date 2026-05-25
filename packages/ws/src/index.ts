import { createHash, randomUUID } from 'crypto'
import { connect as tcpConnect } from 'net'
import { connect as tlsConnect } from 'tls'
import { URL } from 'url'

/* ------------------------------------------------------------------ */
/*  Opcodes & helpers                                                  */
/* ------------------------------------------------------------------ */

const OP_CONT = 0x0
const OP_TEXT = 0x1
const OP_BIN  = 0x2
const OP_CLOSE = 0x8
const OP_PING = 0x9
const OP_PONG = 0xA

function mask(data: Buffer, maskKey: Buffer): Buffer {
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ maskKey[i & 3]
  return out
}

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

export type WSEventMap = {
  open: []
  message: [data: string | Buffer]
  close: [code: number, reason: string]
  error: [error: Error]
}

/* ------------------------------------------------------------------ */
/*  ResumableWS                                                        */
/* ------------------------------------------------------------------ */

export class ResumableWS {
  #url: URL
  #maxReconnect: number
  #baseDelay: number
  #shouldReconnect = true
  #closed = false
  #reconnectAttempts = 0
  #queue: (string | Buffer)[] = []
  #queueEnabled: boolean

  #sock: any = null
  #listeners = new Map<string, Set<Function>>()
  #buffer = Buffer.alloc(0)

  constructor(url: string, opts?: {
    maxReconnectAttempts?: number
    reconnectDelay?: number
    queueWhileDisconnected?: boolean
  }) {
    this.#url = new URL(url)
    this.#maxReconnect = opts?.maxReconnectAttempts ?? Infinity
    this.#baseDelay = opts?.reconnectDelay ?? 1000
    this.#queueEnabled = opts?.queueWhileDisconnected ?? true
  }

  get connected(): boolean {
    return this.#sock !== null && !this.#sock.destroyed
  }

  get readyState(): number {
    if (!this.#sock) return 3
    if (this.#sock.destroyed) return 3
    if (!this.#sock.writable) return 3
    return 1
  }

  /* ---------- public API ---------- */

  async connect(): Promise<void> {
    this.#closed = false
    this.#shouldReconnect = true
    return this.#doConnect()
  }

  async send(data: string | Buffer): Promise<void> {
    if (this.connected && this.#sock?.writable) {
      const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
      const opcode = typeof data === 'string' ? OP_TEXT : OP_BIN
      this.#writeFrame(opcode, payload)
    } else if (this.#queueEnabled) {
      this.#queue.push(data)
    }
  }

  async close(code = 1000, reason = ''): Promise<void> {
    this.#closed = true
    this.#shouldReconnect = false
    this.#queue = []
    if (this.connected && this.#sock?.writable) {
      const reasonBuf = Buffer.from(reason, 'utf8')
      const payload = Buffer.alloc(2 + reasonBuf.length)
      payload.writeUInt16BE(code, 0)
      reasonBuf.copy(payload, 2)
      this.#writeFrame(OP_CLOSE, payload)
    }
    this.#destroySocket()
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

  /* ---------- internal ---------- */

  #dispatch<E extends keyof WSEventMap>(event: E, ...args: WSEventMap[E]) {
    this.#listeners.get(event)?.forEach(fn => fn(...args))
  }

  #doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
      const keyEncoded = Buffer.from(key).toString('base64')
      const isTls = this.#url.protocol === 'wss:'
      const port = Number(this.#url.port) || (isTls ? 443 : 80)

      let sock: any
      if (isTls) {
        sock = tlsConnect({ host: this.#url.hostname, port, rejectUnauthorized: false }, () => {
          sock.write(
            `GET ${this.#url.pathname + this.#url.search} HTTP/1.1\r\n` +
            `Host: ${this.#url.hostname}\r\n` +
            'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${keyEncoded}\r\nSec-WebSocket-Version: 13\r\n\r\n`
          )
        })
      } else {
        sock = tcpConnect(port, this.#url.hostname, () => {
          sock.write(
            `GET ${this.#url.pathname + this.#url.search} HTTP/1.1\r\n` +
            `Host: ${this.#url.hostname}\r\n` +
            'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${keyEncoded}\r\nSec-WebSocket-Version: 13\r\n\r\n`
          )
        })
      }

      let response = Buffer.alloc(0)
      let headersRead = false

      sock.on('data', (chunk: any) => {
        response = Buffer.concat([response, chunk])
        if (!headersRead) {
          const idx = response.indexOf('\r\n\r\n')
          if (idx === -1) return
          headersRead = true
          const headerStr = response.slice(0, idx).toString('utf8')
          const rest = response.slice(idx + 4)
          response = rest

          // Parse status
          const statusLine = headerStr.split('\r\n')[0]
          if (!statusLine.includes('101')) {
            sock.destroy()
            reject(new Error(`Upgrade failed: ${statusLine}`))
            return
          }

          // Parse accept header
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

          this.#reconnectAttempts = 0
          this.#sock = sock
          sock.setKeepAlive(true)
          sock.on('data', (chunk2: any) => this.#onData(chunk2))
          sock.on('error', (err: any) => this.#onError(err))
          sock.on('close', () => this.#onClose(1006, 'connection dropped'))
          this.#dispatch('open')
          this.#flushQueue()
          resolve()

          // Process any remaining data (pong, etc.)
          if (response.length > 0) this.#onData(response)
        }
      })

      sock.on('error', (err: any) => reject(err))
      sock.on('close', () => {
        if (!headersRead) reject(new Error('Connection closed before upgrade'))
      })
    })
  }

  #onData(chunk: Buffer) {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    while (this.#buffer.length >= 2) {
      const first = this.#buffer[0]
      const second = this.#buffer[1]
      const opcode = first & 0x0F
      const masked = (second & 0x80) !== 0
      let payloadLen = second & 0x7F
      let offset = 2

      if (payloadLen === 126) {
        if (this.#buffer.length < 4) break
        payloadLen = this.#buffer.readUInt16BE(2)
        offset = 4
      } else if (payloadLen === 127) {
        if (this.#buffer.length < 10) break
        payloadLen = Number(this.#buffer.readBigUInt64BE(2))
        offset = 10
      }

      const maskLen = masked ? 4 : 0
      const totalLen = offset + maskLen + payloadLen
      if (this.#buffer.length < totalLen) break

      const maskKey = masked ? this.#buffer.slice(offset, offset + 4) : null
      offset += maskLen
      let payload = this.#buffer.slice(offset, offset + payloadLen)
      if (maskKey) payload = Buffer.from(mask(payload, maskKey))

      this.#buffer = this.#buffer.slice(totalLen)
      this.#handleFrame(opcode, payload)
    }
  }

  #handleFrame(opcode: number, payload: Buffer) {
    switch (opcode) {
      case OP_TEXT:
        this.#dispatch('message', payload.toString('utf8'))
        break
      case OP_BIN:
        this.#dispatch('message', payload)
        break
      case OP_PING:
        this.#writeFrame(OP_PONG, payload)
        break
      case OP_CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
        const reason = payload.length > 2 ? payload.slice(2).toString('utf8') : ''
        this.#dispatch('close', code, reason)
        this.#destroySocket()
        break
      }
    }
  }

  #onError(err: Error) {
    this.#dispatch('error', err)
  }

  #onClose(code: number, reason: string) {
    this.#sock = null
    this.#dispatch('close', code, reason)
    if (!this.#closed && this.#shouldReconnect) this.#reconnect()
  }

  #writeFrame(opcode: number, payload: Buffer) {
    if (!this.#sock?.writable) return
    const header = this.#buildHeader(opcode, payload.length)
    const maskKey = Buffer.from([0x00, 0x00, 0x00, 0x00]) // unmasked for simplicity (client-to-server SHOULD be masked per spec, but most servers accept unmasked)
    // Actually let's use a random mask key
    for (let i = 0; i < 4; i++) maskKey[i] = Math.floor(Math.random() * 256)
    payload = mask(payload, maskKey)
    this.#sock.write(Buffer.concat([header, maskKey, payload]))
  }

  #buildHeader(opcode: number, len: number): Buffer {
    const buf: number[] = [0x80 | opcode] // FIN + opcode
    if (len < 126) {
      buf.push(0x80 | len) // MASK set to 1
      return Buffer.from(buf)
    } else if (len < 65536) {
      buf.push(0x80 | 126)
      const ext = Buffer.alloc(2)
      ext.writeUInt16BE(len, 0)
      return Buffer.concat([Buffer.from(buf), ext])
    } else {
      buf.push(0x80 | 127)
      const ext = Buffer.alloc(8)
      ext.writeBigUInt64BE(BigInt(len), 0)
      return Buffer.concat([Buffer.from(buf), ext])
    }
  }

  #destroySocket() {
    if (this.#sock) {
      try { this.#sock.destroy() } catch {}
      this.#sock = null
    }
  }

  #flushQueue() {
    const q = this.#queue.slice()
    this.#queue = []
    for (const msg of q) this.send(msg)
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
}
