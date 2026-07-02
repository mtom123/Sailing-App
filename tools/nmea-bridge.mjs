/*
 * Bridge NMEA0183 → WebSocket per TIMONE.
 *
 * I browser (Safari su iPad incluso) non possono aprire socket UDP/TCP raw:
 * questo script gira sul computer di bordo (o su qualsiasi macchina nella
 * stessa rete Wi-Fi del multiplexer NMEA) e inoltra le sentenze !AIVDM
 * ricevute via UDP e/o TCP a tutti i client WebSocket collegati.
 *
 * Uso:
 *   npm run bridge                        # UDP 10110, TCP 10111, WS 8484
 *   node tools/nmea-bridge.mjs --udp 2000 --tcp 2001 --ws 9000
 *
 * Nell'app: sorgente AIS "NMEA" → ws://<ip-di-questa-macchina>:8484
 */

import dgram from 'node:dgram'
import net from 'node:net'
import { WebSocketServer } from 'ws'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback
}

const UDP_PORT = arg('udp', 10110)
const TCP_PORT = arg('tcp', 10111)
const WS_PORT = arg('ws', 8484)

const wss = new WebSocketServer({ port: WS_PORT })
const clients = new Set()

wss.on('connection', (ws, req) => {
  clients.add(ws)
  console.log(`[ws] client connesso da ${req.socket.remoteAddress} (totale: ${clients.size})`)
  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[ws] client disconnesso (totale: ${clients.size})`)
  })
})

function broadcast(chunk) {
  const text = chunk.toString('utf8')
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(text)
  }
}

const udp = dgram.createSocket('udp4')
udp.on('message', broadcast)
udp.on('error', (err) => console.error('[udp]', err.message))
udp.bind(UDP_PORT, () => console.log(`[udp] in ascolto su :${UDP_PORT}`))

const tcp = net.createServer((socket) => {
  console.log(`[tcp] sorgente collegata da ${socket.remoteAddress}`)
  socket.on('data', broadcast)
  socket.on('error', (err) => console.error('[tcp]', err.message))
})
tcp.on('error', (err) => console.error('[tcp]', err.message))
tcp.listen(TCP_PORT, () => console.log(`[tcp] in ascolto su :${TCP_PORT}`))

console.log(`[ws] server WebSocket su :${WS_PORT} — nell'app usare ws://<ip>:${WS_PORT}`)
