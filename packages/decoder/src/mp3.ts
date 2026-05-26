import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SR_TABLE = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

interface EmscriptenModule {
  _init_mp3_decoder(): number
  _decode_mp3(handle: number, inPtr: number, inLen: number, outPtr: number, outCap: number): number
  _free_mp3_decoder(handle: number): void
  _reset_mp3_decoder(handle: number): void
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPU8: Uint8Array
  HEAPF32: Float32Array
  ready: Promise<void>
}

let modulePromise: Promise<EmscriptenModule> | null = null

async function getModule(): Promise<EmscriptenModule> {
  if (modulePromise) return modulePromise

  modulePromise = (async () => {
    const wasmDir = join(__dirname, '..', 'wasm')
    const wasmBinary = readFileSync(join(wasmDir, 'mpg123_decoder.wasm'))
    const { default: createModule } = await import(join(wasmDir, 'mpg123_decoder.mjs'))
    const mod = await createModule({ wasmBinary }) as unknown as EmscriptenModule
    return mod
  })()

  return modulePromise
}

export interface MP3Decoder {
  ready: Promise<void>
  decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  reset(): void
  free(): void
}

export async function createMP3Decoder(): Promise<MP3Decoder> {
  const mod = await getModule()
  const handle = mod._init_mp3_decoder()
  if (!handle) throw new Error('mpg123 init failed')

  const DECODE_BUF_SIZE = 65536 * 2 * 4
  const outPtr = mod._malloc(DECODE_BUF_SIZE)

  async function decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }> {
    const allChunks: Float32Array[] = []
    let sampleRate = 44100
    let channels = 2
    let totalSamples = 0

    let offset = 0
    const feed = (inPtr: number, inLen: number): boolean => {
      const packed = mod._decode_mp3(handle, inPtr, inLen, outPtr, DECODE_BUF_SIZE)
      if (packed <= 0) return false
      const samples = packed & 0xffffff
      if (samples === 0) return false
      const srIdx = (packed >>> 28) & 0xf
      const ch = (packed >>> 24) & 0xf
      if (srIdx > 0) sampleRate = SR_TABLE[srIdx] || sampleRate
      channels = ch || channels
      const pcm = new Float32Array(mod.HEAPF32.buffer, outPtr, samples * channels)
      allChunks.push(Float32Array.from(pcm))
      totalSamples += samples * channels
      return true
    }

    while (offset < data.length) {
      const chunkSize = Math.min(data.length - offset, 65536)
      const inPtr = mod._malloc(chunkSize)
      mod.HEAPU8.set(data.subarray(offset, offset + chunkSize), inPtr)
      feed(inPtr, chunkSize)
      mod._free(inPtr)
      offset += chunkSize
    }

    while (feed(0, 0));

    if (totalSamples === 0) throw new Error('no MP3 frames decoded')

    const samplesPerChannel = Math.floor(totalSamples / channels)
    const channelData: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(samplesPerChannel))

    let writeIdx = 0
    for (const chunk of allChunks) {
      const frameSamples = chunk.length / channels
      for (let s = 0; s < frameSamples; s++) {
        for (let c = 0; c < channels; c++) {
          channelData[c][writeIdx] = chunk[s * channels + c]
        }
        writeIdx++
      }
    }

    return { channelData, samplesDecoded: totalSamples, sampleRate }
  }

  return {
    ready: Promise.resolve(),
    decode,
    reset: () => mod._reset_mp3_decoder(handle),
    free: () => { mod._free_mp3_decoder(handle); mod._free(outPtr) },
  }
}

export async function decodeMP3(src: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }> {
  const decoder = await createMP3Decoder()
  try {
    return await decoder.decode(src)
  } finally {
    decoder.free()
  }
}
