export interface FLACDecoder {
  ready: Promise<void>
  decode(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  decodeFrame(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  decodeFrames(data: Uint8Array): Promise<{ channelData: Float32Array[]; samplesDecoded: number; sampleRate: number }>
  reset(): void
  free(): void
}

export async function createFLACDecoder(): Promise<FLACDecoder> {
  const mod = await import('@audio/decode-flac')
  return (mod as any).decoder()
}

export async function decodeFLAC(src: Uint8Array): Promise<{
  channelData: Float32Array[]
  samplesDecoded: number
  sampleRate: number
}> {
  const mod = await import('@audio/decode-flac')
  return (mod as any).default(src)
}
