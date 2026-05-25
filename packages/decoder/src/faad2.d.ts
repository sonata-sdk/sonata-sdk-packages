declare module '@ecliptia/faad2-wasm/faad2_node_decoder.js' {
  interface FAAD2DecodeResult {
    pcm: Float32Array
    sampleRate: number
    channels: number
    samplesPerChannel: number
  }

  class FAAD2NodeDecoder {
    ready: Promise<void>
    initialized: boolean
    sampleRate: number
    channels: number

    configure(ascOrFirstFrame: Buffer, autoDetect?: boolean): Promise<void>
    decode(frameData: Buffer): FAAD2DecodeResult | null
    decodeInt16(frameData: Buffer): { pcm: Int16Array; sampleRate: number; channels: number; samplesPerChannel: number } | null
    decodePlanar(frameData: Buffer): { channelData: Float32Array[]; sampleRate: number; channels: number } | null
    reset(): void
    destroy(): void
  }

  export default FAAD2NodeDecoder
}
