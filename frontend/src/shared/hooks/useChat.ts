// =====================================================================
// shared/hooks/useChat.ts —— 核心对话状态机（plan §4），纯逻辑、平台无关
// web 和 app 的 UI 都基于这个 hook。
// 第 1 步已实现：text_delta 流式 + done/error + 防并发 + 历史维护。
// 第 2~4 步要改的只是"渲染层"，这里的 SSE 分发已写全。
// =====================================================================

import { useCallback, useRef, useState } from 'react'
import { postChat, postElicitRespond } from '@shared/api/client'
import { parseOrderFromSummary } from '@shared/order-sync'
import { usePortfolio } from '@shared/portfolio/PortfolioContext'
import type { ChatMessage, PendingElicit, SSEEvent, ToolPart, UIMessage } from '@shared/types'

let _seq = 0
const genId = () => `msg-${Date.now()}-${_seq++}`

function patchById(
  list: UIMessage[],
  id: string,
  fn: (m: UIMessage) => UIMessage,
): UIMessage[] {
  return list.map((m) => (m.id === id ? fn(m) : m))
}

/**
 * 由当前 UI 消息构造回传历史（修正 plan §5 在 tool-calling 场景的缺陷）：
 *
 * - user 文本：原样保留
 * - assistant：若有工具调用，还原为「assistant(tool_calls) + 多条 tool 结果」
 *   的标准 OpenAI 多轮结构；否则只保留文本
 * - ui 事件的 HTML：绝不进历史（体积大 + 不可信）
 * - error 消息：丢弃
 *
 * 这样 LLM 能看到自己上轮确实调用了工具，不会被自己的文字回复带偏。
 */
function buildHistory(prev: UIMessage[], currentUserText: string): ChatMessage[] {
  const history: ChatMessage[] = []
  for (const m of prev) {
    if (m.status === 'error') continue

    if (m.role === 'user') {
      const text = m.text.trim()
      if (text) history.push({ role: 'user', content: text })
      continue
    }

    // assistant：分离出工具调用部分
    const toolParts = m.parts.filter((p): p is ToolPart => p.kind === 'tool')
    if (toolParts.length > 0) {
      // 1) assistant 消息（可能同时含文本 + tool_calls）
      history.push({
        role: 'assistant',
        content: m.text.trim(),
        tool_calls: toolParts.map((p) => ({
          id: p.id,
          name: p.name,
          arguments:
            typeof p.arguments === 'string'
              ? p.arguments
              : JSON.stringify(p.arguments ?? {}),
        })),
      })
      // 2) 每个工具调用对应一条 role=tool 的结果消息
      for (const p of toolParts) {
        history.push({
          role: 'tool',
          tool_call_id: p.id,
          name: p.name,
          content: p.result?.summary ?? '',
        })
      }
    } else {
      const text = m.text.trim()
      if (text) history.push({ role: 'assistant', content: text })
    }
  }
  history.push({ role: 'user', content: currentUserText.trim() })
  return history
}

export interface UseChatResult {
  messages: UIMessage[]
  sending: boolean
  pendingElicit: PendingElicit | null
  send: (text: string) => void
  abort: () => void
  /** 用户确认/拒绝，回传后端并关闭面板（accept 时需带 content） */
  respondElicit: (
    action: 'accept' | 'decline' | 'cancel',
    content?: Record<string, unknown>,
  ) => Promise<void>
  /** 仅前端关闭面板，不调接口（用于超时兑底） */
  dismissElicit: () => void
  /** 清空所有消息（跳过回放时用） */
  clearMessages: () => void
  /** 幽灵回放专用：把录制的 SSE 事件喂给状态机 */
  feedEvent: (ev: SSEEvent) => void
}

export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [sending, setSending] = useState(false)
  const [pendingElicit, setPendingElicit] = useState<PendingElicit | null>(null)

  // 用 ref 跟踪最新状态，避免闭包读到旧值
  const messagesRef = useRef<UIMessage[]>([])
  messagesRef.current = messages
  const pendingElicitRef = useRef<PendingElicit | null>(null)
  pendingElicitRef.current = pendingElicit

  const controllerRef = useRef<AbortController | null>(null)

  // 订单同步：Agent 下单/撤单的 tool_result 里嵌了订单 JSON，注入左侧 store
  const { upsertOrder } = usePortfolio()

  const abort = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const respondElicit = useCallback(
    async (
      action: 'accept' | 'decline' | 'cancel',
      content?: Record<string, unknown>,
    ): Promise<void> => {
      const p = pendingElicitRef.current
      if (!p) return
      pendingElicitRef.current = null
      setPendingElicit(null)
      try {
        // 回传后后端 sink 返回，SSE 流自动继续（tool_result / text_delta / done）
        await postElicitRespond({ id: p.id, action, content })
      } catch (err) {
        // 回传失败通常是 404（后端已超时 cancel），SSE 会自行收到 tool_result，静默处理
        // eslint-disable-next-line no-console
        console.warn('[elicit] respond 失败：', err)
      }
    },
    [],
  )

  const dismissElicit = useCallback(() => {
    pendingElicitRef.current = null
    setPendingElicit(null)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    pendingElicitRef.current = null
    setPendingElicit(null)
  }, [])

  /** 处理 SSE 事件的核心状态机，send() 和 feedEvent() 共用。 */
  const handleEventFor = useCallback(
    (aiMsgId: string, ev: SSEEvent) => {
      switch (ev.event) {
        case 'text_delta':
          setMessages((prev) =>
            patchById(prev, aiMsgId, (m) => ({ ...m, text: m.text + ev.data.text })),
          )
          break
        case 'tool_call':
          setMessages((prev) =>
            patchById(prev, aiMsgId, (m) => ({
              ...m,
              parts: [
                ...m.parts,
                {
                  kind: 'tool',
                  id: ev.data.id,
                  name: ev.data.name,
                  arguments: ev.data.arguments,
                },
              ],
            })),
          )
          break
        case 'tool_result':
          // 订单同步：place_order/cancel_order 的 summary 里嵌了完整订单 JSON
          if (!ev.data.isError) {
            const order = parseOrderFromSummary(ev.data.name, ev.data.summary)
            if (order) upsertOrder(order)
          }
          setMessages((prev) =>
            patchById(prev, aiMsgId, (m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.kind === 'tool' && p.name === ev.data.name && !p.result
                  ? { ...p, result: { summary: ev.data.summary, isError: ev.data.isError } }
                  : p,
              ),
            })),
          )
          break
        case 'ui':
          setMessages((prev) =>
            patchById(prev, aiMsgId, (m) => ({
              ...m,
              parts: [...m.parts, { kind: 'ui', html: ev.data.html, meta: ev.data.meta }],
            })),
          )
          break
        case 'elicit':
          pendingElicitRef.current = ev.data
          setPendingElicit(ev.data)
          break
        case 'done':
          setMessages((prev) => patchById(prev, aiMsgId, (m) => ({ ...m, status: 'done' })))
          break
        case 'error':
          setMessages((prev) =>
            patchById(prev, aiMsgId, (m) => ({
              ...m,
              status: 'error',
              text: m.text || `⚠️ ${ev.data.message}`,
            })),
          )
          break
      }
    },
    [upsertOrder],
  )

  const send = useCallback((text: string) => {
    const content = text.trim()
    if (!content) return
    if (controllerRef.current) return // 防并发（plan §4）

    const controller = new AbortController()
    controllerRef.current = controller

    const aiMsgId = genId()
    const userMsg: UIMessage = {
      id: genId(),
      role: 'user',
      text: content,
      parts: [],
      status: 'done',
    }
    const aiMsg: UIMessage = {
      id: aiMsgId,
      role: 'assistant',
      text: '',
      parts: [],
      status: 'streaming',
    }

    // 在推入 UI 前就基于"上一个状态"算好 history（不含本轮 assistant）
    const history = buildHistory(messagesRef.current, content)
    setMessages((prev) => [...prev, userMsg, aiMsg])
    setSending(true)

    const handleEvent = (ev: SSEEvent) => handleEventFor(aiMsgId, ev)

    postChat(history, handleEvent, controller.signal)
      .catch((err: unknown) => {
        const aborted = err instanceof DOMException && err.name === 'AbortError'
        if (aborted) {
          // 用户主动中断，按完成处理
          setMessages((prev) => patchById(prev, aiMsgId, (m) => ({ ...m, status: 'done' })))
        } else {
          setMessages((prev) =>
            patchById(prev, aiMsgId, (m) => ({
              ...m,
              status: 'error',
              text: m.text || `⚠️ 请求失败：${(err as Error).message}`,
            })),
          )
        }
      })
      .finally(() => {
        controllerRef.current = null
        setSending(false)
      })
  }, [])

  // 幽灵回放：喂录制的 SSE 事件给状态机，不开网络请求。
  // 每个场景开一个 user+streaming-assistant 槽位，然后逐事件喂。
  // elicit 事件回放时不阻塞（录制时等了 60s 手动确认），
  // 这里在弹窗后模拟“用户思考几秒后自动接受”。
  const replayTurnRef = useRef<string | null>(null)
  const feedEvent = useCallback(
    (ev: SSEEvent) => {
      const eventName = ev.event as string
      // 回放专用控制事件：为一个新场景开槽位
      if (eventName === '__replay_new_turn') {
        const aiMsgId = genId()
        replayTurnRef.current = aiMsgId
        setMessages((prev) => [
          ...prev,
          {
            id: genId(),
            role: 'user',
            text: (ev.data as { prompt?: string }).prompt ?? '',
            parts: [],
            status: 'done',
          },
          { id: aiMsgId, role: 'assistant', text: '', parts: [], status: 'streaming' },
        ])
        return
      }
      // 回放专用控制事件：关闭 elicit 弹窗（视觉上“点掉”）
      if (eventName === '__replay_dismiss_elicit') {
        pendingElicitRef.current = null
        setPendingElicit(null)
        return
      }
      const aiMsgId = replayTurnRef.current
      if (!aiMsgId) return
      handleEventFor(aiMsgId, ev)
    },
    [handleEventFor],
  )

  return { messages, sending, pendingElicit, send, abort, respondElicit, dismissElicit, clearMessages, feedEvent }
}
