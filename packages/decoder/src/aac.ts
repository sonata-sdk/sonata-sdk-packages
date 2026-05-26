import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SR_TABLE = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

interface Faad2Module {
  _init_decoder(ptr: number, len: number): number
  _decode_frame(handle: number, inPtr: number, inLen: number, outPtr: number, outSize: number): number
  _free_decoder(handle: number): void
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPU8: Uint8Array
  HEAPF32: Float32Array
  ready: Promise<void>
}

let modulePromise: Promise<Faad2Module> | null = null

async function getModule(): Promise<Faad2Module> {
  if (modulePromise) return modulePromise

  modulePromise = (async () => {
    const wasmDir = join(__dirname, '..', 'wasm')
    const wasmBinary = readFileSync(join(wasmDir, 'faad2_decoder.wasm'))
    const { default: createModule } = await import(join(wasmDir, 'faad2_decoder.mjs'))
    return await createModule({ wasmBinary }) as unknown as Faad2Module
  })()

  return modulePromise
}

function isADTS(data: Uint8Array): boolean {
  return data.length >= 2 && (data[0] & 0xff) === 0xff && (data[1] & 0xf0) === 0xf0
}

function isMP4Container(data: Uint8Array): boolean {
  if (data.length < 8) return false
  const type = String.fromCharCode(data[4], data[5], data[6], data[7])
  return type === 'ftyp' || type === 'moov'
}

function splitADTSFrames(data: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = []
  let off = 0
  while (off + 7 < data.length) {
    if ((data[off] & 0xff) !== 0xff || (data[off + 1] & 0xf0) !== 0xf0) break
    const hasCRC = !(data[off + 1] & 1)
    const headerLen = hasCRC ? 9 : 7
    const frameLen = ((data[off + 3] & 0x03) << 11) | (data[off + 4] << 3) | (data[off + 5] >> 5)
    if (frameLen < headerLen || frameLen > 8192 || off + frameLen > data.length) break
    frames.push(data.slice(off + headerLen, off + frameLen))
    off += frameLen
  }
  return frames
}

const ASC_DEFAULT = new Uint8Array([0x12, 0x10])

export interface AACDecoder {
  ready: Promise<void>
  decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  reset(): void
  free(): void
}

export async function createAACDecoder(): Promise<AACDecoder> {
  const mod = await getModule()

  async function decode(data: Uint8Array) {
    const isMP4 = isMP4Container(data)
    const frames = isMP4 ? extractMP4AACFrames(data) : isADTS(data) ? splitADTSFrames(data) : [data]

    if (frames.length === 0) throw new Error('no AAC frames found')

    const ascPtr = mod._malloc(ASC_DEFAULT.length)
    mod.HEAPU8.set(ASC_DEFAULT, ascPtr)
    const handle = mod._init_decoder(ascPtr, ASC_DEFAULT.length)
    mod._free(ascPtr)

    if (!handle) throw new Error('FAAD2 init failed')

    const outPtr = mod._malloc(2048 * 2 * 4)
    const allPcm: Float32Array[] = []
    let sampleRate = 44100
    let channels = 2
    let totalSamples = 0

    for (const frame of frames) {
      const inPtr = mod._malloc(frame.length)
      mod.HEAPU8.set(frame, inPtr)
      const packed = mod._decode_frame(handle, inPtr, frame.length, outPtr, 2048 * 2 * 4)
      mod._free(inPtr)

      if (packed > 0) {
        const srIdx = (packed >>> 28) & 0xf
        const ch = (packed >>> 24) & 0xf
        const samples = packed & 0xffffff
        if (samples > 0) {
          if (srIdx > 0) sampleRate = SR_TABLE[srIdx] || sampleRate
          channels = ch || channels
          const pcm = new Float32Array(mod.HEAPF32.buffer, outPtr, samples)
          allPcm.push(Float32Array.from(pcm))
          totalSamples += samples
        }
      }
    }

    mod._free(outPtr)
    mod._free_decoder(handle)

    if (totalSamples === 0) throw new Error('no AAC frames decoded successfully')

    const spc = Math.floor(totalSamples / channels)
    const channelData: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(spc))

    let writeIdx = 0
    for (const pcm of allPcm) {
      const frameSpc = pcm.length / channels
      for (let i = 0; i < frameSpc; i++) {
        for (let c = 0; c < channels; c++) {
          channelData[c][writeIdx] = pcm[i * channels + c]
        }
        writeIdx++
      }
    }

    return { channelData, samplesDecoded: totalSamples, sampleRate }
  }

  return { ready: Promise.resolve(), decode, reset() {}, free() {} }
}

function extractMP4AACFrames(data: Uint8Array): Uint8Array[] {
  const findBox = (start: number, type: string): { offset: number; size: number } | null => {
    let off = start
    while (off + 8 <= data.length) {
      const size = (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]
      const boxType = String.fromCharCode(data[off + 4], data[off + 5], data[off + 6], data[off + 7])
      if (boxType === type) return { offset: off, size }
      if (size < 8) break
      off += size
    }
    return null
  }

  const moov = findBox(0, 'moov')
  if (!moov) throw new Error('moov box not found')

  // Navigate moov/trak/mdia/minf/stbl
  const navigate = (startOff: number, path: string[]): { offset: number; size: number } | null => {
    let off = startOff
    for (const target of path) {
      const found = findBox(off, target)
      if (!found) return null
      off = found.offset + 8
    }
    return { offset: 0, size: 0 }
  }

  // Read stsz from stbl
  let stblOff = 0
  {
    const find = (start: number, type: string): { offset: number; size: number } | null => {
      let o = start
      while (o + 8 <= data.length) {
        const s = (data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]
        const t = String.fromCharCode(data[o + 4], data[o + 5], data[o + 6], data[o + 7])
        if (t === type) return { offset: o, size: s }
        if (s < 8) break
        o += s
      }
      return null
    }

    const trak = find(moov.offset, 'trak')
    if (!trak) throw new Error('trak not found')
    const mdia = find(trak.offset, 'mdia')
    if (!mdia) throw new Error('mdia not found')
    const minf = find(mdia.offset, 'minf')
    if (!minf) throw new Error('minf not found')
    const stbl = find(minf.offset, 'stbl')
    if (!stbl) throw new Error('stbl not found')
    stblOff = stbl.offset
  }

  // Parse stsz
  const sampleSizes: number[] = []
  {
    let off = stblOff + 8
    while (off + 8 <= data.length) {
      const size = (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]
      const type = String.fromCharCode(data[off + 4], data[off + 5], data[off + 6], data[off + 7])
      if (type === 'stsz') {
        const sampleSize = (data[off + 12] << 24) | (data[off + 13] << 16) | (data[off + 14] << 8) | data[off + 15]
        const sampleCount = (data[off + 16] << 24) | (data[off + 17] << 16) | (data[off + 18] << 8) | data[off + 19]
        if (sampleSize === 0) {
          for (let i = 0; i < sampleCount; i++) {
            const s = (data[off + 20 + i * 4] << 24) | (data[off + 21 + i * 4] << 16) | (data[off + 22 + i * 4] << 8) | data[off + 23 + i * 4]
            sampleSizes.push(s)
          }
        } else {
          for (let i = 0; i < sampleCount; i++) sampleSizes.push(sampleSize)
        }
        break
      }
      if (size < 8) break
      off += size
    }
  }

  const mdat = findBox(0, 'mdat')
  if (!mdat) throw new Error('mdat box not found')

  const frames: Uint8Array[] = []
  let frameOff = mdat.offset + 8
  for (let i = 0; i < sampleSizes.length; i++) {
    let frameData = data.slice(frameOff, frameOff + sampleSizes[i])
    if (i === 0 && sampleSizes[i] > 16) {
      const tag = String.fromCharCode(frameData[0], frameData[1], frameData[2])
      if (tag === 'Lav') frameData = frameData.slice(16)
    }
    frames.push(frameData)
    frameOff += sampleSizes[i]
  }

  return frames
}

export async function decodeAAC(src: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }> {
  const decoder = await createAACDecoder()
  return decoder.decode(src)
}
