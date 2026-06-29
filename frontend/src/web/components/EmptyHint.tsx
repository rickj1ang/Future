import type { ReplayPhase } from '@shared/hooks/useReplay'

interface Props {
  phase: ReplayPhase
  sceneIndex: number
  sceneLabel: string
  sceneCount: number
  onStart: () => void        // 开始/重新观看演示
  onSkip: () => void         // 跳过 → 进入真实交互
}

// 录制时的短标签 → 演示时的人类可读能力名
const LABEL_PRETTY: Record<string, string> = {
  行情: '查询行情 · K 线图',
  下单: '自然语言下单',
  查单: '查询订单',
  撤单: '撤销订单',
}

/**
 * 三态横幅组件（由 ChatWindow 决定渲染位置）：
 *
 *   idle    首屏欢迎：品牌 + "▶ 观看演示"
 *   playing 顶部薄条："第 N 幕 · {能力}" + "我来试试"
 *   done    底部引导："演示完毕 ↑ 试试问我别的" + "重新观看"
 */
export function EmptyHint({ phase, sceneIndex, sceneLabel, sceneCount, onStart, onSkip }: Props) {
  if (phase === 'playing') {
    const pretty = LABEL_PRETTY[sceneLabel] ?? sceneLabel
    return (
      <div className="flex items-center justify-center gap-3 py-2.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          演示进行中
          {sceneCount > 0 && sceneIndex >= 0 && (
            <span className="text-secondary">
              · 第 {sceneIndex + 1} / {sceneCount} 幕{pretty ? ` · ${pretty}` : ''}
            </span>
          )}
        </span>
        <button
          onClick={onSkip}
          className="px-2 py-0.5 rounded border border-line text-secondary hover:bg-elevated transition-colors"
        >
          我来试试 ✈
        </button>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 px-1 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-brand/60" />
          <span className="text-secondary">演示完毕</span>
          · 试试问我别的股票，或任何想做的操作
        </span>
        <button
          onClick={onStart}
          className="shrink-0 px-2 py-0.5 rounded border border-line text-secondary hover:bg-elevated transition-colors"
        >
          重新观看 ↻
        </button>
      </div>
    )
  }

  // idle：首屏
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line text-muted text-[11px] uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
        Future Agent
      </div>
      <p className="mt-5 text-sm text-secondary">
        A 股交易 Agent · 行情 / 下单 / 查单 / 撤单
      </p>
      <button
        onClick={onStart}
        className="mt-6 px-5 py-2 rounded-xl bg-brand text-black font-medium text-sm hover:brightness-110 transition"
      >
        ▶ 观看演示
      </button>
      <p className="mt-3 text-[11px] text-muted">或直接输入消息开始对话</p>
    </div>
  )
}
