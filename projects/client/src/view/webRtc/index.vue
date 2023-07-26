<template>
  <div class="webCamera">
    <div class="content">
      <video ref="videoRef" class="video" autoplay playsinline muted></video>
      <canvas ref="canvasRef" class="canvasBox"></canvas>
    </div>

    <div class="btnGroup">
      <span class="btn" @click="handleOpen">开启摄像头</span>
      <span class="btn" @click="handlePhoto">拍照</span>
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
  } else {
    alert('请打开摄像头')
  }
}

const handlePhoto = () => {
  const context = canvasRef.value!.getContext('2d')
  if (context) {
    context.drawImage(videoRef.value!, 0, 0, 120, 120)
  }
}
</script>

<style scoped lang="less">
.webCamera {
  .video {
    width: 120px;
    height: 120px;
  }
  .canvasBox {
    width: 120px;
    height: 120px;
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
  }
}
</style>
