# Future

## 仓库结构

```
Future/
├── backend/            # 后端（Go）
│   ├── core-agent/     # 核心 Agent 服务
│   └── mcp-server/     # MCP 工具服务
└── frontend/           # 前端（React + Vite + TypeScript）
```

## 快速开始

### 前端

```bash
cd frontend
cp .env.example .env       # 按需填写后端地址
npm install
npm run dev
```

### 后端

```bash
cd backend/core-agent      # 或 backend/mcp-server
go run ./cmd
```

详细说明见各子目录下的文档。
