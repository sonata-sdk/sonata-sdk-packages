import { createHash, randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type * as http from 'http'
import type * as net from 'net'
import { WSConnection } from './connection.js'

export type ServerOptions = {
  server?: http.Server
  path?: string
  noServer?: boolean
}

export class WebSocketServer extends EventEmitter {
  #server: http.Server | null
  #path: string | undefined

  constructor(opts?: ServerOptions) {
    super()
    this.#server = opts?.server ?? null
    this.#path = opts?.path

    if (this.#server) this.#bind(this.#server)
  }

  handleUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer, callback: (ws: WSConnection, req: http.IncomingMessage) => void): void {
    if (head.length > 0) socket.unshift(head)

    const key = req.headers['sec-websocket-key'] as string
    if (!key) {
      socket.destroy()
      return
    }

    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )

    const ws = new WSConnection(socket, false)
    callback(ws, req)
  }

  close(cb?: () => void): void {
    this.removeAllListeners()
    if (cb) cb()
  }

  #bind(server: http.Server) {
    server.on('upgrade', (req, socket, head) => {
      if (this.#path && req.url !== this.#path) return
      this.handleUpgrade(req, socket as net.Socket, head as Buffer, (ws, req) => {
        this.emit('connection', ws, req)
      })
    })
  }
}
