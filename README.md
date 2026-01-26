# FRP-All in one

一个基于 Web 的 FRP 内网穿透管理系统，提供从用户注册到自动部署的完整解决方案。

## ✨ 核心特性

- 🎯 **零门槛部署**：一键 `docker-compose up` 完成所有配置
- 🔐 **安全可靠**：JWT 身份验证 + Bcrypt 密码加密
- 🚀 **自动化**：Web 界面配置 FRPS，自动生成 FRPC 部署脚本
- 📊 **可视化管理**：客户端状态监控、隧道配置可视化
- 🔄 **热重载**：Agent 自动同步配置，无需重启服务

## 🏗️ 技术架构

- **前端**: React + Vite + Tailwind CSS v4
- **后端**: Python (FastAPI) + SQLite
- **部署**: Docker Compose (3 容器)
- **FRP**: 官方 Latest 镜像

## 📦 快速开始

### 前置要求

- Docker & Docker Compose
- 一台具有公网 IP 的服务器

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git
cd FRP-ALL-IN-ONE

# 2. 启动服务（首次启动会自动构建）
docker-compose up -d --build

# 3. 访问 Web 界面
http://your_server_ip
```

就是这么简单！🎉

### 低内存服务器部署（512MB-1GB）

如果服务器内存不足 1GB，需要先配置 Swap：

```bash
# 运行 Swap 配置脚本
chmod +x setup-swap.sh
sudo ./setup-swap.sh

# 然后正常部署
docker-compose up -d --build
```

> **提示**: 即使有 1GB 内存，也建议配置 Swap 以确保构建稳定。

## 🎮 使用流程

### 1️⃣ 首次注册

访问服务器 IP，系统会引导您创建管理员账户。

### 2️⃣ 配置 FRPS

登录后进入配置向导，只需设置：
- **监听端口**（默认 7000）
- Token 和版本号由系统自动生成

点击部署，系统将：
- ✅ 自动生成配置文件
- ✅ 重启 FRPS 容器
- ✅ 返回配置信息（Token、公网 IP）

### 3️⃣ 部署 FRPC

系统会自动生成一键部署脚本，在内网机器上执行：

```bash
# 下载并执行脚本
chmod +x deploy-frpc.sh
sudo ./deploy-frpc.sh
```

### 4️⃣ 管理隧道

在 Web 界面中：
1. 添加客户端设备
2. 为设备配置端口映射（TCP/UDP/HTTP）
3. Agent 自动同步配置并应用

## 📁 项目结构

```
FRP-ALL-IN-ONE/
├── server/              # 后端 API (FastAPI)
├── frontend/            # Web 界面 (React)
├── agent/               # 客户端同步脚本
├── docker-compose.yml   # 容器编排
└── frps.toml           # FRPS 配置（系统生成）
```

## 🔧 高级配置

### 修改端口范围

编辑 `docker-compose.yml`:

```yaml
frps:
  ports:
    - "7000:7000"
    - "6000-6100:6000-6100"  # 增加端口范围
```

### 使用自定义域名

1. 配置 Nginx 反向代理到 80 端口
2. 启用 HTTPS（推荐 Certbot）

### 数据备份

```bash
# 备份数据库
cp ./data/frp_manager.db ./backup/

# 备份配置
cp ./frps.toml ./backup/
```

## 🛡️ 安全建议

- ✅ 定期更新 Docker 镜像
- ✅ 使用强密码（至少 12 位）
- ✅ 限制后台访问 IP（Nginx 白名单）
- ✅ 定期备份数据库

## 🐛 常见问题

**Q: FRPS 配置后没有生效？**
```bash
# 手动重启 FRPS 容器
docker restart frps
```

**Q: 忘记管理员密码？**
```bash
# 进入数据库修改（需手动 hash 密码）
sqlite3 ./data/frp_manager.db
```

**Q: Agent 无法连接？**
检查：
1. 公网 IP 是否正确
2. 防火墙是否开放 7000 端口
3. Token 是否匹配

## 📄 许可证

MIT License

## 🙏 致谢

- [FRP](https://github.com/fatedier/frp) - 优秀的内网穿透工具
- FastAPI、React - 强大的开发框架

---

**⭐ 如果这个项目对您有帮助，请给我们一个 Star！**
