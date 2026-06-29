# ─────────────────────────────────────────────
# core-agent 镜像（多阶段构建）
# 编译静态二进制 -> alpine 运行，镜像约 15MB
# 端口: 8081  路由: /chat(SSE) /elicit/respond /health
# ─────────────────────────────────────────────

# ---- builder ----
FROM golang:1.26-alpine AS builder
WORKDIR /src

# 先拷依赖清单，利用层缓存（改代码不重下依赖）
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# 静态编译：CGO 关、去调试信息、裁剪符号表
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath -ldflags="-s -w" \
    -o /out/core-agent ./cmd

# ---- runtime ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /out/core-agent .

EXPOSE 8081
CMD ["/app/core-agent"]
