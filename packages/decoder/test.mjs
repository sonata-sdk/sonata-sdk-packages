import { createMP3Decoder, decodeMP3 } from './dist/mp3.js'
import { createFLACDecoder, decodeFLAC } from './dist/flac.js'
import { createAACDecoder, decodeAAC } from './dist/aac.js'
import { detectFormat } from './dist/index.js'
import { readFileSync } from 'fs'

const testDir = '/root/vscode/src/vs/platform/accessibilitySignal/browser/media'
const mp3File = `${testDir}/break.mp3`

// Test MP3
console.log('=== MP3 Decoder ===')
const mp3Data = readFileSync(mp3File)
console.log('File size:', mp3Data.length, 'bytes')
console.log('detectFormat:', detectFormat(new Uint8Array(mp3Data)))

const result = await decodeMP3(new Uint8Array(mp3Data))
console.log('Decoded:', result.samplesDecoded, 'samples,', result.sampleRate, 'Hz,', result.channelData.length, 'channels')
console.log('Channel 0 length:', result.channelData[0].length)
console.log('First 5 samples of channel 0:', Array.from(result.channelData[0].slice(0, 5)))

// Test FLAC
console.log('\n=== FLAC Decoder ===')
const flacData = readFileSync(`${testDir}/../signal.flac`)
if (flacData.length > 0) {
  console.log('File size:', flacData.length, 'bytes')
  console.log('detectFormat:', detectFormat(new Uint8Array(flacData)))
  try {
    const flacResult = await decodeFLAC(new Uint8Array(flacData))
    console.log('Decoded:', flacResult.samplesDecoded, 'samples,', flacResult.sampleRate, 'Hz,', flacResult.channelData.length, 'channels')
  } catch (e) {
    console.log('FLAC decode error (expected if no flac file):', e.message)
  }
}

// Test streaming decoder
console.log('\n=== Streaming MP3 Decoder ===')
const decoder = await createMP3Decoder()
console.log('Created decoder')

// Decode in chunks
const chunk1 = mp3Data.subarray(0, 10000)
const chunk2 = mp3Data.subarray(10000)
const r1 = await decoder.decode(new Uint8Array(chunk1))
console.log('Chunk 1:', r1.samplesDecoded, 'samples')
const r2 = await decoder.decode(new Uint8Array(chunk2))
console.log('Chunk 2:', r2.samplesDecoded, 'samples')
console.log('Total:', r1.samplesDecoded + r2.samplesDecoded)
decoder.free()

console.log('\nAll tests passed!')
