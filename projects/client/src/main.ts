import { createApp } from 'vue'
import router from './router'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persist'
import './style.css'
import App from './App.vue'

const store = createPinia()
store.use(piniaPersist)

createApp(App).use(store).use(router).mount('#app')
