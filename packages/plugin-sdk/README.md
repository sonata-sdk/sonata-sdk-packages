<div align="center">
  <h1>🔌 @sonata-sdk/plugin-sdk</h1>
  <p><strong>TypeScript SDK for building <a href="https://github.com/sonata-sdk/sonata">Sonata</a> plugins</strong></p>
  <p>
    <img src="https://img.shields.io/npm/v/@sonata-sdk/plugin-sdk?color=blueviolet" alt="Version" />
    <img src="https://img.shields.io/npm/l/@sonata-sdk/plugin-sdk?color=blue" alt="License" />
    <img src="https://img.shields.io/npm/dt/@sonata-sdk/plugin-sdk?color=green" alt="Downloads" />
    <img src="https://img.shields.io/bundlephobia/min/@sonata-sdk/plugin-sdk?color=orange" alt="Size" />
    <img src="https://img.shields.io/badge/node-20%2B-339933?logo=node.js" alt="Node" />
  </p>
  <p>
    <a href="#-install">Install</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-api-reference">API</a> •
    <a href="#-examples">Examples</a>
  </p>
  <br />
  <hr />
</div>

> The official SDK for creating plugins for [**Sonata**](https://github.com/sonata-sdk/sonata). Provides TypeScript types, a `register()` helper, and an optional base class so you can build and distribute plugins as npm packages.

---

## 📥 Install

```bash
npm install @sonata-sdk/plugin-sdk
```

---

## 📋 Usage

### Quick plugin

```js
import { register } from '@sonata-sdk/plugin-sdk'

export default register({
  name: 'my-plugin',
  version: '1.0.0',
  install(ctx) {
    ctx.onTrackStart((guildId, track) => {
      ctx.log('info', `▶ ${track.info.title}`)
    })

    ctx.onTrackEnd((guildId, track, reason) => {
      ctx.log('info', `⏹ ${track.info.title} — ${reason}`)
    })
  },
})
```

### Plugin with route

```js
import { register } from '@sonata-sdk/plugin-sdk'

export default register({
  name: 'status-plugin',
  version: '1.0.0',
  install(ctx) {
    let totalTracks = 0

    ctx.onTrackStart((guildId, track) => {
      totalTracks++
    })

    ctx.registerRoute('GET', '/status-plugin/stats', (req, res) => {
      res.end(JSON.stringify({ totalTracks }))
    })
  },
})
```

---

## 📖 API Reference

### `register(plugin)`

Validates and returns a plugin definition.

```ts
function register(plugin: {
  name: string
  version: string
  install(ctx: PluginContext): void | Promise<void>
}): Plugin
```

Throws if `name`, `version`, or `install` are missing.

---

### `PluginContext`

| Method | Description |
|--------|-------------|
| `config` | Per-plugin configuration object from Sonata's `config.js` |
| `onTrackStart(fn)` | Fired when a track starts playing |
| `onTrackEnd(fn)` | Fired when a track ends |
| `onTrackStuck(fn)` | Fired when a track gets stuck |
| `onTrackException(fn)` | Fired when a track encounters an error |
| `onQueueEnd(fn)` | Fired when the queue is empty |
| `onPlayerUpdate(fn)` | Fired on each player state update |
| `onQueueEvent(type, fn)` | Fired on queue changes (add, remove, clear, shuffle) |
| `registerRoute(method, path, handler)` | Register a custom HTTP route |
| `log(level, message, ...args)` | Log through Sonata's logger |

**Event handler signatures:**

```ts
type TrackStartHandler = (guildId: string, track: Track) => void
type TrackEndHandler = (guildId: string, track: Track, reason: string) => void
type TrackStuckHandler = (guildId: string, track: Track, thresholdMs: number) => void
type TrackExceptionHandler = (guildId: string, track: Track, error: string) => void
type QueueEndHandler = (guildId: string) => void
type PlayerUpdateHandler = (guildId: string, state: PlayerState) => void
type QueueEventHandler = (guildId: string, detail: unknown) => void
```

---

### `SonataPlugin` (optional base class)

For object-oriented plugins:

```ts
import { SonataPlugin } from '@sonata-sdk/plugin-sdk'

export default new (class extends SonataPlugin {
  constructor() {
    super('my-plugin', '1.0.0')
  }

  start() {
    this.onTrackStart((guildId, track) => {
      this.log('info', `▶ ${track.info.title}`)
    })

    this.onTrackEnd((guildId, track, reason) => {
      this.log('info', `⏹ ${track.info.title} — ${reason}`)
    })
  }
})()
```

Available methods on `SonataPlugin`:

| Method | Delegates to |
|--------|-------------|
| `log(level, msg, ...args)` | `ctx.log(...)` (prefixes `[plugin-name]`) |
| `onTrackStart(fn)` | `ctx.onTrackStart(fn)` |
| `onTrackEnd(fn)` | `ctx.onTrackEnd(fn)` |
| `onTrackStuck(fn)` | `ctx.onTrackStuck(fn)` |
| `onTrackException(fn)` | `ctx.onTrackException(fn)` |
| `onQueueEnd(fn)` | `ctx.onQueueEnd(fn)` |
| `onPlayerUpdate(fn)` | `ctx.onPlayerUpdate(fn)` |
| `onQueueEvent(type, fn)` | `ctx.onQueueEvent(type, fn)` |
| `registerRoute(method, path, handler)` | `ctx.registerRoute(method, path, handler)` |

---

### `Track`

```ts
interface Track {
  encoded: string
  info: TrackInfo
  source: string
  userData?: Record<string, unknown>
}

interface TrackInfo {
  identifier: string
  title: string
  author: string
  duration: number
  uri: string
  artworkUrl: string
  sourceName: string
  isStream: boolean
  position: number
  isSeekable?: boolean
}
```

---

### `PlayerState`

```ts
interface PlayerState {
  guildId: string
  track?: Track
  volume: number
  paused: boolean
  position: number
  connected: boolean
  ping: number
}
```

---

## 💡 Examples

### Scrobble to Last.fm

```js
import { register } from '@sonata-sdk/plugin-sdk'

export default register({
  name: 'lastfm-scrobbler',
  version: '1.0.0',
  install(ctx) {
    ctx.onTrackStart((guildId, track) => {
      const { title, author } = track.info
      fetch(`https://ws.audioscrobbler.com/2.0/?method=track.updateNowPlaying&artist=${author}&track=${title}&api_key=${ctx.config.apiKey}&format=json`)
    })
  },
})
```

### Track counter

```js
import { SonataPlugin } from '@sonata-sdk/plugin-sdk'

export default new (class extends SonataPlugin {
  #counts = new Map()

  constructor() {
    super('track-counter', '1.0.0')
  }

  start() {
    this.onTrackStart((guildId) => {
      this.#counts.set(guildId, (this.#counts.get(guildId) ?? 0) + 1)
      this.log('info', `Guild ${guildId}: ${this.#counts.get(guildId)} tracks played`)
    })

    this.registerRoute('GET', '/track-counter/stats', (req, res, params) => {
      const guildId = params.guildId
      res.end(JSON.stringify({ played: this.#counts.get(guildId) ?? 0 }))
    })
  }
})()
```

---

## 📦 Related

- [**Sonata**](https://github.com/sonata-sdk/sonata) — Lavalink-compatible audio server
- [**sonata-sdk-packages**](https://github.com/sonata-sdk/sonata-sdk-packages) — Monorepo for all official packages

---

<div align="center">
  <sub>MIT License · Built with ❤️</sub>
</div>
