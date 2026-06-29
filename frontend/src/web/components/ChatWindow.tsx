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

  // 幽灵回放：进入时自动开始
  const { phase, sceneIndex, sceneLabel, sceneCount, start, stop, reset } =
    useReplay(feedEvent)

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

  // 退出演示：清空演示消息 + 重置回放状态，回到干净的真实对话起点
  const exitReplay = () => {
    stop()
    reset()
    clearMessages()
  }

  // 用户发消息：只要演示内容还在（playing 或 done），都先清空再真实发送。
  // 这是避免演示消息污染真实对话历史的关键。
  const handleSend = (text: string) => {
    if (phase !== 'idle') {
      exitReplay()
    }
    send(text)
  }

  const showStartScreen = messages.length === 0 && phase === 'idle'

  // 输入框 placeholder 随状态变化，引导用户
  const placeholder =
    phase === 'done'
      ? '比如「比亚迪最近怎么样」'
      : sending
        ? 'AI 正在回复…'
        : '输入消息，Enter 发送，Shift+Enter 换行'

  return (
    <div className="flex flex-col h-full">
      {/* 演示中：顶部显示"第 N 幕 · 能力名"+ 跳过按钮 */}
      {phase === 'playing' && (
        <div className="shrink-0 border-b border-line/50 bg-panel/40">
          <EmptyHint
            phase="playing"
            sceneIndex={sceneIndex}
            sceneLabel={sceneLabel}
            sceneCount={sceneCount}
            onStart={start}
            onSkip={exitReplay}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {showStartScreen && (
            <EmptyHint
              phase="idle"
              sceneIndex={sceneIndex}
              sceneLabel={sceneLabel}
              sceneCount={sceneCount}
              onStart={start}
              onSkip={() => {}}
            />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 演示完毕：输入框上方出现引导条 */}
      {phase === 'done' && (
        <div className="shrink-0 border-t border-line/50 bg-panel/40 px-4">
          <div className="max-w-3xl mx-auto">
            <EmptyHint
              phase="done"
              sceneIndex={sceneIndex}
              sceneLabel={sceneLabel}
              sceneCount={sceneCount}
              onStart={() => {
                exitReplay()
                start()
              }}
              onSkip={exitReplay}
            />
          </div>
        </div>
      )}

      <InputBar sending={sending} onSend={handleSend} onAbort={abort} placeholder={placeholder} />

      {/* elicit 下单确认模态：回放期间也会弹出，数秒后自动关闭 */}
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
