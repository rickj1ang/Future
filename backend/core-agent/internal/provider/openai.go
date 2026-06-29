package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// OpenAICompatible 实现一个 OpenAI 兼容的流式 chat completions provider。
// 适用于 DeepSeek（默认 https://api.deepseek.com）等所有 OpenAI 兼容端点。
type OpenAICompatible struct {
	BaseURL string // 如 https://api.deepseek.com，不带 /chat/completions
	APIKey  string
	Model   string // 如 deepseek-v4-flash
	Client  *http.Client
}

// OpenAI 请求/响应（流式 chunk）的最小字段集。

type oaiMessage struct {
	Role       string        `json:"role"`
	Content    string        `json:"content,omitempty"`
	ToolCalls  []oaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
	Name       string        `json:"name,omitempty"`
}

type oaiToolCall struct {
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"` // "function"
	Function struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"` // 流式时分片累积
	} `json:"function"`
}

// 流式响应里 delta 中的 tool_call 带 Index，用于按序累积。
type oaiDeltaToolCall struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Function struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"`
	} `json:"function"`
}

type oaiChoice struct {
	Index        int `json:"index"`
	Delta struct {
		Role      string             `json:"role,omitempty"`
		Content   string             `json:"content,omitempty"`
		ToolCalls []oaiDeltaToolCall `json:"tool_calls,omitempty"`
	} `json:"delta"`
	FinishReason string `json:"finish_reason,omitempty"`
}

type oaiStreamChunk struct {
	Choices []oaiChoice `json:"choices"`
}

// Chat 流式调用 chat completions。
func (p *OpenAICompatible) Chat(ctx context.Context, req ChatRequest, onDelta func(text string)) (*Completion, error) {
	if p.Client == nil {
		p.Client = http.DefaultClient
	}

	payload := map[string]any{
		"model":  p.Model,
		"stream": true,
	}
	if len(req.Tools) > 0 {
		payload["tools"] = toOpenAITools(req.Tools)
	}
	msgs := make([]oaiMessage, len(req.Messages))
	for i, m := range req.Messages {
		msgs[i] = oaiMessage{
			Role:       string(m.Role),
			Content:    m.Content,
			ToolCallID: m.ToolCallID,
		}
		if m.Name != "" {
			msgs[i].Name = m.Name
		}
		if len(m.ToolCalls) > 0 {
			msgs[i].ToolCalls = make([]oaiToolCall, len(m.ToolCalls))
			for j, tc := range m.ToolCalls {
				msgs[i].ToolCalls[j].ID = tc.ID
				msgs[i].ToolCalls[j].Type = "function"
				msgs[i].ToolCalls[j].Function.Name = tc.Name
				msgs[i].ToolCalls[j].Function.Arguments = tc.Arguments
			}
		}
	}
	payload["messages"] = msgs

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := strings.TrimRight(p.BaseURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := p.Client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode/100 != 2 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("llm returned %s: %s", resp.Status, string(b))
	}

	comp := &Completion{}
	// tool_calls 的 arguments 分片到达，按 index 累积。
	type acc struct {
		id, name, args string
	}
	accs := map[int]*acc{}

	scanner := bufio.NewScanner(resp.Body)
	// 单行可能很大（含 HTML？不会，HTML 走 ui 事件；但仍放宽 buffer 防极端）。
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		const prefix = "data: "
		if !strings.HasPrefix(line, prefix) {
			continue
		}
		data := strings.TrimPrefix(line, prefix)
		data = strings.TrimSpace(data)
		if data == "[DONE]" {
			break
		}
		var chunk oaiStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// 单个 chunk 解析失败不应中断整条流；记录后继续。
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		ch := chunk.Choices[0]
		if ch.Delta.Content != "" {
			comp.Text += ch.Delta.Content
			if onDelta != nil {
				onDelta(ch.Delta.Content)
			}
		}
		for _, dtc := range ch.Delta.ToolCalls {
			a := accs[dtc.Index]
			if a == nil {
				a = &acc{}
				accs[dtc.Index] = a
			}
			if dtc.ID != "" {
				a.id = dtc.ID
			}
			if dtc.Function.Name != "" {
				a.name = dtc.Function.Name
			}
			a.args += dtc.Function.Arguments
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read stream: %w", err)
	}

	// 按 index 排序收集 tool_calls。
	if len(accs) > 0 {
		idxs := make([]int, 0, len(accs))
		for i := range accs {
			idxs = append(idxs, i)
		}
		sort.Ints(idxs)
		for _, i := range idxs {
			a := accs[i]
			comp.ToolCalls = append(comp.ToolCalls, ToolCall{
				ID:        a.id,
				Name:      a.name,
				Arguments: a.args,
			})
		}
	}

	return comp, nil
}

// toOpenAITools 把内部 ToolSchema 转成 OpenAI 的 tools 字段格式。
// MCP 的 inputSchema 直接作为 function.parameters，两者都是 JSON Schema。
func toOpenAITools(tools []ToolSchema) []map[string]any {
	out := make([]map[string]any, 0, len(tools))
	for _, t := range tools {
		out = append(out, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        t.Name,
				"description": t.Description,
				"parameters":  t.InputSchema,
			},
		})
	}
	return out
}
