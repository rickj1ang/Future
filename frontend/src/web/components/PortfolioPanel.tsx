import { usePortfolio } from '@shared/portfolio/PortfolioContext'
import { isCancellable, type Order, type Position } from '@shared/types'

/**
 * 左侧常驻面板：持仓 + 订单。
 * 这些是「不依赖 Agent、用户直接操作」的功能，尤其撤单必须能一键完成、
 * 不能等 Agent 走一轮对话（见用户需求）。
 *
 * 数据来自 PortfolioContext（mock，见 shared/api/portfolio.ts）。
 */
export function PortfolioPanel({ onToast }: { onToast: (msg: string) => void }) {
  const { positions, orders, loading, cancelOrder } = usePortfolio()

  const handleCancel = async (o: Order) => {
    await cancelOrder(o.id)
    onToast(`已提交撤单：${o.name} ${o.side === 'buy' ? '买' : '卖'} ${o.quantity}股`)
  }

  return (
    <div className="p-3 space-y-5">
      {/* 持仓 */}
      <section>
        <h2 className="flex items-center gap-2 text-[11px] font-semibold text-secondary uppercase tracking-wider mb-2">
          持仓
          <span className="text-muted normal-case">({positions.length})</span>
        </h2>
        {loading ? (
          <SkeletonRows n={3} />
        ) : positions.length === 0 ? (
          <Empty text="暂无持仓" />
        ) : (
          <div className="space-y-2">
            {positions.map((p) => (
              <PositionCard key={p.code} p={p} />
            ))}
          </div>
        )}
      </section>

      {/* 订单 */}
      <section>
        <h2 className="flex items-center gap-2 text-[11px] font-semibold text-secondary uppercase tracking-wider mb-2">
          订单
          <span className="text-muted normal-case">({orders.length})</span>
        </h2>
        {loading ? (
          <SkeletonRows n={3} />
        ) : orders.length === 0 ? (
          <Empty text="暂无订单" />
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <OrderCard key={o.id} o={o} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------- 持仓卡片 ----------------
function PositionCard({ p }: { p: Position }) {
  const pnl = (p.currentPrice - p.costPrice) * p.quantity
  const pnlPct = (p.currentPrice / p.costPrice - 1) * 100
  const pnlColor = pnl > 0 ? 'text-up' : pnl < 0 ? 'text-down' : 'text-secondary'

  return (
    <div className="rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm hover:border-line2 transition-colors">
      <div className="flex items-center justify-between">
        <div className="font-medium text-primary">
          {p.name}
          <span className="ml-1.5 text-xs text-muted">{p.code}</span>
        </div>
        <div className={`text-xs tabular-nums ${pnlColor}`}>
          {pnl >= 0 ? '+' : ''}
          {pnl.toFixed(2)}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-secondary tabular-nums">
        <span>
          持 <span className="text-primary">{p.quantity}</span>
          <span className="text-muted"> · 可用 {p.available}</span>
        </span>
        <span>
          成本 {p.costPrice.toFixed(2)} · 现 {p.currentPrice.toFixed(2)}
        </span>
      </div>
      <div className={`mt-0.5 text-right text-xs tabular-nums ${pnlColor}`}>
        {pnlPct >= 0 ? '+' : ''}
        {pnlPct.toFixed(2)}%
      </div>
    </div>
  )
}

// ---------------- 订单卡片 ----------------
function OrderCard({
  o,
  onCancel,
}: {
  o: Order
  onCancel: (o: Order) => void
}) {
  const sideText = o.side === 'buy' ? '买' : '卖'
  const sideColor = o.side === 'buy' ? 'text-up' : 'text-down'
  const { text: statusText, cls: statusCls } = statusView(o.status)
  const cancellable = isCancellable(o.status)

  return (
    <div className="rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm hover:border-line2 transition-colors">
      <div className="flex items-center justify-between">
        <div className="font-medium text-primary">
          {o.name}
          <span className="ml-1.5 text-xs text-muted">{o.code}</span>
        </div>
        <span className={`text-xs ${statusCls}`}>{statusText}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-secondary tabular-nums">
        <span className={`font-medium ${sideColor}`}>{sideText}</span>
        <span>
          <span className="text-primary">{o.filled}</span>/{o.quantity}股 @ {o.price.toFixed(2)}
        </span>
        <span className="text-muted">
          {o.type === 'limit' ? '限价' : '市价'}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-muted tabular-nums">{o.time}</span>
        {cancellable && (
          <button
            onClick={() => onCancel(o)}
            className="text-xs px-2 py-0.5 rounded border border-line text-secondary hover:border-up hover:text-up transition-colors"
          >
            撤单
          </button>
        )}
      </div>
    </div>
  )
}

function statusView(status: Order['status']): { text: string; cls: string } {
  switch (status) {
    case 'pending':
      return { text: '待成交', cls: 'text-brand' }
    case 'partial':
      return { text: '部分成交', cls: 'text-brand' }
    case 'filled':
      return { text: '已成', cls: 'text-secondary' }
    case 'cancelled':
      return { text: '已撤', cls: 'text-muted' }
    case 'rejected':
      return { text: '废单', cls: 'text-up' }
  }
}

// ---------------- 小工具 ----------------
function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-elevated animate-pulse" />
      ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted py-4 text-center">{text}</div>
}
