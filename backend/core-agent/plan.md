# core-agent 实现计划

对接 `mcp-server`（HTTP 模式），对外暴露 chat 接口（**SSE 流式**）给前端。demo 阶段，不含长期记忆 / 多轮上下文压缩 / RAG 等复杂能力。

---

## 0. 定位与边界

**core-agent 做什么**
- 是 MCP **client**：连接我们自己的 mcp-server（HTTP transport）
- 是 LLM **编排者**：驱动 LLM 的 tool-calling 循环（LLM 决定调哪个 tool → agent 执行 → 结果回灌 LLM）
- 是前端 **流式网关**：SSE 推送 LLM 文本增量、tool 调用过程、`ui://` 富内容、elicitation 确认请求

**core-agent 不做什么（demo 阶段）**
- 不做对话记忆持久化（每次请求独立，上下文靠前端传回，见 §4）
- 不做多用户/鉴权
- 不接外部 MCP server（先硬连自己的 mcp-server）
- 不做 LangChain 之类的框架——裸调 LLM + 手写循环，机制清晰、依赖最少

---

## 1. 关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| LLM 调用 | **裸调** OpenAI 兼容 HTTP API（DeepSeek 兼容端点） | tool-calling 本质就是 function calling，手写循环看得清机制，无 SDK 依赖 |
| Provider 抽象 | **agent 依赖 `provider.Provider` 接口**，`internal/provider` 包实现 | 接口隔离，未来换 Anthropic/本地模型不动 agent 主循环 |
| 模型 | `deepseek-v4-flash`（OpenAI 兼容） | 默认配置，env 可改 |
| MCP 连接 | go-sdk `ClientSession` + **HTTP transport** 直连 mcp-server | 进程隔离、贴近真实部署 |
| Tool schema 来源 | agent 启动时从 mcp-server **`tools/list` 拉一次**，转成 LLM 的 function schema | 单一数据源，mcp-server 加 tool 不用改 agent |
| `ui://` 处理 | **agent 主动 `resources/read` 拉 HTML，作为 SSE 的 `ui` 事件推送**（见 §3） | 前端不懂 MCP 协议，必须由 agent 转译 |
| 输出方式 | **流式 SSE**（见 §4） | 体验好；且 SSE 天然适合做 elicitation 的推送通道 |
| elicitation 处理 | SSE 推 `elicit` 事件 + 独立 `POST /elicit/respond` 回传（见 §5） | 利用流式通道，比轮询优雅 |
| 模块复用 | mcp-server 作为独立进程，core-agent 通过 HTTP/MCP 调它 | 不做成 go module 依赖，进程隔离 |

---

## 2. 代码结构

```
core-agent/
├── cmd/main.go                    # 入口：连 mcp-server、起 SSE /chat
├── internal/
│   ├── provider/                  # LLM provider 抽象 + OpenAI 兼容实现
│   │   ├── provider.go            # Provider 接口、Message/ToolSchema/Completion 类型
│   │   └── openai.go              # 流式实现（DeepSeek 兼容端点）
│   ├── mcpclient/                 # MCP client 封装（连 mcp-server）
│   │   └── client.go              # ListTools / CallTool / ReadResource
│   └── agent/                     # LLM 编排
│       └── agent.go               # Run(ctx, sseWriter, messages)：tool-calling 循环
└── pkg/
    └── apitypes/                  # 给前端的 JSON 契约（chat req、SSE 事件）
        └── types.go
```

**依赖方向**：`agent` → `provider`（接口）+ `mcpclient`；`cmd` → 三者。provider 是接口的实现方，agent 不感知具体 provider。

---

## 3. 最关键也最容易设计错的点：`ui://` 资源如何流到前端

### 问题
- mcp-server 的 `query_kline` 返回 `_meta.ui.resourceUri = "ui://kline/600519"`
- LLM 只看到文字摘要（"已展示图表"）
- 前端需要拿到 **HTML** 才能渲染 iframe
- 但前端**不会**发 MCP 协议请求

### 方案：agent 做转译，通过 SSE `ui` 事件推送
```
LLM 调 query_kline → agent.CallTool
  → 结果带 _meta.ui.resourceUri
  → agent 调 mcpclient.ReadResource("ui://kline/600519") 拿到 HTML
  → SSE 推 event: ui  data: {html, meta:{code}}
  → 同时只把文字摘要回灌 LLM（HTML 绝不进 LLM context）
```

### ⚠️ 两条铁律
1. **HTML 不回灌 LLM**：tool 结果中给 LLM 看的只有文字摘要，HTML 单独走 SSE `ui` 事件。否则下一轮 LLM context 被 HTML 打爆，K 线设计的意义就没了。
2. **前端必须 sandbox iframe 渲染**：`sandbox="allow-scripts"`，**不带** `allow-same-origin`，防 XSS / 访问父页面。HTML 虽来自自家 server，仍按不可信内容对待。

---

## 4. chat 接口设计（流式 SSE）

### 请求
```
POST /chat
Content-Type: application/json
{
  "messages": [                    # 前端维护的对话历史（demo 无服务端记忆）
    {"role":"user","content":"看看茅台最近走势"}
  ]
}
```

### 响应：SSE 流
```
Content-Type: text/event-stream

event: text_delta
data: {"text":"好的"}

event: text_delta
data: {"text":"，我来查一下"}

event: tool_call
data: {"id":"call_1","name":"query_kline","arguments":{"code":"600519"}}

event: tool_result
data: {"name":"query_kline","summary":"600519 近 30 日..."}

event: ui
data: {"html":"<!DOCTYPE html>...","meta":{"code":"600519"}}

event: text_delta
data: {"text":"已为您展示茅台近 30 日 K 线..."}

event: done
data: {}
```

事件类型（`pkg/apitypes`）：
- `text_delta` — LLM 文本增量
- `tool_call` — agent 即将调用某 tool（前端可显示"正在查询…"）
- `tool_result` — tool 完成（给 LLM 的文字摘要，调试可见性）
- `ui` — 富内容 HTML（见 §3）
- `elicit` — 下单等确认请求（见 §5）
- `done` — 本轮结束
- `error` — 出错（带 message）

### 上下文记忆策略（demo）
- **服务端无状态**：每次请求前端把完整 `messages` 传回
- ⚠️ **tool 中间结果（尤其 HTML）绝不进 messages**——只存 user/assistant 文本。否则下一轮前端回传巨量数据 + LLM context 污染。

---

## 5. elicitation：用 SSE 推 + POST 回

`place_order` 的确认是 server→client 反向请求。流式通道天然适合做推送：

### 流程
```
LLM 调 place_order → agent.CallTool
  → mcp-server 向 agent 发 elicitation/create
  → agent 的 ElicitationHandler 生成 elicit_id，
    SSE 推 event: elicit  data: {id, message, schema}   ← 推给前端
    同时阻塞在 channel 上（带超时）
  → 前端渲染确认 UI，POST /elicit/respond {id, action, content}
  → 该 endpoint 查 channel，投递响应
  → Handler 解除阻塞，返回 ElicitResult 给 mcp-server
  → 流式继续
```

### 需要一个 pending-elicitation 注册表
`map[elicitID]chan ElicitResult` + mutex。同一个 `/chat` 连接内串行，但 endpoint 跨请求，所以要按 id 路由。

### ⚠️ 必须实现
- **超时**：Handler 带 timeout（如 60s），用户不响应返回 `cancel`，避免 `/chat` 永久挂起
- **降级安全**：第 3 步前 ElicitationHandler 先 stub 成"decline + 清晰提示"，**绝不跳过确认**让单直接下进去

---

## 6. tool-calling 循环（agent 核心，流式版）

```go
func (a *Agent) Run(ctx, sse, messages) error {
    for iter := 0; iter < maxIter; iter++ {
        comp, err := a.provider.Chat(ctx, ChatRequest{messages, a.tools}, func(d string){
            sse.Write("text_delta", map[string]any{"text": d})  // 逐 token 推
        })
        messages = append(messages, assistantMsg(comp))
        if len(comp.ToolCalls) == 0 { sse.Write("done", nil); return nil }

        for _, tc := range comp.ToolCalls {
            sse.Write("tool_call", tc)
            result := a.mcp.CallTool(ctx, tc.Name, tc.Arguments)
            if uri := uiFromMeta(result.Meta); uri != "" {
                html := a.mcp.ReadResource(ctx, uri)
                sse.Write("ui", map[string]any{"html": html, ...})
            }
            sse.Write("tool_result", textForLLM(result))
            messages = append(messages, toolMsg(tc.ID, textForLLM(result)))  // 只回灌文本
        }
    }
    return errMaxIter
}
```

### ⚠️ 循环防护
- 最大迭代次数（如 10）、per-call timeout
- 只回灌**文本**，HTML 走 `ui` 事件（见 §3 铁律 1）

---

## 7. Provider 接口（流式）

```go
type Provider interface {
    // Chat 流式补全。onDelta 在每个文本增量到达时被调用。
    // 返回最终 completion（累积文本 + 若有的 tool_calls）。
    Chat(ctx context.Context, req ChatRequest, onDelta func(text string)) (*Completion, error)
}
type ChatRequest struct {
    Messages []Message
    Tools    []ToolSchema
}
type Completion struct {
    Text      string
    ToolCalls []ToolCall   // 已按 index 累积好
}
```

- agent 只依赖接口；`internal/provider/openai.go` 实现一个（DeepSeek 兼容）
- 流式实现要点：`stream:true` + 逐行解析 `data: {...}` / `data: [DONE]`，tool_calls 的 arguments 按分片累积（OpenAI/DeepSeek 格式一致）
- ⚠️ **tool schema 转换**：MCP inputSchema → OpenAI `parameters`，基本直传；启动时打印转换结果便于核对

---

## 8. 实现顺序（每步可独立验证）

| 步骤 | 内容 | 验证 |
|---|---|---|
| **1** | mcpclient：连 mcp-server，`tools/list` 打印 | 启动打印 4 个 tool |
| **2** | provider：接口 + 流式实现（DeepSeek） | 假 mock 注入跑通 SSE 循环 |
| **3** | agent：tool-calling 循环 + SSE，先只暴露 query_kline；UI 转译 | curl "看看茅台" → 流式文本 + ui 事件 |
| **4** | elicitation 转发：接 place_order 确认 | 前端能确认/拒绝 |
| **5** | 收尾：其余 tool、错误处理、循环防护 | 全流程通 |

**当前实现到第 3 步**，停下让用户确认骨架。

---

## 9. 配置与启动

```
MCP_SERVER_URL=http://localhost:8080/mcp
DEEPSEEK_BASE_URL=https://api.deepseek.com        # OpenAI 兼容
DEEPSEEK_API_KEY=sk-...
LLM_MODEL=deepseek-v4-flash
AGENT_PORT=8081
ELICIT_TIMEOUT=60s
MAX_TOOL_ITER=10
```

启动：先 `cd ../mcp-server && go run ./cmd -transport http -addr :8080`，再起 core-agent。

---

## 10. 必须注意的坑

1. **HTML 安全**：前端 sandbox iframe，不带 `allow-same-origin`
2. **tool 结果不回灌 LLM context**：只回灌文本，HTML 走 `ui` 事件
3. **循环防护**：最大迭代 + timeout
4. **elicitation 超时与降级**：不响应要 cancel，绝不跳过确认
5. **上下文在前端**：服务端无状态；tool 中间结果绝不进 messages
6. **tool schema 转换**：MCP→LLM JSON Schema 有细节差异，启动时打印核对
7. **流式 tool_calls 累积**：arguments 分片到达，按 index 拼接
8. **mcp-server 是独立进程**：agent 启动前要等它就绪（重试连接）

---

## 11. 暂不实现

- 多用户 / 鉴权 / 会话隔离
- 对话记忆持久化、上下文压缩、摘要
- 多 provider（接口预留，先实现 DeepSeek 兼容一个）
- 外部 MCP server 接入
- 前端代码（本仓库只到 agent 的 HTTP/SSE 接口）
- 优雅停机、限流、监控、日志聚合
