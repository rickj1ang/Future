import type { UIPart } from '@shared/types'

/**
 * 渲染 `ui` 事件返回的 HTML（K 线图等）。见 plan §3.3 / §9.1。
 *
 * 安全要点（务必遵守）：
 * - sandbox 只含 allow-scripts，不含 allow-same-origin —— HTML 按不可信处理
 * - 用 srcDoc 注入，referrer 不外泄
 *
 * 图表 HTML 内部用 lightweight-charts 的 autoSize 撑满 body，
 * 所以这里给固定高度即可（plan §9.6）。
 *
 * 背景透明，让深色气泡透出，融入暗色主题。
 */
export function ChartFrame({ part }: { part: UIPart }) {
  return (
    <iframe
      title="图表"
      srcDoc={part.html}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="w-full rounded-lg border border-line bg-white"
      style={{ height: 400 }}
    />
  )
}
