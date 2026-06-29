#!/usr/bin/env bash
# ════════════════════════════════════════════════════
# Future 服务器一次性初始化（Debian 12）
# 在服务器上以 root 运行：bash server-init.sh
# 做三件事：装 Docker、建部署目录、写 compose 文件
# ════════════════════════════════════════════════════
set -euo pipefail

DEPLOY_DIR=/opt/future
echo "▶ [1/3] 安装 Docker（Debian 官方源）..."
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  install -m 0755 -d /etc/apt/sources.list.d
  # 用官方预生成的 keyring，避免 gpg --dearmor 在非交互 SSH 下的 tty 问题
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "  Docker 已安装: $(docker --version)"
fi

echo "▶ [2/3] 建部署目录 $DEPLOY_DIR ..."
mkdir -p "$DEPLOY_DIR"

echo "▶ [3/3] 写 compose 与 .env ..."
# compose.prod.yml 由 GitHub Actions 通过 SCP/写文件方式同步到服务器；
# 这里只先放一个占位的 .env，CI 部署时会保留它不覆盖。
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cat > "$DEPLOY_DIR/.env" <<'EOF'
# DeepSeek API 密钥（首次部署前手动填入，CI 不会覆盖此文件）
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
EOF
  echo "  已创建 $DEPLOY_DIR/.env —— 请编辑填入 DEEPSEEK_API_KEY"
else
  echo "  $DEPLOY_DIR/.env 已存在，保留不动"
fi

echo
echo "✅ 初始化完成。下一步："
echo "   编辑 /opt/future/.env 填入 DEEPSEEK_API_KEY"
echo "   随后任意一次推送 backend/** 即会自动部署"
