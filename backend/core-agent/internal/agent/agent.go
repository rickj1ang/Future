// Package agent 实现 LLM tool-calling 编排，通过 SSE 把过程流式推给前端。
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"core-agent/internal/mcpclient"
	"core-agent/internal/provider"
)

// Agent 持有一个 provider（LLM）和一个 mcp-client（tool/UI 来源）。
type Agent struct {
	LLM     provider.Provider
	MCP     *mcpclient.Client
	Tools   []provider.ToolSchema // 启动时从 mcp-server 拉取并过滤
	MaxIter int                   // tool-calling 最大迭代次数，防死循环
	Elicit  *ElicitRegistry       // 下单确认路由；nil 时禁用确认（place_order 会被拒绝）
}

// SSEWriter 把事件写入 HTTP 流。由 http handler 传入。
type SSEWriter struct {
	write func(event string, data any) error
}

// NewSSEWriter 构造一个写入器。write 回调负责序列化 + 刷新。
func NewSSEWriter(write func(event string, data any) error) *SSEWriter {
	return &SSEWriter{write: write}
}

func (w *SSEWriter) emit(event string, data any) {
	if err := w.write(event, data); err != nil {
		log.Printf("sse write %s: %v", event, err)
	}
}

// Run 驱动一轮对话：流式调用 LLM，按需调 tool，全程通过 sse 推事件。
// messages 由调用方维护（demo 无服务端记忆，从请求里来）。
func (a *Agent) Run(ctx context.Context, sse *SSEWriter, msgs []provider.Message) error {
	if a.MaxIter <= 0 {
		a.MaxIter = 10
	}
	// sink 在整个 /chat 期间有效：standalone SSE 可能任意时刻推 elicitation
	// （比如 agent 还在等 LLM），所以必须在 Run 一开始就设好。
	if a.Elicit != nil {
		cleanup := a.MCP.SetElicitSink(a.elicitSinkFor(sse))
		defer cleanup()
	}
	for iter := 0; iter < a.MaxIter; iter++ {
		// 1) 流式调用 LLM。文本增量实时推给前端。
		comp, err := a.LLM.Chat(ctx, provider.ChatRequest{
			Messages: msgs,
			Tools:    a.Tools,
		}, func(text string) {
			sse.emit("text_delta", map[string]any{"text": text})
		})
		if err != nil {
			sse.emit("error", map[string]any{"message": err.Error()})
			return fmt.Errorf("llm chat: %w", err)
		}

		// 把这一轮 assistant 消息（含 tool_calls）加入历史。
		assistantMsg := provider.Message{
			Role:    provider.RoleAssistant,
			Content: comp.Text,
		}
		if len(comp.ToolCalls) > 0 {
			assistantMsg.ToolCalls = comp.ToolCalls
		}
		msgs = append(msgs, assistantMsg)

		// 2) 没有 tool_call → LLM 已给出最终回复，结束。
		if len(comp.ToolCalls) == 0 {
			sse.emit("done", nil)
			return nil
		}

		// 3) 执行每个 tool_call。
		for _, tc := range comp.ToolCalls {
			sse.emit("tool_call", map[string]any{
				"id":        tc.ID,
				"name":      tc.Name,
				"arguments": json.RawMessage(tc.Arguments),
			})

			result, err := a.MCP.CallTool(ctx, tc.Name, tc.Arguments)
			if err != nil {
				// tool 调用本身失败（网络/协议层）：回灌错误文本让 LLM 知道并自纠。
				errText := fmt.Sprintf("调用 tool %s 失败: %v", tc.Name, err)
				sse.emit("tool_result", map[string]any{"name": tc.Name, "summary": errText, "isError": true})
				msgs = append(msgs, provider.Message{
					Role: provider.RoleTool, Name: tc.Name, ToolCallID: tc.ID, Content: errText,
				})
				continue
			}

			// 4) 关键：抽 _meta.ui.resourceUri → 拉 HTML → 推 ui 事件。
			//    HTML 绝不回灌 LLM；只把 result.Text（文字摘要）回灌。
			if uri := uiResourceURI(result.Meta); uri != "" {
				html, _, rerr := a.MCP.ReadResource(ctx, uri)
				if rerr != nil {
					log.Printf("read ui resource %s: %v", uri, rerr)
				} else {
					sse.emit("ui", map[string]any{"html": html, "meta": map[string]any{"uri": uri}})
				}
			}

			sse.emit("tool_result", map[string]any{
				"name":    tc.Name,
				"summary": truncForEvent(result.Text),
				"isError": result.IsError,
			})

			// 只回灌文字（铁律：HTML 不进 LLM context）。
			msgs = append(msgs, provider.Message{
				Role: provider.RoleTool, Name: tc.Name, ToolCallID: tc.ID, Content: result.Text,
			})
		}
		// 循环继续：把 tool 结果交给 LLM，让它决定下一步。
	}

	sse.emit("error", map[string]any{"message": fmt.Sprintf("超过最大 tool 迭代次数 %d", a.MaxIter)})
	return fmt.Errorf("max tool iterations exceeded")
}

// uiResourceURI 从 tool 结果的 _meta 里取 ui.resourceUri（mcp-server 的约定）。
func uiResourceURI(meta mcp.Meta) string {
	if meta == nil {
		return ""
	}
	ui, ok := meta["ui"].(map[string]any)
	if !ok {
		return ""
	}
	uri, _ := ui["resourceUri"].(string)
	return uri
}

// elicitSinkFor 构造「把确认转发给这个 SSE 流」的 sink。nil 表示禁用确认。
// 流程：注册 id → 推 elicit 事件 → 阻塞等 /elicit/respond 投递（带超时/断连兜底）。
// 超时或断连返回 cancel，mcp-server 会安全撤销下单。
func (a *Agent) elicitSinkFor(sse *SSEWriter) mcpclient.ElicitSink {
	if a.Elicit == nil {
		log.Printf("[elicit] a.Elicit 为 nil，确认被禁用")
		return nil
	}
	reg := a.Elicit
	log.Printf("[elicit] 构造 sink（registry 已启用）")
	return func(ctx context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
		log.Printf("[elicit] sink 被调用！message=%s", req.Params.Message)
		id, ch := reg.Register()
		defer reg.Unregister(id)
		sse.emit("elicit", ElicitEvent{
			ID:      id,
			Message: req.Params.Message,
			Schema:  req.Params.RequestedSchema,
		})
		select {
		case res := <-ch:
			return res, nil
		case <-time.After(reg.Timeout):
			log.Printf("elicit %s 超时，自动 cancel", id)
			return &mcp.ElicitResult{Action: "cancel"}, nil
		case <-ctx.Done():
			log.Printf("elicit %s 上下文取消", id)
			return &mcp.ElicitResult{Action: "cancel"}, nil
		}
	}
}

// truncForEvent 限制 tool_result 事件里摘要的长度（前端展示用，不影响回灌 LLM）。
func truncForEvent(s string) string {
	const max = 500
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// 用于 json.Marshal 一个 raw arguments 到事件里。
var _ = json.Marshal
