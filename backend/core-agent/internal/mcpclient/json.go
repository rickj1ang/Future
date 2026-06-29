package mcpclient

import "encoding/json"

// marshalJSON / jsonUnmarshal 是 encoding/json 的薄封装，
// 避免在调用处重复 import（也避免与 mcp 包内可能的 json 别名混淆）。
func marshalJSON(v any) ([]byte, error)   { return json.Marshal(v) }
func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }
