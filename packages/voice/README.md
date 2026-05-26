<div align="center">
  <h1>🎙️ @sonata-sdk/voice</h1>
  <p><strong>Discord voice connection library</strong><br />WebSocket gateway · UDP · RTP · Encryption · DAVE/MLS</p>
  <p>
    <img src="https://img.shields.io/npm/v/@sonata-sdk/voice?color=blueviolet" alt="Version" />
    <img src="https://img.shields.io/npm/l/@sonata-sdk/voice?color=blue" alt="License" />
    <img src="https://img.shields.io/badge/node-20%2B-339933?logo=node.js" alt="Node" />
    <img src="https://img.shields.io/badge/docs-sonata.enerthya.website-818cf8?style=flat-square" alt="Docs" />
  </p>
  <p>
    <a href="#-install">Install</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-api">API</a> •
    <a href="#-related">Related</a>
  </p>
  <br />
  <hr />
</div>

> Pure TypeScript Discord voice library. Connects to Discord's voice gateway, handles UDP audio, RTP packetization, encryption, and DAVE/MLS E2EE. No native dependencies, no C++.

---

## 📥 Install

```bash
npm install @sonata-sdk/voice
```

### Optional (for DAVE/E2EE)

```bash
npm install @snazzah/davey libsodium-wrappers
```

---

## 🔌 Subpath imports

```ts
import { joinVoiceChannel } from '@sonata-sdk/voice'
import { VoiceGateway } from '@sonata-sdk/voice/gateway'
import { UdpSocket } from '@sonata-sdk/voice/udp'
import { AudioEncryption } from '@sonata-sdk/voice/encryption'
import type { VoiceConnection, EncryptionMode } from '@sonata-sdk/voice/types'
```

---

## 🚀 Usage

```ts
import { joinVoiceChannel } from '@sonata-sdk/voice'

const connection = joinVoiceChannel({
  guildId: '123',
  userId: '456',
  channelId: '789',
  encryption: 'aead_aes256_gcm_rtpsize',
})

connection.voiceStateUpdate({ sessionId: 'abc' })
connection.voiceServerUpdate({ token: 'xyz', endpoint: 'gateway.discord.audio' })

connection.on('stateChange', (old, next) => {
  if (next.status === 'connected') {
    // Send audio every 20ms
    setInterval(() => {
      connection.sendAudioFrame(opusFrame)
    }, 20)
  }
})

connection.setSpeaking(1)
```

---

## 📖 API

### `joinVoiceChannel(options)`

| Option | Type | Description |
|--------|------|-------------|
| `guildId` | `string` | Discord guild ID |
| `userId` | `string` | Bot user ID |
| `channelId` | `string` | Voice channel ID |
| `encryption` | `string \| null` | Encryption mode or null for auto |

Returns a `VoiceConnection`.

### `VoiceConnection`

| Property | Description |
|----------|-------------|
| `state` | `{ status, reason, code }` — connection state |
| `playerState` | `{ status, reason }` — playback state |
| `ping` | Voice websocket latency |
| `statistics` | `{ packetsSent, packetsLost, packetsExpected }` |
| `udpInfo` | `{ ssrc, ip, port, secretKey }` or `null` |

| Method | Description |
|--------|-------------|
| `voiceStateUpdate(obj)` | Feed Discord voice state |
| `voiceServerUpdate(obj)` | Feed Discord voice server |
| `sendAudioFrame(frame)` | Send an Opus frame |
| `setSpeaking(value)` | Set speaking flag (1 = speaking) |
| `destroy()` | Clean up connection |
| `on(event, fn)` | Listen to events |
| `removeAllListeners(event?)` | Remove listeners |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `stateChange` | `(old, next)` | Connection state changed |
| `playerStateChange` | `(old, next)` | Player state changed |
| `error` | `(Error)` | An error occurred |
| `ready` | `()` | Voice connection established |

---

## 🔒 Encryption Modes

| Mode | Algorithm |
|------|-----------|
| `aead_aes256_gcm_rtpsize` | AES-256-GCM |
| `aead_xchacha20_poly1305_rtpsize` | XChaCha20-Poly1305 |
| `xsalsa20_poly1305_lite_rtpsize` | XSalsa20-Poly1305 (lite) |
| `xsalsa20_poly1305_suffix_rtpsize` | XSalsa20-Poly1305 (suffix) |
| `normal` | XSalsa20-Poly1305 (legacy) |

---

## 📦 Related

- [**Sonata**](https://github.com/sonata-sdk/sonata) — Lavalink-compatible audio server
- [**@sonata-sdk/plugin-sdk**](https://github.com/sonata-sdk/sonata-sdk-packages/tree/main/packages/plugin-sdk) — SDK for Sonata plugins
- [**sonata-sdk-packages**](https://github.com/sonata-sdk/sonata-sdk-packages) — Monorepo
- [**Docs**](https://sonata.enerthya.website) — Package documentation

---

<div align="center">
  <sub>MIT License · Built with ❤️</sub>
</div>
