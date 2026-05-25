<div align="center">
  <h1>🌐 @sonata-sdk/ws</h1>
  <p><strong>Zero-dependency WebSocket for Node.js</strong><br />Client + server — built from scratch on <code>net</code> / <code>tls</code> / <code>crypto</code></p>
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
    <a href="#-subpath-imports">Subpath imports</a> •
    <a href="#-related">Related</a>
  </p>
  <br />
  <hr />
</div>

> Full WebSocket implementation using only Node.js built-ins. **Client** with auto-reconnect + message queue, **server** with HTTP upgrade handler. No `ws` package, no external deps.

---

## ✨ Features

- **No dependencies** — pure Node.js (`net`, `tls`, `crypto`)
- **Client + Server** — `ResumableWS` (auto-reconnect) + `WebSocketServer` (HTTP upgrade)
- **Auto-reconnect** — exponential backoff (configurable, capped at 30s)
- **Message queue** — buffers outgoing messages while disconnected
- **Text + Binary** — full `string` and `Buffer` support
- **Strongly typed** — TypeScript declarations included
- **TLS/SSL** — `wss://` and `wss://` server support

---

## 📥 Install

```bash
npm install @sonata-sdk/ws
```

---

## 🚀 Usage

### Client

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

await ws.connect()
await ws.send(JSON.stringify({ op: 2, d: { token: '...' } }))
await ws.close(1000, 'bye')
```

### Server

```ts
import { createServer } from 'http'
import { WebSocketServer } from '@sonata-sdk/ws'

const httpServer = createServer()
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  console.log('client connected from', req.socket.remoteAddress)

  ws.on('message', (data) => ws.send(data)) // echo
  ws.on('close', (code, reason) => console.log('closed:', code, reason))
})

httpServer.listen(8080)
```

### Manual upgrade

```ts
import { WebSocketServer } from '@sonata-sdk/ws'

const wss = new WebSocketServer()

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') return
  wss.handleUpgrade(req, socket, head, (ws, req) => {
    wss.emit('connection', ws, req)
  })
})
```

---

## 📖 API

### `ResumableWS`

```ts
new ResumableWS(url: string, opts?: {
  maxReconnectAttempts?: number  // default: Infinity
  reconnectDelay?: number        // default: 1000
  queueWhileDisconnected?: boolean // default: true
})
```

| Method | Description |
|--------|-------------|
| `connect()` | Connect to server (returns `Promise<void>`) |
| `send(data)` | Send text or binary message |
| `close(code?, reason?)` | Close connection gracefully |
| `on(event, listener)` | Register event listener |
| `off(event, listener)` | Remove event listener |

| Event | Arguments | Description |
|-------|-----------|-------------|
| `open` | — | Connected |
| `message` | `string \| Buffer` | Received message |
| `close` | `code, reason` | Disconnected |
| `error` | `Error` | Error occurred |

---

### `WebSocketServer`

```ts
new WebSocketServer(opts?: {
  server?: http.Server  // auto-bind to upgrade events
  path?: string         // optional path filter
})
```

| Method | Description |
|--------|-------------|
| `handleUpgrade(req, socket, head, callback)` | Upgrade HTTP to WS |
| `close()` | Clean up |
| `on(event, listener)` | Register listener |

| Event | Arguments | Description |
|-------|-----------|-------------|
| `connection` | `(WSConnection, IncomingMessage)` | New client |
| `error` | `(Error)` | Server error |

---

### `WSConnection`

Base class shared by client and server connections.

| Method | Description |
|--------|-------------|
| `send(data)` | Send text or binary |
| `close(code?, reason?)` | Close gracefully |
| `ping()` | Send ping |
| `terminate()` | Force close |

| Event | Arguments |
|-------|-----------|
| `message` | `string \| Buffer` |
| `close` | `code, reason` |
| `error` | `Error` |
| `ping` / `pong` | — |

---

## 🔌 Subpath imports

```ts
import { ResumableWS }     from '@sonata-sdk/ws/client'
import { WebSocketServer } from '@sonata-sdk/ws/server'
import { WSConnection }    from '@sonata-sdk/ws/connection'
import { encodeFrame, readFrame } from '@sonata-sdk/ws/frame'
import type { WSEventMap } from '@sonata-sdk/ws/types'
```

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
