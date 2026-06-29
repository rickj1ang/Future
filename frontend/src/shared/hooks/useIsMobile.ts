// =====================================================================
// shared/hooks/useIsMobile.ts —— 屏幕宽度检测，决定用桌面还是移动布局
//
// 用 matchMedia 监听，拖动浏览器窗口缩放能实时切换，方便调试。
// 将来用 Capacitor 打包成 App 时，再叠加 isNativePlatform() 即可。
// =====================================================================

import { useEffect, useState } from 'react'

export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return mobile
}
