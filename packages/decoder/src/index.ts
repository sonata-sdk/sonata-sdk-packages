import { createMP3Decoder, decodeMP3, type MP3Decoder } from './mp3.js'
import { createFLACDecoder, decodeFLAC, type FLACDecoder } from './flac.js'
import { createAACDecoder, decodeAAC, type AACDecoder } from './aac.js'

export type AudioDecoder = MP3Decoder | FLACDecoder | AACDecoder
export type AudioFormat = 'mp3' | 'flac' | 'aac'

const MP3_MAGIC = 0xffe0
const FLAC_MAGIC = 0x664c6143 // "fLaC" as big-endian u32

export function detectFormat(data: Uint8Array): AudioFormat | null {
  if (data.length < 4) return null

  const view = new DataView(data.buffer, data.byteOffset, 4)
  const u32 = view.getUint32(0, false)

  if (u32 === FLAC_MAGIC) return 'flac'

  const sync = view.getUint16(0, false)
  if ((sync & MP3_MAGIC) === MP3_MAGIC) return 'mp3'

  // Check for ADTS AAC (syncword 0xFFF)
  if (data.length >= 2 && (data[0] & 0xff) === 0xff && (data[1] & 0xf0) === 0xf0) {
    return 'aac'
  }

  // Check for MP4 container with AAC (ftyp box)
  if (data.length >= 8) {
    const type = String.fromCharCode(data[4], data[5], data[6], data[7])
    if (type === 'ftyp' || type === 'moov') return 'aac'
  }

  return null
}

export async function createDecoder(format: AudioFormat): Promise<AudioDecoder> {
  switch (format) {
    case 'mp3': return createMP3Decoder()
    case 'flac': return createFLACDecoder()
    case 'aac': return createAACDecoder()
  }
}

export {
  createMP3Decoder, decodeMP3,
  createFLACDecoder, decodeFLAC,
  createAACDecoder, decodeAAC,
}
export type { MP3Decoder, FLACDecoder, AACDecoder }
