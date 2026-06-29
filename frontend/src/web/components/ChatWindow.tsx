import { useEffect, useRef } from 'react'
import { useChat } from '@shared/hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { EmptyHint } from './EmptyHint'
import { ElicitOrderPanel } from './ElicitOrderPanel'

export function ChatWindow() {
  const { messages, sending, pendingElicit, send, abort, respondElicit, dismissElicit } =
    useChat()
  const bottomRef = useRef<HTMLDivElement>(null)

  // 新消息或流式更新时滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && <EmptyHint />}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <InputBar sending={sending} onSend={send} onAbort={abort} />

      {/* elicit 下单确认模态（plan §3.4 / §9.7）：
          打开时阻塞主交互，用户必须先处理。SSE 流在后端阻塞等响应。 */}
      {pendingElicit && (
        <ElicitOrderPanel
          elicit={pendingElicit}
          onAccept={(content) => respondElicit('accept', content)}
          onDecline={() => respondElicit('decline')}
          onExpire={dismissElicit}
        />
      )}
    </div>
  )
}
