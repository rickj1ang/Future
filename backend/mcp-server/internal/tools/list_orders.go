package tools

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type ListOrdersInput struct{} // 无入参

type ListOrdersOutput struct {
	Orders []*Order `json:"orders"`
}

// ListOrders 查询当前所有订单。
func ListOrders(_ context.Context, _ *mcp.CallToolRequest, _ ListOrdersInput) (*mcp.CallToolResult, ListOrdersOutput, error) {
	return nil, ListOrdersOutput{Orders: listOrders()}, nil
}
