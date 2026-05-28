<div align="center">

# FRP-ALL-IN-ONE

**一站式 FRP 内网穿透管理平台**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.21-00ADD8?logo=go)](https://go.dev)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)

</div>

---

## 项目简介

FRP-ALL-IN-ONE 是一个基于 [frp](https://github.com/fatedier/frp) 的一站式内网穿透管理平台，提供：

- **Web 管理面板** — 可视化管理所有穿透隧道和客户端设备
- **GitHub OAuth 登录** — 安全的单管理员认证体系
- **实时监控** — WebSocket 实时推送客户端状态、CPU/内存/流量指标
- **一键部署** — 自动生成各平台（Linux / macOS / Windows）Agent 安装脚本
- **自动 HTTPS** — 支持 Let's Encrypt 证书自动申请与续期
- **多协议支持** — TCP / UDP / HTTP / HTTPS 隧道穿透

## 项目结构

```
FRP-ALL-IN-ONE/
├── frontend/                    # 前端（React + TypeScript + Vite + Tailwind CSS）
│   ├── src/
│   │   ├── App.tsx              # 主应用组件（路由、页面、状态管理）
│   │   ├── api.ts               # HTTP API 模块（对接后端 REST API）
│   │   ├── ws.ts                # WebSocket 模块（实时数据推送）
│   │   ├── types.ts             # TypeScript 类型定义
│   │   ├── data.ts              # 静态数据与脚本生成
│   │   └── index.css            # 全局样式（Tailwind CSS）
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── Dockerfile               # 多阶段构建：Node 编译 + Nginx 部署
│
├── server/                      # 后端（Python FastAPI + SQLAlchemy）
│   ├── main.py                  # 应用入口，WebSocket 端点
│   ├── auth.py                  # JWT 认证与 GitHub OAuth
│   ├── models.py                # 数据库模型
│   ├── schemas.py               # Pydantic 数据校验
│   ├── crud.py                  # 数据库增删改查
│   ├── database.py              # SQLite 数据库连接
│   ├── frp_deploy.py            # FRPS 部署与配置生成
│   ├── websocket_manager.py     # WebSocket 连接管理器
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── routers/                 # API 路由模块
│   │   ├── auth.py              #   认证（GitHub OAuth 登录）
│   │   ├── clients.py           #   客户端与隧道管理
│   │   ├── frp_server.py        #   FRPS 状态与部署
│   │   ├── settings.py          #   系统设置（域名、HTTPS、端口）
│   │   ├── system.py            #   系统状态
│   │   └── agents.py            #   Agent 管理
│   ├── services/                # 业务服务
│   │   ├── dashboard.py         #   Dashboard 数据聚合
│   │   ├── tls_manager.py       #   TLS 证书管理
│   │   └── dns_checker.py       #   DNS 解析检测
│   └── core/                    # 核心工具
│       ├── dependencies.py      #   依赖注入（认证、数据库）
│       ├── container_engine.py  #   Podman 容器引擎
│       ├── rate_limit.py        #   API 限流
│       └── exceptions.py        #   异常处理
│
├── agent/                       # 客户端 Agent（Go）
│   ├── cmd/frp-agent/           #   入口
│   ├── internal/                #   内部模块
│   │   ├── config/              #     配置解析
│   │   ├── frpc/                #     FRPC 进程管理
│   │   ├── monitor/             #     系统监控（CPU/内存/网络）
│   │   ├── ws/                  #     WebSocket 通信
│   │   └── logger/              #     日志采集
│   ├── scripts/                 #   安装脚本模板
│   ├── go.mod
│   └── Makefile
│
├── deploy/                      # 部署配置
│   ├── compose.yml              # Docker Compose 编排（从 TCR 拉取镜像）
│   ├── deploy.sh                # 一键部署脚本（自动安装 Podman）
│   ├── frps.toml                # FRPS 服务端配置模板
│   ├── setup-swap.sh            # Swap 创建脚本（低内存服务器）
│   └── uninstall-frpc.sh        # Agent 卸载脚本
│
├── .github/workflows/           # CI/CD
│   ├── build-and-push.yml       #   构建推送 Docker 镜像到腾讯云 TCR
│   └── release-agent.yml        #   编译发布 Agent 二进制到 GitHub Releases
│
└── README.md
```

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 + Lucide Icons + Motion |
| 后端 | Python 3.11 + FastAPI + SQLAlchemy + SQLite + JWT |
| Agent | Go 1.21 + gorilla/websocket + gopsutil |
| 部署 | Podman + Docker Compose + Nginx |
| CI/CD | GitHub Actions + 腾讯云 TCR |

## 快速开始

### 一键部署（推荐）

在你的服务器上执行：

```bash
# 克隆项目
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git
cd FRP-ALL-IN-ONE/deploy

# 一键部署（自动安装 Podman、配置环境变量、启动服务）
sudo sh deploy.sh
```

部署脚本会自动：
1. 安装 Podman 和 compose
2. 配置 GitHub OAuth 凭证
3. 从腾讯云 TCR 拉取预构建镜像
4. 启动所有服务

### 手动部署

```bash
cd deploy

# 配置环境变量
cat > .env <<EOF
GITHUB_CLIENT_ID=你的GitHubOAuth客户端ID
GITHUB_CLIENT_SECRET=你的GitHubOAuth客户端密钥
SECRET_KEY=随机生成的JWT密钥
EOF

# 启动服务
podman compose up -d
```

### 本地开发

**前端开发：**

```bash
cd frontend
npm install
npm run dev     # 启动开发服务器 http://localhost:3000
```

**后端开发：**

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App 客户端 ID | 是 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 客户端密钥 | 是 |
| `SECRET_KEY` | JWT 签名密钥（建议 64 位随机字符串） | 是 |

### GitHub OAuth 配置

1. 前往 [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写：
   - **Homepage URL**: `http://你的服务器IP:8080`
   - **Authorization callback URL**: `http://你的服务器IP:8080/api/auth/github/callback`
4. 获取 Client ID 和 Client Secret，填入 `.env`

> 首个通过 GitHub 登录的用户将自动成为系统管理员。

## CI/CD

### Docker 镜像构建

推送到 `main` 分支时，GitHub Actions 自动检测变更并构建：

- `server/**` 变更 → 构建并推送 `frp-backend` 镜像
- `frontend/**` 变更 → 构建并推送 `frp-frontend` 镜像

镜像推送到腾讯云容器镜像服务（TCR）：
- `sgccr.ccs.tencentyun.com/frp-all-in-one/frp-backend:latest`
- `sgccr.ccs.tencentyun.com/frp-all-in-one/frp-frontend:latest`

手动触发或推送 `v*` tag 时，会同时构建两个镜像并使用版本号标签。

### Agent 发布

推送 `v*` tag 时自动编译多平台 Agent 二进制文件并发布到 GitHub Releases。

### 所需 Secrets

在 GitHub 仓库 Settings → Secrets → Actions 中配置：

| Secret | 说明 |
|--------|------|
| `TCR_USERNAME` | 腾讯云 TCR 访问凭证用户名 |
| `TCR_PASSWORD` | 腾讯云 TCR 访问凭证密码 |

## 服务端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 8080 | Frontend (Nginx) | Web 管理面板 |
| 8000 | Backend (FastAPI) | API 服务（绑定 127.0.0.1，通过 Nginx 代理） |
| 7000 | FRPS | FRP 服务端监听端口 |
| 7500 | FRPS Dashboard | FRPS 内置仪表盘 |

## 许可证

[MIT License](LICENSE)
