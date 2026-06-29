// =====================================================================
// shared/types.ts —— 与平台无关的类型定义，web 和 app 共用
// 严格对应 plan.md §2 的事件契约
// =====================================================================

// ---------- 对话历史（回传给后端）----------
// 多轮 tool-calling 必须把 assistant 的 tool_calls 和对应的 tool 结果
// 一起回传，否则 LLM 看不到“上轮我用工具完成了任务”，会被自己的
// 文字回复带偏（例如重复用文字模拟下单而不调 place_order）。
// 注意：ui 事件的 HTML 绝不进历史（体积大 + 不可信）；只回灌文字摘要。
export type Role = 'user' | 'assistant'

// ToolCallRef 是历史里 assistant 消息携带的工具调用（arguments 为 JSON 字符串，
// 与 OpenAI 协议 / 后端 provider.ToolCall 对齐）。
export interface ToolCallRef {
  id: string
  name: string
  arguments: string
}

export interface ChatMessage {
  role: Role | 'tool'
  content: string
  tool_calls?: ToolCallRef[] // 仅 role=assistant
  tool_call_id?: string // 仅 role=tool，关联上条 assistant 的某个 tool_call
  name?: string // 仅 role=tool，工具名
}

// ---------- SSE 事件契约（见 plan §2）----------
export interface TextDeltaEvent {
  event: 'text_delta'
  data: { text: string }
}
export interface ToolCallEvent {
  event: 'tool_call'
  data: { id: string; name: string; arguments: unknown }
}
export interface ToolResultEvent {
  event: 'tool_result'
  data: { name: string; summary: string; isError?: boolean }
}
export interface UIEvent {
  event: 'ui'
  data: { html: string; meta?: unknown }
}
export interface ElicitEvent {
  event: 'elicit'
  data: { id: string; message: string; schema: unknown }
}
export interface DoneEvent {
  event: 'done'
  data: Record<string, never>
}
export interface ErrorEvent {
  event: 'error'
  data: { message: string }
}

export type SSEEvent =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | UIEvent
  | ElicitEvent
  | DoneEvent
  | ErrorEvent

// ---------- UI 消息（前端渲染用，与历史分离）----------
export interface ToolPart {
  kind: 'tool'
  id: string
  name: string
  arguments: unknown
  result?: { summary: string; isError?: boolean }
}

export interface UIPart {
  kind: 'ui'
  html: string
  meta?: unknown
}

export type MessagePart = ToolPart | UIPart

export interface UIMessage {
  id: string
  role: Role
  text: string
  parts: MessagePart[]
  status: 'streaming' | 'done' | 'error'
}

// ---------- 持仓 / 订单（左侧常驻面板，独立于 Agent）----------
// 这部分是「不依赖 Agent、用户直接操作」的功能（如紧急撤单），
// 常驻在左侧。后端暂无 REST 接口，前端用 mock（见 shared/api/portfolio.ts）。
export interface Position {
  code: string // 证券代码，如 "600519"
  name: string // 名称
  quantity: number // 持仓总数（股）
  available: number // 可用数量（未冻结）
  costPrice: number // 成本价
  currentPrice: number // 现价
}

export type OrderSide = 'buy' | 'sell'
export type OrderType = 'limit' | 'market'
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled' | 'rejected'

export interface Order {
  id: string // 委托单号
  code: string
  name: string
  side: OrderSide
  type: OrderType
  price: number // 委托价（市价单为触发参考价）
  quantity: number // 委托数量
  filled: number // 已成交数量
  status: OrderStatus
  time: string // 显示用字符串，如 "14:32:05"
}

// 可撤单状态：待成交 / 部分成交
export function isCancellable(status: OrderStatus): boolean {
  return status === 'pending' || status === 'partial'
}

// ---------- elicit 下单确认（plan §3.4 / §4）----------
// elicit 事件携带的载荷；useChat 的 pendingElicit 状态即此类型。
export type PendingElicit = ElicitEvent['data']
