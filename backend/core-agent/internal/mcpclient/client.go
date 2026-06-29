// Package mcpclient 封装对 mcp-server 的 MCP client 连接。
package mcpclient

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"core-agent/internal/provider"
)

// Client 是连到 mcp-server 的 client。agent 通过它调 tool / 读 ui:// 资源。
type Client struct {
	session *mcp.ClientSession

	// elicitation 路由：standalone SSE 是长连接，mcp-server 可能在任意时刻
	// 推送 elicitation（比如 agent 还在等 LLM 响应时）。所以 sink 必须在
	// /chat 请求开始时就设上、贯穿整个请求，不能等到 CallTool 才设。
	// 这意味着同一个 Client 一次只能服务一个 /chat（串行），demo 够用。
	elicitMu   sync.Mutex
	elicitSink ElicitSink
}

// ElicitSink 是 /chat 请求提供的「如何处理一次确认请求」的回调。
// agent 在 Run 开始时通过 SetElicitSink 注册，结束时清理。
type ElicitSink func(ctx context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error)

// SetElicitSink 设置当前活动 sink，返回一个清理函数。
// 应在 /chat 请求开始时调用，defer 执行返回的清理函数。传 nil 清空。
func (c *Client) SetElicitSink(sink ElicitSink) (cleanup func()) {
	c.elicitMu.Lock()
	c.elicitSink = sink
	c.elicitMu.Unlock()
	return func() {
		c.elicitMu.Lock()
		c.elicitSink = nil
		c.elicitMu.Unlock()
	}
}

// New 连接 mcp-server（HTTP transport）并完成 MCP initialize 握手。
// mcpServerURL 形如 http://localhost:8080/mcp。
func New(ctx context.Context, mcpServerURL string) (*Client, error) {
	c := &Client{}
	transport := &mcp.StreamableClientTransport{
		Endpoint: mcpServerURL,
		// 不要禁用 standalone SSE：它是 server→client 请求（如 elicitation/create）
		// 的唯一通道（server 用 JSONResponse，POST 不流式）。
	}
	client := mcp.NewClient(
		&mcp.Implementation{Name: "core-agent", Version: "v0.1.0"},
		&mcp.ClientOptions{
			// 转发到当前活动 sink。没有活动 sink（无 /chat 关联）时安全拒绝，
			// 绝不让 place_order 静默下单。
			ElicitationHandler: func(ctx context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
				return c.handleElicit(ctx, req)
			},
		},
	)
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect mcp-server: %w", err)
	}
	c.session = session
	return c, nil
}

// handleElicit 读当前活动 sink 并委托；无 sink 时拒绝。
func (c *Client) handleElicit(ctx context.Context, req *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
	c.elicitMu.Lock()
	sink := c.elicitSink
	c.elicitMu.Unlock()
	log.Printf("[elicit] handleElicit 被调用，sink=%v", sink != nil)
	if sink == nil {
		log.Printf("[elicit] 无活动 sink，拒绝（无 /chat 关联或时序问题）")
		return &mcp.ElicitResult{Action: "decline"}, nil
	}
	return sink(ctx, req)
}

// Close 关闭与 mcp-server 的连接。
func (c *Client) Close() error { return c.session.Close() }

// ListToolSchemas 拉取 mcp-server 的 tool 列表，转成 provider.ToolSchema。
// allowlist 非空时只保留其中列出的 tool（demo 阶段按需暴露）。
func (c *Client) ListToolSchemas(ctx context.Context, allowlist map[string]bool) ([]provider.ToolSchema, error) {
	res, err := c.session.ListTools(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("list tools: %w", err)
	}
	out := make([]provider.ToolSchema, 0, len(res.Tools))
	for _, t := range res.Tools {
		if len(allowlist) > 0 && !allowlist[t.Name] {
			continue
		}
		schema := provider.ToolSchema{
			Name:        t.Name,
			Description: t.Description,
		}
		// t.InputSchema 是 any（服务端是 *jsonschema.Schema，client 端反序列化为 map[string]any）。
		if m, ok := t.InputSchema.(map[string]any); ok {
			schema.InputSchema = m
		} else if t.InputSchema != nil {
			// 兜底：重新 marshal/unmarshal 成 map。
			if b, err := marshalJSON(t.InputSchema); err == nil {
				var mm map[string]any
				if jsonUnmarshal(b, &mm) == nil {
					schema.InputSchema = mm
				}
			}
		}
		out = append(out, schema)
		log.Printf("mcp tool: %s — %s", t.Name, t.Description)
	}
	return out, nil
}

// ToolResult 是 CallTool 的结果，同时透出 _meta（用于提取 ui:// 资源 URI）。
type ToolResult struct {
	Text    string         // 给 LLM 看的文字（拼接所有 TextContent）
	IsError bool           // tool 自报错误（如"用户已拒绝"）
	Meta    map[string]any // _meta，含 ui.resourceUri 等
}

// CallTool 调用 mcp-server 的某 tool。arguments 是原始 JSON 字符串。
// 确认路由（sink）由调用方通过 SetElicitSink 在 /chat 开始时设置。
func (c *Client) CallTool(ctx context.Context, name, argumentsJSON string) (*ToolResult, error) {
	var args any
	if argumentsJSON != "" {
		if err := jsonUnmarshal([]byte(argumentsJSON), &args); err != nil {
			return nil, fmt.Errorf("parse tool arguments: %w", err)
		}
	}
	res, err := c.session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		return nil, fmt.Errorf("call tool %s: %w", name, err)
	}
	tr := &ToolResult{IsError: res.IsError, Meta: res.Meta}
	for _, cc := range res.Content {
		if tc, ok := cc.(*mcp.TextContent); ok && tc.Text != "" {
			if tr.Text != "" {
				tr.Text += "\n"
			}
			tr.Text += tc.Text
		}
	}
	return tr, nil
}

// ReadResource 读一个 uri:// 资源，返回第一个 content 的 text（用于 ui:// HTML）。
func (c *Client) ReadResource(ctx context.Context, uri string) (string, string, error) {
	res, err := c.session.ReadResource(ctx, &mcp.ReadResourceParams{URI: uri})
	if err != nil {
		return "", "", fmt.Errorf("read resource %s: %w", uri, err)
	}
	if len(res.Contents) == 0 {
		return "", "", fmt.Errorf("resource %s empty", uri)
	}
	c0 := res.Contents[0]
	return c0.Text, c0.MIMEType, nil
}

// PollUntilReady 重试连接 mcp-server，直到成功、超时、或遇到不可重试错误。
//
// 只对"连接被拒"（端口未开）重试；对连接成功后的协议错误（如 session not found）
// 不重试，避免死循环——这类错误重试也不会成功，该让调用方看到真实原因。
func PollUntilReady(ctx context.Context, url string, interval time.Duration) (*Client, error) {
	var lastErr error
	for {
		c, err := New(ctx, url)
		if err == nil {
			return c, nil
		}
		lastErr = err
		if !isRetryableConnectErr(err) {
			return nil, fmt.Errorf("连接 mcp-server 失败（不可重试）: %w", err)
		}
		log.Printf("mcp-server 尚未就绪 (%v)，%s 后重试…", err, interval)
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("等待 mcp-server 超时 (最后一次错误: %v): %w", lastErr, ctx.Err())
		case <-time.After(interval):
		}
	}
}

// isRetryableConnectErr 判断错误是否值得重试。
// "连接被拒"（端口未监听）是可重试的；握手后的协议错误不是。
func isRetryableConnectErr(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "i/o timeout")
}
