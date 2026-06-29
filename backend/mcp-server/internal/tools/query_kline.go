package tools

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type QueryKLineInput struct {
	// 没有 omitempty → 自动成为 required 字段。
	Code string `json:"code" jsonschema:"股票代码或名称，例如 600519 或 贵州茅台"`
	// 可选：K 线周期/数量等，按需扩展
}

// QueryKLineOutput 是给 LLM 的结构化结果。
//
// 注意：这里刻意不返回完整 OHLCV 数组（会打爆 context 且对 LLM 无意义），
// 只返回人类可读的摘要 + ui 资源 URI。host 读到 _meta.ui.resourceUri 后
// 会再去请求 ui://kline/{code} 渲染完整可交互图表给人类看。
type QueryKLineOutput struct {
	Code    string `json:"code"`
	Summary string `json:"summary"`            // 文字摘要：区间、涨跌、放量等
	Preview string `json:"preview,omitempty"`  // 最近 1-2 根的简表，便于 LLM 引用
}

// QueryKLine 查询股票 K 线数据。
//
// 返回值约定：
//   - result.Content[0]      : 给 LLM 看的摘要文本
//   - result.Meta["ui"]      : {resourceUri: "ui://kline/<code>"}，host 据此渲染图表
//   - out (QueryKLineOutput) : 结构化摘要，供程序化客户端使用
func QueryKLine(_ context.Context, _ *mcp.CallToolRequest, in QueryKLineInput) (*mcp.CallToolResult, QueryKLineOutput, error) {
	// TODO: 调用真实行情/数据库接口
	ks := FetchKLines(in.Code)

	summary, preview := summarize(in.Code, ks)
	out := QueryKLineOutput{Code: in.Code, Summary: summary, Preview: preview}

	// 给 LLM 的文本：摘要 + 一句话告知"已在对话中展示图表"。
	// 注意 UI 资源的内容（完整 K 线 + 图表）不会进 LLM context。
	text := summary + "\n\n（已在对话中展示 " + in.Code + " 的可交互 K 线图）"

	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
		// _meta.ui.resourceUri 是 host 约定：识别到该字段就去 resources/read
		// 拉取并渲染。外部 host（Cursor/Claude Desktop）和自研 host 均可消费。
		Meta: mcp.Meta{
			"ui": map[string]any{
				// code 可能是中文股票名（如 贵州茅台），必须百分号编码成合法 URI，
				// 否则 SDK 的 URI-template 匹配会失败（RFC 3986 不允许原始非 ASCII）。
				// MatchKLineURI 在反解时会自动解码回原始 code。
				"resourceUri": "ui://kline/" + url.PathEscape(in.Code),
			},
		},
	}, out, nil
}

// FetchKLines 取该股票的 K 线数据。
// tool 与 ui:// 资源渲染都走这里，保证两处看到的是同一份数据。
// 真实环境替换为行情接口。
func FetchKLines(code string) []KLine {
	base := 1800.0
	now := time.Now()
	ks := make([]KLine, 30)
	for i := range 30 {
		day := now.AddDate(0, 0, -(29 - i))
		o := base + float64(i)*0.5
		c := o + 2
		if i%4 == 0 {
			c = o - 1 // 偶尔下跌
		}
		ks[i] = KLine{
			Time:   day,
			Open:   o,
			Close:  c,
			High:   c + 3,
			Low:    o - 1,
			Volume: 10000 + float64(i*500),
		}
	}
	return ks
}

// summarize 把完整 K 线压缩成几十个 token 的摘要，给 LLM 用。
func summarize(code string, ks []KLine) (summary, preview string) {
	if len(ks) == 0 {
		return fmt.Sprintf("%s：无 K 线数据", code), ""
	}
	first, last := ks[0], ks[len(ks)-1]
	hi, lo := ks[0].High, ks[0].Low
	for _, k := range ks {
		if k.High > hi {
			hi = k.High
		}
		if k.Low < lo {
			lo = k.Low
		}
	}
	chg := last.Close - first.Open
	pct := chg / first.Open * 100
	summary = fmt.Sprintf("%s 近 %d 日：最新收盘 %.2f，区间 [%.2f, %.2f]，区间涨跌 %.2f（%+.2f%%）",
		code, len(ks), last.Close, lo, hi, chg, pct)
	preview = fmt.Sprintf("最近一根：开 %.2f / 高 %.2f / 低 %.2f / 收 %.2f / 量 %.0f",
		last.Open, last.High, last.Low, last.Close, last.Volume)
	return summary, preview
}
