import { useEffect, useMemo, useRef, useState } from 'react'
import { parseElicitMessage, type OrderDraft } from '@shared/elicit'
import type { PendingElicit } from '@shared/types'

interface Props {
  elicit: PendingElicit
  /** 确认下单，回传完整 5 字段 content（见 place_order.go） */
  onAccept: (content: Record<string, unknown>) => void
  /** 拒绝 */
  onDecline: () => void
  /** 前端倒计时归零（后端会自行 cancel） */
  onExpire: () => void
}

const DEFAULT_DRAFT: OrderDraft = {
  code: '',
  direction: 'buy',
  price: 0,
  quantity: 100,
  type: 'limit',
}

/** 与后端 elicit 超时一致（plan §9.3） */
const ELICIT_TIMEOUT = 60

/**
 * 下单确认模态（plan §3.4）。券商风格交易面板：
 * 买卖方向 / 限价市价 / 价格(输入+滑块) / 数量(stepper+快捷档) / 试算 / 倒计时。
 */
export function ElicitOrderPanel({ elicit, onAccept, onDecline, onExpire }: Props) {
  const parsed = useMemo(() => parseElicitMessage(elicit.message), [elicit.message])
  const refPrice = parsed?.price ?? 0
  const [draft, setDraft] = useState<OrderDraft>(() => parsed ?? DEFAULT_DRAFT)

  const isLimit = draft.type === 'limit'
  const isBuy = draft.direction === 'buy'

  // ---- 倒计时（与后端 60s 同步）----
  const [remaining, setRemaining] = useState(ELICIT_TIMEOUT)
  const expiredRef = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => r - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true
      onExpire()
    }
  }, [remaining, onExpire])

  // ---- 试算金额：限价用编辑价，市价用参考价 ----
  const estAmount = (isLimit ? draft.price : refPrice) * draft.quantity

  // ---- 数量按手（100股）对齐 ----
  const stepQty = (delta: number) =>
    setDraft((d) => ({
      ...d,
      quantity: Math.max(100, Math.round((d.quantity + delta) / 100) * 100),
    }))

  // 滑块范围：围绕参考价 ±10%（A 股涨跌停）
  const min = +(refPrice * 0.9).toFixed(2)
  const max = +(refPrice * 1.1).toFixed(2)

  const handleAccept = () => {
    onAccept({
      code: draft.code,
      direction: draft.direction,
      price: draft.price,
      quantity: draft.quantity,
      type: draft.type,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-[400px] max-w-full rounded-2xl border border-line2 bg-panel shadow-2xl shadow-black/50">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-primary font-medium">
              {draft.code || '下单'} 确认
            </span>
          </div>
          <span className={`text-xs tabular-nums ${remaining <= 10 ? 'text-up' : 'text-muted'}`}>
            {Math.max(0, remaining)}s 后自动取消
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* 买卖方向 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDraft((d) => ({ ...d, direction: 'buy' }))}
              className={dirBtn(isBuy, true)}
            >
              买入
            </button>
            <button
              onClick={() => setDraft((d) => ({ ...d, direction: 'sell' }))}
              className={dirBtn(!isBuy, false)}
            >
              卖出
            </button>
          </div>

          {/* 订单类型 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-secondary w-14">类型</span>
            <button
              onClick={() => setDraft((d) => ({ ...d, type: 'limit' }))}
              className={typeBtn(isLimit)}
            >
              限价
            </button>
            <button
              onClick={() => setDraft((d) => ({ ...d, type: 'market' }))}
              className={typeBtn(!isLimit)}
            >
              市价
            </button>
          </div>

          {/* 价格 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-secondary w-14">价格</span>
              <input
                type="number"
                disabled={!isLimit}
                value={Number.isFinite(draft.price) ? draft.price : 0}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, price: parseFloat(e.target.value) || 0 }))
                }
                className={inputCls(!isLimit) + ' w-28'}
              />
              {refPrice > 0 && (
                <span className="text-xs text-muted">参考 {refPrice.toFixed(2)}</span>
              )}
            </div>
            {isLimit && refPrice > 0 && (
              <input
                type="range"
                min={min}
                max={max}
                step={0.01}
                value={Math.min(max, Math.max(min, draft.price))}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, price: parseFloat(e.target.value) }))
                }
                className="w-full accent-brand"
              />
            )}
          </div>

          {/* 数量 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-secondary w-14">数量</span>
              <div className="flex items-center gap-1">
                <button onClick={() => stepQty(-100)} className={qtyStepBtn}>
                  −
                </button>
                <input
                  type="number"
                  value={draft.quantity}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      quantity: Math.max(100, parseInt(e.target.value) || 100),
                    }))
                  }
                  className={inputCls(false) + ' w-20 text-center'}
                />
                <button onClick={() => stepQty(100)} className={qtyStepBtn}>
                  +
                </button>
              </div>
              <span className="text-xs text-muted">股</span>
            </div>
            <div className="flex gap-2">
              {[100, 500, 1000].map((q) => (
                <button
                  key={q}
                  onClick={() => setDraft((d) => ({ ...d, quantity: q }))}
                  className="flex-1 text-xs py-1 rounded border border-line text-secondary hover:border-line2"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* 试算 */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-ink/60 text-sm">
            <span className="text-secondary">预计金额</span>
            <span className="text-primary tabular-nums">
              ¥{estAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex gap-2 p-4 border-t border-line">
          <button
            onClick={onDecline}
            className="flex-1 h-11 rounded-xl border border-line text-secondary hover:bg-elevated"
          >
            拒绝
          </button>
          <button
            onClick={handleAccept}
            className={`flex-1 h-11 rounded-xl font-medium text-black hover:brightness-110 ${
              isBuy ? 'bg-up' : 'bg-down'
            }`}
          >
            确认{isBuy ? '买入' : '卖出'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- 样式 ----
const inputCls = (disabled: boolean) =>
  `rounded-lg border border-line bg-ink/60 px-3 py-1.5 text-primary tabular-nums outline-none focus:border-line2 disabled:opacity-50 ${
    disabled ? 'cursor-not-allowed' : ''
  }`
const qtyStepBtn =
  'w-8 h-8 rounded-lg border border-line text-secondary hover:bg-elevated hover:border-line2'

function dirBtn(active: boolean, isBuy: boolean): string {
  return [
    'h-10 rounded-xl border text-sm font-medium transition-colors',
    active
      ? isBuy
        ? 'border-up text-up bg-up/10'
        : 'border-down text-down bg-down/10'
      : 'border-line text-secondary hover:border-line2',
  ].join(' ')
}

function typeBtn(active: boolean): string {
  return [
    'px-3 py-1 rounded-lg border text-xs transition-colors',
    active
      ? 'border-brand text-brand bg-brand/10'
      : 'border-line text-secondary hover:border-line2',
  ].join(' ')
}
