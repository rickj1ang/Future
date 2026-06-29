import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from '@shared/types'
import { ChartFrame } from './ChartFrame'

/**
 * 单条消息气泡。
 *
 * 渲染规则（按用户要求）：
 * - 不显示 tool_call / tool_result：用户不需要看到中间过程
 * - AI 回复的文本走 markdown（标题/列表/粗体/代码块等）
 * - `ui` 事件（K 线图等）渲染为 sandbox iframe
 *
 * 顺序：图先于文字到达（实测：tool_call → ui → tool_result → text_delta），
 * 所以图放在文字上方，最贴合流式到达顺序。
 */
export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const charts = message.parts.filter((p) => p.kind === 'ui')

  const bubbleCls = [
    'max-w-[85%] rounded-2xl px-4 py-2.5',
    isUser
      ? 'bg-elevated2 text-primary border border-line2'
      : message.status === 'error'
        ? 'bg-[#2a1416] text-up border border-up/40'
        : 'bg-elevated text-primary border border-line',
  ].join(' ')

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={bubbleCls}>
        {/* 图表（仅 AI 消息）。图先到达 → 放在文字上方 */}
        {!isUser && charts.length > 0 && (
          <div className="flex flex-col gap-3 mb-2 overflow-hidden rounded-lg">
            {charts.map((c, i) => (
              <ChartFrame key={i} part={c} />
            ))}
          </div>
        )}

        {/* 文本 */}
        {isUser ? (
          <span className="whitespace-pre-wrap break-words">{message.text}</span>
        ) : message.status === 'error' ? (
          <span className="whitespace-pre-wrap break-words">{message.text}</span>
        ) : message.text ? (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-pre:my-2 prose-pre:bg-ink prose-pre:border prose-pre:border-line prose-code:text-brand prose-a:text-brand prose-strong:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </div>
        ) : message.status === 'streaming' ? (
          <span className="text-secondary animate-[pulse_2s_ease-in-out_infinite]">
            思考中…
          </span>
        ) : null}
      </div>
    </div>
  )
}
