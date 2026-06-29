export function EmptyHint() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line text-muted text-[11px] uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
        Future Agent
      </div>
      <p className="mt-5 text-sm text-secondary">
        输入消息开始对话，例如<span className="text-primary">「看看茅台」</span>
      </p>
    </div>
  )
}
