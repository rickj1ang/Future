# ─────────────────────────────────────────────
# future-frontend 镜像（多阶段构建）
# Stage 1: Node 构建 Vite 静态产物
# Stage 2: nginx serve + 反代 core-agent
# ─────────────────────────────────────────────

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# 生产构建；后端地址用相对路径（nginx 反代到 core-agent）
RUN npm run build

# ---- runtime ----
FROM nginx:1.27-alpine
# nginx 配置：静态托管 + 反向代理 core-agent（含 SSE 透传）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 把 Vite 产物拷到 nginx html 目录
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
