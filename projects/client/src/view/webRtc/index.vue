<template>
  <div class="webMedia">
    <h1 class="back"><router-link to="/">返回</router-link></h1>
    <div class="content">
      <video ref="videoRef" class="video" autoplay playsinline muted></video>
      <canvas ref="canvasRef" width="320" height="240"></canvas>
    </div>

    <div class="btnGroup">
      <span class="btn" @click="handleOpen">开启摄像头</span>
      <span class="btn" @click="handleShare">屏幕共享</span>
      <span class="btn" @click="handlePhoto">截图</span>
      <span class="btn primary" @click="handleClose">关闭</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const handleOpen = async () => {
  if (navigator?.mediaDevices?.getUserMedia) {
    // 标准的API
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false, // 音频麦克风
        video: { facingMode: 'user' } // 优先使用前置摄像头
      })
      const video = videoRef.value!
      video.srcObject = mediaStream
      video.onloadedmetadata = function () {
        video.play()
      }
    } catch (e) {
      console.error(e)
    }
  } else {
    alert('请打开摄像头')
  }
}

const handleShare = async () => {
  if (navigator?.mediaDevices?.getDisplayMedia) {
    // 标准的API
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true
      })
      const video = videoRef.value!
      video.srcObject = mediaStream
      video.onloadedmetadata = function () {
        video.play()
      }
    } catch (e) {
      console.error(e)
    }
  }
}

const handlePhoto = () => {
  const context = canvasRef.value!.getContext('2d')
  if (context) {
    context.drawImage(videoRef.value!, 0, 0, 320, 240)
  }
}

const closeCamera = () => {
  const video = videoRef.value!
  if (video.srcObject) {
    const tracks = (video.srcObject as MediaStream).getTracks()
    tracks.forEach((track) => {
      track.stop()
    })
    video.srcObject = null
  }
}

const closeCanvas = () => {
  const context = canvasRef.value!.getContext('2d')
  if (context) {
    context.clearRect(0, 0, 320, 240)
  }
}

const handleClose = () => {
  closeCamera()
  closeCanvas()
}
</script>

<style scoped lang="less">
.webMedia {
  .back {
    position: fixed;
    top: 10px;
    left: 10px;
  }
  .video {
    width: 320px;
    height: 240px;
  }
  .content {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btnGroup {
    display: flex;
    margin-top: 1.875rem;

    .btn {
      min-width: 5rem;
      padding: 6px 12px;
      background-color: #0a86ff;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      & + .btn {
        margin-left: 10px;
      }
    }

    .primary {
      background-color: #333;
    }
  }
}
</style>
