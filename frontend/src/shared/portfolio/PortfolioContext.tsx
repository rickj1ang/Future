// =====================================================================
// shared/portfolio/PortfolioContext.tsx
//
// 持仓 / 订单 的全局状态（跨平台逻辑）。
// 用 Context 暴露，这样：
//   - 左侧 PortfolioPanel 直接读取/撤单
//   - 将来 Agent 通过 elicit 下单成交后，也能从 useChat 里把新订单推进来
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  cancelOrder as apiCancelOrder,
  fetchOrders,
  fetchPositions,
} from '@shared/api/portfolio'
import type { Order, Position } from '@shared/types'

interface PortfolioValue {
  positions: Position[]
  orders: Order[]
  loading: boolean
  refresh: () => Promise<void>
  /** 撤单：调接口 + 即时把该订单状态改成 cancelled（不等 Agent） */
  cancelOrder: (id: string) => Promise<void>
  /**
   * 注入/更新一笔订单（来自 Agent 下单或撤单的 tool_result，见 order-sync.ts）。
   * 同 id 则覆盖，不同 id 则插到订单列表顶部。
   */
  upsertOrder: (o: Order) => void
}

const Ctx = createContext<PortfolioValue | null>(null)

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [p, o] = await Promise.all([fetchPositions(), fetchOrders()])
    setPositions(p)
    setOrders(o)
    setLoading(false)
  }, [])

  const cancelOrder = useCallback(async (id: string) => {
    await apiCancelOrder(id)
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o)),
    )
  }, [])

  const upsertOrder = useCallback((o: Order) => {
    setOrders((prev) => {
      const idx = prev.findIndex((x) => x.id === o.id)
      if (idx === -1) return [o, ...prev] // 新订单置顶
      const next = prev.slice()
      next[idx] = { ...prev[idx], ...o }
      return next
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Ctx.Provider value={{ positions, orders, loading, refresh, cancelOrder, upsertOrder }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePortfolio(): PortfolioValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePortfolio 必须用在 <PortfolioProvider> 内')
  return v
}
