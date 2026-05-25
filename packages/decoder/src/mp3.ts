export interface MP3Decoder {
  ready: Promise<void>
  decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  decodeFrame(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  decodeFrames(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  reset(): void
  free(): void
}

export async function createMP3Decoder(): Promise<MP3Decoder> {
  const mod = await import('@audio/decode-mp3')
  return (mod as any).decoder()
}

export async function decodeMP3(src: Uint8Array): Promise<{
  channelData: Float32Array[]
  samplesDecoded: number
  sampleRate: number
}> {
  const mod = await import('@audio/decode-mp3')
  return (mod as any).default(src)
}
