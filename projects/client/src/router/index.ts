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
  },
  {
    path: '/session',
    name: 'session',
    component: () => import('../view/webRtc/session.vue')
  },
  {
    path: '/signaling',
    name: 'signaling',
    component: () => import('../view/webRtc/signaling.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
