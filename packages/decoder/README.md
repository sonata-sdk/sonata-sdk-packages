<div align="center">
  <h1>🧩 @sonata-sdk/decoder</h1>
  <p><strong>Zero-dependency pure-WASM audio decoders for Node.js</strong><br />MP3 · FLAC · AAC</p>
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

> Pure-WASM audio decoders. No native addons, no FFmpeg, no external JS dependencies. Every decoder is a hand-compiled C library → WASM using Emscripten.

---

## 📥 Install

```bash
npm install @sonata-sdk/decoder
```

---

## 🚀 Usage

```ts
import { detectFormat, decodeMP3, decodeFLAC } from '@sonata-sdk/decoder'
import { readFileSync } from 'fs'

const data = readFileSync('song.mp3')
const fmt = detectFormat(data) // 'mp3' | 'flac' | 'aac' | null

const { channelData, sampleRate, samplesDecoded } = fmt === 'mp3'
  ? await decodeMP3(data)
  : await decodeFLAC(data)

// channelData[0] = Float32Array left
// channelData[1] = Float32Array right
```

### Streaming

```ts
import { createMP3Decoder } from '@sonata-sdk/decoder'

const decoder = await createMP3Decoder()
for (const chunk of chunks) {
  const { channelData, sampleRate } = await decoder.decode(chunk)
  // process float PCM...
}
decoder.free()
```

### Subpath imports

```ts
import { createAACDecoder } from '@sonata-sdk/decoder/aac'
import { createMP3Decoder } from '@sonata-sdk/decoder/mp3'
import { createFLACDecoder } from '@sonata-sdk/decoder/flac'
```

---

## 📦 What's inside

| Format | Decoder | WASM size |
|--------|---------|-----------|
| **MP3** | mpg123 1.32.5 compiled to WASM | ~235 KB |
| **FLAC** | libFLAC 1.4.3 compiled to WASM | ~59 KB |
| **AAC** | FAAD2 compiled to WASM | ~276 KB |

All WASM binaries are compiled from source with Emscripten 3.1.56 and bundled in the package. Zero runtime dependencies — no `@audio/decode-*`, no `mpg123-decoder`, no `@wasm-audio-decoders/`.

The WASM uses a handle-based API so multiple decoders can run concurrently.

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
