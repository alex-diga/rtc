function logIncoming(sourceName, msg) {
  console.log(sourceName, JSON.stringify(msg))
}

function logOutgoing(destName, msg) {
  console.log(destName, JSON.stringify(msg))
}

function logForward(srcName, destName, msg) {
  console.log(srcName, destName, JSON.stringify(msg))
}

module.exports = {
  logIncoming,
  logOutgoing,
  logForward
}
