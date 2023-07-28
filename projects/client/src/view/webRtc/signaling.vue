<template>
  <div class="rtcPtp">
    <h1 class="back"><router-link to="/">返回</router-link></h1>
    <div class="content">
      <div class="videoBox">
        <video class="video" ref="localRef" autoplay playsinline></video>
        <span class="tip">我</span>
      </div>
      <div class="videoBox">
        <video class="video" ref="remoteRef" autoplay playsinline></video>
        <span class="tip">远程视频</span>
      </div>
    </div>
    <div class="operator">
      <div class="inputBox">
        <span class="label">房间：</span>
        <input type="text" class="input" :value="roomId" @change="onChange" />
        <span class="btn" @click="handleJoin">加入</span>
      </div>
      <div>
        <span
          class="btn"
          :class="{ primary: isOpenVideo }"
          @click="handleVideo"
        >
          {{ isOpenVideo ? '关闭' : '打开' }}视频
        </span>
      </div>
    </div>
  </div>
</template>
<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { nanoid } from 'nanoid'

const userId = nanoid()
const pc = new RTCPeerConnection({
  iceServers: [
    {
      urls: 'stun:stun.voipbuster.com'
    }
  ]
})
const roomId = ref('')
const socket = ref<WebSocket | null>(null)
const isOpenVideo = ref(true)
const localRef = ref<HTMLVideoElement | null>(null)
const remoteRef = ref<HTMLVideoElement | null>(null)
const sdp = reactive({ offer: '', answer: '' })

onMounted(() => {
  init()
})

onUnmounted(() => {
  console.log(55555)
  if (socket.value) {
    socket.value.close()
  }
})

const init = async () => {
  const localVideo = localRef.value!
  const remoteVideo = remoteRef.value!
  try {
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true
    })

    localVideo.srcObject = localStream
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream)
    })
  } catch (e) {
    console.error(e)
  }

  const remoteStream = new MediaStream()
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track)
    })
    remoteVideo.srcObject = remoteStream
  }
}

const parse = (str: string, backup?: unknown): any => {
  let res = backup || {}
  try {
    res = JSON.parse(str)
  } catch (e) {
    res = backup || {}
  }
  return res
}

const connectWs = () => {
  const ws = new WebSocket('wss://192.168.188.61:8080/ice')
  // 建立连接
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', userId, roomId: roomId.value }))
  }
  // 接收消息
  ws.onmessage = (res) => {
    handleMsg(parse(res.data))
  }
  // 发生错误时
  ws.onerror = (res) => {
    console.log(res)
  }
  // 关闭
  ws.onclose = () => {
    console.log('websokect关闭')
  }

  socket.value = ws
}

const send = (data: object, type: string) => {
  if (socket.value) {
    socket.value?.send(JSON.stringify({ ...data, type }))
  }
}

const handleMsg = (data: { type: string; [x: string]: any }) => {
  const { type } = data
  if (type === 'createOffer') {
    if (sdp.offer) {
      const data = { offer: sdp.offer, userId, roomId: roomId.value }
      send(data, 'offer')
    }
    createOffer()
  } else if (type === 'offer') {
    createAnswer(data.sdp)
  } else if (type === 'answer') {
    addAnswer(data.sdp)
  }
}

// 创建 offer
async function createOffer() {
  // 当一个新的offer ICE候选人被创建时触发事件
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      sdp.offer = JSON.stringify(pc.localDescription)
      // 发送 offer
      if (sdp.offer) {
        const data = { offer: sdp.offer, userId, roomId: roomId.value }
        send(data, 'offer')
      }
    }
  }
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
}

// 创建 answer
async function createAnswer(val: string) {
  const offer = JSON.parse(val)
  pc.onicecandidate = async (event) => {
    // 当一个新的 answer ICE candidate 被创建时
    if (event.candidate) {
      const data = {
        userId,
        roomId: roomId.value,
        sdp: JSON.stringify(pc.localDescription)
      }
      send(data, 'answer')
    }
  }
  await pc.setRemoteDescription(offer)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
}

async function addAnswer(answerSdp: string) {
  const answer = JSON.parse(answerSdp)
  if (!pc.currentRemoteDescription) {
    pc.setRemoteDescription(answer)
  }
}

const onChange = (e: Event) => {
  roomId.value = (e.target as HTMLInputElement).value
}

const handleJoin = () => {
  if (roomId.value) {
    connectWs()
  }
}

const handleVideo = () => {
  const localVideo = localRef.value!
  if (localVideo.srcObject) {
    ;(localVideo.srcObject as MediaStream).getVideoTracks().forEach((track) => {
      track.stop()
    })
  }

  isOpenVideo.value = !isOpenVideo.value
}
</script>

<style scoped lang="less">
.rtcPtp {
  display: flex;
  flex-direction: column;
  .back {
    position: fixed;
    top: 10px;
    left: 10px;
  }
  .content {
    display: flex;

    .videoBox {
      position: relative;
      border: 1px solid #0a86ff;
      border-radius: 10px;
      background-color: rgba(15, 20, 24, 0.5);
      .video {
        width: 320px;
        height: 240px;
      }
      .tip {
        position: absolute;
        bottom: 0px;
        left: 50%;
        transform: translateX(-50%);
        color: rgba(255, 255, 255, 0.65);
      }
      & + .videoBox {
        margin-left: 20px;
      }
    }
  }

  .operator {
    width: 100%;
    height: 360px;
    margin-top: 20px;
    .btn {
      min-width: 5rem;
      padding: 6px 12px;
      background-color: #0a86ff;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
    }
    .primary {
      background-color: #333;
    }
    .inputBox {
      display: flex;
      align-items: center;
      margin-bottom: 20px;

      .label {
        color: rgba(0, 0, 0, 0.85);
      }

      .input {
        flex: 1;
        height: 30px;
      }
    }
  }
}
</style>
