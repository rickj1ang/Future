# Future Frontend

对接 `core-agent` 的 chat 前端。当前处于 demo 阶段，对应 `plan.md` 的实现进度。

## 架构（为 web / app 双端预留）

```
src/
├── main.tsx          # React 入口
├── App.tsx           # 平台分发（将来按 Capacitor.isNativePlatform() 选布局）
├── shared/           # 【平台无关】逻辑层，web 和 app 共用
│   ├── types.ts          # SSE 事件契约、消息类型（plan §2 §5）
│   ├── api/client.ts     # /chat (SSE) + /elicit/respond，纯 fetch 手写解析（plan §6）
│   └── hooks/useChat.ts  # 核心状态机（plan §4）：流式、防并发、历史维护
├── web/              # 【桌面端 UI】现在实现的就是这套
│   ├── layouts/DesktopLayout.tsx
│   └── components/       # ChatWindow / MessageBubble / InputBar / EmptyHint
└── app/              # 【手机端 UI】预留，见 app/README.md
```

> 想让手机端布局和桌面完全不同时，只需在 `app/` 加一套布局，
> 再在 `App.tsx` 切换即可；`shared/` 不用动。

## 当前进度（plan.md §7）

- [x] **第 1 步**：chat 骨架 + 输入框 + `text_delta` 流式显示 + done/error + 防并发 + 历史维护
- [ ] 第 2 步：`tool_call` / `tool_result` 徽章
- [ ] 第 3 步：`ui` 事件 → sandbox iframe 渲染 K 线
- [ ] 第 4 步：`elicit` 事件 → 确认弹窗 + 回传
- [ ] 第 5 步：倒计时提示 / 健壮性

> 注：`useChat` 里**所有 SSE 事件都已经在接收和入库**（parts），
> 第 2~4 步基本只动渲染层（`MessageBubble` + 新弹窗组件）。

## 开发

```bash
npm install
npm run dev      # http://localhost:5173
```

后端默认 `http://localhost:8081`。dev 时 `vite.config.ts` 已配 proxy，
前端请求 `/chat` 会自动转发，**无需后端开 CORS**。生产环境改 `.env` 里的 `VITE_CORE_AGENT_URL`。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查 + 打包 |
| `npm run typecheck` | 仅类型检查 |
