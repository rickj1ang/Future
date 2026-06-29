/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** core-agent 后端地址，留空走 vite proxy（见 vite.config.ts） */
  readonly VITE_CORE_AGENT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
