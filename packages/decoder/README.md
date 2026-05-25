# @sonata-sdk/decoder

Pure-WASM audio decoders (MP3, FLAC) for Node.js — no native dependencies.

## Install

```sh
npm install @sonata-sdk/decoder
```

## Usage

```ts
import { createMP3Decoder, createFLACDecoder, detectFormat } from '@sonata-sdk/decoder'
import { readFileSync } from 'node:fs'

const buf = readFileSync('track.mp3')

// Detect format from magic bytes
const fmt = detectFormat(new Uint8Array(buf))
console.log(fmt) // 'mp3' | 'flac' | null

// Decode full file
import { decodeMP3 } from '@sonata-sdk/decoder/mp3'
const { channelData, sampleRate } = await decodeMP3(new Uint8Array(buf))

// Stream with decoder instance
const decoder = await createMP3Decoder()
for await (const chunk of someStream) {
  const result = await decoder.decodeFrame(chunk)
  // result.channelData: Float32Array[]
  // result.samplesDecoded: number
}
decoder.free()
```

## API

### `@sonata-sdk/decoder`
| Export | Description |
|---|---|
| `detectFormat(data)` | Detect `'mp3'` / `'flac'` / `null` from magic bytes |
| `createDecoder(format)` | Create decoder by format name |

### `@sonata-sdk/decoder/mp3`
| Export | Description |
|---|---|
| `createMP3Decoder()` | Create streaming MP3 decoder instance |
| `decodeMP3(src)` | Decode full MP3 buffer in one call |

### `@sonata-sdk/decoder/flac`
| Export | Description |
|---|---|
| `createFLACDecoder()` | Create streaming FLAC decoder instance |
| `decodeFLAC(src)` | Decode full FLAC buffer in one call |

## License

MIT
