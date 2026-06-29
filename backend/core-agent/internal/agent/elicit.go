package agent

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ElicitRegistry 管理 pending 的下单确认请求：agent 的 sink 注册一个 id 并阻塞等待，
// /elicit/respond 按 id 投递用户的响应。两者跨 HTTP 请求，所以用 id 路由。
type ElicitRegistry struct {
	mu      sync.Mutex
	pending map[string]chan *mcp.ElicitResult
	Timeout time.Duration // 用户不响应的超时，到点自动 cancel
}

// NewElicitRegistry 构造一个注册表。timeout<=0 时默认 60s。
func NewElicitRegistry(timeout time.Duration) *ElicitRegistry {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	return &ElicitRegistry{pending: make(map[string]chan *mcp.ElicitResult), Timeout: timeout}
}

// Register 生成一个唯一 elicit_id，登记一个等待 channel。
// 调用方在结束等待后必须 Unregister 释放。
func (r *ElicitRegistry) Register() (id string, ch chan *mcp.ElicitResult) {
	id = genID()
	ch = make(chan *mcp.ElicitResult, 1)
	r.mu.Lock()
	r.pending[id] = ch
	r.mu.Unlock()
	return id, ch
}

// Deliver 投递用户的响应给等待中的 sink。返回 false 表示 id 不存在（已超时/已处理）。
func (r *ElicitRegistry) Deliver(id string, res *mcp.ElicitResult) bool {
	r.mu.Lock()
	ch, ok := r.pending[id]
	r.mu.Unlock()
	if !ok {
		return false
	}
	select {
	case ch <- res:
		return true
	default:
		return false // channel 已被消费（重复提交）
	}
}

// Unregister 释放一个 id。sink 等待结束后调用。
func (r *ElicitRegistry) Unregister(id string) {
	r.mu.Lock()
	delete(r.pending, id)
	r.mu.Unlock()
}

// genID 生成一个短的随机 hex id，用于前端回传关联。
func genID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "elicit_" + hex.EncodeToString(b[:])
}

// ElicitEvent 是推给前端的 elicit 事件载荷。前端据此渲染确认 UI，
// 然后用 POST /elicit/respond {id, action, content} 回传。
type ElicitEvent struct {
	ID      string `json:"id"`
	Message string `json:"message"`
	Schema  any    `json:"schema,omitempty"` // 可编辑字段的 JSON Schema
}
