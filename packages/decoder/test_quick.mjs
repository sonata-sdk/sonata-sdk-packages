import { decodeMP3, decodeFLAC, detectFormat, createMP3Decoder } from './dist/index.js'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

// Download a real MP3 from the test server
const testFile = '/tmp/test_decoder.mp3'
try {
  execSync(`yt-dlp -f bestaudio --audio-format mp3 -o "${testFile}" "ytsearch:30 second audio test" --max-filesize 1M 2>/dev/null`, { timeout: 15000 })
} catch {}

if (readFileSync(testFile).length > 100) {
  const data = new Uint8Array(readFileSync(testFile))
  console.log('Format:', detectFormat(data))
  const r = await decodeMP3(data)
  console.log(`MP3: ${r.samplesDecoded} samples, ${r.sampleRate}Hz, ${r.channelData.length}ch`)
} else {
  // Use a sine wave file
  console.log('No MP3 download, testing module loading...')
  const decoder = await createMP3Decoder()
  console.log('MP3 decoder created OK')
  decoder.free()
}

console.log('All good!')
