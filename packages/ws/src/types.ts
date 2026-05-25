export type WSEventMap = {
  open: []
  message: [data: string | Buffer]
  close: [code: number, reason: string]
  error: [error: Error]
  ping: []
  pong: []
}

export const OP_CONT  = 0x0
export const OP_TEXT  = 0x1
export const OP_BIN   = 0x2
export const OP_CLOSE = 0x8
export const OP_PING  = 0x9
export const OP_PONG  = 0xA
