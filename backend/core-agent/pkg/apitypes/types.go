// Package apitypes 定义 core-agent 对前端暴露的 JSON 契约。
package apitypes

// ChatRequest 是 POST /chat 的请求体。
//
// demo 阶段无服务端记忆：每次请求由前端把完整对话历史传回。
// 历史需要携带多轮 tool-calling 结构（assistant 的 tool_calls 与对应的
// tool 结果消息），否则 LLM 看不到上轮用工具完成了任务，会被自己的文字回复
// 带偏（例如重复用文字模拟下单而不调 place_order）。但 ui 事件的 HTML 等
// 大 payload 绝不能放进来。
type ChatRequest struct {
	Messages []ChatMessage `json:"messages"`
}

// ChatMessage 对齐 OpenAI 多轮格式，透传 tool_calls / tool 结果。
type ChatMessage struct {
	Role       string         `json:"role"`                  // "user" | "assistant" | "system" | "tool"
	Content    string         `json:"content"`
	ToolCalls  []ChatToolCall `json:"tool_calls,omitempty"`  // 仅 assistant
	ToolCallID string         `json:"tool_call_id,omitempty"` // 仅 role=tool
	Name       string         `json:"name,omitempty"`         // 仅 role=tool：tool 名
}

// ChatToolCall 是历史里 assistant 携带的工具调用。Arguments 为原始 JSON 字符串。
type ChatToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// SSE 事件名。
const (
	EventTextDelta  = "text_delta"  // 文本增量
	EventToolCall   = "tool_call"   // 即将调用某 tool
	EventToolResult = "tool_result" // tool 完成（给 LLM 的文字）
	EventUI         = "ui"          // 富内容 HTML
	EventElicit     = "elicit"      // 下单等确认请求（第 4 步启用）
	EventDone       = "done"        // 本轮结束
	EventError      = "error"       // 出错
)

// 各事件的 data 载荷。

type TextDeltaData struct {
	Text string `json:"text"`
}

type ToolCallData struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments any    `json:"arguments,omitempty"` // 已解析的对象，便于前端展示
}

type ToolResultData struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	IsError bool   `json:"isError,omitempty"`
}

// UIData 是推给前端的富内容。前端用 sandbox iframe 渲染 HTML。
type UIData struct {
	HTML string `json:"html"`
	Meta any    `json:"meta,omitempty"` // 透传，如 {code:"600519"}
}

type ErrorData struct {
	Message string `json:"message"`
}
