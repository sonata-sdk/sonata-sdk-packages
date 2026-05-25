import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function isADTS(data: Uint8Array): boolean {
  return data.length >= 2 && (data[0] & 0xff) === 0xff && (data[1] & 0xf0) === 0xf0
}

function isMP4Container(data: Uint8Array): boolean {
  if (data.length < 12) return false
  const type = String.fromCharCode(data[4], data[5], data[6], data[7])
  return type === 'ftyp' || type === 'moov'
}

function findBox(data: Uint8Array, type: string, start = 0): { offset: number; size: number } | null {
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

function parseMP4AAC(data: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = []

  const moov = findBox(data, 'moov')
  if (!moov) throw new Error('moov box not found')

  const moovData = data.slice(moov.offset, moov.offset + moov.size)

  const stbl = (() => {
    let off = 8
    const find = (parent: Uint8Array, type: string): { offset: number; size: number } | null => {
      let o = 8
      while (o + 8 <= parent.length) {
        const s = (parent[o] << 24) | (parent[o + 1] << 16) | (parent[o + 2] << 8) | parent[o + 3]
        const t = String.fromCharCode(parent[o + 4], parent[o + 5], parent[o + 6], parent[o + 7])
        if (t === type) return { offset: o, size: s }
        if (s < 8) break
        o += s
      }
      return null
    }
    const trak = find(moovData, 'trak')
    if (!trak) return null
    const trakData = data.slice(moov.offset + trak.offset, moov.offset + trak.offset + trak.size)
    const mdia = find(trakData, 'mdia')
    if (!mdia) return null
    const mdiaData = data.slice(moov.offset + trak.offset + mdia.offset, moov.offset + trak.offset + mdia.offset + mdia.size)
    const minf = find(mdiaData, 'minf')
    if (!minf) return null
    const minfData = data.slice(moov.offset + trak.offset + mdia.offset + minf.offset, moov.offset + trak.offset + mdia.offset + minf.offset + minf.size)
    const stblBox = find(minfData, 'stbl')
    if (!stblBox) return null
    return {
      offset: moov.offset + trak.offset + mdia.offset + minf.offset + stblBox.offset,
      size: stblBox.size,
    }
  })()

  if (!stbl) throw new Error('stbl box not found')
  const stblData = data.slice(stbl.offset, stbl.offset + stbl.size)

  let sampleSizes: number[] = []
  let mdatOffset = 0

  let off = 8
  while (off + 8 <= stblData.length) {
    const size = (stblData[off] << 24) | (stblData[off + 1] << 16) | (stblData[off + 2] << 8) | stblData[off + 3]
    const type = String.fromCharCode(stblData[off + 4], stblData[off + 5], stblData[off + 6], stblData[off + 7])
    if (type === 'stsz') {
      const sampleSize = (stblData[off + 12] << 24) | (stblData[off + 13] << 16) | (stblData[off + 14] << 8) | stblData[off + 15]
      const sampleCount = (stblData[off + 16] << 24) | (stblData[off + 17] << 16) | (stblData[off + 18] << 8) | stblData[off + 19]
      if (sampleSize === 0) {
        for (let i = 0; i < sampleCount; i++) {
          const s = (stblData[off + 20 + i * 4] << 24) | (stblData[off + 21 + i * 4] << 16) | (stblData[off + 22 + i * 4] << 8) | stblData[off + 23 + i * 4]
          sampleSizes.push(s)
        }
      } else {
        for (let i = 0; i < sampleCount; i++) sampleSizes.push(sampleSize)
      }
    }
    if (size < 8) break
    off += size
  }

  const mdat = findBox(data, 'mdat')
  if (!mdat) throw new Error('mdat box not found')
  mdatOffset = mdat.offset + 8

  let frameOff = mdatOffset
  for (let i = 0; i < sampleSizes.length; i++) {
    const sz = sampleSizes[i]
    let frameData = data.slice(frameOff, frameOff + sz)
    if (i === 0 && sz > 16) {
      const tag = String.fromCharCode(frameData[0], frameData[1], frameData[2])
      if (tag === 'Lav' || tag === 'Lav') {
        frameData = frameData.slice(16)
      }
    }
    frames.push(frameData)
    frameOff += sz
  }

  return frames
}

interface Faad2Module {
  _init_decoder(ptr: number, len: number): number
  _decode_frame(handle: number, inPtr: number, inLen: number, outPtr: number, outSize: number): number
  _free_decoder(handle: number): void
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPU8: Uint8Array
}

let faad2Module: Faad2Module | null = null

const WASM_DIR = join(__dirname, '..', 'wasm')

async function getFaad2Module(): Promise<Faad2Module> {
  if (faad2Module) return faad2Module
  const { default: Faad2ModuleFactory } = await import(join(WASM_DIR, 'faad2_decoder.mjs'))
  const wasmBinary = readFileSync(join(WASM_DIR, 'faad2_decoder.wasm'))
  faad2Module = await Faad2ModuleFactory({ wasmBinary }) as unknown as Faad2Module
  return faad2Module
}

export interface AACDecoder {
  ready: Promise<void>
  decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  reset(): void
  free(): void
}

export async function createAACDecoder(): Promise<AACDecoder> {
  const mod = await getFaad2Module()

  class AACDecoderImpl implements AACDecoder {
    get ready() { return Promise.resolve() }

    async decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }> {
      const isMP4 = isMP4Container(data)
      const isADTSFile = isADTS(data)

      let frames: Uint8Array[]
      if (isMP4) {
        frames = parseMP4AAC(data)
      } else if (isADTSFile) {
        frames = []
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
      } else {
        frames = [data]
      }

      if (frames.length === 0) {
        throw new Error('no AAC frames found')
      }

      const asc = new Uint8Array([0x12, 0x10])
      const ascPtr = mod._malloc(asc.length)
      mod.HEAPU8.set(asc, ascPtr)
      const handle = mod._init_decoder(ascPtr, asc.length)
      mod._free(ascPtr)

      if (!handle) {
        throw new Error('FAAD2 init failed')
      }

      const outPtr = mod._malloc(2048 * 2 * 4)
      const allPcm: Float32Array[] = []
      let sampleRate = 44100
      let channels = 2
      let totalSamples = 0

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]
        const inPtr = mod._malloc(frame.length)
        mod.HEAPU8.set(frame, inPtr)
        const packed = mod._decode_frame(handle, inPtr, frame.length, outPtr, 2048 * 2 * 4)
        mod._free(inPtr)

        if (packed > 0) {
          const srIdx = (packed >>> 28) & 0xf
          const ch = (packed >>> 24) & 0xf
          const samples = packed & 0xffffff
          if (samples > 0) {
            if (srIdx > 0) sampleRate = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350][srIdx] || sampleRate
            channels = ch || channels
            const pcm = new Float32Array(mod.HEAPU8.buffer, outPtr, samples)
            allPcm.push(Float32Array.from(pcm))
            totalSamples += samples
          }
        }
      }

      mod._free(outPtr)
      mod._free_decoder(handle)

      if (totalSamples === 0) {
        throw new Error('no AAC frames decoded successfully')
      }

      const channelData: Float32Array[] = []
      const spc = Math.floor(totalSamples / channels)
      for (let c = 0; c < channels; c++) {
        const chan = new Float32Array(spc)
        let idx = 0
        for (const pcm of allPcm) {
          const frameSpc = pcm.length / channels
          for (let i = 0; i < frameSpc; i++) {
            chan[idx++] = pcm[i * channels + c]
          }
        }
        channelData.push(chan)
      }

      return { channelData, samplesDecoded: totalSamples, sampleRate }
    }

    reset() {}
    free() {}
  }

  return new AACDecoderImpl()
}

export async function decodeAAC(src: Uint8Array): Promise<{
  channelData: Float32Array[]
  samplesDecoded: number
  sampleRate: number
}> {
  const decoder = await createAACDecoder()
  return decoder.decode(src)
}
