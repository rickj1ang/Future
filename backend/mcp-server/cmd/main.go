package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"mcp-server/internal/server"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// 用法：
//
//   # 1) stdio 模式（默认，适合 Claude Desktop / Cursor / Claude Code 等本地客户端）
//   go run ./cmd
//
//   # 2) HTTP 模式（远程服务，监听 :8080/mcp）
//   go run ./cmd -transport http -addr :8080 -path /mcp
//
// 在 Claude Desktop 的 mcpServers 配置里写：
//   { "command": "go", "args": ["run", "./cmd"], "cwd": "<本仓库路径>" }
func main() {
	var (
		transport = flag.String("transport", "stdio", "传输方式: stdio | http")
		addr      = flag.String("addr", ":8080", "HTTP 监听地址（仅 http 模式）")
		path      = flag.String("path", "/mcp", "HTTP 服务路径（仅 http 模式）")
	)
	flag.Parse()

	srv := server.New()

	ctx, stop := signal.NotifyContext(context.Background(),
		os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch *transport {
	case "stdio":
		log.Printf("starting MCP server in stdio mode")
		if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
			log.Fatalf("stdio server exited: %v", err)
		}

	case "http":
		mux := http.NewServeMux()
		mux.Handle(*path, server.NewStreamableHTTPHandler(srv))
		httpSrv := &http.Server{Addr: *addr, Handler: mux}

		go func() {
			log.Printf("starting MCP server on http://%s%s", *addr, *path)
			if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("http server exited: %v", err)
			}
		}()

		<-ctx.Done()
		log.Printf("shutting down")
		_ = httpSrv.Shutdown(context.Background())

	default:
		log.Fatalf("unknown transport %q (use stdio or http)", *transport)
	}
}
