import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/', //首页
    redirect: '/home'
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('../view/home/index.vue')
  },
  {
    path: '/rtc',
    name: 'rtc',
    component: () => import('../view/webRtc/index.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
