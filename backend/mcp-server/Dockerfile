# ─────────────────────────────────────────────
# mcp-server 镜像（多阶段构建）
# 编译静态二进制 -> alpine 运行
# 端口: 8080  路径: /mcp (HTTP 模式)
# 注意: kline.html 通过 go:embed 已打入二进制
# ─────────────────────────────────────────────

# ---- builder ----
FROM golang:1.26-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath -ldflags="-s -w" \
    -o /out/mcp-server ./cmd

# ---- runtime ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /out/mcp-server .

EXPOSE 8080
# 容器内必须用 HTTP 模式（默认是 stdio，只适合本地客户端）
CMD ["/app/mcp-server", "-transport", "http", "-addr", ":8080", "-path", "/mcp"]
