import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SR_TABLE = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

interface EmscriptenModule {
  _init_flac_decoder(): number
  _decode_flac(handle: number, inPtr: number, inLen: number, outPtr: number, outCap: number): number
  _free_flac_decoder(handle: number): void
  _reset_flac_decoder(handle: number): void
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
    const wasmBinary = readFileSync(join(wasmDir, 'flac_decoder.wasm'))
    const { default: createModule } = await import(join(wasmDir, 'flac_decoder.mjs'))
    const mod = await createModule({ wasmBinary }) as unknown as EmscriptenModule
    return mod
  })()

  return modulePromise
}

export interface FLACDecoder {
  ready: Promise<void>
  decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  reset(): void
  free(): void
}

export async function createFLACDecoder(): Promise<FLACDecoder> {
  const mod = await getModule()
  const handle = mod._init_flac_decoder()
  if (!handle) throw new Error('FLAC decoder init failed')

  const DECODE_BUF_SIZE = 8192 * 1024
  const outPtr = mod._malloc(DECODE_BUF_SIZE)

  async function decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }> {
    const inPtr = mod._malloc(data.length)
    mod.HEAPU8.set(data, inPtr)

    const packed = mod._decode_flac(handle, inPtr, data.length, outPtr, DECODE_BUF_SIZE)
    mod._free(inPtr)

    if (packed <= 0) throw new Error('FLAC decode failed')

    const samples = packed & 0xffffff
    const srIdx = (packed >>> 28) & 0xf
    const channels = (packed >>> 24) & 0xf
    const sampleRate = SR_TABLE[srIdx] || 44100

    if (samples === 0) throw new Error('no FLAC frames decoded')

    const samplesPerChannel = Math.floor(samples / channels)
    const pcm = new Float32Array(mod.HEAPF32.buffer, outPtr, samples)
    const pcmCopy = Float32Array.from(pcm)

    const channelData: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(samplesPerChannel))
    for (let s = 0; s < samplesPerChannel; s++) {
      for (let c = 0; c < channels; c++) {
        channelData[c][s] = pcmCopy[s * channels + c]
      }
    }

    return { channelData, samplesDecoded: samples, sampleRate }
  }

  return {
    ready: Promise.resolve(),
    decode,
    reset: () => mod._reset_flac_decoder(handle),
    free: () => { mod._free_flac_decoder(handle); mod._free(outPtr) },
  }
}

export async function decodeFLAC(src: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }> {
  const decoder = await createFLACDecoder()
  try {
    return await decoder.decode(src)
  } finally {
    decoder.free()
  }
}
