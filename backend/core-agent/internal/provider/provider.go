// Package provider 抽象 LLM 调用。agent 只依赖 Provider 接口，
// 具体实现（OpenAI 兼容 / DeepSeek 等）在本包内提供。
package provider

import "context"

// Role 是消息角色。
type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool" // tool 结果回灌给 LLM
)

// Message 是发给 LLM 的一条消息。
//
// 注意 tool 结果回灌时：Role=RoleTool，Content 是给 LLM 看的文字摘要
// （绝不能塞 HTML/大数据），ToolCallID 关联到对应的 assistant tool_call。
type Message struct {
	Role       Role       `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`  // 仅 RoleAssistant 且模型要求调 tool 时有
	ToolCallID string     `json:"tool_call_id,omitempty"` // 仅 RoleTool
	Name       string     `json:"name,omitempty"`         // 仅 RoleTool：tool 名
}

// ToolCall 是模型要求调用的 tool。Arguments 是原始 JSON 字符串。
type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // 原始 JSON 字符串
}

// ToolSchema 是暴露给 LLM 的 tool 描述。InputSchema 是 JSON Schema（来自 MCP）。
type ToolSchema struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
}

// ChatRequest 是一次补全请求。
type ChatRequest struct {
	Messages []Message
	Tools    []ToolSchema
}

// Completion 是一次补全的结果。
type Completion struct {
	Text      string     // 累积的全部文本（便于回灌 assistant 消息）
	ToolCalls []ToolCall // 模型要求调用的 tool（已按 index 累积好）；为空表示本轮结束
}

// Provider 流式补全。agent 在循环里调用它。
//
// onDelta 在每个文本增量到达时被调用（可能是空串，可忽略）。
// 流式 tool_calls 的 arguments 分片在实现内部累积，返回时已是完整 JSON。
type Provider interface {
	Chat(ctx context.Context, req ChatRequest, onDelta func(text string)) (*Completion, error)
}
