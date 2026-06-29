interface Props {
  replaying: boolean
  sceneIndex: number
  sceneCount: number
  onStartReplay: () => void
  onSkipReplay: () => void
}

/**
 * 空状态条。
 *
 * 三种状态：
 * 1. 未回放 + 无消息：显示品牌 + "观看演示"按钮
 * 2. 回放中：顶部薄条显示"演示进行中"+ "我来试试"跳过按钮
 * 3. 回放结束/跳过后：不再渲染（消息列表已有内容）
 */
export function EmptyHint({ replaying, sceneIndex, sceneCount, onStartReplay, onSkipReplay }: Props) {
  if (replaying) {
    return (
      <div className="flex items-center justify-center gap-3 py-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          演示进行中
          {sceneCount > 0 && (
            <span className="text-secondary">
              · 第 {Math.max(1, sceneIndex + 1)} / {sceneCount} 幕
            </span>
          )}
        </span>
        <button
          onClick={onSkipReplay}
          className="px-2 py-0.5 rounded border border-line text-secondary hover:bg-elevated transition-colors"
        >
          我来试试 ✈
        </button>
      </div>
    )
  }

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
        onClick={onStartReplay}
        className="mt-6 px-5 py-2 rounded-xl bg-brand text-black font-medium text-sm hover:brightness-110 transition"
      >
        ▶ 观看演示
      </button>
      <p className="mt-3 text-[11px] text-muted">或直接输入消息开始对话</p>
    </div>
  )
}
