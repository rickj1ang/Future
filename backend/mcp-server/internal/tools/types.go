package tools

import "time"

// 通用领域类型。这是 tool 与（未来的）真实券商业务层之间的契约，
// 所以放在 tools 包的顶部集中声明。

type Direction string

const (
	DirectionBuy  Direction = "buy"
	DirectionSell Direction = "sell"
)

type OrderType string

const (
	OrderTypeLimit  OrderType = "limit"  // 限价
	OrderTypeMarket OrderType = "market" // 市价
)

type OrderStatus string

const (
	OrderStatusPending  OrderStatus = "pending"
	OrderStatusFilled   OrderStatus = "filled"
	OrderStatusCanceled OrderStatus = "canceled"
)

// Order 是一个订单，place/list/cancel 工具都会用到。
type Order struct {
	ID        string      `json:"id"`
	Code      string      `json:"code"`
	Name      string      `json:"name,omitempty"`
	Direction Direction   `json:"direction"`
	Price     float64     `json:"price"`
	Quantity  int         `json:"quantity"`
	Type      OrderType   `json:"type"`
	Status    OrderStatus `json:"status"`
	CreatedAt time.Time   `json:"created_at"`
}

// KLine 一根 K 线。
type KLine struct {
	Time   time.Time `json:"time"`
	Open   float64   `json:"open"`
	Close  float64   `json:"close"`
	High   float64   `json:"high"`
	Low    float64   `json:"low"`
	Volume float64   `json:"volume"`
}
