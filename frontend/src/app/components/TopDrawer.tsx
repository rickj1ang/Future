import { useEffect, useState, type ReactNode } from 'react'

/**
 * 从顶部滑下的抽屉（移动端用）。
 *
 * 交互：
 * - 进入：遮罩淡入 + 抽屉 translateY(-100% → 0)，缓动 .32s
 * - 退出：反向，过渡结束才卸载（保证退出动画播完）
 * - 关闭：右上角 ✕ / 点遮罩 / ESC
 * - 打开期间锁住背景滚动
 *
 * 顶部留一条「抓手」视觉，提示可下拉（手势关闭是后续增强项）。
 */
export function TopDrawer({
  open,
  onClose,
  children,
  title = '持仓 & 订单',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [enter, setEnter] = useState(false)

  // open 由 false→true：先挂载，下一帧再触发进入动画（让 transition 生效）
  // open 由 true→false：只翻转 enter，等退出过渡结束再卸载
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => setEnter(true))
      return () => cancelAnimationFrame(r)
    }
    setEnter(false)
  }, [open])

  // 背景滚动锁 + ESC 关闭
  useEffect(() => {
    if (!mounted) return
    document.body.style.overflow = 'hidden'
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', h)
    }
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: enter ? 1 : 0 }}
        onClick={onClose}
      />

      {/* 抽屉主体 */}
      <div
        onTransitionEnd={() => {
          if (!open && !enter) setMounted(false)
        }}
        className="absolute inset-x-0 top-0 h-full bg-panel rounded-b-2xl shadow-2xl shadow-black/50 flex flex-col"
        style={{
          transform: enter ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform .32s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* 抓手 + 标题 + 关闭 */}
        <div className="shrink-0">
          <div className="mx-auto mt-2.5 w-10 h-1 rounded-full bg-line2" />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-primary font-medium">{title}</span>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="h-px bg-line" />
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
