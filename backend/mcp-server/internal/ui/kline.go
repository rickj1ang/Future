// Package ui 生成各 tool 对应的 ui:// 资源 HTML。
//
// 数据流见 server 包：tool 返回 _meta.ui.resourceUri 指向一个 ui://
// 资源，host 再用 resources/read 拉取本包生成的自包含 HTML 渲染。
package ui

import (
	_ "embed" // go:embed kline.html 需要
	"encoding/json"
	"fmt"
	"html/template"
	"strings"

	"github.com/yosida95/uritemplate/v3"

	"mcp-server/internal/tools"
)

// MIMEType 是 ui:// 资源返回的 MIME 类型。
const MIMEType = "text/html"

// KLineURITemplate 是 query_kline 暴露的 ui 资源 URI 模板（RFC 6570）。
// client 会用展开后的具体 URI（如 ui://kline/600519）发起 resources/read。
const KLineURITemplate = "ui://kline/{code}"

// MatchKLineURI 把一个具体的 ui://kline/<code> URI 反解出 {code}。
// SDK 的 ResourceTemplate 只做正则匹配、不自动提取变量，所以这里自己提取。
func MatchKLineURI(uri string) (code string, ok bool) {
	tmpl, err := uritemplate.New(KLineURITemplate)
	if err != nil {
		return "", false
	}
	values := tmpl.Match(uri)
	if values == nil {
		return "", false
	}
	v := values.Get("code")
	if !v.Valid() {
		return "", false
	}
	return v.String(), true
}

// RenderKLineChart 生成一张自包含的 K 线图 HTML：K 线数据内嵌为 JSON，
// 图表库走 CDN。host 拿到后可直接塞进 iframe/webview 渲染，无需外部资源。
func RenderKLineChart(code string, k []tools.KLine) (string, error) {
	// tools.KLine.Time 是 time.Time，JSON 序列化为 RFC3339 字符串；
	// 前端用 new Date() 解析后再转成 lightweight-charts 需要的 ut8 秒时间戳。
	type point struct {
		Time  int64   `json:"time"`  // UTC 秒
		Open  float64 `json:"open"`
		High  float64 `json:"high"`
		Low   float64 `json:"low"`
		Close float64 `json:"close"`
	}
	type volPoint struct {
		Time   int64   `json:"time"`
		Value  float64 `json:"value"`
		Color  string  `json:"color"`
	}

	candles := make([]point, len(k))
	vols := make([]volPoint, len(k))
	for i, bar := range k {
		candles[i] = point{
			Time: bar.Time.Unix(),
			Open: bar.Open, High: bar.High, Low: bar.Low, Close: bar.Close,
		}
		color := "rgba(200,200,200,0.5)"
		if bar.Close >= bar.Open {
			color = "rgba(229,81,81,0.6)" // A股红涨
		} else {
			color = "rgba(36,153,84,0.6)" // 绿跌
		}
		vols[i] = volPoint{Time: bar.Time.Unix(), Value: bar.Volume, Color: color}
	}

	candlesJSON, err := json.Marshal(candles)
	if err != nil {
		return "", fmt.Errorf("marshal candles: %w", err)
	}
	volJSON, err := json.Marshal(vols)
	if err != nil {
		return "", fmt.Errorf("marshal volume: %w", err)
	}

	var buf strings.Builder
	if err := klineTpl.Execute(&buf, map[string]any{
		"Code":   code,
		"Candles": template.JS(candlesJSON), // 已是合法 JSON，安全注入
		"Volume":  template.JS(volJSON),
	}); err != nil {
		return "", fmt.Errorf("render template: %w", err)
	}
	return buf.String(), nil
}

//go:embed kline.html
var klineHTML string

// klineTpl 用 lightweight-charts (TradingView) CDN 渲染 K 线图：
//   - 自适应填满容器
//   - 主图：蜡烛图，A 股配色（红涨绿跌）
//   - 副图：成交量柱
//   - 内置交互：缩放、十字线、价格/时间 tooltip
//
// 模板源文件 kline.html 独立存放，以获得编辑器对 HTML 的语法高亮 / 补全 /
// 格式化支持；编译期由 go:embed 嵌入，部署时仍是单个二进制、无外部依赖。
var klineTpl = template.Must(template.New("kline").Parse(klineHTML))
