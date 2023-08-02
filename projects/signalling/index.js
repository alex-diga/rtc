#!/usr/bin/env node

const express = require('express')
const RateLimit = require('express-rate-limit')
const http = require('http')
const https = require('https')
const helmet = require('helmet')
const hsts = require('hsts')
const net = require('net')
const WebSocket = require('ws')
const querystring = require('querystring')
const path = require('path')
const url = require('url')
const fs = require('fs')
const { init } = require('./utils/config')
const { logIncoming, logOutgoing, logForward } = require('./utils/log')

const app = express()
const config = init(path.join(__dirname, 'config.json'))

let httpServer = http.Server(app)
let httpsServer

if (config.UseHTTPS) {
  const options = {
    cert: fs.readFileSync(path.join(__dirname, '../client/keys/cert.crt')),
    key: fs.readFileSync(path.join(__dirname, '../client/keys/cert.key'))
  }
  httpsServer = https.Server(options, app)
}

let FRONTEND_WEBSERVER = 'https://localhost'

let httpPort = config.HttpPort
let httpsPort = config.HttpsPort
if (config.UseFrontend) {
  httpPort = 3000
  httpsPort = 8000
  if (config.UseHTTPS && config.DisableSSLCert) {
    //Required for self signed certs otherwise just get an error back when sending request to frontend see https://stackoverflow.com/a/35633993
    console.log(
      'WARNING: config.DisableSSLCert is true. Unauthorized SSL certificates will be allowed! This is convenient for local testing but please DO NOT SHIP THIS IN PRODUCTION. To remove this warning please set DisableSSLCert to false in your config.json.'
    )
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
}

let streamerPort = config.StreamerPort // port to listen to Streamer connections
let sfuPort = config.SFUPort

let matchmakerAddress = '127.0.0.1'
let matchmakerPort = 9999
let matchmakerRetryInterval = 5
let matchmakerKeepAliveInterval = 30
let maxPlayerCount = -1

let gameSessionId
let serverPublicIp

let clientConfig = { type: 'config', peerConnectionOptions: {} }

try {
  if (typeof config.PublicIp != 'undefined') {
    serverPublicIp = config.PublicIp.toString()
  }
  if (typeof config.HttpPort != 'undefined') {
    httpPort = config.HttpPort
  }
  if (typeof config.HttpsPort != 'undefined') {
    httpsPort = config.HttpsPort
  }
  if (typeof config.StreamerPort != 'undefined') {
    streamerPort = config.StreamerPort
  }
  if (typeof config.SFUPort != 'undefined') {
    sfuPort = config.SFUPort
  }
  if (typeof config.FrontendUrl != 'undefined') {
    FRONTEND_WEBSERVER = config.FrontendUrl
  }
  if (typeof config.peerConnectionOptions != 'undefined') {
    clientConfig.peerConnectionOptions = JSON.parse(
      config.peerConnectionOptions
    )
    console.log(
      `peerConnectionOptions = ${JSON.stringify(
        clientConfig.peerConnectionOptions
      )}`
    )
  } else {
    console.log('No peerConnectionConfig')
  }
  if (typeof config.MatchmakerAddress != 'undefined') {
    matchmakerAddress = config.MatchmakerAddress
  }
  if (typeof config.MatchmakerPort != 'undefined') {
    matchmakerPort = config.MatchmakerPort
  }
  if (typeof config.MatchmakerRetryInterval != 'undefined') {
    matchmakerRetryInterval = config.MatchmakerRetryInterval
  }
  if (typeof config.MaxPlayerCount != 'undefined') {
    maxPlayerCount = config.MaxPlayerCount
  }
} catch (e) {
  console.error(e)
  process.exit(2)
}

if (config.UseHTTPS) {
  app.use(helmet())
  app.use(
    hsts({
      maxAge: 15552000 // 180 days in seconds
    })
  )
  //Setup http -> https redirect
  console.log('Redirecting http->https')
  app.use(function (req, res, next) {
    if (!req.secure) {
      if (req.get('Host')) {
        const hostAddressParts = req.get('Host').split(':')
        let hostAddress = hostAddressParts[0]
        if (httpsPort != 443) {
          hostAddress = `${hostAddress}:${httpsPort}`
        }
        return res.redirect(['https://', hostAddress, req.originalUrl].join(''))
      } else {
        console.error(
          `unable to get host name from header. Requestor ${
            req.ip
          }, url path: '${req.originalUrl}', available headers ${JSON.stringify(
            req.headers
          )}`
        )
        return res.status(400).send('Bad Request')
      }
    }
    next()
  })
}

const limiter = RateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60
})
// apply rate limiter to all requests
app.use(limiter)

if (config.EnableWebserver) {
  //Setup folders
  app.use(express.static(path.join(__dirname, '/Public')))
  app.use('/images', express.static(path.join(__dirname, './images')))
}

//Setup http and https servers
httpServer.listen(httpPort, function () {
  console.log('Http listening on *: ' + httpPort)
})

if (config.UseHTTPS) {
  httpsServer.listen(httpsPort, function () {
    console.log('Https listening on *: ' + httpsPort)
  })
}
console.log(
  `Running Cirrus - The Pixel Streaming reference implementation signalling server for Unreal Engine 5.3.`
)

let nextPlayerId = 1
const streamers = new Map()
const players = new Map()
const SFUPlayerId = 'SFU'
const LegacyStreamerId = '__LEGACY__' // old streamers that dont know how to ID will be assigned this id.
const PlayerType = { Regular: 0, SFU: 1 }

class Player {
  constructor(id, ws, type, browserSendOffer) {
    this.id = id
    this.ws = ws
    this.type = type
    this.browserSendOffer = browserSendOffer
  }

  subscribe(streamerId) {
    if (!streamers.has(streamerId)) {
      console.error(
        `subscribe: Player ${this.id} tried to subscribe to a non-existent streamer ${streamerId}`
      )
      return
    }
    this.streamerId = streamerId
    const msg = {
      type: 'playerConnected',
      playerId: this.id,
      dataChannel: true,
      sfu: this.type == PlayerType.SFU,
      sendOffer: !this.browserSendOffer
    }
    logOutgoing(this.streamerId, msg)
    this.sendFrom(msg)
  }

  unsubscribe() {
    if (this.streamerId && streamers.has(this.streamerId)) {
      const msg = { type: 'playerDisconnected', playerId: this.id }
      logOutgoing(this.streamerId, msg)
      this.sendFrom(msg)
    }
    this.streamerId = null
  }

  sendFrom(message) {
    if (!this.streamerId) {
      if (streamers.size > 0) {
        this.streamerId = streamers.entries().next().value[0]
        console.log(
          `Player ${this.id} attempted to send an outgoing message without having subscribed first. Defaulting to ${this.streamerId}`
        )
      } else {
        console.log(
          `Player ${this.id} attempted to send an outgoing message without having subscribed first. No streamer connected so this message isn't going anywhere!`
        )
        return
      }
    }

    // normally we want to indicate what player this message came from
    // but in some instances we might already have set this (streamerDataChannels) due to poor choices
    if (!message.playerId) {
      message.playerId = this.id
    }
    const msgString = JSON.stringify(message)

    let streamer = streamers.get(this.streamerId)
    if (!streamer) {
      console.error(
        `sendFrom: Player ${this.id} subscribed to non-existent streamer: ${this.streamerId}`
      )
    } else {
      streamer.ws.send(msgString)
    }
  }

  sendTo(message) {
    const msgString = JSON.stringify(message)
    this.ws.send(msgString)
  }
}

function sfuIsConnected() {
  const sfuPlayer = players.get(SFUPlayerId)
  return sfuPlayer && sfuPlayer.ws && sfuPlayer.ws.readyState == 1
}

function getSFU() {
  return players.get(SFUPlayerId)
}

const sfuMessageHandlers = new Map()
const playerMessageHandlers = new Map()

function sanitizePlayerId(playerId) {
  if (playerId && typeof playerId === 'number') {
    playerId = playerId.toString()
  }
  return playerId
}

function getPlayerIdFromMessage(msg) {
  return sanitizePlayerId(msg.playerId)
}

function registerStreamer(id, streamer) {
  streamer.id = id
  streamers.set(streamer.id, streamer)
}

function onStreamerDisconnected(streamer) {
  if (!streamer.id) {
    return
  }

  if (!streamers.has(streamer.id)) {
    console.error(`Disconnecting streamer ${streamer.id} does not exist.`)
  } else {
    sendStreamerDisconnectedToMatchmaker()
    let sfuPlayer = getSFU()
    if (sfuPlayer) {
      const msg = { type: 'streamerDisconnected' }
      logOutgoing(sfuPlayer.id, msg)
      sfuPlayer.sendTo(msg)
      disconnectAllPlayers(sfuPlayer.id)
    }
    disconnectAllPlayers(streamer.id)
    streamers.delete(streamer.id)
  }
}

function onStreamerMessageId(streamer, msg) {
  logIncoming(streamer.id, msg)
  let streamerId = msg.id
  registerStreamer(streamerId, streamer)
  // subscribe any sfu to the latest connected streamer
  const sfuPlayer = getSFU()
  if (sfuPlayer) {
    sfuPlayer.subscribe(streamer.id)
  }
  // if any streamer id's assume the legacy streamer is not needed.
  streamers.delete(LegacyStreamerId)
}

function onStreamerMessagePing(streamer, msg) {
  logIncoming(streamer.id, msg)
  const pongMsg = JSON.stringify({ type: 'pong', time: msg.time })
  streamer.ws.send(pongMsg)
}

function onStreamerMessageDisconnectPlayer(streamer, msg) {
  logIncoming(streamer.id, msg)
  const playerId = getPlayerIdFromMessage(msg)
  const player = players.get(playerId)
  if (player) {
    player.ws.close(1011 /* internal error */, msg.reason)
  }
}

function onStreamerMessageLayerPreference(streamer, msg) {
  let sfuPlayer = getSFU()
  if (sfuPlayer) {
    logOutgoing(sfuPlayer.id, msg)
    sfuPlayer.sendTo(msg)
  }
}

function forwardStreamerMessageToPlayer(streamer, msg) {
  const playerId = getPlayerIdFromMessage(msg)
  const player = players.get(playerId)
  if (player) {
    delete msg.playerId
    logForward(streamer.id, playerId, msg)
    player.sendTo(msg)
  } else {
    console.warn('No playerId specified, cannot forward message: %s', msg)
  }
}

const streamerMessageHandlers = new Map()
streamerMessageHandlers.set('endpointId', onStreamerMessageId)
streamerMessageHandlers.set('ping', onStreamerMessagePing)
streamerMessageHandlers.set('offer', forwardStreamerMessageToPlayer)
streamerMessageHandlers.set('answer', forwardStreamerMessageToPlayer)
streamerMessageHandlers.set('iceCandidate', forwardStreamerMessageToPlayer)
streamerMessageHandlers.set(
  'disconnectPlayer',
  onStreamerMessageDisconnectPlayer
)
streamerMessageHandlers.set('layerPreference', onStreamerMessageLayerPreference)

let streamerServer = new WebSocket.Server({ port: streamerPort, backlog: 1 })
streamerServer.on('connection', function (ws, req) {
  console.log(`Streamer connected: ${req.connection.remoteAddress}`)
  sendStreamerConnectedToMatchmaker()

  let streamer = { ws: ws }

  ws.on('message', (msgRaw) => {
    let msg
    try {
      msg = JSON.parse(msgRaw)
    } catch (err) {
      console.error(`Cannot parse Streamer message: ${msgRaw}\nError: ${err}`)
      ws.close(1008, 'Cannot parse')
      return
    }

    let handler = streamerMessageHandlers.get(msg.type)
    if (!handler || typeof handler != 'function') {
      if (config.LogVerbose) {
        console.log(streamer.id, msgRaw)
      }
      console.error(`unsupported Streamer message type: ${msg.type}`)
      ws.close(1008, 'Unsupported message type')
      return
    }
    handler(streamer, msg)
  })

  ws.on('close', function (code, reason) {
    console.error(`streamer ${streamer.id} disconnected: ${code} - ${reason}`)
    onStreamerDisconnected(streamer)
  })

  ws.on('error', function (error) {
    console.error(`streamer ${streamer.id} connection error: ${error}`)
    onStreamerDisconnected(streamer)
    try {
      ws.close(1006 /* abnormal closure */, error)
    } catch (err) {
      console.error(`ERROR: ws.on error: ${err.message}`)
    }
  })

  ws.send(JSON.stringify(clientConfig))

  // request id
  const msg = { type: 'identify' }
  logOutgoing('unknown', msg)
  ws.send(JSON.stringify(msg))

  registerStreamer(LegacyStreamerId, streamer)
})

function forwardSFUMessageToPlayer(msg) {
  const playerId = getPlayerIdFromMessage(msg)
  const player = players.get(playerId)
  if (player) {
    logForward(SFUPlayerId, playerId, msg)
    player.sendTo(msg)
  }
}

function forwardSFUMessageToStreamer(msg) {
  const sfuPlayer = getSFU()
  if (sfuPlayer) {
    logForward(SFUPlayerId, sfuPlayer.streamerId, msg)
    msg.sfuId = SFUPlayerId
    sfuPlayer.sendFrom(msg)
  }
}

function onPeerDataChannelsSFUMessage(msg) {
  // sfu is telling a peer what stream id to use for a data channel
  const playerId = getPlayerIdFromMessage(msg)
  const player = players.get(playerId)
  if (player) {
    logForward(SFUPlayerId, playerId, msg)
    player.sendTo(msg)
    player.datachannel = true
  }
}

function onSFUDisconnected() {
  console.log('disconnecting SFU from streamer')
  disconnectAllPlayers(SFUPlayerId)
  const sfuPlayer = getSFU()
  if (sfuPlayer) {
    sfuPlayer.unsubscribe()
    sfuPlayer.ws.close(4000, 'SFU Disconnected')
  }
  players.delete(SFUPlayerId)
  streamers.delete(SFUPlayerId)
}

sfuMessageHandlers.set('offer', forwardSFUMessageToPlayer)
sfuMessageHandlers.set('answer', forwardSFUMessageToStreamer)
sfuMessageHandlers.set('streamerDataChannels', forwardSFUMessageToStreamer)
sfuMessageHandlers.set('peerDataChannels', onPeerDataChannelsSFUMessage)

const sfuServer = new WebSocket.Server({ port: sfuPort })
sfuServer.on('connection', function (ws, req) {
  // reject if we already have an sfu
  if (sfuIsConnected()) {
    ws.close(1013, 'Already have an SFU')
    return
  }

  ws.on('message', (msgRaw) => {
    let msg
    try {
      msg = JSON.parse(msgRaw)
    } catch (err) {
      console.error(`Cannot parse SFU message: ${msgRaw}\nError: ${err}`)
      ws.close(1008, 'Cannot parse')
      return
    }

    let handler = sfuMessageHandlers.get(msg.type)
    if (!handler || typeof handler != 'function') {
      if (config.LogVerbose) {
        console.log(SFUPlayerId, msgRaw)
      }
      console.error(`unsupported SFU message type: ${msg.type}`)
      ws.close(1008, 'Unsupported message type')
      return
    }
    handler(msg)
  })

  ws.on('close', function (code, reason) {
    console.error(`SFU disconnected: ${code} - ${reason}`)
    onSFUDisconnected()
  })

  ws.on('error', function (error) {
    console.error(`SFU connection error: ${error}`)
    onSFUDisconnected()
    try {
      ws.close(1006 /* abnormal closure */, error)
    } catch (err) {
      console.error(`ERROR: ws.on error: ${err.message}`)
    }
  })

  let sfuPlayer = new Player(SFUPlayerId, ws, PlayerType.SFU, false)
  players.set(SFUPlayerId, sfuPlayer)
  console.log(`SFU (${req.connection.remoteAddress}) connected `)

  // TODO subscribe it to one of any of the streamers for now
  for (let [streamerId, streamer] of streamers) {
    sfuPlayer.subscribe(streamerId)
    break
  }

  // sfu also acts as a streamer
  registerStreamer(SFUPlayerId, { ws: ws })
})

let playerCount = 0

function sendPlayersCount() {
  const msg = { type: 'playerCount', count: players.size }
  logOutgoing('[players]', msg)
  for (let player of players.values()) {
    player.sendTo(msg)
  }
}

function onPlayerMessageSubscribe(player, msg) {
  logIncoming(player.id, msg)
  player.subscribe(msg.streamerId)
}

function onPlayerMessageUnsubscribe(player, msg) {
  logIncoming(player.id, msg)
  player.unsubscribe()
}

function onPlayerMessageStats(player, msg) {
  console.log(`player ${playerId}: stats\n${msg.data}`)
}

function onPlayerMessageListStreamers(player, msg) {
  logIncoming(player.id, msg)

  let reply = { type: 'streamerList', ids: [] }
  for (let [streamerId, streamer] of streamers) {
    reply.ids.push(streamerId)
  }

  logOutgoing(player.id, reply)
  player.sendTo(reply)
}

function forwardPlayerMessage(player, msg) {
  logForward(player.id, player.streamerId, msg)
  player.sendFrom(msg)
}

function onPlayerDisconnected(playerId) {
  const player = players.get(playerId)
  player.unsubscribe()
  players.delete(playerId)
  --playerCount
  sendPlayersCount()
  sendPlayerDisconnectedToMatchmaker()
}
url

playerMessageHandlers.set('subscribe', onPlayerMessageSubscribe)
playerMessageHandlers.set('unsubscribe', onPlayerMessageUnsubscribe)
playerMessageHandlers.set('stats', onPlayerMessageStats)
playerMessageHandlers.set('offer', forwardPlayerMessage)
playerMessageHandlers.set('answer', forwardPlayerMessage)
playerMessageHandlers.set('iceCandidate', forwardPlayerMessage)
playerMessageHandlers.set('listStreamers', onPlayerMessageListStreamers)
// sfu related messages
playerMessageHandlers.set('dataChannelRequest', forwardPlayerMessage)
playerMessageHandlers.set('peerDataChannelsReady', forwardPlayerMessage)

let playerServer = new WebSocket.Server({
  server: config.UseHTTPS ? httpsServer : httpServer
})
playerServer.on('connection', function (ws, req) {
  const parsedUrl = url.parse(req.url)
  const urlParams = new URLSearchParams(parsedUrl.search)
  const browserSendOffer =
    urlParams.has('OfferToReceive') &&
    urlParams.get('OfferToReceive') !== 'false'

  if (playerCount + 1 > maxPlayerCount && maxPlayerCount !== -1) {
    console.log(
      `new connection would exceed number of allowed concurrent connections. Max: ${maxPlayerCount}, Current ${playerCount}`
    )
    ws.close(
      1013,
      `too many connections. max: ${maxPlayerCount}, current: ${playerCount}`
    )
    return
  }

  ++playerCount
  let playerId = sanitizePlayerId(nextPlayerId++)
  console.log(`player ${playerId} (${req.connection.remoteAddress}) connected`)
  let player = new Player(playerId, ws, PlayerType.Regular, browserSendOffer)
  players.set(playerId, player)

  ws.on('message', (msgRaw) => {
    let msg
    try {
      msg = JSON.parse(msgRaw)
    } catch (err) {
      console.error(
        `Cannot parse player ${playerId} message: ${msgRaw}\nError: ${err}`
      )
      ws.close(1008, 'Cannot parse')
      return
    }

    let player = players.get(playerId)
    if (!player) {
      console.error(
        `Received a message from a player not in the player list ${playerId}`
      )
      ws.close(1001, 'Broken')
      return
    }

    let handler = playerMessageHandlers.get(msg.type)
    if (!handler || typeof handler != 'function') {
      if (config.LogVerbose) {
        console.log(playerId, msgRaw)
      }
      console.error(`unsupported player message type: ${msg.type}`)
      ws.close(1008, 'Unsupported message type')
      return
    }
    handler(player, msg)
  })

  ws.on('close', function (code, reason) {
    console.log(`player ${playerId} connection closed: ${code} - ${reason}`)
    onPlayerDisconnected(playerId)
  })

  ws.on('error', function (error) {
    console.error(`player ${playerId} connection error: ${error}`)
    ws.close(1006 /* abnormal closure */, error)
    onPlayerDisconnected(playerId)

    console.log(`Trying to reconnect...`)
    reconnect()
  })

  sendPlayerConnectedToMatchmaker()
  player.ws.send(JSON.stringify(clientConfig))
  sendPlayersCount()
})

function disconnectAllPlayers(streamerId) {
  console.log(`unsubscribing all players on ${streamerId}`)
  const clone = new Map(players)
  for (let player of clone.values()) {
    if (player.streamerId == streamerId) {
      // disconnect players but just unsubscribe the SFU
      if (player.id == SFUPlayerId) {
        // because we're working on a clone here we have to access directly
        getSFU().unsubscribe()
      } else {
        player.ws.close()
      }
    }
  }
}

if (config.UseMatchmaker) {
  const matchmaker = new net.Socket()

  matchmaker.on('connect', function () {
    console.log(
      `Cirrus connected to Matchmaker ${matchmakerAddress}:${matchmakerPort}`
    )

    // message.playerConnected is a new variable sent from the SS to help track whether or not a player
    // is already connected when a 'connect' message is sent (i.e., reconnect). This happens when the MM
    // and the SS get disconnected unexpectedly (was happening often at scale for some reason).
    let playerConnected = false

    // Set the playerConnected flag to tell the MM if there is already a player active (i.e., don't send a new one here)
    if (players && players.size > 0) {
      playerConnected = true
    }

    // Add the new playerConnected flag to the message body to the MM
    message = {
      type: 'connect',
      address:
        typeof serverPublicIp === 'undefined' ? '127.0.0.1' : serverPublicIp,
      port: config.UseHTTPS ? httpsPort : httpPort,
      ready: streamers.size > 0,
      playerConnected: playerConnected
    }

    matchmaker.write(JSON.stringify(message))
  })

  matchmaker.on('error', (err) => {
    console.log(`Matchmaker connection error ${JSON.stringify(err)}`)
  })

  matchmaker.on('end', () => {
    console.log('Matchmaker connection ended')
  })

  matchmaker.on('close', (hadError) => {
    console.log('Setting Keep Alive to true')
    matchmaker.setKeepAlive(true, 60000) // Keeps it alive for 60 seconds

    console.log(`Matchmaker connection closed (hadError=${hadError})`)

    reconnect()
  })

  // Attempt to connect to the Matchmaker
  function connect() {
    matchmaker.connect(matchmakerPort, matchmakerAddress)
  }

  // Try to reconnect to the Matchmaker after a given period of time
  function reconnect() {
    console.log(
      `Try reconnect to Matchmaker in ${matchmakerRetryInterval} seconds`
    )
    setTimeout(function () {
      connect()
    }, matchmakerRetryInterval * 1000)
  }

  function registerMMKeepAlive() {
    setInterval(function () {
      message = {
        type: 'ping'
      }
      matchmaker.write(JSON.stringify(message))
    }, matchmakerKeepAliveInterval * 1000)
  }

  connect()
  registerMMKeepAlive()
}

function sendStreamerConnectedToMatchmaker() {
  if (!config.UseMatchmaker) return
  try {
    message = {
      type: 'streamerConnected'
    }
    matchmaker.write(JSON.stringify(message))
  } catch (err) {
    console.log(`ERROR sending streamerConnected: ${err.message}`)
  }
}

function sendStreamerDisconnectedToMatchmaker() {
  if (!config.UseMatchmaker) return
  try {
    message = {
      type: 'streamerDisconnected'
    }
    matchmaker.write(JSON.stringify(message))
  } catch (err) {
    console.log(`ERROR sending streamerDisconnected: ${err.message}`)
  }
}

// The Matchmaker will not re-direct clients to this Cirrus server if any client
// is connected.
function sendPlayerConnectedToMatchmaker() {
  if (!config.UseMatchmaker) return
  try {
    message = {
      type: 'clientConnected'
    }
    matchmaker.write(JSON.stringify(message))
  } catch (err) {
    console.log(`ERROR sending clientConnected: ${err.message}`)
  }
}

// The Matchmaker is interested when nobody is connected to a Cirrus server
// because then it can re-direct clients to this re-cycled Cirrus server.
function sendPlayerDisconnectedToMatchmaker() {
  if (!config.UseMatchmaker) return
  try {
    message = {
      type: 'clientDisconnected'
    }
    matchmaker.write(JSON.stringify(message))
  } catch (err) {
    console.log(`ERROR sending clientDisconnected: ${err.message}`)
  }
}
