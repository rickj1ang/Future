package tools

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type CancelOrderInput struct {
	ID string `json:"id" jsonschema:"要撤销的订单 ID"`
}

type CancelOrderOutput struct {
	Order  *Order `json:"order,omitempty"`
	Status string `json:"status"`
}

// CancelOrder 根据订单 ID 撤单。
func CancelOrder(_ context.Context, _ *mcp.CallToolRequest, in CancelOrderInput) (*mcp.CallToolResult, CancelOrderOutput, error) {
	o, ok := cancelOrder(in.ID)
	if !ok {
		// 用 IsError=true 的结果告知客户端，而不是返回 error（error 会被当成 JSON-RPC 错误）
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf("订单 %s 不存在", in.ID)}},
		}, CancelOrderOutput{Status: "not_found"}, nil
	}
	return nil, CancelOrderOutput{Order: o, Status: "canceled"}, nil
}
