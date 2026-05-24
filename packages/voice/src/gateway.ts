import WebSocket from 'ws'
import { EventEmitter } from 'node:events'

const DISCORD_VOICE_VERSION = 8
const DISCORD_VOICE_URL_TEMPLATE = 'wss://{endpoint}/?v={v}'

export interface VoiceServerPayload {
  token: string
  endpoint: string
  channel_id?: string
  channelId?: string
}

export interface ReadyPayload {
  ssrc: number
  ip: string
  port: number
  modes: string[]
}

export interface SessionDescriptionPayload {
  mode: string
  secret_key: number[]
  dave_protocol_version?: number
}

export class VoiceGateway extends EventEmitter {
  #ws: WebSocket | null = null
  #guildId: string
  #userId: string
  #sessionId = ''
  #token = ''
  #endpoint = ''
  #channelId = ''
  #heartbeatInterval = 0
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null
  #ssrc = 0
  #ip = ''
  #port = 0
  #modes: string[] = []
  #secretKey: Buffer | null = null
  #connected = false
  #daveProtocolVersion = 0

  get connected() { return this.#connected }
  get ssrc() { return this.#ssrc }
  get ip() { return this.#ip }
  get port() { return this.#port }
  get modes() { return this.#modes }
  get secretKey() { return this.#secretKey }
  get daveProtocolVersion() { return this.#daveProtocolVersion }

  constructor(guildId: string, userId: string) {
    super()
    this.#guildId = guildId
    this.#userId = userId
  }

  voiceStateUpdate(sessionId: string) {
    this.#sessionId = sessionId
  }

  voiceServerUpdate(token: string, endpoint: string, channelId?: string) {
    this.#token = token
    this.#endpoint = endpoint.replace(/^wss:\/\//, '').replace(/\/\?v=\d+$/, '')
    if (channelId) this.#channelId = channelId
  }

  connect() {
    const url = DISCORD_VOICE_URL_TEMPLATE
      .replace('{endpoint}', this.#endpoint)
      .replace('{v}', String(DISCORD_VOICE_VERSION))

    this.#ws = new WebSocket(url)
    this.#ws.on('open', () => this.#onOpen())
    this.#ws.on('message', (data: Buffer) => this.#onMessage(data))
    this.#ws.on('close', (code, reason) => this.#onClose(code, reason))
    this.#ws.on('error', (err) => this.emit('error', err))
  }

  #onOpen() {
    this.#sendOp(0, {
      server_id: this.#guildId,
      user_id: this.#userId,
      session_id: this.#sessionId,
      token: this.#token,
    })
  }

  #onMessage(data: Buffer) {
    try {
      const json = JSON.parse(data.toString())
      this.#handleOp(json.op, json.d)
    } catch {
      // binary op (DAVE)
      if (data.length > 0) {
        this.emit('binary', data)
      }
    }
  }

  #handleOp(op: number, d: any) {
    switch (op) {
      case 2: { // Ready
        const payload = d as ReadyPayload
        this.#ssrc = payload.ssrc
        this.#ip = payload.ip
        this.#port = payload.port
        this.#modes = payload.modes
        this.emit('ready', payload)
        break
      }
      case 4: { // Session Description
        const payload = d as SessionDescriptionPayload
        this.#secretKey = Buffer.from(payload.secret_key)
        this.#daveProtocolVersion = payload.dave_protocol_version ?? 0
        this.#connected = true
        this.emit('sessionDescription', payload)
        break
      }
      case 5: { // Speaking
        this.emit('speaking', d)
        break
      }
      case 6: { // Heartbeat ACK
        this.emit('heartbeatAck', d)
        break
      }
      case 8: { // Hello
        this.#heartbeatInterval = d.heartbeat_interval
        this.#startHeartbeat()
        break
      }
      case 9: { // Resumed
        this.emit('resumed')
        break
      }
    }
  }

  #onClose(code: number, reason: Buffer) {
    this.#connected = false
    this.#stopHeartbeat()
    this.emit('close', code, reason?.toString())
  }

  #startHeartbeat() {
    let seq = 0
    this.#heartbeatTimer = setInterval(() => {
      this.#sendOp(3, { t: Date.now(), seq_ack: seq })
    }, this.#heartbeatInterval)
  }

  #stopHeartbeat() {
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer)
  }

  #sendOp(op: number, data: any) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify({ op, d: data }))
    }
  }

  sendBinary(data: Buffer) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(data)
    }
  }

  sendSelectProtocol(address: string, port: number, mode: string) {
    this.#sendOp(1, {
      protocol: 'udp',
      data: { address, port, mode },
    })
  }

  setSpeaking(value: number, delay = 0) {
    this.#sendOp(5, { speaking: value, delay, ssrc: this.#ssrc })
  }

  close() {
    this.#connected = false
    this.#stopHeartbeat()
    if (this.#ws) {
      this.#ws.close()
      this.#ws = null
    }
  }
}
