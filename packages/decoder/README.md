<div align="center">
  <h1>🧩 @sonata-sdk/decoder</h1>
  <p><strong>Zero-dependency audio decoders for Node.js</strong><br />MP3 · FLAC · AAC (bundled FAAD2 WASM)</p>
  <p>
    <img src="https://img.shields.io/npm/v/@sonata-sdk/decoder?color=blueviolet" alt="Version" />
    <img src="https://img.shields.io/npm/l/@sonata-sdk/decoder?color=blue" alt="License" />
    <img src="https://img.shields.io/npm/dt/@sonata-sdk/decoder?color=green" alt="Downloads" />
    <img src="https://img.shields.io/badge/node-20%2B-339933?logo=node.js" alt="Node" />
  </p>
  <p>
    <a href="#-install">Install</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-whats-inside">What's inside</a> •
    <a href="#-related">Related</a>
  </p>
  <br />
  <hr />
</div>

> Pure TypeScript audio decoders. No native addons, no FFmpeg, no external WASM wrappers. MP3 and FLAC use pure-JS decoders, AAC uses a bundled FAAD2 WASM compiled from source.

---

## 📥 Install

```bash
npm install @sonata-sdk/decoder
```

---

## 🚀 Usage

```ts
import { detectFormat, createDecoder } from '@sonata-sdk/decoder'
import { readFileSync } from 'fs'

const data = readFileSync('song.mp4')
const fmt = detectFormat(data) // 'mp3' | 'flac' | 'aac' | null

const decoder = await createDecoder(fmt!)
const { channelData, sampleRate } = await decoder.decode(data)

// channelData[0] = Float32Array left channel
// channelData[1] = Float32Array right channel
```

### Subpath imports

```ts
import { createAACDecoder } from '@sonata-sdk/decoder/aac'
import { createMP3Decoder } from '@sonata-sdk/decoder/mp3'
import { createFLACDecoder } from '@sonata-sdk/decoder/flac'
```

---

## 📦 What's inside

| Format | Decoder | Size |
|--------|---------|------|
| **MP3** | `@audio/decode-mp3` (pure JS) | — |
| **FLAC** | `@audio/decode-flac` (pure JS) | — |
| **AAC** | Bundled FAAD2 WASM (compiled from source) | ~276 KB |

AAC is decoded with our own FAAD2 WASM binary, compiled from the [official FAAD2 source](https://github.com/knik0/faad2) with Emscripten 3.1.56. No `@ecliptia/faad2-wasm`, no `mp4box`, no FFmpeg.

The WASM uses a handle-based API so multiple decoders can run concurrently on the same instance.

---

## 📦 Related

- [**Sonata**](https://github.com/sonata-sdk/sonata) — Lavalink-compatible audio server
- [**@sonata-sdk/voice**](https://github.com/sonata-sdk/sonata-sdk-packages/tree/main/packages/voice) — Discord voice connection
- [**@sonata-sdk/ws**](https://github.com/sonata-sdk/sonata-sdk-packages/tree/main/packages/ws) — Resumable WebSocket client
- [**sonata-sdk-packages**](https://github.com/sonata-sdk/sonata-sdk-packages) — Monorepo

---

<div align="center">
  <sub>MIT License · Built with ❤️</sub>
</div>
