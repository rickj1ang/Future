# app/ —— 手机端 UI（预留）

当前只实现了 web 桌面端（见 `../web`）。这个目录是为"手机端 UI 与桌面不同"预留的位置。

## 为什么分开

参考 plan.md 的定位，手机端的布局会明显不同，例如：

- 输入框吸底、键盘弹起时跟随
- K 线图（`ui` 事件）改成全屏弹层而非侧栏
- 对话气泡宽度铺满，而非 `max-w-3xl` 居中

但**核心逻辑完全一样**（SSE 解析、`/chat`、`/elicit/respond`、`useChat` 状态机），
所以 `shared/` 是两边共用的，本目录只放"长得不一样"的布局和组件。

## 将来做手机端的步骤

1. 安装 Capacitor：`npm i @capacitor/core`
2. 在这里加 `layouts/MobileLayout.tsx` 及其专属组件（如 `BottomInputBar`）
3. 在 `src/App.tsx` 按平台切换：

   ```tsx
   import { Capacitor } from '@capacitor/core'
   const isNative = Capacitor.isNativePlatform()
   return isNative ? <MobileLayout /> : <DesktopLayout />
   ```

4. `shared/` 一行都不用动 —— 这正是当初把逻辑拆到 `shared/` 的目的。
