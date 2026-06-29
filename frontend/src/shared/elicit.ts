// =====================================================================
// shared/elicit.ts —— elicit message 解析（平台无关）
//
// 后端 place_order.go 的 message 格式固定为：
//   确认下单：{code} {direction} {quantity} 股 {type}，价格 {price}
// 后端 schema 只描述字段类型、不给 default 初始值，
// 所以表单初始值只能从这里解析。
// =====================================================================

import type { OrderSide, OrderType } from '@shared/types'

export interface OrderDraft {
  code: string
  direction: OrderSide
  price: number
  quantity: number
  type: OrderType
}

const RE = /确认下单：(.+?)\s+(buy|sell)\s+(\d+)\s+股\s+(limit|market)，价格\s+([\d.]+)/

/** 从 elicit message 解析表单初始值。解析失败返回 null（由 UI 兜底默认）。 */
export function parseElicitMessage(message: string): OrderDraft | null {
  const m = RE.exec(message)
  if (!m) return null
  const [, code, direction, quantity, type, price] = m
  return {
    code: code.trim(),
    direction: direction as OrderSide,
    quantity: parseInt(quantity, 10),
    type: type as OrderType,
    price: parseFloat(price),
  }
}
