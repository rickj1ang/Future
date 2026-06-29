import { useEffect, useRef } from 'react'
import { useChat } from '@shared/hooks/useChat'
import { useReplay } from '@shared/hooks/useReplay'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { EmptyHint } from './EmptyHint'
import { ElicitOrderPanel } from './ElicitOrderPanel'

export function ChatWindow() {
  const {
    messages,
    sending,
    pendingElicit,
    send,
    abort,
    respondElicit,
    dismissElicit,
    feedEvent,
    clearMessages,
  } = useChat()

  // 幽灵回放：进入时自动开始；用户首次输入即停止
  const { replaying, sceneIndex, sceneCount, start, stop } = useReplay(feedEvent)

  const bottomRef = useRef<HTMLDivElement>(null)

  // 进入应用自动播放演示
  useEffect(() => {
    start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 新消息或流式更新时滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 用户发消息：先停掉回放，清空演示，再真实发送
  const handleSend = (text: string) => {
    if (replaying) {
      stop()
      clearMessages()
    }
    send(text)
  }

  const showEmptyHint = messages.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* 回放中时，顶部显示进度条 */}
      {replaying && (
        <div className="shrink-0">
          <EmptyHint
            replaying
            sceneIndex={sceneIndex}
            sceneCount={sceneCount}
            onStartReplay={() => {}}
            onSkipReplay={() => {
              stop()
              clearMessages()
            }}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {showEmptyHint && !replaying && (
            <EmptyHint
              replaying={false}
              sceneIndex={sceneIndex}
              sceneCount={sceneCount}
              onStartReplay={() => start()}
              onSkipReplay={() => {}}
            />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <InputBar sending={sending} onSend={handleSend} onAbort={abort} />

      {/* elicit 下单确认模态：回放期间也会弹出，2.5s 后自动关闭 */}
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
