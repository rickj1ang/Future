package server

import (
	"context"
	"log"
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"mcp-server/internal/tools"
	"mcp-server/internal/ui"
)

// New 创建并注册好所有 Tool 与 ui:// 资源的 MCP Server。
// 同一个 *mcp.Server 实例可以被 stdio / HTTP 多种 transport 复用。
func New() *mcp.Server {
	server := mcp.NewServer(
		&mcp.Implementation{Name: "future-mcp", Version: "v0.1.0"},
		nil,
	)

	registerTools(server)
	registerUIResources(server)

	return server
}

// registerTools 注册 plan.md 中的 4 个工具。全部用泛型 mcp.AddTool，
// SDK 会从 struct tag 自动推导 InputSchema / OutputSchema：
//   - required 由 json tag 是否带 omitempty 决定
//   - description 取自 jsonschema tag（整个 tag 内容就是描述）
//
// 业务参数校验（如 direction 只能是 buy/sell）交给真实券商业务层去做。
func registerTools(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "query_kline",
		Description: "查询股票 K 线数据（会在对话中渲染可交互图表，AI 只收到文字摘要）",
		Annotations: &mcp.ToolAnnotations{
			Title:        "查询 K 线",
			ReadOnlyHint: true, // 只读，无副作用
		},
	}, tools.QueryKLine)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "place_order",
		Description: "下单（买入/卖出，限价/市价）。下单前会要求用户确认，并允许用户修改参数。",
		Annotations: &mcp.ToolAnnotations{
			Title:           "下单",
			ReadOnlyHint:    false,
			DestructiveHint: ptr(true), // 破坏性：会花钱，需人类确认
		},
	}, tools.PlaceOrder)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_orders",
		Description: "查询当前所有订单",
		Annotations: &mcp.ToolAnnotations{
			Title:        "查询订单列表",
			ReadOnlyHint: true,
		},
	}, tools.ListOrders)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "cancel_order",
		Description: "根据订单 ID 撤单",
		Annotations: &mcp.ToolAnnotations{
			Title:           "撤单",
			ReadOnlyHint:    false,
			DestructiveHint: ptr(true), // 撤销已有订单，有副作用
		},
	}, tools.CancelOrder)
}

// ptr 返回 v 的地址，用于构造 ToolAnnotations 里的 *bool 字段。
func ptr[T any](v T) *T { return &v }

// registerUIResources 注册 ui:// 资源模板。
//
// 工作流程（以 query_kline 为例）：
//  1. AI 调 query_kline，server 返回 _meta.ui.resourceUri = "ui://kline/600519"
//  2. host 识别到 _meta.ui，发起 resources/read ui://kline/600519
//  3. SDK 用正则匹配到本 template，调用下面的 handler
//  4. handler 从 URI 反解出 code，取数据，生成自包含 HTML 返回
//  5. host 把 HTML 塞进 iframe/webview 渲染
//
// 注意：SDK 的 ResourceTemplate 只做正则匹配，不自动提取 {code}，
// 所以这里用 ui.MatchKLineURI 自己提取。
func registerUIResources(server *mcp.Server) {
	server.AddResourceTemplate(&mcp.ResourceTemplate{
		Name:        "kline",
		Title:       "K 线图",
		Description: "可交互的股票 K 线图（蜡烛图 + 成交量）",
		URITemplate: ui.KLineURITemplate,
		MIMEType:    ui.MIMEType,
	}, func(_ context.Context, req *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		code, ok := ui.MatchKLineURI(req.Params.URI)
		if !ok {
			return nil, mcp.ResourceNotFoundError(req.Params.URI)
		}
		ks := tools.FetchKLines(code)
		html, err := ui.RenderKLineChart(code, ks)
		if err != nil {
			log.Printf("render kline ui for %s: %v", code, err)
			return nil, mcp.ResourceNotFoundError(req.Params.URI)
		}
		return &mcp.ReadResourceResult{
			Contents: []*mcp.ResourceContents{{
				URI:      req.Params.URI,
				MIMEType: ui.MIMEType,
				Text:     html,
			}},
		}, nil
	})
}

// NewStreamableHTTPHandler 把 server 包装成一个标准 http.Handler，
// 可直接挂到 net/http.Server / 任何 mux 上对外提供服务。
//
// 路径（例如 /mcp）由调用方在 mux 中决定。
func NewStreamableHTTPHandler(server *mcp.Server) http.Handler {
	return mcp.NewStreamableHTTPHandler(
		func(r *http.Request) *mcp.Server { return server },
		&mcp.StreamableHTTPOptions{JSONResponse: true},
	)
}
