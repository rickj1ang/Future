import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // shared/ 里的纯逻辑 web/app 共用
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    // dev 时把后端接口代理到 core-agent，避免跨域（plan §8）
    // 默认后端在 http://localhost:8081
    proxy: {
      '/chat': 'http://localhost:8081',
      '/elicit': 'http://localhost:8081',
      '/health': 'http://localhost:8081',
    },
  },
})
