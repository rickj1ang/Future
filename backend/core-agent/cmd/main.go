package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"core-agent/internal/agent"
	"core-agent/internal/mcpclient"
	"core-agent/internal/provider"
	"core-agent/pkg/apitypes"
)

func main() {
	mcpServerURL := envOr("MCP_SERVER_URL", "http://localhost:8080/mcp")
	llmBaseURL := envOr("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
	llmAPIKey := os.Getenv("DEEPSEEK_API_KEY")
	llmModel := envOr("LLM_MODEL", "deepseek-v4-flash")
	port := envOr("AGENT_PORT", "8081")
	maxIter := envIntOr("MAX_TOOL_ITER", 10)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 1) 连 mcp-server（带就绪重试）。
	log.Printf("连接 mcp-server: %s", mcpServerURL)
	mc, err := mcpclient.PollUntilReady(ctx, mcpServerURL, 2*time.Second)
	if err != nil {
		log.Fatalf("mcp-server: %v", err)
	}
	defer mc.Close()

	// 2) 拉 tool 列表（全部暴露：第 4 步已接确认 UI，place_order 不再静默）。
	tools, err := mc.ListToolSchemas(ctx, nil)
	if err != nil {
		log.Fatalf("list tools: %v", err)
	}
	log.Printf("已加载 %d 个 tool", len(tools))

	// 确认请求路由表：agent 的 sink 注册，/elicit/respond 投递。
	reg := agent.NewElicitRegistry(envDurOr("ELICIT_TIMEOUT", 60*time.Second))

	// 3) 组装 agent。provider 用 OpenAI 兼容（DeepSeek）。
	a := &agent.Agent{
		LLM: &provider.OpenAICompatible{
			BaseURL: llmBaseURL,
			APIKey:  llmAPIKey,
			Model:   llmModel,
		},
		MCP:     mc,
		Tools:   tools,
		MaxIter: maxIter,
		Elicit:  reg,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/chat", chatHandler(a))
	mux.HandleFunc("/elicit/respond", elicitRespondHandler(reg))
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	srv := &http.Server{Addr: ":" + port, Handler: corsMiddleware(mux)}
	go func() {
		log.Printf("core-agent 监听 :%s (SSE /chat)", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()
	<-ctx.Done()
	log.Printf("关闭中…")
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutCtx)
}

// chatHandler 处理 POST /chat，以 SSE 流式返回。
func chatHandler(a *agent.Agent) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req apitypes.ChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
			return
		}

		// 切到 SSE。
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // 关闭代理缓冲

		// SSE 事件写入回调：序列化 + 写空行分隔 + flush。
		sse := agent.NewSSEWriter(func(event string, data any) error {
			var payload string
			if data != nil {
				b, err := json.Marshal(data)
				if err != nil {
					return err
				}
				payload = string(b)
			}
			// SSE 格式：event: X\ndata: {...}\n\n
			_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
			if err != nil {
				return err
			}
			flusher.Flush()
			return nil
		})

		// 把请求 messages 转成 provider.Message（带 system 提示）。
		msgs := []provider.Message{
			{Role: provider.RoleSystem, Content: `你是一个 A 股交易助手。可用工具：
- query_kline：查询股票行情，会在对话中渲染可交互 K 线图，你只收到文字摘要。
- place_order：下单（买入/卖出，限价/市价）。用户表达任何买卖意图时，你都必须调用此工具——工具会自动弹出确认界面让用户核对/修改参数并确认。绝对不要用文字罗列订单参数请用户确认，那样不会真正下单。
- list_orders：查询当前所有订单。
- cancel_order：根据订单 ID 撤单。

规则：下单、撤单是有副作用的操作，必须通过对应工具完成，禁止用文字模拟流程。用户每一次新的买卖请求，都要再次调用 place_order。`},
		}
		for _, m := range req.Messages {
			role := provider.Role(m.Role)
			if role == "" {
				role = provider.RoleUser
			}
			msg := provider.Message{
				Role:       role,
				Content:    m.Content,
				ToolCallID: m.ToolCallID,
				Name:       m.Name,
			}
			for _, tc := range m.ToolCalls {
				msg.ToolCalls = append(msg.ToolCalls, provider.ToolCall{
					ID:        tc.ID,
					Name:      tc.Name,
					Arguments: tc.Arguments,
				})
			}
			msgs = append(msgs, msg)
		}

		// 每个请求独立 context（前端断开即取消）。
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()
		if err := a.Run(ctx, sse, msgs); err != nil {
			// 错误已通过 error 事件推送；这里只记录。
			log.Printf("agent run: %v", err)
		}
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envIntOr(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return def
}

func envDurOr(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

// elicitRespondHandler 处理前端回传的用户确认。
// body: {id, action, content}。按 id 投递给等待中的 /chat 的 sink。
func elicitRespondHandler(reg *agent.ElicitRegistry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			ID      string         `json:"id"`
			Action  string         `json:"action"`            // accept | decline | cancel
			Content map[string]any `json:"content,omitempty"` // accept 时用户（可能修改过的）参数
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
			return
		}
		if !reg.Deliver(body.ID, &mcp.ElicitResult{Action: body.Action, Content: body.Content}) {
			// id 不存在：已超时/已处理/或前端臆造
			http.Error(w, "elicit id not found or already resolved", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// 防止 strings 未用（保留给未来参数清洗用）。
var _ = strings.TrimSpace

// corsMiddleware 为所有响应加上 CORS 头，并处理预检 OPTIONS。
// demo 用，允许任意源。生产应收敛 allowlist。
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type, Accept")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
