<div align="center">
  <h1>FRP-ALL-IN-ONE</h1>
  <p>一个基于 Web 的 FRP 内网穿透管理系统：用浏览器完成 <b>FRPS 配置</b>、<b>客户端一键部署</b>、<b>设备注册/心跳</b>、<b>端口映射管理</b>，并提供<b>实时流量监控</b>与<b>系统资源监控</b>。</p>
  <p>
    <a href="https://github.com/GreenhandTan/FRP-ALL-IN-ONE/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/GreenhandTan/FRP-ALL-IN-ONE?style=flat&logo=github"></a>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/GreenhandTan/FRP-ALL-IN-ONE?style=flat"></a>
    <img alt="Podman" src="https://img.shields.io/badge/Podman-892CA0?style=flat&logo=podman&logoColor=white">
    <img alt="Go" src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white">
    <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white">
    <img alt="React" src="https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=000">
  </p>
  <p>
    <a href="#features">功能特性</a> ·
    <a href="#quick-start-server">部署指南</a> ·
    <a href="#ports">端口放行</a> ·
    <a href="#troubleshooting">排障</a> ·
    <a href="#license">开源协议</a>
  </p>
  <p>
    <a href="README.md">简体中文</a> |
    <a href="README.en.md">English</a> |
    <a href="README.zh-TW.md">繁體中文</a>
  </p>
</div>

<a id="author"></a>

## 作者与社区

- 博客：https://greenhandtan.top

<a id="stars"></a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=GreenhandTan/FRP-ALL-IN-ONE&type=date&legend=top-left)](https://www.star-history.com/#GreenhandTan/FRP-ALL-IN-ONE&type=date&legend=top-left)

<a id="demo"></a>

## 效果演示

### 主控制台

<img src="demo.png" alt="FRP-ALL-IN-ONE Demo" width="900" />

### 实时日志

<img src="demo-logs.png" alt="FRP-ALL-IN-ONE Logs" width="900" />

<a id="toc"></a>

## 目录

- [核心特性](#features)
- [架构说明](#architecture)
- [快速开始（服务端）](#quick-start-server)
- [首次使用流程](#first-time-workflow)
- [HTTPS 配置（可选）](#https-setup)
- [端口与安全组](#ports)
- [监控与统计说明](#monitoring)
- [常用运维命令](#ops)
- [排障指南](#troubleshooting)
- [卸载客户端](#uninstall)
- [项目结构](#layout)
- [开发与构建](#development)
- [开源协议与使用要求](#license)

<a id="features"></a>

## 核心特性

### 🚀 部署与管理

- **一键部署**：Podman Compose 启动管理后台、Web、FRPS
- **配置向导**：Web 界面完成 FRPS 端口、Token、公网 IP 设置
- **一键脚本**：自动生成客户端部署脚本（支持多架构、systemd、开机自启）
- **HTTPS 全自动**：支持自动申请 Let's Encrypt 证书或上传自定义证书

### 🔐 安全增强

- **强制修改密码**：首次登录强制修改默认密码，密码强度校验（8位+大小写+数字）
- **JWT 安全**：自动生成强密钥并持久化，支持环境变量覆盖
- **API 限流**：登录接口 5次/分钟，证书申请 3次/小时，防止暴力破解
- **证书自动续期**：Let's Encrypt 证书自动续期，到期前 30 天自动处理

### 📊 实时监控

- **实时流量监控**：Agent 每 3 秒采集网络流量速率，WebSocket 实时推送
- **系统资源监控**：CPU、内存、磁盘使用率实时显示
- **累计流量统计**：顶部卡片展示所有客户端的累计总流量
- **隧道流量统计**：每个隧道独立显示累计流量

### 🔧 Agent 机制

- **自动注册**：客户端自动上报 hostname、OS、架构，自动命名设备
- **心跳上报**：定时上报系统指标（CPU、内存、磁盘、网络速率）
- **配置热重载**：通过 FRPC Admin API 热重载配置，无需重启服务
- **实时日志**：WebSocket 推送 FRPC 运行日志到控制台
- **协议自适应**：Agent 自动检测服务器协议（ws/wss）并切换

### 🌐 其他特性

- **WebSocket 实时推送**：每秒推送状态更新，无需手动刷新
- **国际化**：支持中文/英文/繁体中文切换
- **数据持久化**：SQLite 数据库和证书自动持久化到 Podman 卷

<a id="architecture"></a>

## 架构说明

```mermaid
flowchart TB
    subgraph Server["服务端 Podman Compose"]
        Web["Web<br/>Nginx + React<br/>:80/TCP 或 :443/TCP"]
        Backend["Backend<br/>FastAPI + SQLite<br/>WebSocket 实时推送"]
        FRPS["FRPS<br/>FRP Server<br/>:7000 + :7500"]
        Web <--> Backend
        Backend <--> FRPS
    end

    subgraph Client["客户端"]
        Agent["frp-agent Go<br/>WebSocket 连接管理端<br/>自动注册设备<br/>每3秒采集系统指标<br/>配置热重载"]
        FRPC["frpc<br/>与 FRPS 建立连接<br/>承载代理转发"]
        Agent --> FRPC
    end

    Backend <-.->|"WebSocket<br/>心跳/指标/日志<br/>ws:// 或 wss://"| Agent
    FRPS <-->|"控制连接<br/>数据转发"| FRPC
```

<a id="quick-start-server"></a>

## 快速开始（服务端）

### 前置要求

- 一台具备公网 IP 的服务器（**建议采用 Linux 系统，已完整适配本项目的部署**）
- Podman & Podman Compose（脚本可自动安装）
- 端口放行（至少）：80/TCP、FRPS 端口（默认 7000/TCP）

> 💡 **系统建议**：本项目基于 Podman 部署，脚本支持自动识别 Linux 发行版并安装依赖（含 Alpine / Debian / Ubuntu / RHEL 系）。Windows 和 macOS 可作为客户端运行，但作为公网服务器建议使用 Linux。

### 一键部署

```bash
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git
cd FRP-ALL-IN-ONE/deploy

chmod +x deploy.sh
sudo ./deploy.sh
```

### 默认账户

| 用户名 | 密码   |
| ------ | ------ |
| admin  | 123456 |

> ⚠️ **系统已强制要求首次登录后修改默认密码**，密码需满足：至少 8 位，包含大写字母、小写字母和数字。

### 低内存服务器（512MB-1GB）

```bash
cd FRP-ALL-IN-ONE/deploy
chmod +x setup-swap.sh
sudo ./setup-swap.sh
sudo ./deploy.sh
```

### 数据持久化

当前 `compose.yml` 已默认启用数据持久化：

- `frp-data`：FRP 配置文件持久化
- `frp-certs`：SSL 证书持久化
- `./data`：SQLite 数据库持久化

<a id="first-time-workflow"></a>

## 首次使用流程

### 1) 登录管理台

访问：`http://<服务器公网IP>`

使用默认账户登录后，系统将**强制要求修改密码**。

### 2) 配置 FRPS（向导）

在向导中设置：

- 监听端口（默认 7000）
- 公网 IP（支持自动探测）

### 3) 部署客户端

在向导"客户端脚本"页面下载脚本，在内网机器执行：

```bash
chmod +x deploy-frpc.sh
sudo ./deploy-frpc.sh
```

### 4) 创建端口映射

在控制台"设备列表"中：

1. 选择设备 → 新增映射（TCP/UDP/HTTP/HTTPS）
2. 等待 Agent 同步并热重载
3. 通过 `公网IP:remote_port` 访问内网服务

<a id="https-setup"></a>

## HTTPS 配置（可选）

系统支持两种 HTTPS 启用方式：

### 方式一：自动申请 Let's Encrypt 证书（推荐）

1. 进入"系统设置 → 域名与 HTTPS"
2. 输入你的域名（如 `frp.example.com`）
3. 按提示将域名 A 记录解析到服务器公网 IP
4. 点击"检测 DNS"验证解析是否正确
5. 点击"启用 HTTPS"，系统将自动：
   - 申请 Let's Encrypt 证书
   - 配置 Nginx
   - 重载服务
6. 完成后自动跳转到 `https://你的域名`

> 🔒 **自动续期**：证书将在过期前 30 天自动续期，无需手动干预。

### 方式二：上传自定义证书

1. 进入"系统设置 → 域名与 HTTPS"
2. 选择"自定义证书"标签
3. 上传证书文件（.crt/.pem）和私钥文件（.key）
4. 输入域名并启用 HTTPS

### 查看证书状态

```bash
# 查看证书信息和过期时间
curl http://localhost:8000/api/settings/tls-status
```

<a id="ports"></a>

## 端口与安全组

| 端口                      | 协议    | 用途                        |
| ------------------------- | ------- | --------------------------- |
| 80                        | TCP     | Web 管理界面（HTTP）        |
| 443                       | TCP     | Web 管理界面（HTTPS，可选） |
| 7000（或自定义 bindPort） | TCP     | frpc 控制连接               |
| 49152-65535               | TCP/UDP | 推荐的私有端口范围          |

> 💡 每个 `remote_port` 都需要在安全组中放行才能从外部访问。

<a id="monitoring"></a>

## 监控与统计说明

### 数据刷新频率

| 环节                 | 刷新频率         |
| -------------------- | ---------------- |
| Agent 系统指标采集   | 每 3 秒          |
| WebSocket 推送到前端 | 每 1 秒          |
| 前端 UI 更新         | 实时（事件驱动） |
| 证书续期检查         | 每 24 小时       |

### 流量统计口径

| 指标                      | 说明                                              |
| ------------------------- | ------------------------------------------------- |
| 顶部"总流量"              | 所有客户端的机器级别累计流量（包含所有网络流量）  |
| 客户端卡片"传入/传出流量" | 该客户端的实时网络速率（B/s、KB/s、MB/s）         |
| 隧道"总流量"              | 该隧道的累计流量（来自 FRPS API，连接关闭后更新） |

### 在线状态判断

- Agent 心跳 `last_seen` 在 30 秒内视为在线
- WebSocket 连接状态实时显示

<a id="ops"></a>

## 常用运维命令

### 服务端（Podman）

```bash
cd FRP-ALL-IN-ONE/deploy

# 查看状态
podman compose -f compose.yml ps
podman compose -f compose.yml logs -f

# 重启服务
podman compose -f compose.yml restart
podman restart frps

# 重新构建（更新到最新版本）
podman compose -f compose.yml down
podman compose -f compose.yml pull
podman compose -f compose.yml up -d --build

# 查看证书续期日志
podman exec frp-manager-backend cat /var/log/acme.cron.log
```

### 客户端

```bash
# frp-agent 状态
systemctl status frp-agent --no-pager
journalctl -u frp-agent -n 200 --no-pager
```

<a id="troubleshooting"></a>

## 排障指南

### 端口映射创建了但访问不了

1. **检查外网连通性**（在非服务器本机测试）

   ```bash
   nc -vz <公网IP> <remote_port>
   ```

2. **检查安全组/防火墙**：确认端口已放行

3. **检查 FRPS 是否监听**

   ```bash
   ss -lntp | grep :<remote_port>
   podman logs frps --tail 200
   ```

4. **检查客户端配置同步**
   ```bash
   grep -n "<remote_port>" /opt/frp/frpc.toml
   journalctl -u frp-agent -n 200 --no-pager
   ```

### 设备无法注册/不显示

```bash
systemctl status frp-agent --no-pager
cat /opt/frp/agent.json
```

确认 Agent 服务正常运行且能连接到管理端。

### HTTPS 证书申请失败

1. **检查 DNS 解析**：确保域名 A 记录已正确指向服务器公网 IP
2. **检查端口 80**：Let's Encrypt 验证需要临时使用 80 端口
3. **查看日志**：`podman logs frp-manager-backend | grep -i "cert\|acme"`
4. **手动触发续期**：在 Web 界面点击"续期证书"按钮

<a id="uninstall"></a>

## 卸载客户端

```bash
cd FRP-ALL-IN-ONE/deploy
chmod +x uninstall-frpc.sh
sudo ./uninstall-frpc.sh
```

<a id="layout"></a>

## 项目结构

```
FRP-ALL-IN-ONE/
├── agent/                 # 设备端 Agent（Go 语言）
│   ├── cmd/frp-agent/     # 主程序入口
│   └── internal/          # 内部模块
│       ├── config/        # 配置管理
│       ├── frpc/          # FRPC 进程管理
│       ├── logger/        # 日志采集
│       ├── monitor/       # 系统监控（CPU/内存/磁盘/网络）
│       └── ws/            # WebSocket 客户端
├── server/                # 后端 API（FastAPI + SQLite）
│   ├── core/              # 核心基础设施
│   │   ├── dependencies.py    # 依赖注入（认证、数据库）
│   │   ├── exceptions.py      # 统一异常处理
│   │   └── rate_limit.py      # API 限流
│   ├── routers/           # API 路由
│   │   ├── auth.py            # 认证（登录、修改密码）
│   │   ├── clients.py         # 客户端、隧道管理
│   │   ├── agents.py          # Agent 管理、指标查询
│   │   ├── frp_server.py      # FRPS 管理、安装脚本
│   │   ├── system.py          # 系统状态
│   │   └── settings.py        # 域名与 HTTPS 设置
│   └── services/          # 业务逻辑层
│       ├── tls_manager.py     # 证书申请、Nginx 配置
│       └── dns_checker.py     # DNS 解析验证
├── frontend/              # Web 界面（React + Vite + TailwindCSS）
├── deploy/                # 部署脚本 & compose
├── demo.png               # 演示截图
└── demo-logs.png          # 日志功能截图
```

<a id="development"></a>

## 开发与构建

### 前端

```bash
cd frontend
npm install
npm run dev
```

### Agent

```bash
cd agent
go build -o frp-agent ./cmd/frp-agent
```

### 后端

后端以 Podman 方式运行最稳定；如需本地运行可参考 `server/` 目录。

```bash
cd server
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

<a id="license"></a>

## 开源协议与使用要求

本项目采用 **MIT License**（见 [LICENSE](LICENSE)）。

你可以：

- 免费使用（个人/组织）
- 免费商用
- 修改、二次开发、分发

你需要遵守：

- 保留许可证与版权声明
- 注明原作者为 **GreenhandTan**

## 🛡️ 安全建议

- ✅ 首次登录后立即修改默认密码（系统已强制要求）
- ✅ 使用强密码（至少 8 位，包含大小写+数字）
- ✅ 定期更新 Podman 镜像
- ✅ 安全组仅开放必要端口
- ✅ FRPS Dashboard（7500）建议仅允许本机访问
- ✅ 启用 HTTPS 以加密通信（推荐生产环境使用）

## 🙏 致谢

- [FRP](https://github.com/fatedier/frp) - 优秀的内网穿透工具
- [gopsutil](https://github.com/shirou/gopsutil) - Go 系统监控库
- [acme.sh](https://github.com/acmesh-official/acme.sh) - 全功能 Let's Encrypt 客户端

---

**⭐ 如果这个项目对您有帮助，请给我们一个 Star！**
