import { useCallback, useRef, useState } from 'react'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { ChatWindow } from '../components/ChatWindow'
import { Toaster, type Toast } from '../components/Toaster'

/**
 * 桌面布局（两栏）：
 *
 *   ┌────────────────────────────────────────────┐
 *   │ header                                      │
 *   ├──────────┬─────────────────────────────────┤
 *   │ 持仓/订单 │  对话区（Agent 主交互）          │
 *   │ 常驻面板  │                                  │
 *   └──────────┴─────────────────────────────────┘
 *
 * - 左侧：不依赖 Agent 的常用功能（持仓、订单、一键撤单）
 * - 右侧：Agent 对话（主交互）
 *
 * 手机端（src/app/layouts/MobileLayout.tsx，待实现）会是另一套布局，
 * 例如持仓/订单收进底部 Tab 或抽屉、对话全屏；两边共用 shared/ 的逻辑。
 */
export function DesktopLayout() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const pushToast = useCallback((msg: string) => {
    const id = seq.current++
    setToasts((prev) => [...prev, { id, msg }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500)
  }, [])

  return (
    <div className="h-full w-full flex flex-col bg-ink">
      <header className="shrink-0 border-b border-line bg-panel/60 backdrop-blur">
        <div className="px-4 h-12 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="font-semibold tracking-wide text-primary">Future Agent</span>
          <span className="ml-1 text-[11px] text-muted uppercase tracking-wider">desktop</span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* 左侧常驻面板 */}
        <aside className="w-80 shrink-0 border-r border-line bg-panel overflow-y-auto">
          <PortfolioPanel onToast={pushToast} />
        </aside>

        {/* 右侧对话区 */}
        <main className="flex-1 min-h-0">
          <ChatWindow />
        </main>
      </div>

      <Toaster toasts={toasts} />
    </div>
  )
}
