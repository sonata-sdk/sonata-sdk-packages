import { EventEmitter } from 'node:events'
import { performance } from 'node:perf_hooks'
import { randomInt } from 'node:crypto'
import type { Readable } from 'node:stream'
import { VoiceGateway } from './gateway.js'
import { UdpSocket } from './udp.js'
import {
  AudioEncryption,
  SILENCE_FRAME,
  OPUS_FRAME_DURATION,
  OPUS_FRAME_SIZE,
  TIMESTAMP_INCREMENT,
} from './encryption.js'
import type {
  JoinVoiceOptions,
  ConnectionState,
  PlayerState,
  UdpInfo,
  ConnectionStatistics,
  VoiceConnection as IVoiceConnection,
  EncryptionMode,
} from './types.js'

const _MAX_SEQUENCE = 2 ** 16
const _MAX_TIMESTAMP = 2 ** 32

export class VoiceConnection extends EventEmitter implements IVoiceConnection {
  guildId: string
  userId: string
  channelId: string
  encryption: string | null
  state: ConnectionState = { status: 'connecting', reason: null, code: null }
  playerState: PlayerState = { status: 'idle', reason: null }
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
  #daveReady = false

  #audioStream: Readable | null = null
  #opusQueue: Buffer[] = []
  #playTimeout: ReturnType<typeof setTimeout> | null = null
  #challengeTimeout: ReturnType<typeof setTimeout> | null = null
  #player: { sequence: number; timestamp: number; nextPacket: number; lastPacketTime: number | null }

  constructor(opts: JoinVoiceOptions) {
    super()
    this.guildId = opts.guildId
    this.userId = opts.userId
    this.channelId = opts.channelId
    this.encryption = opts.encryption ?? null

    this.#gateway = new VoiceGateway(opts.guildId, opts.userId)
    this.#gateway.setDaveSession(opts.channelId)
    this.#udp = new UdpSocket()
    this.#player = {
      sequence: randomInt(_MAX_SEQUENCE),
      timestamp: randomInt(_MAX_TIMESTAMP) >>> 0,
      nextPacket: 0,
      lastPacketTime: null,
    }
    this.#setupListeners()
  }

  #setupListeners() {
    this.#gateway.on('ready', (payload) => {
      this.#udp.connect(payload.ssrc, payload.ip, payload.port).catch(() => {})
      this.#gateway.sendSelectProtocol(
        payload.ip, payload.port,
        this.encryption ?? 'aead_aes256_gcm_rtpsize'
      )
    })

    this.#gateway.on('sessionDescription', (payload) => {
      const secretKey = Buffer.from(payload.secret_key)
      this.#udp.setSecretKey(secretKey)
      this.udpInfo = {
        ssrc: this.#gateway.ssrc,
        ip: this.#gateway.ip,
        port: this.#gateway.port,
        secretKey,
      }

      this.#encryption = new AudioEncryption(
        payload.mode as EncryptionMode,
        secretKey,
        this.#gateway.ssrc
      )
      this.#encryption.reset(this.#player.sequence, this.#player.timestamp)

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

    // DAVE handshake handlers
    this.#gateway.on('dave_external_sender', (data: Buffer) => {
      const session = (this.#gateway as any).daveSession
      if (!session) return this.emit('error', new Error('No DAVE session'))
      try {
        session.setExternalSender(data)
        const keyPackage = session.getSerializedKeyPackage()
        this.#gateway.sendDaveOp(26, keyPackage)
      } catch (e) {
        this.emit('error', new Error(`DAVE external sender: ${(e as Error).message}`))
      }
    })

    this.#gateway.on('dave_proposals', (d: any) => {
      const session = (this.#gateway as any).daveSession
      if (!session) return this.emit('error', new Error('No DAVE session'))
      try {
        const { operationType, proposals } = d
        const result = session.processProposals(operationType, Buffer.from(proposals))
        if (session.ready) this.#daveReady = true
        if (result.commit && result.welcome) {
          this.#gateway.sendDaveOp(28, Buffer.concat([result.commit, result.welcome]))
        } else if (result.commit) {
          this.#gateway.sendDaveOp(28, result.commit)
        }
      } catch (e) {
        this.emit('error', new Error(`DAVE proposals: ${(e as Error).message}`))
      }
    })

    this.#gateway.on('dave_commit', ({ transitionId, commitData }: { transitionId: number; commitData: Buffer }) => {
      const session = (this.#gateway as any).daveSession
      if (!session) return this.emit('error', new Error('No DAVE session'))
      try {
        session.processCommit(commitData)
        this.emit('debug', `DAVE commit processed: ready=${session.ready} status=${session.status}`)
        if (session.ready) this.#daveReady = true
        if (transitionId !== 0) {
          this.#gateway.sendOp(23, { transition_id: transitionId })
        }
      } catch (e) {
        this.emit('error', new Error(`DAVE commit: ${(e as Error).message}`))
        this.#gateway.sendOp(31, { transition_id: transitionId })
      }
    })

    this.#gateway.on('dave_welcome', ({ transitionId, welcomeData }: { transitionId: number; welcomeData: Buffer }) => {
      const session = (this.#gateway as any).daveSession
      if (!session) return this.emit('error', new Error('No DAVE session'))
      try {
        session.processWelcome(welcomeData)
        this.emit('debug', `DAVE welcome processed: ready=${session.ready} status=${session.status}`)
        if (session.ready) this.#daveReady = true
        if (transitionId !== 0) {
          this.#gateway.sendOp(23, { transition_id: transitionId })
        }
      } catch (e) {
        this.emit('error', new Error(`DAVE welcome: ${(e as Error).message}`))
        this.#gateway.sendOp(31, { transition_id: transitionId })
      }
    })

    this.#gateway.on('dave_prepare_transition', (d: any) => {
      this.emit('debug', `DAVE prepare transition id=${d.transition_id} version=${d.protocol_version}`)
      this.#davePendingTransitions.set(d.transition_id, d.protocol_version)
      if (d.transition_id === 0) {
        this.#executeTransition(d.transition_id)
      } else {
        if (d.protocol_version === 0) {
          const daveSession = (this.#gateway as any).daveSession
          daveSession?.setPassthroughMode(true, 120)
        }
        this.#gateway.sendOp(23, { transition_id: d.transition_id })
      }
    })

    this.#gateway.on('dave_execute_transition', (d: any) => {
      this.emit('debug', `DAVE execute transition id=${d.transition_id}`)
      this.#executeTransition(d.transition_id)
    })

    this.#gateway.on('dave_prepare_epoch', (d: any) => {
      this.emit('debug', `DAVE prepare epoch id=${d.epoch}`)
      if (d.epoch === 1) {
        this.#gateway.daveProtocolVersion = d.protocol_version
      }
    })
  }

  #davePendingTransitions: Map<number, number> = new Map()
  #daveDowngraded = false

  #executeTransition(transitionId: number) {
    if (!this.#davePendingTransitions.has(transitionId)) {
      this.emit('warn', `Received execute transition, but no pending transition for ${transitionId}`)
      return
    }
    const oldVersion = this.#gateway.daveProtocolVersion
    this.#gateway.daveProtocolVersion = this.#davePendingTransitions.get(transitionId)!
    if (oldVersion !== this.#gateway.daveProtocolVersion && this.#gateway.daveProtocolVersion === 0) {
      this.#daveDowngraded = true
      this.emit('debug', 'DAVE protocol downgraded')
    } else if (transitionId > 0 && this.#daveDowngraded) {
      this.#daveDowngraded = false
      const daveSession = (this.#gateway as any).daveSession
      daveSession?.setPassthroughMode(true, 10)
      this.emit('debug', 'DAVE protocol upgraded')
    }
    this.#davePendingTransitions.delete(transitionId)
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

  // --- Audio Playback ---

  play(audioStream: Readable): Readable | null {
    if (!this.udpInfo) {
      this.emit('error', new Error('Cannot play audio without UDP info'))
      return null
    }

    const oldStream = this.#audioStream

    audioStream.once('readable', () => {
      if (oldStream) {
        oldStream.removeListener('finishBuffering', this.#boundMarkAsStoppable)
      }

      this.#clearPlaybackTimeouts()

      this.#audioStream = audioStream
      this.unpause('requested')
    })

    return oldStream
  }

  stop(reason?: string) {
    this.#clearPlaybackTimeouts()

    if (this.#audioStream) {
      this.#audioStream.removeListener('finishBuffering', this.#boundMarkAsStoppable)
      this.#audioStream.destroy()
      this.#audioStream.removeAllListeners()
      this.#audioStream = null
    }

    this.#updatePlayerState({ status: 'idle', reason: reason ?? 'stopped' })
    this.statistics = { packetsSent: 0, packetsLost: 0, packetsExpected: 0 }

    let silenceCount = 0
    const sendSilence = () => {
      if (silenceCount >= 5 || !this.#encryption) return
      this.sendAudioFrame(SILENCE_FRAME)
      silenceCount++
      if (silenceCount < 5) {
        setTimeout(sendSilence, OPUS_FRAME_DURATION)
      } else {
        this.#gateway.setSpeaking(0)
      }
    }
    sendSilence()
  }

  pause(reason?: string) {
    this.#clearPlaybackTimeouts()
    this.#updatePlayerState({ status: 'paused', reason: reason ?? 'paused' })
    this.#gateway.setSpeaking(0)
  }

  unpause(reason?: string) {
    this.#updatePlayerState({ status: 'playing', reason: reason ?? 'unpaused' })
    this.#gateway.setSpeaking(1)

    const now = performance.now()
    if (this.#player.lastPacketTime) {
      const gap = now - this.#player.lastPacketTime
      if (gap > OPUS_FRAME_DURATION * 2) {
        const lostFrames = Math.floor(gap / OPUS_FRAME_DURATION)
        const lostTimestamp = lostFrames * TIMESTAMP_INCREMENT
        this.#player.timestamp = (this.#player.timestamp + lostTimestamp) >>> 0
        if (this.#encryption) {
          this.#encryption.reset(this.#player.sequence, this.#player.timestamp)
        }
      }
    }

    this.#player.nextPacket = now
    this.#packetInterval()

    if (!(this.#audioStream as any)?.canStop) {
      (this.#audioStream as any)?.removeListener?.('finishBuffering', this.#boundMarkAsStoppable)
      ;(this.#audioStream as any)?.once?.('finishBuffering', this.#boundMarkAsStoppable)
    }
  }

  sendAudioFrame(frame: Buffer) {
    if (this.#destroyed) return

    let payload: Buffer = frame
    const daveSession = (this.#gateway as any).daveSession as { ready: boolean; status: number; encryptOpus: (f: Buffer) => Buffer } | null
    if (this.#daveReady && daveSession?.ready) {
      payload = daveSession.encryptOpus(frame)
    }

    if (this.#encryption) {
      const encrypted = this.#encryption.encrypt(payload)
      if (!encrypted) {
        this.emit('debug', 'sendAudioFrame: encrypt returned null (silence frame)')
        return
      }
      this.emit('debug', `sendAudioFrame: sending ${encrypted.length}B frame daveReady=${this.#daveReady} daveOk=${!!daveSession?.ready} seq=${this.#encryption.sequence}`)
      this.#udp.send(encrypted)
    } else {
      this.emit('error', new Error('sendAudioFrame: no encryption'))
      this.#udp.send(payload)
    }

    this.statistics.packetsSent++
    this.statistics.packetsExpected++
  }

  get queuedOpusFrameCount() { return this.#opusQueue.length }

  enqueueOpusFrame(frame: Buffer) {
    this.#opusQueue.push(frame)
  }

  setSpeaking(value: number) {
    this.#gateway.setSpeaking(value)
  }

  // --- Private Audio Loop ---

  #packetInterval() {
    this.#playTimeout = null
    if (!this.#audioStream) return

    const now = performance.now()
    const lateness = now - this.#player.nextPacket
    if (lateness > 100) {
      this.#player.nextPacket = now
    }

    let chunk: Buffer | null = null
    if (this.#opusQueue.length > 0) {
      chunk = this.#opusQueue.shift()!
    } else {
      chunk = (this.#audioStream as any).read?.(OPUS_FRAME_SIZE)
    }

    if (chunk) {
      this.#clearChallengeTimeout()
      this.sendAudioFrame(chunk)
    } else if ((this.#audioStream as any).canStop) {
      this.#clearChallengeTimeout()
      this.stop('finished')
      return
    } else {
      this.sendAudioFrame(SILENCE_FRAME)
      if (!this.#challengeTimeout) {
        this.#challengeTimeout = setTimeout(() => {
          this.#challengeTimeout = null
          this.emit('stuck')
          this.pause('stuck')
        }, 30000)
      }
    }

    this.#player.lastPacketTime = performance.now()
    this.#player.nextPacket += OPUS_FRAME_DURATION
    this.#playTimeout = setTimeout(
      () => this.#packetInterval(),
      Math.max(0, this.#player.nextPacket - performance.now())
    )
  }

  #clearChallengeTimeout() {
    if (this.#challengeTimeout) {
      clearTimeout(this.#challengeTimeout)
      this.#challengeTimeout = null
    }
  }

  #clearPlaybackTimeouts() {
    if (this.#playTimeout) {
      clearTimeout(this.#playTimeout)
      this.#playTimeout = null
    }
    this.#clearChallengeTimeout()
  }

  #boundMarkAsStoppable = () => {
    if (this.#audioStream) (this.#audioStream as any).canStop = true
  }

  #updatePlayerState(state: PlayerState) {
    const old = this.playerState
    this.playerState = state
    this.emit('playerStateChange', old, this.playerState)
  }

  destroy() {
    this.#destroyed = true
    this.#clearPlaybackTimeouts()

    if (this.#audioStream) {
      this.#audioStream.removeListener('finishBuffering', this.#boundMarkAsStoppable)
      this.#audioStream.destroy()
      this.#audioStream.removeAllListeners()
      this.#audioStream = null
    }

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
