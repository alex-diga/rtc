const express = require('express')
const expressWs = require('express-ws')

const router = express.Router()
expressWs(router)

// 维护定时器任务链接每个ws实例
const wsMap = new Map()
const userMap = new Map()

// 房间信息
const ROOM_LIST = []
// 每个房间最多容纳的人数
const MAX_USER_COUNT = 4

router.ws('/', function (ws, req) {
  // getServiceRunning(ws);
  ws.on('message', function (msg) {
    // console.log("server manager ws client message", msg);
    handleCommand(msg, ws)
  })
  ws.on('close', function () {
    handleDisconnect(ws)
  })
  // error事件
  ws.on('error', function (err) {})
})

const setUserWs = (userId, roomId, ws) => {
  if (!wsMap.has(ws)) {
    wsMap.set(ws, { userId, roomId })
  }
  if (!userMap.has(userId)) {
    userMap.set(userId, ws)
  }
}

const handleCommand = (message, ws) => {
  try {
    const data = JSON.parse(message)
    const { type, userId, ...args } = data
    if (type === 'join') {
      handleJoin(data, ws)
    } else if (type === 'offer') {
      sendMsg(data, type)
    } else if (type === 'answer') {
      sendMsg(data, type)
    }
  } catch (e) {
    ws.send(e)
  }
}

const handleJoin = (data, ws) => {
  const filterRoom = ROOM_LIST.filter((item) => item.roomId === data.roomId)[0]
  let room = { roomId: data.roomId, userList: [] }

  // 判断房间是否存在
  if (filterRoom) {
    room = filterRoom
  } else {
    ROOM_LIST.push(room)
  }

  // 每个房间人数不超过预设的人数
  if (room.userList.length > MAX_USER_COUNT) {
    ws.send(JSON.stringify({ code: 500, msg: '"房间人数已满，请稍后再试"' }))
    return
  }

  setUserWs(data.userId, data.roomId, ws)

  // 当房间里的人数为0且管理员还没有设置，设置管理员
  if (room.userList.length === 0) {
    room.admin = data.userId
  }

  // 判断用户是否已经在房间里
  const filterUser = room.userList.filter(
    (item) => item.userId === data.userId
  )[0]

  if (!filterUser) {
    room.userList.push(data)
  }

  sendMsg(data, 'createOffer')
}

const sendMsg = (data, type) => {
  const msg = JSON.stringify({ ...data, type })
  const filterRoom = ROOM_LIST.find((item) => item.roomId === data.roomId)
  if (filterRoom) {
    filterRoom.userList
      .filter((item) => item !== data.userId)
      .forEach((userId) => {
        const ws = userMap.get(userId)
        if (ws) {
          ws.send(msg)
        }
      })
  }
}

const handleDisconnect = (ws) => {
  if (wsMap.has(ws)) {
    const { userId, roomId } = wsMap.get(ws)
    const room = ROOM_LIST.filter((item) => item.roomId === roomId)[0]

    if (room) {
      const userList = room.userList
      const filterUser = userList.filter((item) => item.userId === userId)[0]
      if (filterUser) {
        // 通知房间内的其他用户
        console.log(userId, '离开房间')
        // 清除房间内的用户信息
        room.userList = userList.filter((item) => item.userId !== userId)
        // 关闭房间
        if (room.userList.length === 0) {
          ROOM_LIST.splice(ROOM_LIST.indexOf(room), 1)
        }
      }
    }
  }
}
module.exports = router
