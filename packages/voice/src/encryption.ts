import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import nacl from 'tweetnacl'
import type { EncryptionMode } from './types.js'

const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe])
const VERSION = 0x80
const TYPE = 0x78

export interface EncryptedPacket {
  header: Buffer
  nonce: Buffer
  encrypted: Buffer
}

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

  encrypt(frame: Buffer): Buffer | null {
    if (frame.equals(SILENCE_FRAME)) return null

    const header = this.#buildHeader()
    const seq = this.#sequence
    const ts = this.#timestamp

    this.#sequence = (this.#sequence + 1) & 0xffff
    this.#timestamp = (this.#timestamp + 960) >>> 0

    const nonce = this.#makeNonce(seq)

    let encrypted: Buffer
    switch (this.#mode) {
      case 'aead_aes256_gcm_rtpsize': {
        encrypted = this.#encryptAes256Gcm(header, frame, nonce)
        break
      }
      case 'aead_xchacha20_poly1305_rtpsize': {
        encrypted = this.#encryptXChaCha20(header, frame, nonce)
        break
      }
      default: {
        encrypted = this.#encryptXsalsa20(header, frame, nonce)
        break
      }
    }

    return Buffer.concat([header, encrypted, nonce.subarray(0, this.#nonceLen())])
  }

  #nonceLen(): number {
    return this.#mode === 'aead_aes256_gcm_rtpsize' ? 4
      : this.#mode === 'aead_xchacha20_poly1305_rtpsize' ? 24
      : 4
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

  #makeNonce(seq: number): Buffer {
    const nonce = Buffer.alloc(this.#nonceBuffer.length)
    if (this.#mode === 'aead_xchacha20_poly1305_rtpsize') {
      nonce.writeUInt32BE(seq, 0)
      this.#nonceBuffer.copy(nonce, 4, 0, 20)
    } else {
      nonce.writeUInt32BE(seq, 0)
    }
    return nonce
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
    const fullNonce = Buffer.alloc(24)
    nonce.copy(fullNonce)
    const enc = nacl.secretbox(frame, fullNonce, this.#secretKey)
    return Buffer.from(enc)
  }
}

export { SILENCE_FRAME }
