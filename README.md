# FRP-All in One

一个基于 Web 的 FRP 内网穿透管理系统，提供从登录到自动部署的完整解决方案。

## ✨ 核心特性

- 🎯 **零门槛部署**：一键 Docker Compose 完成所有配置
- 🔐 **安全可靠**：JWT 身份验证 + Bcrypt 密码加密
- 🚀 **自动化**：Web 界面配置 FRPS，自动生成 FRPC 部署脚本
- 📊 **可视化管理**：客户端状态监控、隧道配置可视化
- 🌐 **国际化**：支持中文/英文切换
- 🎨 **现代化 UI**：浅绿色主题，响应式设计

## 🏗️ 技术架构

| 组件 | 技术栈 |
|------|--------|
| **前端** | React + Vite + Tailwind CSS |
| **后端** | Python (FastAPI) + SQLite |
| **部署** | Docker Compose (3 容器) |
| **FRP** | 官方 Latest 镜像 (自动获取最新版本) |

## 📦 快速开始

### 前置要求

- Docker & Docker Compose
- 一台具有公网 IP 的服务器
- 开放端口：80 (Web)、7000 (FRP)

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git
cd FRP-ALL-IN-ONE/deploy

# 2. 启动服务（首次启动会自动构建）
chmod +x deploy.sh
sudo ./deploy.sh
```

就是这么简单！🎉

### 默认账户

| 用户名 | 密码 |
|--------|------|
| admin | 123456 |

> ⚠️ **请登录后立即修改默认密码！**

### 低内存服务器部署（512MB-1GB）

如果服务器内存不足 1GB，需要先配置 Swap：

```bash
# 运行 Swap 配置脚本
chmod +x setup-swap.sh
sudo ./setup-swap.sh

# 然后正常部署
sudo ./deploy.sh
```

## 🎮 使用流程

### 1️⃣ 登录系统

访问 `http://服务器IP`，使用默认账户登录。

### 2️⃣ 配置 FRPS

登录后进入配置向导，设置：
- **监听端口**（默认 7000）
- **公网 IP**（自动检测，如检测失败请手动输入）

点击部署后，系统将：
- ✅ 自动生成配置文件
- ✅ 重启 FRPS 容器
- ✅ 显示配置信息（Token、公网 IP）

### 3️⃣ 部署 FRPC 客户端

系统会自动生成一键部署脚本，在内网机器上执行：

```bash
# 方式一：下载脚本后执行
chmod +x deploy-frpc.sh
sudo ./deploy-frpc.sh

# 方式二：复制脚本内容粘贴执行
```

脚本会自动：
- 检测系统架构（支持 amd64/arm64/arm 等）
- 下载对应版本的 FRP
- 创建 systemd 服务
- 启动并设置开机自启

同时会自动安装并启动 **配置同步 Agent（frp-agent）**：
- Agent 会向管理端自注册设备并周期性上报心跳（用于“设备列表”展示在线状态）
- Agent 会拉取你在控制台配置的端口映射，并对 frpc 执行热重载（`frpc reload`）

> 说明：FRP 里 “frpc 已连接 frps” 只代表控制连接建立，未配置任何代理（proxy）时 `proxies=[]` 是正常的。设备展示与映射下发由 Agent 机制提供。
>
> 兼容性：如果你之前使用旧版脚本只安装了 frpc，没有安装 frp-agent，那么控制台只能看到“已连接客户端数”，但不会出现设备列表项；建议重新下载并执行新版脚本（或补装 frp-agent）。

### 4️⃣ 管理隧道

在 Web 界面中：
1. 在“设备列表”中查看已注册设备（Agent 自动注册，也可手动添加）
2. 为设备新增端口映射（TCP/UDP/HTTP/HTTPS）
3. 等待 Agent 同步并热重载 frpc，随后可在“客户端列表/隧道列表”看到 proxy 与流量/连接数

> 注意：页面里的“禁用/启用端口”是对服务端端口放行策略的管理（FRPS allowPorts），属于全局配置。

## 🔧 运维命令

### 服务端 (Docker)

```bash
# 查看所有容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启所有服务
docker-compose restart

# 仅重启 FRPS
docker restart frps

# 停止服务
docker-compose down

# 重新构建并启动
docker-compose up -d --build
```

### 客户端 (FRPC)

```bash
# 查看服务状态
systemctl status frpc

# 查看日志
journalctl -u frpc -f

# 重启服务
systemctl restart frpc

# 停止服务
systemctl stop frpc
```

### 客户端（配置同步 Agent）

```bash
# 查看服务状态
systemctl status frp-agent

# 查看日志
journalctl -u frp-agent -f

# 重启服务
systemctl restart frp-agent
```

## 🗑️ 卸载 FRPC 客户端

如果客户端部署失败或需要重新部署，可使用卸载脚本：

```bash
# 下载卸载脚本（或从 deploy 目录获取）
# 然后执行
chmod +x uninstall-frpc.sh
sudo ./uninstall-frpc.sh
```

卸载脚本会：
- 停止并禁用 frpc 服务
- 删除系统服务文件
- 删除安装目录 `/opt/frp`
- 清理所有配置文件

## ⚠️ 安全组配置

> **重要**：云服务器需要在安全组中开放以下端口！

| 端口 | 协议 | 用途 |
|------|------|------|
| 80 | TCP | Web 管理界面 |
| 7000 | TCP | FRP 服务端口（客户端连接） |
| 任意 | TCP/UDP | **Host 模式已开启**：FRP 可使用服务器所有空闲端口，请根据实际使用的端口开放安全组 |

**注意**：后续通过 FRP 开放的任何端口，都需要在安全组中添加对应规则！

例如：配置 SSH 代理到公网 6022 端口，就需要确保云服务器安全组已开放 `6022/TCP`。

## 📁 项目结构

```
FRP-ALL-IN-ONE/
├── agent/               # 设备端 Agent（自注册/心跳/配置同步）
│   └── frp_agent.py
├── server/              # 后端 API (FastAPI)
│   ├── main.py         # 主程序入口
│   ├── models.py       # 数据库模型
│   ├── crud.py         # 数据库操作
│   ├── frp_deploy.py   # FRP 部署逻辑
│   └── Dockerfile
├── frontend/            # Web 界面 (React)
│   ├── src/
│   │   ├── App.jsx     # 主组件
│   │   ├── Login.jsx   # 登录页
│   │   ├── SetupWizard.jsx  # 设置向导
│   │   ├── i18n.js     # 国际化配置
│   │   └── LanguageContext.jsx  # 语言上下文
│   └── Dockerfile
├── deploy/              # 部署相关文件
│   ├── deploy.sh       # 一键部署脚本
│   ├── docker-compose.yml
│   ├── setup-swap.sh   # Swap 配置脚本
│   └── uninstall-frpc.sh  # FRPC 卸载脚本
└── README.md
```

## 🐛 常见问题

### Q: FRPS 配置后没有生效？

```bash
# 手动重启 FRPS 容器
docker restart frps
```

### Q: FRPC 客户端连接失败，提示 Token 不匹配？

这是因为服务端重新部署后 Token 更新了，但客户端还是旧 Token。

**解决方法**：
1. 在服务端 Web 界面重新下载客户端脚本
2. 在客户端机器上重新执行脚本

或者手动更新 Token：
```bash
# 编辑客户端配置
nano /opt/frp/frpc.toml
# 修改 auth.token 为服务端显示的最新 Token
systemctl restart frpc
```

### Q: 忘记管理员密码？

目前需要手动重置数据库或联系开发者添加密码重置功能。

### Q: 客户端部署失败如何清理？

使用卸载脚本：
```bash
chmod +x uninstall-frpc.sh
sudo ./uninstall-frpc.sh
```

### Q: 为什么 frpc 已连接但控制台显示 0（proxies=[]）？

这是正常现象：没有配置任何端口映射（proxy）时，FRPS Dashboard API 会返回 `proxies=[]`，因此流量/连接统计为 0。

本项目通过 **设备端 Agent** 来实现“设备可见 + 映射可下发”：
- 设备上线：Agent 自注册 + 心跳 → 控制台“设备列表”显示在线
- 配置映射：控制台新增映射 → Agent 拉取配置 → `frpc reload` 生效 → `proxies` 开始出现

另外，从当前版本开始：
- `GET /clients/{client_id}/config` 需要携带 `X-Client-Token` 才能拉取配置（由 Agent 自动处理）

### Q: macOS/Windows 本地测试连接失败？

由于 Docker 桌面版的实现原理（运行在虚拟机中），Host 模式下的端口可能不会自动转发到本机 `localhost`。

**解决方法**：
如果您是在本地 Mac/Windows 上测试且发现 FRPC 连接不上，请修改 `deploy/docker-compose.yml`，注释掉 Host 模式并恢复端口映射：

```yaml
  frps:
    # network_mode: "host"  # 注释掉这行
    ports:
      - "7000:7000"
      - "7500:7500"
      - "6000-7000:6000-7000" # 重新启用端口映射
```

然后重新部署：
```bash
docker-compose up -d --build
```

### Q: 如何修改 FRP 代理端口范围（非 Host 模式）？

如果您未使用默认推荐的 Host 模式，而是使用端口映射模式，可以编辑 `deploy/docker-compose.yml`:

```yaml
frps:
  ports:
    - "7000:7000"
    - "6000-6100:6000-6100"  # 增加端口范围
```

然后重新构建：
```bash
docker-compose up -d --build
```

## 🛡️ 安全建议

- ✅ 首次登录后立即修改默认密码
- ✅ 使用强密码（至少 12 位，包含大小写字母、数字、特殊字符）
- ✅ 定期更新 Docker 镜像
- ✅ 限制后台访问 IP（可配置 Nginx 白名单）
- ✅ 安全组仅开放必要端口

## 📄 许可证

MIT License

## 🙏 致谢

- [FRP](https://github.com/fatedier/frp) - 优秀的内网穿透工具
- FastAPI、React - 强大的开发框架

---

**⭐ 如果这个项目对您有帮助，请给我们一个 Star！**
