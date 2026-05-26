import { decodeMP3, createMP3Decoder, detectFormat } from './dist/index.js'
import { readFileSync } from 'fs'

const mp3Data = readFileSync('/root/vscode/src/vs/platform/accessibilitySignal/browser/media/break.mp3')
const buf = new Uint8Array(mp3Data)
console.log('File size:', buf.length)
console.log('detectFormat:', detectFormat(buf))

// One-shot decode
const result = await decodeMP3(buf)
console.log('One-shot:', result.samplesDecoded, 'samples,', result.sampleRate, 'Hz,', result.channelData.length, 'ch')

// Streaming decode
const decoder = await createMP3Decoder()
const r1 = await decoder.decode(buf.subarray(0, 10000))
console.log('Stream chunk1:', r1.samplesDecoded, 'samples')
const r2 = await decoder.decode(buf.subarray(10000))
console.log('Stream chunk2:', r2.samplesDecoded, 'samples')
console.log('Stream total:', r1.samplesDecoded + r2.samplesDecoded)
decoder.free()

console.log('OK')
