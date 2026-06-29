import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // GitHub Pages 项目站点位于 /<repo>/ 子路径，构建时由 CI 注入 PAGES_BASE_PATH；
  // 本地开发不设该变量，默认 '/'，行为不变。
  base: process.env.PAGES_BASE_PATH ?? '/',
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
