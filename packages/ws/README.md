<div align="center">
  <h1>🌐 @sonata-sdk/ws</h1>
  <p><strong>Zero-dependency WebSocket client for Node.js</strong><br />Custom implementation using only built-in modules — no <code>ws</code> package</p>
  <p>
    <img src="https://img.shields.io/npm/v/@sonata-sdk/ws?color=blueviolet" alt="Version" />
    <img src="https://img.shields.io/npm/l/@sonata-sdk/ws?color=blue" alt="License" />
    <img src="https://img.shields.io/npm/dt/@sonata-sdk/ws?color=green" alt="Downloads" />
    <img src="https://img.shields.io/badge/node-20%2B-339933?logo=node.js" alt="Node" />
  </p>
  <p>
    <a href="#-features">Features</a> •
    <a href="#-install">Install</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-api">API</a> •
    <a href="#-related">Related</a>
  </p>
  <br />
  <hr />
</div>

> Lightweight WebSocket client built from scratch on Node.js built-ins (`net`, `tls`, `crypto`). Auto-reconnect, message queue, and full TypeScript declarations. No external dependencies.

---

## ✨ Features

- **No dependencies** — uses only Node.js built-ins
- **Auto-reconnect** — exponential backoff (configurable, capped at 30s)
- **Message queue** — buffers messages while disconnected, flushes on reconnect
- **Text + Binary** — full `string` and `Buffer` support
- **Strongly typed** — TypeScript declarations included
- **TLS/SSL** — `wss://` URLs work out of the box

---

## 📥 Install

```bash
npm install @sonata-sdk/ws
```

---

## 🚀 Usage

```ts
import { ResumableWS } from '@sonata-sdk/ws'

const ws = new ResumableWS('wss://gateway.discord.gg', {
  maxReconnectAttempts: Infinity,
  reconnectDelay: 1000,
  queueWhileDisconnected: true,
})

ws.on('open', () => console.log('connected'))
ws.on('message', (data) => console.log('received:', data))
ws.on('close', (code, reason) => console.log('disconnected:', code, reason))
ws.on('error', (err) => console.log('error:', err.message))

await ws.connect()
await ws.send(JSON.stringify({ op: 2, d: { token: '...' } }))
await ws.close(1000, 'bye')
```

---

## 📖 API

### `new ResumableWS(url, opts?)`

| Option | Default | Description |
|--------|---------|-------------|
| `maxReconnectAttempts` | `Infinity` | Max reconnection attempts before giving up |
| `reconnectDelay` | `1000` | Base delay (ms) between reconnects (doubles each attempt, capped at 30s) |
| `queueWhileDisconnected` | `true` | Buffer outgoing messages while disconnected |

### Methods

- `connect()` — connect to the WebSocket server (returns `Promise<void>`)
- `send(data: string | Buffer)` — send a message (queued if disconnected)
- `close(code?, reason?)` — close the connection gracefully
- `on(event, listener)` — register event listener
- `off(event, listener)` — remove event listener

### Events

| Event | Arguments | Description |
|-------|-----------|-------------|
| `open` | — | Connection established |
| `message` | `data: string \| Buffer` | Received message |
| `close` | `code: number, reason: string` | Connection closed |
| `error` | `error: Error` | Error occurred |

### Properties

- `connected: boolean` — whether the socket is open
- `readyState: number` — `1` (open) or `3` (closed)

---

## 📦 Related

- [**Sonata**](https://github.com/sonata-sdk/sonata) — Lavalink-compatible audio server
- [**@sonata-sdk/decoder**](https://github.com/sonata-sdk/sonata-sdk-packages/tree/main/packages/decoder) — Audio decoders (MP3, FLAC, AAC)
- [**@sonata-sdk/voice**](https://github.com/sonata-sdk/sonata-sdk-packages/tree/main/packages/voice) — Discord voice connection
- [**sonata-sdk-packages**](https://github.com/sonata-sdk/sonata-sdk-packages) — Monorepo

---

<div align="center">
  <sub>MIT License · Built with ❤️</sub>
</div>
