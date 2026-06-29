package tools

import (
	"fmt"
	"sync"
	"time"
)

// 内存订单簿（演示用）。真实环境请替换为交易网关 / 数据库调用。
var (
	orderBookMu sync.Mutex
	orderBook   = make(map[string]*Order)
	nextOrderID int64
)

func saveOrder(o *Order) {
	orderBookMu.Lock()
	defer orderBookMu.Unlock()
	nextOrderID++
	o.ID = fmt.Sprintf("ORD-%d", nextOrderID)
	o.CreatedAt = time.Now()
	orderBook[o.ID] = o
}

func listOrders() []*Order {
	orderBookMu.Lock()
	defer orderBookMu.Unlock()
	out := make([]*Order, 0, len(orderBook))
	for _, o := range orderBook {
		out = append(out, o)
	}
	return out
}

func cancelOrder(id string) (*Order, bool) {
	orderBookMu.Lock()
	defer orderBookMu.Unlock()
	o, ok := orderBook[id]
	if !ok {
		return nil, false
	}
	o.Status = OrderStatusCanceled
	return o, true
}
