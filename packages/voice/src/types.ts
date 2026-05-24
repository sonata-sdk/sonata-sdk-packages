export interface VoiceConnectOptions {
  guildId: string
  userId: string
  sessionId: string
  token: string
  endpoint: string
  channelId: string
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'destroyed'
  reason: string | null
  code: number | null
  closeReason?: string | null
}

export interface PlayerState {
  status: 'playing' | 'paused' | 'stopped'
  reason: string | null
}

export interface UdpInfo {
  ssrc: number
  ip: string
  port: number
  secretKey: Buffer | null
}

export interface ConnectionStatistics {
  packetsSent: number
  packetsLost: number
  packetsExpected: number
}

export interface VoiceConnection {
  guildId: string
  userId: string
  channelId: string
  encryption: string | null
  state: ConnectionState
  playerState: PlayerState
  ping: number
  statistics: ConnectionStatistics
  udpInfo: UdpInfo | null
  voiceStateUpdate(obj: { session_id?: string; sessionId?: string }): void
  voiceServerUpdate(obj: { token: string; endpoint: string; channel_id?: string; channelId?: string }): void
  sendAudioFrame(frame: Buffer): void
  setSpeaking(value: number): void
  destroy(): void
  on(event: string | symbol, listener: (...args: any[]) => void): this
  removeAllListeners(event?: string | symbol): this
}

export interface JoinVoiceOptions {
  guildId: string
  userId: string
  channelId: string
  encryption?: string | null
}

export type EncryptionMode =
  | 'aead_aes256_gcm_rtpsize'
  | 'aead_xchacha20_poly1305_rtpsize'
  | 'xsalsa20_poly1305_lite_rtpsize'
  | 'xsalsa20_poly1305_suffix_rtpsize'
  | 'normal'
