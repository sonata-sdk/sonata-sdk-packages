import { createServer } from 'http'
import { WebSocketServer, ResumableWS } from './dist/index.js'

const PORT = 9123

// ---- Test 1: Server echo ----
const httpServer = createServer()
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  console.log('✓ Server: client connected from', req.socket.remoteAddress)

  ws.on('message', (data) => {
    console.log('✓ Server: received message, echoing back')
    ws.send(data)
  })

  ws.on('close', (code, reason) => {
    console.log(`✓ Server: client disconnected (${code}: ${reason})`)
  })

  ws.send('hello from server')
})

httpServer.listen(PORT, async () => {
  console.log(`✓ Server listening on port ${PORT}`)

  // ---- Test 2: Client connects ----
  const client = new ResumableWS(`ws://127.0.0.1:${PORT}`, {
    maxReconnectAttempts: 2,
    reconnectDelay: 500,
  })

  client.on('open', () => {
    console.log('✓ Client: connected to server')
    client.send('ping from client')
  })

  client.on('message', (data) => {
    console.log('✓ Client: received message:', data.toString())

    // Close after receiving echo
    if (data.toString() === 'ping from client') {
      console.log('✓ Echo test passed')

      // Test close
      client.close(1000, 'test complete')
    }
  })

  client.on('close', (code, reason) => {
    console.log(`✓ Client: closed (${code}: ${reason})`)

    // ---- Test 3: Server WS direct ----
    console.log('\n--- Test 3: WSConnection + send/close ---')
    testDirectSend()
  })

  client.on('error', (err) => {
    console.log('✗ Client error:', err.message)
  })

  await client.connect()
})

function testDirectSend() {
  const client2 = new ResumableWS(`ws://127.0.0.1:${PORT}`, {
    maxReconnectAttempts: 0,
  })

  client2.on('open', () => {
    console.log('✓ Client2: connected')
    client2.send(Buffer.from([0x00, 0x01, 0x02]))
    client2.close(1000, 'done')
  })

  client2.on('close', (code, reason) => {
    console.log(`✓ Client2: closed (${code}: ${reason})`)
    cleanup()
  })

  client2.on('error', (err) => {
    console.log('Client2 error:', err.message)
  })

  client2.connect().catch(console.error)
}

function cleanup() {
  httpServer.close()
  console.log('\n✓ All tests passed')
  process.exit(0)
}
