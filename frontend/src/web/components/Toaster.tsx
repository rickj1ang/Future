export interface Toast {
  id: number
  msg: string
}

/** 顶部居中的轻量提示条（demo 级，无第三方库）。 */
export function Toaster({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-lg border border-line2 bg-elevated2/95 backdrop-blur text-primary text-sm px-4 py-2 shadow-xl shadow-black/40"
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}
