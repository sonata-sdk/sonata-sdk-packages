export interface Track {
  encoded: string
  info: TrackInfo
  source: string
  userData?: Record<string, unknown>
}

export interface TrackInfo {
  identifier: string
  title: string
  author: string
  duration: number
  length?: number
  uri: string
  artworkUrl: string
  sourceName: string
  isStream: boolean
  position: number
  isSeekable?: boolean
}

export interface PlayerState {
  guildId: string
  track?: Track
  volume: number
  paused: boolean
  position: number
  connected: boolean
  ping: number
}

export interface FilterOptions {
  volume?: number
  equalizer?: Band[]
  karaoke?: KaraokeOptions
  timescale?: TimescaleOptions
  tremolo?: TremoloOptions
  vibrato?: VibratoOptions
  rotation?: RotationOptions
  distortion?: DistortionOptions
  channelMix?: ChannelMixOptions
  lowPass?: LowPassOptions
}

export interface Band { band: number; gain: number }
export interface KaraokeOptions { level?: number; monoLevel?: number; filterBand?: number; filterWidth?: number }
export interface TimescaleOptions { speed?: number; pitch?: number; rate?: number }
export interface TremoloOptions { frequency?: number; depth?: number }
export interface VibratoOptions { frequency?: number; depth?: number }
export interface RotationOptions { rotationHz?: number }
export interface DistortionOptions { sinOffset?: number; sinScale?: number; cosOffset?: number; cosScale?: number; tanOffset?: number; tanScale?: number; offset?: number; scale?: number }
export interface ChannelMixOptions { leftToLeft?: number; leftToRight?: number; rightToLeft?: number; rightToRight?: number }
export interface LowPassOptions { smoothing?: number }

export interface QueueState {
  current: Track | null
  queue: Track[]
  history: Track[]
}

export type QueueEventType = 'add' | 'remove' | 'clear' | 'shuffle'

export interface LoadTracksResult {
  loadType: 'track' | 'search' | 'playlist' | 'empty' | 'error'
  tracks: Track[]
  playlistInfo?: PlaylistInfo
  exception?: Exception
}

export interface PlaylistInfo { name: string; trackCount: number }
export interface Exception { message: string; severity: 'COMMON' | 'SUSPICIOUS' | 'FAULT' }

export interface Stats {
  players: number
  playing: number
  uptime: number
  memory: MemoryStats
  cpu: CpuStats
  frameStats?: FrameStats
}

export interface MemoryStats { free: number; used: number; allocated: number; reservable: number }
export interface CpuStats { cores: number; systemLoad: number; processLoad: number }
export interface FrameStats { sent: number; nulled: number; dropped: number }

export interface VoiceState { sessionId: string; token: string; endpoint: string }
export interface SessionState { id: string; resume: boolean; resumeKey?: string }

export type LogLevel = 'trace' | 'verbose' | 'debug' | 'normal' | 'warn' | 'error'

export interface RouteRegistration {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  handler: (req: Request, res: Response, params: Record<string, string>) => void | Promise<void>
}

export type TrackStartHandler = (guildId: string, track: Track) => void
export type TrackEndHandler = (guildId: string, track: Track, reason: string) => void
export type TrackStuckHandler = (guildId: string, track: Track, thresholdMs: number) => void
export type TrackExceptionHandler = (guildId: string, track: Track, error: string) => void
export type QueueEndHandler = (guildId: string) => void
export type PlayerUpdateHandler = (guildId: string, state: PlayerState) => void
export type QueueEventHandler = (guildId: string, detail: unknown) => void

export interface PluginContext {
  config: Record<string, unknown>
  onTrackStart: (handler: TrackStartHandler) => void
  onTrackEnd: (handler: TrackEndHandler) => void
  onTrackStuck: (handler: TrackStuckHandler) => void
  onTrackException: (handler: TrackExceptionHandler) => void
  onQueueEnd: (handler: QueueEndHandler) => void
  onPlayerUpdate: (handler: PlayerUpdateHandler) => void
  onQueueEvent: (type: QueueEventType, handler: QueueEventHandler) => void
  registerRoute: (method: RouteRegistration['method'], path: string, handler: RouteRegistration['handler']) => void
  log: (level: LogLevel, message: string, ...args: unknown[]) => void
}

export interface Plugin {
  name: string
  version: string
  install(ctx: PluginContext): void | Promise<void>
}

export class SonataPlugin implements Plugin {
  name: string
  version: string
  ctx!: PluginContext

  constructor(name: string, version: string) {
    this.name = name
    this.version = version
  }

  install(ctx: PluginContext): void | Promise<void> {
    this.ctx = ctx
    return this.start()
  }

  start(): void | Promise<void> {}

  log(level: LogLevel, message: string, ...args: unknown[]) {
    this.ctx.log(level, `[${this.name}] ${message}`, ...args)
  }

  onTrackStart(handler: TrackStartHandler) { this.ctx.onTrackStart(handler) }
  onTrackEnd(handler: TrackEndHandler) { this.ctx.onTrackEnd(handler) }
  onTrackStuck(handler: TrackStuckHandler) { this.ctx.onTrackStuck(handler) }
  onTrackException(handler: TrackExceptionHandler) { this.ctx.onTrackException(handler) }
  onQueueEnd(handler: QueueEndHandler) { this.ctx.onQueueEnd(handler) }
  onPlayerUpdate(handler: PlayerUpdateHandler) { this.ctx.onPlayerUpdate(handler) }
  onQueueEvent(type: QueueEventType, handler: QueueEventHandler) { this.ctx.onQueueEvent(type, handler) }
  registerRoute(method: RouteRegistration['method'], path: string, handler: RouteRegistration['handler']) {
    this.ctx.registerRoute(method, path, handler)
  }
}

export function register(plugin: Plugin): Plugin {
  if (!plugin.name) throw new Error('Plugin must have a name')
  if (!plugin.version) throw new Error('Plugin must have a version')
  if (typeof plugin.install !== 'function') throw new Error('Plugin must have an install() function')
  return plugin
}
