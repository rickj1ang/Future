package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type PlaceOrderInput struct {
	Code      string    `json:"code"      jsonschema:"股票代码或名称"`
	Direction Direction `json:"direction" jsonschema:"买卖方向：buy 或 sell"`
	Price     float64   `json:"price,omitempty" jsonschema:"价格（市价单可忽略）"`
	Quantity  int       `json:"quantity"  jsonschema:"数量（股），至少 1"`
	Type      OrderType `json:"type"      jsonschema:"订单类型：limit（限价）或 market（市价）"`
}

type PlaceOrderOutput struct {
	Order Order `json:"order"`
}

// ElicitActionXXX 是用户对确认请求的响应动作（来自 ElicitResult.Action）。
// 规范定义见 protocol ElicitResult 注释。
const (
	ElicitActionAccept  = "accept"  // 用户提交表单/确认
	ElicitActionDecline = "decline" // 用户明确拒绝
	ElicitActionCancel  = "cancel"  // 用户关闭对话框（无明确选择）
)

// PlaceOrder 下单（买入/卖出，限价/市价）。
//
// 安全机制：下单是有副作用的破坏性操作，绝不能由 AI 直接执行。
// handler 收到调用后，先通过 elicitation 向 host 发起"请求用户确认"：
//   - host 弹出确认表单（用户可查看/修改参数）
//   - 用户 accept  → 用（可能修改过的）参数真正下单
//   - 用户 decline → 返回"用户已拒绝"
//   - 用户 cancel  → 返回"用户已取消"
//   - client 不支持 elicitation → 返回错误，绝不静默下单
func PlaceOrder(ctx context.Context, req *mcp.CallToolRequest, in PlaceOrderInput) (*mcp.CallToolResult, PlaceOrderOutput, error) {
	// 用一份可被用户修改的副本做确认；最终下单以用户提交的为准。
	confirmed := in

	res, err := req.Session.Elicit(ctx, &mcp.ElicitParams{
		Message: fmt.Sprintf("确认下单：%s %s %d 股 %s，价格 %.2f", in.Code, in.Direction, in.Quantity, in.Type, in.Price),
		RequestedSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"code":      map[string]any{"type": "string", "description": "股票代码"},
				"direction": map[string]any{"type": "string", "enum": []string{"buy", "sell"}},
				"price":     map[string]any{"type": "number", "description": "价格（市价单可忽略）"},
				"quantity":  map[string]any{"type": "integer", "minimum": 1, "description": "数量（股）"},
				"type":      map[string]any{"type": "string", "enum": []string{"limit", "market"}},
			},
		},
	})
	if err != nil {
		// 通常是 "client does not support elicitation"：安全起见拒绝下单，
		// 而不是放行。返回 error 会被 ToolHandlerFor 转成 IsError=true 的结果。
		return nil, PlaceOrderOutput{}, fmt.Errorf("下单需要用户确认，但当前客户端不支持 elicitation：%w", err)
	}

	switch res.Action {
	case ElicitActionAccept:
		// 用户可能修改了参数，以提交的为准。解析失败时回退到 AI 原始参数。
		if c, err := parsePlaceOrderContent(res.Content); err == nil {
			confirmed = c
		} else {
			log.Printf("place_order: 解析用户提交参数失败，回退到 AI 参数: %v", err)
		}
	case ElicitActionDecline:
		// 用户明确拒绝。返回 IsError=true 让 AI 知道并停止后续动作。
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{&mcp.TextContent{Text: "用户已拒绝本次下单"}},
		}, PlaceOrderOutput{}, nil
	case ElicitActionCancel:
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{&mcp.TextContent{Text: "用户已取消本次下单"}},
		}, PlaceOrderOutput{}, nil
	default:
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf("未知的确认响应：%q", res.Action)}},
		}, PlaceOrderOutput{}, nil
	}

	// TODO: 调用真实交易网关下单
	o := &Order{
		Code:      confirmed.Code,
		Direction: confirmed.Direction,
		Price:     confirmed.Price,
		Quantity:  confirmed.Quantity,
		Type:      confirmed.Type,
		Status:    OrderStatusPending,
	}
	saveOrder(o)
	return nil, PlaceOrderOutput{Order: *o}, nil
}

// parsePlaceOrderContent 把 elicitation 返回的 map[string]any 解析回结构化参数。
// 字段缺失时回退到零值（由调用方决定是否接受）。
func parsePlaceOrderContent(content map[string]any) (PlaceOrderInput, error) {
	if content == nil {
		return PlaceOrderInput{}, fmt.Errorf("empty content")
	}
	raw, err := json.Marshal(content)
	if err != nil {
		return PlaceOrderInput{}, err
	}
	var in PlaceOrderInput
	if err := json.Unmarshal(raw, &in); err != nil {
		return PlaceOrderInput{}, err
	}
	return in, nil
}
