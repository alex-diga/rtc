const { constants } = require('buffer')
const fs = require('fs')
const path = require('path')

const defaultConfig = {
  UseFrontend: false,
  UseMatchmaker: false,
  UseHTTPS: false,
  HTTPSCertFile: './certificates/client-cert.pem',
  HTTPSKeyFile: './certificates/client-key.pem',
  UseAuthentication: false,
  LogToFile: true,
  LogVerbose: true,
  HomepageFile: 'player.html',
  AdditionalRoutes: new Map(),
  EnableWebserver: true,
  MatchmakerAddress: '',
  MatchmakerPort: 9999,
  PublicIp: 'localhost',
  HttpPort: 80,
  HttpsPort: 443,
  StreamerPort: 8888,
  SFUPort: 8889,
  MaxPlayerCount: -1,
  DisableSSLCert: true
}

function init(configFile) {
  let config = defaultConfig
  try {
    let configData = fs.readFileSync(configFile, 'utf-8')
    fileConfig = JSON.parse(configData)
    config = { ...config, ...fileConfig }

    // try {
    //   fs.writeFileSync(configFile, JSON.stringify(config, null, '\t'), 'UTF8')
    // } catch (err) {}
  } catch (err) {
    if (err.code === 'ENOENT') {
      fs.writeFileSync(configFile, JSON.stringify(config, null, '\t'), 'UTF8')
    }
  }

  return config
}

module.exports = { init }
