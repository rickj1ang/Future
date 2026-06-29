# 前端实现计划

对接 `core-agent`（默认 `http://localhost:8081`），做一个能对话、能看 K 线、能确认下单的最小可用 chat 界面。demo 阶段，不要求功能完备。

---

## 0. 定位

**前端做什么**
- 一个 chat 界面：用户输入消息、看 AI 流式回复
- 消费 core-agent 的 SSE 流，按事件类型渲染不同的 UI（文本/图表/确认框）
- 维护对话历史（demo 无服务端记忆，前端是唯一的上下文来源）
- 对 `ui://` 返回的 HTML 用 sandbox iframe 渲染
- 对 `elicit` 事件弹出确认框，用户可改参数后回传

**前端不做什么（demo）**
- 不做多用户/登录
- 不做历史持久化（刷新即丢，可接受）
- 不做复杂图表交互的二次开发（图表 HTML 由 mcp-server 生成，前端只负责装进 iframe）
- 不做移动端适配（桌面优先）
- 不做错误重试/断线重连（出错就提示）

---

## 1. 需要消费的后端接口（已实现，照契约调）

### `POST /chat`（SSE 流）
请求体：
```json
{ "messages": [{"role":"user","content":"看看茅台"}, ...] }
```
响应：`Content-Type: text/event-stream`，事件流见下。

### `POST /elicit/respond`（普通 POST，回传确认）
请求体：
```json
{
  "id": "elicit_xxx",        // 从 SSE 的 elicit 事件里拿
  "action": "accept",        // accept | decline | cancel
  "content": {               // 仅 accept 时，用户确认/修改后的参数
    "code":"600519","direction":"buy","price":1700,"quantity":100,"type":"limit"
  }
}
```
响应：`204 No Content`（成功）或 `404`（id 过期/不存在）。

### `GET /health`（健康检查，可选）

---

## 2. SSE 事件类型 & 前端处理

| 事件 | data 字段 | 前端行为 |
|---|---|---|
| `text_delta` | `{text}` | 累加到"当前 AI 回复气泡"，逐字显示 |
| `tool_call` | `{id,name,arguments}` | 在当前 AI 气泡内显示一个灰色徽章："🔧 调用 query_kline…"（带参数预览） |
| `tool_result` | `{name,summary,isError}` | 在 tool 徽章下方显示结果摘要；`isError=true` 时标红 |
| `ui` | `{html,meta}` | **关键**：在当前 AI 气泡内插入一个 sandbox iframe，srcdoc=html |
| `elicit` | `{id,message,schema}` | **关键**：弹出确认对话框（见 §4），用户操作后调 `/elicit/respond` |
| `done` | `{}` | 标记本轮结束，解锁输入框 |
| `error` | `{message}` | 显示错误提示，解锁输入框 |

### 顺序约束
- `text_delta` 按到达顺序拼接
- `tool_call` → `tool_result` → 可能 `ui`/`elicit` → 更多 `text_delta` → `done`
- 同一条 AI 回复里可能有多个 tool 调用（串行显示）

---

## 3. 需要实现的界面元素

### 3.1 对话区
- 消息列表：用户气泡（右）、AI 气泡（左）
- AI 气泡内可混合：流式文本 + 多个 tool 徽章 + 多个图表 iframe
- AI 正在回复时，底部显示"思考中…"指示器

### 3.2 输入区
- 文本输入框 + 发送按钮
- 发送时禁用，直到收到 `done` 或 `error`（避免并发请求把 SSE 流搅乱）

### 3.3 图表渲染（`ui` 事件）
- 用 `<iframe srcdoc="...HTML..." sandbox="allow-scripts">`
- **`sandbox` 必须只含 `allow-scripts`，不含 `allow-same-origin`**（安全：HTML 虽来自自家 server，仍按不可信处理，防止访问父页面 cookie/DOM）
- iframe 高度固定（如 400px），宽度撑满气泡

### 3.4 下单确认对话框（`elicit` 事件）—— 最关键的交互
这是 demo 的亮点，必须做好。收到 `elicit` 后弹出模态框：
- 标题/正文：显示 `message`（如"确认下单：贵州茅台 buy 100 股 limit，价格 1800.00"）
- 参数表单：根据 `schema` 渲染可编辑字段（code/direction/price/quantity/type），用户可改值
- 两个按钮：
  - **确认下单** → `action:"accept"` + 表单当前值作为 `content`
  - **拒绝** → `action:"decline"`
- 倒计时提示：底部小字"60 秒内不确认将自动取消"（超时由后端处理，前端只提示）
- 对话框打开期间，**阻塞主 SSE 流的 UI**（用户必须先处理确认，才能继续）

---

## 4. 关键状态机（避免 bug）

一个 `/chat` 请求的生命周期：

```
[空闲]
  └─用户点发送→ [发送中：禁用输入，显示思考中]
                  └─收到 text_delta → [流式渲染文本]
                  └─收到 tool_call  → [加 tool 徽章]
                  └─收到 elicit     → [弹确认框，阻塞] ──用户操作──→ 调 /elicit/respond
                  └─收到 ui         → [插 iframe]
                  └─收到 done/error → [空闲：解锁输入]
```

**务必处理**：
- 发送中再次点发送 → 忽略（防并发）
- 用户离开/刷新页面 → 主动关闭 SSE 连接（浏览器会自动，但最好 `fetch` 时存 controller 显式 abort）
- elicit 框未关时收到 done → 不可能发生（后端会等 sink 返回才继续），但前端别假设

---

## 5. 对话历史的维护（重要，容易错）

**只把 user 文本 + assistant 文本 存进 messages**，下次请求回传。
**绝对不要**把以下塞进 messages：
- tool_call / tool_result 事件的内容
- `ui` 事件的 HTML（会让下一轮请求体爆炸 + 后端拒绝）
- elicit 的 schema

```js
// 伪代码
messages = [
  {role:"user", content:"看看茅台"},
  {role:"assistant", content:"茅台近30日小幅上涨…"},  // done 时的累积文本
]
// 下一轮发送：messages.push({role:"user", content:"帮我买100股"}); POST /chat
```

assistant 的 content = 本轮所有 `text_delta` 拼接后的完整文本（在 `done` 时确定）。

---

## 6. SSE 接收方式

浏览器原生 `fetch` + `ReadableStream` 手写解析（不用 EventSource，因为 EventSource 不支持 POST）：

```js
const resp = await fetch('/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({messages}), signal});
const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const {done, value} = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, {stream:true});
  // SSE 事件以空行分隔，逐个解析 "event: X\ndata: Y"
  let idx;
  while ((idx = buffer.indexOf('\n\n')) >= 0) {
    const block = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    handleSSEBlock(block);  // 解析出 event/data，分发给上面的处理器
  }
}
```

注意：部分 chunk 可能在事件中间断开，必须用 buffer 累积 + 按 `\n\n` 切分。

---

## 7. 实现顺序（每步可独立看到效果）

| 步骤 | 内容 | 验证 |
|---|---|---|
| **1** | 基础 chat 骨架：输入框 + 消息列表 + 发送 + 接 text_delta 流式显示 | ✅ 能和 AI 文字对话 |
| **2** | tool_call/tool_result 徽章 | ✅ 按用户要求改为「不展示中间过程」，但事件仍接收入库 |
| **3** | `ui` 事件 → iframe 渲染 K 线图 | ✅ 看到K 线图 |
| **4** | `elicit` 事件 → 确认弹窗 + 回传 | ✅ 下单确认全流程（券商风格交易面板，解决了之前的 60s 超时） |
| **5** | 历史维护 + 错误处理 + 倒计时提示 | ✅ 多轮对话 + 健壮性 |

### 超出原计划的增强
- **左侧常驻面板**：持仓 + 订单 + 一键撤单（不依赖 Agent，补足「不该等 Agent」的场景）
- **Agent 下单联动**：`place_order` 成功后，从 tool_result.summary 解析订单注入左侧订单列表（`shared/order-sync.ts`）
- **黑灰高级感主题**：暗色交易终端风配色，语义化 token（`tailwind.config.js`）
- **Markdown 渲染**：react-markdown + remark-gfm + prose-invert

### 为多端预留
`src/shared/`（逻辑）与 `src/web/`（桌面 UI）分离；`src/app/` 预留手机端，将来只加布局、复用 shared。
---

## 8. 配置

- 后端地址：默认 `http://localhost:8081`，用环境变量或配置文件注入（构建时替换 / 运行时从某 config 读）
- 开发时跨域：core-agent 的 `/chat` 需要允许前端域名的 CORS（如果前端 dev server 不在 8081）。**后端要加 CORS 中间件**——这是后端的小改动，前端 plan 提一下让后端配合。

---

## 9. 必须注意的坑

1. **iframe sandbox**：只 `allow-scripts`，不要 `allow-same-origin`
2. **messages 不含 tool 中间结果**：只 user/assistant 文本
3. **elicit 60s 超时**：后端兜底，前端倒计时提示 + 超时后关闭弹窗（收到后续的 tool_result is_error 或正常 done 时清理）
4. **SSE chunk 边界**：必须 buffer 累积按 `\n\n` 切分，不能假设一次 read 是一个完整事件
5. **发送中禁用输入**：避免并发请求
6. **iframe 高度**：图表 HTML 是全屏自适应（lightweight-charts autoSize），给 iframe 固定高度即可
7. **确认框是模态的**：打开时挡住下层，强制用户先处理
8. **assistant 文本在 done 时才入 history**：避免流式中间状态被错误回传

---

## 10. 暂不实现

- 用户登录/多用户
- 对话历史持久化（刷新即丢）
- 移动端响应式
- 暗黑模式（可选）
- 多语言
- 复杂的错误重试/断线重连
- markdown 渲染的高级特性（代码高亮、表格等）—— 基础 markdown 即可
- 前端单元测试
