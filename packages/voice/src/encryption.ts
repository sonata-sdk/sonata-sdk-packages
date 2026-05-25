import { randomBytes, createCipheriv } from 'node:crypto'
import nacl from 'tweetnacl'
import type { EncryptionMode } from './types.js'

const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe])
const VERSION = 0x80
const TYPE = 0x78

export const OPUS_SAMPLE_RATE = 48000
export const OPUS_FRAME_DURATION = 20
export const TIMESTAMP_INCREMENT = 960
export const OPUS_FRAME_SIZE = 960
export const OPUS_SILENCE_FRAME = SILENCE_FRAME

export class AudioEncryption {
  #mode: EncryptionMode
  #secretKey: Buffer
  #sequence = 0
  #timestamp = 0
  #ssrc: number
  #nonceBuffer: Buffer

  constructor(mode: EncryptionMode, secretKey: Buffer, ssrc: number) {
    this.#mode = mode
    this.#secretKey = secretKey
    this.#ssrc = ssrc
    this.#nonceBuffer = Buffer.alloc(mode === 'aead_xchacha20_poly1305_rtpsize' ? 24 : 12)
  }

  get sequence() { return this.#sequence }
  get timestamp() { return this.#timestamp }
  get ssrc() { return this.#ssrc }

  reset(sequence?: number, timestamp?: number) {
    this.#sequence = sequence ?? 0
    this.#timestamp = timestamp ?? 0
  }

  encrypt(frame: Buffer): Buffer | null {
    if (frame.equals(SILENCE_FRAME)) return null

    const header = this.#buildHeader()
    const seq = this.#sequence

    this.#sequence = (this.#sequence + 1) & 0xffff
    this.#timestamp = (this.#timestamp + TIMESTAMP_INCREMENT) >>> 0

    let encrypted: Buffer
    let suffix: Buffer

    switch (this.#mode) {
      case 'aead_aes256_gcm_rtpsize': {
        const nonce = Buffer.alloc(12)
        nonce.writeUInt32BE(seq, 0)
        encrypted = this.#encryptAes256Gcm(header, frame, nonce)
        suffix = nonce.subarray(0, 4)
        break
      }
      case 'aead_xchacha20_poly1305_rtpsize': {
        const nonce = Buffer.alloc(24)
        nonce.writeUInt32BE(seq, 0)
        this.#nonceBuffer.copy(nonce, 4, 0, 20)
        encrypted = this.#encryptXChaCha20(header, frame, nonce)
        suffix = nonce.subarray(0, 24)
        break
      }
      case 'xsalsa20_poly1305_suffix_rtpsize': {
        const nonce = randomBytes(24)
        encrypted = this.#encryptXsalsa20(header, frame, nonce)
        suffix = nonce
        break
      }
      case 'normal': {
        const nonce = Buffer.alloc(24)
        encrypted = this.#encryptXsalsa20(header, frame, nonce)
        suffix = Buffer.alloc(0)
        break
      }
      default: {
        const nonce = Buffer.alloc(24)
        nonce.writeUInt32BE(seq, 0)
        encrypted = this.#encryptXsalsa20(header, frame, nonce)
        suffix = nonce.subarray(0, 4)
        break
      }
    }

    return Buffer.concat([header, encrypted, suffix])
  }

  #buildHeader(): Buffer {
    const h = Buffer.alloc(12)
    h[0] = VERSION
    h[1] = TYPE
    h.writeUInt16BE(this.#sequence, 2)
    h.writeUInt32BE(this.#timestamp, 4)
    h.writeUInt32BE(this.#ssrc, 8)
    return h
  }

  #encryptAes256Gcm(header: Buffer, frame: Buffer, nonce: Buffer): Buffer {
    const cipher = createCipheriv('aes-256-gcm', this.#secretKey, nonce, { authTagLength: 16 })
    cipher.setAAD(header)
    const enc = cipher.update(frame)
    cipher.final()
    return Buffer.concat([enc, cipher.getAuthTag()])
  }

  #encryptXChaCha20(header: Buffer, frame: Buffer, nonce: Buffer): Buffer {
    try {
      const sodium = require('libsodium-wrappers')
      const enc = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        frame, header, null, nonce, this.#secretKey
      )
      return Buffer.from(enc)
    } catch {
      return this.#encryptXsalsa20(header, frame, nonce)
    }
  }

  #encryptXsalsa20(header: Buffer, frame: Buffer, nonce: Buffer): Buffer {
    const enc = nacl.secretbox(frame, nonce, this.#secretKey)
    return Buffer.from(enc)
  }
}

export { SILENCE_FRAME }
