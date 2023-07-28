<template>
  <div class="rtcSession">
    <h1 class="back"><router-link to="/">返回</router-link></h1>
    <div class="content">
      <div class="videoBox">
        <video class="video" ref="localRef" autoplay playsinline muted></video>
        <span class="tip">我</span>
      </div>
      <div class="videoBox">
        <video class="video" ref="remoteRef" autoplay playsinline></video>
        <span class="tip">远程视频</span>
      </div>
    </div>
    <div class="operator">
      <div class="ice">
        <h2 class="name">操作1</h2>
        <span class="btn" @click="createOffer">创建 Offer</span>
        <input class="input" type="text" :value="offerSdp" />
      </div>

      <div class="ice">
        <h2 class="name">操作2</h2>
        <span class="tip">offerSdp</span>
        <input class="input" type="text" :value="offerSdp" @change="change" />
        <span class="btn" @click="createAnswer">创建 Answer</span>
        <input class="input" type="text" :value="answerSdp" />
      </div>

      <div class="ice">
        <h2 class="name">操作3</h2>
        <span class="btn" @click="addAnswer">添加 Offer</span>
        <input class="input" type="text" :value="answerSdp" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const pc = new RTCPeerConnection()
const localRef = ref<HTMLVideoElement | null>(null)
const remoteRef = ref<HTMLVideoElement | null>(null)

const offerSdp = ref('')
const answerSdp = ref('')

onMounted(() => init())

const init = async () => {
  const localVideo = localRef.value!
  const remoteVideo = remoteRef.value!
  try {
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true
    })

    localVideo.srcObject = localStream
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

const createOffer = async () => {
  const offer = await pc.createOffer()

  await pc.setLocalDescription(offer)
  offerSdp.value = JSON.stringify(pc.localDescription)
  pc.onicecandidate = async (event) => {
    console.log(event)
    if (event.candidate) {
      offerSdp.value = JSON.stringify(pc.localDescription)
    }
  }
}

const change = (e: Event) => {
  offerSdp.value = (e.target as HTMLInputElement)?.value
}

const createAnswer = async () => {
  const offer = JSON.parse(offerSdp.value)
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      answerSdp.value = JSON.stringify(pc.localDescription)
    }
  }
  await pc.setRemoteDescription(offer)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  answerSdp.value = JSON.stringify(pc.localDescription)
}

const addAnswer = async () => {
  const answer = JSON.parse(answerSdp.value)
  if (!pc.currentRemoteDescription) {
    pc.setRemoteDescription(answer)
  }
}
</script>

<style scoped lang="less">
.rtcSession {
  display: flex;
  justify-content: space-between;

  .back {
    position: fixed;
    top: 10px;
    left: 10px;
  }

  .content {
    width: 65%;

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
        margin-top: 20px;
      }
    }
  }

  .operator {
    margin-left: 36px;
    .ice {
      .name {
        font-size: 18px;
      }
    }
    .input {
      width: 100%;
    }
    .btn {
      min-width: 5rem;
      padding: 6px 12px;
      background-color: #0a86ff;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      margin-bottom: 10px;
    }
  }
}
</style>
