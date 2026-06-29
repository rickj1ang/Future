// =====================================================================
// shared/order-sync.ts —— 从 SSE tool_result 解析订单，注入左侧 store
//
// 背景：后端 place_order 成功后，tool_result.summary 里嵌套了完整订单 JSON
// （见 mcp-server/internal/tools/place_order.go 的 output；core-agent 把
// ToolResult.Text 当 summary 透传）。core-agent 没有独立的 /orders 接口，
// 所以前端直接从这条已经流过来的事件里"白嫖"订单数据，零新增请求。
//
// 同理 cancel_order 成功后 summary 也会有订单（status=canceled）。
// =====================================================================

import type { Order, OrderSide, OrderStatus, OrderType } from '@shared/types'

/** 后端 mcp-server 的 Order 结构（见 tools/types.go） */
interface BackendOrder {
  id: string
  code: string
  name?: string
  direction: 'buy' | 'sell'
  price: number
  quantity: number
  type: 'limit' | 'market'
  status: 'pending' | 'filled' | 'canceled' // 注意后端是 canceled（单 l）
  created_at?: string
}

/**
 * 尝试从 tool_result.summary 解析出订单。
 * summary 形如 `{"order":{...}}`（PlaceOrderOutput 的 JSON）。
 * 解析失败返回 null（绝大多数 tool_result 不是下单，正常返回 null）。
 */
export function parseOrderFromSummary(
  toolName: string,
  summary: string,
): Order | null {
  if (toolName !== 'place_order' && toolName !== 'cancel_order') return null
  if (!summary) return null
  let outer: unknown
  try {
    outer = JSON.parse(summary)
  } catch {
    return null
  }
  const raw = (outer as { order?: BackendOrder })?.order
  if (!raw || !raw.id) return null
  return normalizeOrder(raw)
}

/** 后端 Order → 前端 Order（字段映射 + status 拼写统一为 cancelled） */
function normalizeOrder(o: BackendOrder): Order {
  return {
    id: o.id,
    code: o.code,
    name: o.name || o.code,
    side: o.direction as OrderSide,
    type: o.type as OrderType,
    price: o.price,
    quantity: o.quantity,
    filled: o.status === 'filled' ? o.quantity : 0,
    status: normalizeStatus(o.status),
    time: formatTime(o.created_at),
  }
}

function normalizeStatus(s: BackendOrder['status']): OrderStatus {
  switch (s) {
    case 'pending':
      return 'pending'
    case 'filled':
      return 'filled'
    case 'canceled':
      return 'cancelled' // 前端统一用 cancelled（双 l）
  }
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
