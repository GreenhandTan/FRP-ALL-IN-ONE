# FRP-ALL-IN-ONE

一个基于 Web 的 FRP 内网穿透管理系统：用浏览器完成 **FRPS 配置**、**客户端一键部署**、**设备注册/心跳**、**端口映射管理**，并提供近实时的连接/流量展示与排障路径。

## 目录

- [核心特性](#核心特性)
- [架构说明](#架构说明)
- [快速开始（服务端）](#快速开始服务端)
- [首次使用流程](#首次使用流程)
- [端口与安全组](#端口与安全组)
- [监控与统计口径](#监控与统计口径)
- [常用运维命令](#常用运维命令)
- [排障指南](#排障指南)
- [卸载客户端](#卸载客户端)
- [项目结构](#项目结构)
- [开发与构建](#开发与构建)

## 核心特性

- 一键部署：Docker Compose 启动管理后台、Web、FRPS
- 配置向导：Web 中完成 FRPS 端口、Token、公网 IP 设置
- 一键脚本：自动生成客户端脚本（含架构识别、systemd、开机自启）
- Agent 机制：客户端自动注册、心跳上报、配置同步、`frpc reload` 热更新
- 近实时面板：状态/流量/连接数轮询刷新（默认每 3 秒）
- 国际化：中文/英文切换
- 统一弹窗：全站使用同一套轻量弹窗组件（替换浏览器默认 alert/confirm）

## 架构说明

本项目以 **3 个容器** 运行（均使用 `network_mode: host`）：

- Web（Nginx + React）：对外提供管理界面（默认 80/TCP）
- Backend（FastAPI + SQLite）：提供 API、生成配置、重启 FRPS、拉取 FRPS Dashboard 数据
- FRPS：FRP 服务端（默认 7000/TCP）+ Dashboard（默认 7500/TCP，建议仅内网可访问）

客户端侧由两部分组成：

- `frpc`：与 FRPS 建立控制连接并承载代理转发
- `frp-agent`：向管理端自注册、上报心跳、拉取你在 Web 里配置的端口映射，并对 `frpc` 执行热重载

## 快速开始（服务端）

### 前置要求

- 一台具备公网 IP 的服务器
- Docker & Docker Compose
- 端口放行（至少）：80/TCP、FRPS 端口（默认 7000/TCP）

### 一键部署

```bash
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git
cd FRP-ALL-IN-ONE/deploy

chmod +x deploy.sh
sudo ./deploy.sh
```

### 默认账户

| 用户名 | 密码 |
|--------|------|
| admin | 123456 |

请登录后立即修改默认密码。

### 低内存服务器（512MB-1GB）

```bash
cd FRP-ALL-IN-ONE/deploy
chmod +x setup-swap.sh
sudo ./setup-swap.sh
sudo ./deploy.sh
```

### 数据持久化说明（重要）

当前 `docker-compose.yml` 未对后端 SQLite 数据库做持久化挂载；如果你重建/清理容器，**设备/隧道等管理数据会丢失**。  
FRPS 配置文件 `deploy/frps.toml` 已在宿主机上持久化。

如需持久化后台数据，可自行在 `deploy/docker-compose.yml` 中为 backend 增加卷挂载（例如将 `frp_manager.db` 挂载到宿主机目录）。

## 首次使用流程

### 1) 登录管理台

访问：`http://<服务器公网IP>`

### 2) 配置 FRPS（向导）

在向导中设置：

- 监听端口（默认 7000）
- 公网 IP（支持自动探测；失败时手动输入）

点击部署后会：

- 生成 `deploy/frps.toml`
- 重启 FRPS 容器（确保 Token 生效）
- 在页面展示 Token、公网 IP

公网 IP 自动探测支持多源探测，可用环境变量自定义探测源：

- `PUBLIC_IP_URLS`：逗号分隔 URL 列表（可选）

### 3) 部署客户端（frpc + frp-agent）

在向导 “客户端脚本” 页面下载/复制脚本，在内网机器执行：

```bash
chmod +x deploy-frpc.sh
sudo ./deploy-frpc.sh
```

脚本会自动：

- 下载对应架构的 `frpc`
- 写入 `/opt/frp/frpc.toml` 与 systemd 服务
- 安装并启动 `frp-agent`（用于设备注册/心跳/配置同步）

### 4) 创建端口映射

在控制台 “设备列表” 中：

1. 选择设备 → 新增映射（TCP/UDP/HTTP/HTTPS）
2. 等待 Agent 同步并热重载（无需重启服务）
3. 外部即可通过 `公网IP:remote_port` 访问到 `local_ip:local_port`

## 端口与安全组

云服务器安全组/防火墙建议放行：

| 端口 | 协议 | 用途 |
|------|------|------|
| 80 | TCP | Web 管理界面 |
| 7000（或你设置的 bindPort） | TCP | frpc 控制连接 |
| 49152-65535 | TCP/UDP | 推荐作为端口映射使用的私有端口范围（冲突风险更低） |

说明：

- 你在 Web 中创建的每个 `remote_port`，都必须在安全组中允许入站，否则外部无法访问。
- 推荐尽量使用 `49152-65535` 私有端口范围；但不强制，你也可以使用其它端口（需确认未被占用且已放行）。

安全建议：

- FRPS Dashboard 默认监听 7500/TCP，为避免暴露管理接口，建议仅允许本机访问（或通过安全组/防火墙限制来源 IP）。

## 监控与统计口径

- 面板数据来源：后端从 FRPS Dashboard API 拉取 `serverinfo` 与各类 `proxy` 列表。
- 页面刷新：默认每 3 秒轮询更新（近实时）。
- “在线设备”：依据 Agent 上报心跳的 `last_seen` 计算（近 30 秒视为在线）。
- “流量/连接数为 0”的常见原因：
  - 仅建立了 frpc 控制连接，但没有任何代理流量
  - 外部没有访问到你的 `remote_port`（安全组未放行、端口未监听等）
  - 新建映射刚下发，尚未完成同步/热重载

## 常用运维命令

### 服务端（Docker）

```bash
cd FRP-ALL-IN-ONE/deploy

docker-compose ps
docker-compose logs -f

docker-compose restart
docker restart frps

docker-compose down
docker-compose up -d --build
```

### 客户端（frpc）

```bash
systemctl status frpc --no-pager
journalctl -u frpc -n 200 --no-pager

systemctl restart frpc
```

### 客户端（frp-agent）

```bash
systemctl status frp-agent --no-pager
journalctl -u frp-agent -n 200 --no-pager

cat /opt/frp/agent.json
```

## 排障指南

### 端口映射创建了但访问不了（以 SSH 6022→22 为例）

按链路从外到内排查：

1. 外网连通性（在非服务器本机测试）
   ```bash
   nc -vz <公网IP> 6022
   ```
2. 云安全组/防火墙：确认 6022/TCP（或你选择的端口）已放行
3. FRPS 是否监听该端口（在服务器上）
   ```bash
   ss -lntp | grep :6022 || echo "no listener"
   docker logs frps --tail 200
   ```
4. 客户端是否已同步到映射（在客户端机器）
   ```bash
   grep -n "6022" /opt/frp/frpc.toml || true
   journalctl -u frp-agent -n 200 --no-pager
   journalctl -u frpc -n 200 --no-pager
   ```
5. 客户端本机 SSH 是否在 22 监听
   ```bash
   ss -lntp | grep :22 || true
   systemctl status ssh --no-pager || systemctl status sshd --no-pager
   ```

### 客户端看不到设备/无法注册

检查 `frp-agent` 是否启动并写入状态：

```bash
systemctl status frp-agent --no-pager
cat /opt/frp/agent.json
systemctl cat frp-agent
```

确认 `FRP_MANAGER_URL` 指向你的管理端、`FRP_MANAGER_REGISTER_TOKEN` 已注入。

### Token 不匹配导致 frpc 连接失败

服务端重新部署后 Token 变化，客户端仍使用旧 Token。建议重新下载并执行最新客户端脚本；或手动更新：

```bash
nano /opt/frp/frpc.toml
systemctl restart frpc
```

## 卸载客户端

```bash
cd FRP-ALL-IN-ONE/deploy
chmod +x uninstall-frpc.sh
sudo ./uninstall-frpc.sh
```

卸载会停止并禁用 `frpc/frp-agent`，并清理 `/opt/frp` 与 systemd 文件。

## 项目结构

```
FRP-ALL-IN-ONE/
├── agent/                 # 设备端 Agent（自注册/心跳/配置同步）
├── server/                # 后端 API (FastAPI)
├── frontend/              # Web 界面 (React + Vite)
├── deploy/                # 部署脚本 & docker-compose
└── README.md
```

## 开发与构建

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 后端

后端以 Docker 方式运行最稳定；如需本地运行可参考 `server/` 目录（FastAPI + SQLite）。

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
