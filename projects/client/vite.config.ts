import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), basicSsl()],
  server: {
    https: {
      cert: fs.readFileSync(path.join(__dirname, 'keys/cert.crt')),
      key: fs.readFileSync(path.join(__dirname, 'keys/cert.key'))
    },
    host: '0.0.0.0',
    port: 7788
    // proxy: {}
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src')
      }
    ]
  }
})
