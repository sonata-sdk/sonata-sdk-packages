import { createSocket, type Socket, type RemoteInfo } from 'node:dgram'
import { EventEmitter } from 'node:events'

const KEEPALIVE_INTERVAL = 10_000
const IP_DISCOVERY_PACKET = Buffer.alloc(74)

export class UdpSocket extends EventEmitter {
  #socket: Socket | null = null
  #ip = ''
  #port = 0
  #ssrc = 0
  #secretKey: Buffer | null = null
  #keepaliveTimer: ReturnType<typeof setInterval> | null = null
  #connected = false

  get connected() { return this.#connected }
  get ip() { return this.#ip }
  get port() { return this.#port }
  get ssrc() { return this.#ssrc }
  get secretKey() { return this.#secretKey }

  async connect(ssrc: number, ip: string, port: number): Promise<void> {
    this.#ssrc = ssrc
    this.#socket = createSocket('udp4')
    this.#socket.on('message', (msg) => this.#onMessage(msg))
    this.#socket.on('error', (err) => this.emit('error', err))

    await this.#discoverIp(ip, port)
    this.#startKeepalive()
    this.#connected = true
  }

  #onMessage(msg: Buffer) {
    if (msg.length === 74) {
      const type = msg.readUInt16BE(0)
      if (type === 2) {
        const ip = `${msg.readUInt8(4)}.${msg.readUInt8(5)}.${msg.readUInt8(6)}.${msg.readUInt8(7)}`
        const port = msg.readUInt16BE(8)
        this.emit('ipDiscovery', ip, port)
      }
    }
  }

  #discoverIp(ip: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      IP_DISCOVERY_PACKET.writeUInt16BE(1, 0)
      IP_DISCOVERY_PACKET.writeUInt16BE(70, 2)
      IP_DISCOVERY_PACKET.writeUInt32BE(this.#ssrc, 4)

      const timeout = setTimeout(() => reject(new Error('IP discovery timed out')), 5000)
      this.#socket!.send(IP_DISCOVERY_PACKET, port, ip)

      this.once('ipDiscovery', (discIp: string, discPort: number) => {
        clearTimeout(timeout)
        this.#ip = discIp
        this.#port = discPort || port
        resolve()
      })
    })
  }

  setSecretKey(key: Buffer) {
    this.#secretKey = key
  }

  send(packet: Buffer) {
    if (!this.#socket || !this.#ip) return
    this.#socket.send(packet, this.#port, this.#ip)
  }

  #startKeepalive() {
    const packet = Buffer.alloc(74)
    packet.writeUInt16BE(1, 0)
    packet.writeUInt16BE(70, 2)
    packet.writeUInt32BE(this.#ssrc, 4)

    this.#keepaliveTimer = setInterval(() => {
      if (this.#socket) {
        this.#socket.send(packet, this.#port, this.#ip)
      }
    }, KEEPALIVE_INTERVAL)
  }

  close() {
    if (this.#keepaliveTimer) clearInterval(this.#keepaliveTimer)
    if (this.#socket) {
      this.#socket.close()
      this.#socket = null
    }
    this.#connected = false
  }
}
