/*
 * Bridge NMEA0183 ⇆ WebSocket per TIMONE.
 *
 * I browser (Safari su iPad incluso) non possono aprire socket UDP/TCP raw:
 * questo script gira sul computer di bordo (o su qualsiasi macchina nella
 * stessa rete Wi-Fi del multiplexer NMEA) e:
 *  - inoltra le sentenze NMEA (!AIVDM ecc.) ricevute via UDP/TCP ai client
 *    WebSocket collegati (AIS in ingresso verso l'app);
 *  - inoltra via UDP le sentenze ricevute DAI client WebSocket (APB/RMB/XTE
 *    generate dall'app) verso il multiplexer collegato al pilota automatico.
 *
 * Uso:
 *   npm run bridge                        # UDP 10110, TCP 10111, WS 8484
 *   node tools/nmea-bridge.mjs --udp 2000 --tcp 2001 --ws 9000
 *   node tools/nmea-bridge.mjs --fwd 192.168.4.1:10110   # uscita pilota
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

function argStr(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const UDP_PORT = arg('udp', 10110)
const TCP_PORT = arg('tcp', 10111)
const WS_PORT = arg('ws', 8484)
const FWD = argStr('fwd', '') // es. 192.168.4.1:10110 → uscita verso il pilota

const wss = new WebSocketServer({ port: WS_PORT })
const clients = new Set()

const [fwdHost, fwdPort] = FWD ? FWD.split(':') : [null, null]
const udpOut = FWD ? dgram.createSocket('udp4') : null

wss.on('connection', (ws, req) => {
  clients.add(ws)
  console.log(`[ws] client connesso da ${req.socket.remoteAddress} (totale: ${clients.size})`)
  ws.on('message', (data) => {
    // Sentenze dall'app (pilota automatico) → multiplexer via UDP
    if (udpOut) {
      udpOut.send(data.toString('utf8'), Number(fwdPort), fwdHost, (err) => {
        if (err) console.error('[fwd]', err.message)
      })
    }
  })
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
if (FWD) console.log(`[fwd] sentenze pilota inoltrate via UDP a ${FWD}`)
