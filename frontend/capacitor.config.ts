import type { CapacitorConfig } from '@capacitor/cli'

// ════════════════════════════════════════════════════
// Capacitor 配置 —— 把 Vite 构建出的 dist/ 套成 Android App
//
// 工作流：
//   npm run build        → 产出 dist/
//   npx cap sync android → 把 dist/ 拷进 android 项目
//   ./gradlew assembleDebug → 出 APK
//
// 注意：app 用 capacitor://localhost 加载 web 资源，
// 所以 fetch('/chat') 这样的相对路径会失败，
// 必须在构建时用 VITE_CORE_AGENT_URL 注入绝对地址。
// cleartext HTTP 由 CI 在 AndroidManifest 里开启。
// ════════════════════════════════════════════════════

const config: CapacitorConfig = {
  appId: 'com.rickj1ang.future',
  appName: 'Future',
  webDir: 'dist',
  // androidScheme 用 https 加载本地资源，避免混合内容警告
  server: {
    androidScheme: 'https',
  },
  android: {
    // 允许 WebView 发起明文 HTTP 请求（后端是 HTTP，没上 HTTPS）
    allowMixedContent: true,
  },
}

export default config
