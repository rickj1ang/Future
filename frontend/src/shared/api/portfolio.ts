// =====================================================================
// shared/api/portfolio.ts —— 持仓 / 订单 / 撤单 数据源
//
// ⚠️ MOCK 实现：后端 core-agent 目前只有 /chat、/elicit/respond、/health
//    （见 plan.md），暂无持仓/订单 REST 接口。
//
// 将来后端补上后，把下面三个函数体换成 fetch 即可，
// 上层（PortfolioContext / 组件）完全不用改。
//
// 建议的后端契约（供后端参考）：
//   GET  /positions        -> Position[]
//   GET  /orders           -> Order[]
//   POST /orders/:id/cancel -> 204
// =====================================================================

import type { Order, Position } from '@shared/types'

const MOCK_POSITIONS: Position[] = [
  {
    code: '600519',
    name: '贵州茅台',
    quantity: 200,
    available: 200,
    costPrice: 1700.0,
    currentPrice: 1816.5,
  },
  {
    code: '300750',
    name: '宁德时代',
    quantity: 100,
    available: 100,
    costPrice: 210.0,
    currentPrice: 198.5,
  },
  {
    code: '000858',
    name: '五粮液',
    quantity: 500,
    available: 0, // 全部冻结（挂单中）
    costPrice: 165.0,
    currentPrice: 172.3,
  },
]

const MOCK_ORDERS: Order[] = [
  {
    id: '20260629-100023',
    code: '600519',
    name: '贵州茅台',
    side: 'buy',
    type: 'limit',
    price: 1800.0,
    quantity: 100,
    filled: 0,
    status: 'pending',
    time: '14:32:05',
  },
  {
    id: '20260629-100024',
    code: '300750',
    name: '宁德时代',
    side: 'sell',
    type: 'limit',
    price: 205.0,
    quantity: 200,
    filled: 80,
    status: 'partial',
    time: '14:35:12',
  },
  {
    id: '20260629-100020',
    code: '000858',
    name: '五粮液',
    side: 'buy',
    type: 'limit',
    price: 165.0,
    quantity: 500,
    filled: 500,
    status: 'filled',
    time: '09:35:20',
  },
  {
    id: '20260629-100018',
    code: '600519',
    name: '贵州茅台',
    side: 'sell',
    type: 'market',
    price: 1810.0,
    quantity: 50,
    filled: 0,
    status: 'cancelled',
    time: '09:30:01',
  },
]

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchPositions(): Promise<Position[]> {
  await delay(200)
  return structuredClone(MOCK_POSITIONS)
}

export async function fetchOrders(): Promise<Order[]> {
  await delay(200)
  return structuredClone(MOCK_ORDERS)
}

/** 撤单。mock 下只做延迟；真实接口应 POST /orders/:id/cancel。 */
export async function cancelOrder(_id: string): Promise<void> {
  await delay(150)
}
