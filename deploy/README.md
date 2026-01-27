# FRP-All in one Deploy 部署包

此目录包含一键部署所需的所有文件。

## 📦 文件说明

- `deploy.sh` - 一键部署脚本（自动检测环境、配置 Swap、启动服务）
- `docker-compose.yml` - Docker Compose 配置文件
- `frps.toml` - FRPS 配置文件（系统自动生成）
- `setup-swap.sh` - Swap 配置脚本（可单独运行）

## 🚀 快速部署

### 自动部署（推荐）

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

脚本会自动：
1. ✅ 检查 Docker 环境
2. ✅ 检测内存并配置 Swap（如需要）
3. ✅ 检查端口占用
4. ✅ 构建并启动服务
5. ✅ 显示访问地址

### 手动部署

```bash
# 1. 如果内存不足 1GB，先配置 Swap
chmod +x setup-swap.sh
sudo ./setup-swap.sh

# 2. 启动服务
docker-compose up -d --build
```

## 📍 访问

部署成功后访问：
- **Web 管理界面**: http://your_server_ip
- **FRP 服务端口**: your_server_ip:7000

## 🔧 常用命令

```bash
# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新服务
docker-compose pull
docker-compose up -d
```

## ⚠️ 注意事项

- 首次运行需要构建镜像，时间较长（3-10分钟）
- 确保 80 和 7000 端口未被占用
- 低内存服务器(<1GB)必须配置 Swap
