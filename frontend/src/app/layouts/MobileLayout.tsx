import { useCallback, useRef, useState } from 'react'
import { ChatWindow } from '../../web/components/ChatWindow'
import { PortfolioPanel } from '../../web/components/PortfolioPanel'
import { Toaster, type Toast } from '../../web/components/Toaster'
import { TopDrawer } from '../components/TopDrawer'

/**
 * 移动端布局：
 *
 * - 顶栏：左侧品牌名，右侧一个下拉箭头按钮（▾）
 * - 点按钮：持仓/订单从顶部滑下（TopDrawer）
 * - 对话区占满主屏（Agent 为主）
 * - 输入框吸底（ChatWindow 自带）
 *
 * 持仓/订单按需调出，不常驻占空间（用户需求）。
 * 所有业务逻辑、SSE、下单确认、订单联动均复用 shared/。
 */
export function MobileLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const pushToast = useCallback((msg: string) => {
    const id = seq.current++
    setToasts((prev) => [...prev, { id, msg }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500)
  }, [])

  return (
    <div className="h-full w-full flex flex-col bg-ink">
      <header className="shrink-0 border-b border-line bg-panel/80 backdrop-blur">
        <div className="px-3 h-12 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="font-semibold tracking-wide text-primary">Future Agent</span>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="持仓与订单"
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:bg-elevated"
          >
            {/* 下拉箭头 ▾，提示「点开从上方拉下持仓/订单」 */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 7l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <ChatWindow />
      </main>

      <TopDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <PortfolioPanel onToast={pushToast} />
      </TopDrawer>

      <Toaster toasts={toasts} />
    </div>
  )
}
