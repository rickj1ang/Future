import { DesktopLayout } from './web/layouts/DesktopLayout'
import { MobileLayout } from './app/layouts/MobileLayout'
import { PortfolioProvider } from '@shared/portfolio/PortfolioContext'
import { useIsMobile } from '@shared/hooks/useIsMobile'

/**
 * 平台入口。
 *
 * 桌面/移动按屏幕宽度切换（useIsMobile），拖动窗口缩放即可实时切换，
 * 方便调试。将来用 Capacitor 打包 App 时，再叠加原生判断：
 *
 *   import { Capacitor } from '@capacitor/core'
 *   const isNative = Capacitor.isNativePlatform()
 *   const layout = isNative || isMobile ? <MobileLayout/> : <DesktopLayout/>
 *
 * 两套布局共用 shared/（useChat / API / 持仓订单 store / 下单解析）。
 */
export default function App() {
  // PortfolioProvider 放顶层：web / app 两套布局都共用同一个持仓订单 store
  const isMobile = useIsMobile()
  return (
    <PortfolioProvider>{isMobile ? <MobileLayout /> : <DesktopLayout />}</PortfolioProvider>
  )
}
