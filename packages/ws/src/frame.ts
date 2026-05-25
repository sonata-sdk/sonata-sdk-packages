import { OP_CONT, OP_TEXT, OP_BIN, OP_CLOSE, OP_PING, OP_PONG } from './types.js'

export function mask(data: Buffer, key: Buffer): Buffer {
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i & 3]
  return out
}

export function randomMaskKey(): Buffer {
  const key = Buffer.alloc(4)
  for (let i = 0; i < 4; i++) key[i] = (Math.random() * 256) | 0
  return key
}

export function encodeFrame(opcode: number, payload: Buffer, useMask: boolean): Buffer {
  const fin = 0x80 | opcode
  const len = payload.length
  const masked = useMask ? 0x80 : 0x00

  let header: Buffer
  if (len < 126) {
    header = Buffer.from([fin, masked | len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = fin
    header[1] = masked | 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = fin
    header[1] = masked | 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }

  if (useMask) {
    const key = randomMaskKey()
    return Buffer.concat([header, key, mask(payload, key)])
  }

  return Buffer.concat([header, payload])
}

export interface ParsedFrame {
  opcode: number
  payload: Buffer
}

export function readFrame(buffer: Buffer): { frame: ParsedFrame; consumed: number } | null {
  if (buffer.length < 2) return null

  const first = buffer[0]
  const second = buffer[1]
  const opcode = first & 0x0F
  const masked = (second & 0x80) !== 0
  let payloadLen = second & 0x7F
  let offset = 2

  if (payloadLen === 126) {
    if (buffer.length < 4) return null
    payloadLen = buffer.readUInt16BE(2)
    offset = 4
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null
    payloadLen = Number(buffer.readBigUInt64BE(2))
    offset = 10
  }

  const maskLen = masked ? 4 : 0
  const totalLen = offset + maskLen + payloadLen
  if (buffer.length < totalLen) return null

  let payload: Buffer
  if (masked) {
    const key = buffer.subarray(offset, offset + 4)
    payload = mask(buffer.subarray(offset + 4, offset + 4 + payloadLen), key)
  } else {
    payload = buffer.subarray(offset, offset + payloadLen)
  }

  return { frame: { opcode, payload }, consumed: totalLen }
}

export { OP_CONT, OP_TEXT, OP_BIN, OP_CLOSE, OP_PING, OP_PONG }
