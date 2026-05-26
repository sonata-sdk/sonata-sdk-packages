import { readFileSync } from 'fs'

const wasmDir = new URL('./wasm/', import.meta.url)

// Quick MP3 test
const mp3Data = readFileSync('/root/vscode/src/vs/platform/accessibilitySignal/browser/media/break.mp3')
console.log('MP3 file size:', mp3Data.length)

const wasmBinary = readFileSync(new URL('./wasm/mpg123_decoder.wasm', import.meta.url))
const { default: createModule } = await import(new URL('./wasm/mpg123_decoder.mjs', import.meta.url))
const mod = await createModule({ wasmBinary })

console.log('Module loaded, calling init_mp3_decoder...')
const handle = mod._init_mp3_decoder()
console.log('Handle:', handle)

const bufSize = 65536 * 2 * 4
const outPtr = mod._malloc(bufSize)
console.log('outPtr:', outPtr)

// Feed in larger chunks
const feedSize = 65536
let offset = 0
let totalSamples = 0

while (offset < mp3Data.length) {
  const chunkSize = Math.min(mp3Data.length - offset, feedSize)
  const inPtr = mod._malloc(chunkSize)
  mod.HEAPU8.set(mp3Data.subarray(offset, offset + chunkSize), inPtr)
  console.log(`Feeding chunk at ${offset}, size ${chunkSize}`)

  let iter = 0
  while (iter < 20) {
    iter++
    const packed = mod._decode_mp3(handle, inPtr, chunkSize, outPtr, bufSize)
    const samples = packed & 0xffffff
    const srIdx = (packed >>> 28) & 0xf
    const ch = (packed >>> 24) & 0xf
    console.log(`  decode ret=${packed} samples=${samples} srIdx=${srIdx} ch=${ch}`)

    if (packed <= 0) {
      console.log(`  -> break (packed <= 0)`)
      break
    }
    if (samples === 0) {
      console.log(`  -> break (samples == 0)`)
      break
    }
    totalSamples += samples
  }

  mod._free(inPtr)
  offset += chunkSize
}

// Flush
console.log('Flushing...')
let iter = 0
while (iter < 20) {
  iter++
  const packed = mod._decode_mp3(handle, 0, 0, outPtr, bufSize)
  const samples = packed & 0xffffff
  console.log(`  flush ret=${packed} samples=${samples}`)
  if (packed <= 0 || samples === 0) break
  totalSamples += samples
}

console.log('Total samples:', totalSamples)
console.log('Test done')

mod._free(outPtr)
mod._free_mp3_decoder(handle)
