import { useState, type KeyboardEvent } from 'react'

interface Props {
  sending: boolean
  onSend: (text: string) => void
  onAbort: () => void
}

export function InputBar({ sending, onSend, onAbort }: Props) {
  const [value, setValue] = useState('')

  const submit = () => {
    const text = value.trim()
    if (!text || sending) return
    onSend(text)
    setValue('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-panel/60 backdrop-blur px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <textarea
          className="flex-1 resize-none rounded-xl border border-line bg-ink/60 px-3 py-2 text-primary placeholder:text-muted outline-none focus:border-line2 transition-colors max-h-40"
          rows={1}
          placeholder={sending ? 'AI 正在回复…' : '输入消息，Enter 发送，Shift+Enter 换行'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        {sending ? (
          <button
            onClick={onAbort}
            className="shrink-0 h-10 px-4 rounded-xl border border-line text-secondary hover:bg-elevated transition-colors"
          >
            停止
          </button>
        ) : (
          <button
            onClick={submit}
            className="shrink-0 h-10 px-4 rounded-xl bg-brand text-black font-medium hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 transition"
            disabled={!value.trim()}
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
