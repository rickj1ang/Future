// =====================================================================
// shared/api/client.ts —— core-agent HTTP/SSE 客户端，纯逻辑、平台无关
// =====================================================================

import type { ChatMessage, SSEEvent } from '@shared/types'

// 留空 → 用相对路径，dev 时走 vite proxy（见 vite.config.ts §8）；
// 设了 → 用绝对地址，生产部署时注入。
const BASE_URL = import.meta.env.VITE_CORE_AGENT_URL ?? ''

/**
 * 发起 POST /chat（SSE 流）。见 plan §6。
 *
 * 浏览器 EventSource 不支持 POST，所以用 fetch + ReadableStream 手写解析。
 * 注意：一次 read 的 chunk 可能在事件中间断开，必须用 buffer 累积 + 按 "\n\n" 切分。
 */
export async function postChat(
  messages: ChatMessage[],
  onEvent: (ev: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 事件之间用空行分隔
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const ev = parseSSEBlock(block)
      if (ev) onEvent(ev)
    }
  }
}

function parseSSEBlock(block: string): SSEEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    return null
  }
  return { event, data } as SSEEvent
}

/**
 * POST /elicit/respond（回传确认），见 plan §1。第 4 步会用到。
 */
export async function postElicitRespond(
  payload: {
    id: string
    action: 'accept' | 'decline' | 'cancel'
    content?: Record<string, unknown>
  },
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${BASE_URL}/elicit/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`HTTP ${resp.status}`)
  }
}
