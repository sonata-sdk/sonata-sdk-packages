import { createMP3Decoder, decodeMP3, type MP3Decoder } from './mp3.js'
import { createFLACDecoder, decodeFLAC, type FLACDecoder } from './flac.js'

export type AudioDecoder = MP3Decoder | FLACDecoder
export type AudioFormat = 'mp3' | 'flac'

const MP3_MAGIC = 0xffe0
const FLAC_MAGIC = 0x664c6143 // "fLaC" as big-endian u32

export function detectFormat(data: Uint8Array): AudioFormat | null {
  if (data.length < 4) return null

  const view = new DataView(data.buffer, data.byteOffset, 4)
  const u32 = view.getUint32(0, false)

  if (u32 === FLAC_MAGIC) return 'flac'

  const sync = view.getUint16(0, false)
  if ((sync & MP3_MAGIC) === MP3_MAGIC) return 'mp3'

  return null
}

export async function createDecoder(format: AudioFormat): Promise<AudioDecoder> {
  switch (format) {
    case 'mp3': return createMP3Decoder()
    case 'flac': return createFLACDecoder()
  }
}

export {
  createMP3Decoder, decodeMP3,
  createFLACDecoder, decodeFLAC,
}
export type { MP3Decoder, FLACDecoder }
