import { EventEmitter } from 'node:events'
import { VoiceGateway } from './gateway.js'
import { UdpSocket } from './udp.js'
import { AudioEncryption, SILENCE_FRAME } from './encryption.js'
import type {
  JoinVoiceOptions,
  ConnectionState,
  PlayerState,
  UdpInfo,
  ConnectionStatistics,
  VoiceConnection as IVoiceConnection,
  EncryptionMode,
} from './types.js'

export class VoiceConnection extends EventEmitter implements IVoiceConnection {
  guildId: string
  userId: string
  channelId: string
  encryption: string | null
  state: ConnectionState = { status: 'connecting', reason: null, code: null }
  playerState: PlayerState = { status: 'stopped', reason: null }
  ping = 0
  statistics: ConnectionStatistics = { packetsSent: 0, packetsLost: 0, packetsExpected: 0 }
  udpInfo: UdpInfo | null = null

  #gateway: VoiceGateway
  #udp: UdpSocket
  #encryption: AudioEncryption | null = null
  #sessionId = ''
  #token = ''
  #endpoint = ''
  #destroyed = false

  constructor(opts: JoinVoiceOptions) {
    super()
    this.guildId = opts.guildId
    this.userId = opts.userId
    this.channelId = opts.channelId
    this.encryption = opts.encryption ?? null

    this.#gateway = new VoiceGateway(opts.guildId, opts.userId)
    this.#udp = new UdpSocket()
    this.#setupListeners()
  }

  #setupListeners() {
    this.#gateway.on('ready', (payload) => {
      this.#udp.connect(payload.ssrc, payload.ip, payload.port).then(() => {
        this.#gateway.sendSelectProtocol(this.#udp.ip, this.#udp.port, this.encryption ?? 'xsalsa20_poly1305_lite_rtpsize')
      }).catch((err) => this.emit('error', err))
    })

    this.#gateway.on('sessionDescription', (payload) => {
      this.#udp.setSecretKey(payload.secret_key)
      this.udpInfo = {
        ssrc: this.#gateway.ssrc,
        ip: this.#gateway.ip,
        port: this.#gateway.port,
        secretKey: payload.secret_key,
      }

      this.#encryption = new AudioEncryption(
        payload.mode as EncryptionMode,
        payload.secret_key,
        this.#gateway.ssrc
      )

      this.state = { status: 'connected', reason: null, code: null }
      this.emit('stateChange', { status: 'connecting' }, this.state)
      this.emit('ready')
    })

    this.#gateway.on('close', (code, reason) => {
      this.state = { status: 'disconnected', reason, code, closeReason: reason }
      this.emit('stateChange', { status: 'connected' }, this.state)
    })

    this.#gateway.on('error', (err) => this.emit('error', err))
    this.#gateway.on('heartbeatAck', (d: any) => {
      if (d.t) this.ping = Date.now() - d.t
    })

    this.#udp.on('error', (err) => this.emit('error', err))
  }

  voiceStateUpdate(obj: { session_id?: string; sessionId?: string }) {
    this.#sessionId = obj.sessionId ?? obj.session_id ?? this.#sessionId
    this.#gateway.voiceStateUpdate(this.#sessionId)
  }

  voiceServerUpdate(obj: { token: string; endpoint: string; channel_id?: string; channelId?: string }) {
    this.#token = obj.token
    this.#endpoint = obj.endpoint
    this.#gateway.voiceServerUpdate(obj.token, obj.endpoint, obj.channelId ?? obj.channel_id)
  }

  connect() {
    this.#gateway.connect()
  }

  sendAudioFrame(frame: Buffer) {
    if (this.#destroyed) return

    if (this.#encryption) {
      const encrypted = this.#encryption.encrypt(frame)
      if (!encrypted) return // silence frame
      this.#udp.send(encrypted)
    } else {
      this.#udp.send(frame)
    }

    this.statistics.packetsSent++
    this.statistics.packetsExpected++
  }

  setSpeaking(value: number) {
    this.#gateway.setSpeaking(value)
    if (value > 0) {
      this.playerState = { status: 'playing', reason: null }
    } else {
      this.playerState = { status: 'stopped', reason: null }
    }
  }

  destroy() {
    this.#destroyed = true
    this.state = { status: 'destroyed', reason: 'destroyed', code: null }
    this.#gateway.close()
    this.#udp.close()
    this.emit('stateChange', { status: 'connected' }, this.state)
    this.removeAllListeners()
  }
}

export function joinVoiceChannel(options: JoinVoiceOptions): VoiceConnection {
  return new VoiceConnection(options)
}
