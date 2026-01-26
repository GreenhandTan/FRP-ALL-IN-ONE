# FRP-All in one 生产环境部署指南

本文档详细介绍如何将 FRP-All in one 系统部署到真实的生产环境中进行测试和使用。

---

## 一、架构概述

```
┌─────────────────────────────────────────────────────────────────────┐
│                        公网服务器 (有公网IP)                          │
│  ┌────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │   frps     │  │  FRP Manager   │  │      Nginx (可选)           │ │
│  │  :7000     │  │  Backend :8000 │  │  反向代理 + HTTPS           │ │
│  └────────────┘  │  Frontend :80  │  └────────────────────────────┘ │
│                  └────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 公网访问
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                        内网机器 (无公网IP)                            │
│  ┌────────────┐  ┌────────────────┐                                 │
│  │   frpc     │  │   FRP Agent    │  <- 自动拉取配置并热重载           │
│  │ (隧道客户端) │  │  (Python脚本)   │                                 │
│  └────────────┘  └────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、公网服务器部署

### 2.1 环境准备

```bash
# 连接到您的公网服务器
ssh root@your_server_ip

# 安装必要软件
apt update && apt install -y python3 python3-pip nodejs npm nginx git
```

### 2.2 上传项目代码

**方式一：Git 克隆 (推荐)**
```bash
cd /opt
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git frp-manager
cd frp-manager
```

**方式二：SCP 上传**
```bash
# 本地执行
scp -r /Users/xx/FRP-ALL-IN-ONE root@your_server_ip:/opt/frp-manager
```

### 2.3 部署后端 API

```bash
cd /opt/frp-manager/server

# 安装依赖
pip3 install -r requirements.txt

# 创建 systemd 服务
cat > /etc/systemd/system/frp-manager.service << 'EOF'
[Unit]
Description=FRP Manager Backend API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/frp-manager/server
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
systemctl daemon-reload
systemctl enable frp-manager
systemctl start frp-manager

# 检查状态
systemctl status frp-manager
```

### 2.4 构建并部署前端

```bash
cd /opt/frp-manager/frontend

# 安装依赖
npm install

# 构建生产版本
npm run build

# 将构建产物复制到 Nginx 目录
cp -r dist/* /var/www/html/
```

### 2.5 配置 Nginx 反向代理

```bash
cat > /etc/nginx/sites-available/frp-manager << 'EOF'
server {
    listen 80;
    server_name your_domain_or_ip;

    # 前端静态文件
    location / {
        root /var/www/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 直接代理后端 (可选，用于开发)
    location /clients {
        proxy_pass http://127.0.0.1:8000;
    }
}
EOF

ln -sf /etc/nginx/sites-available/frp-manager /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 2.6 部署 frps (服务端)

```bash
# 下载 FRP
cd /opt
wget https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_amd64.tar.gz
tar -xzf frp_0.61.1_linux_amd64.tar.gz
mv frp_0.61.1_linux_amd64 frp

# 配置 frps
cat > /opt/frp/frps.toml << 'EOF'
bindPort = 7000
auth.token = "your_secure_token_here"

# Dashboard (可选)
webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "admin123"
EOF

# 创建 systemd 服务
cat > /etc/systemd/system/frps.service << 'EOF'
[Unit]
Description=FRP Server
After=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frps -c /opt/frp/frps.toml
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable frps
systemctl start frps
```

### 2.7 开放防火墙端口

```bash
# 如使用 ufw
ufw allow 80/tcp      # Web UI
ufw allow 8000/tcp    # API (开发时，生产可关闭)
ufw allow 7000/tcp    # FRP 服务端口
ufw allow 7500/tcp    # FRP Dashboard (可选)
ufw allow 6000:7000/tcp  # 穿透端口范围 (根据需要调整)
```

---

## 三、内网客户端部署

### 3.1 安装 frpc

```bash
# 下载 FRP (与服务端版本一致)
cd /opt
wget https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_amd64.tar.gz
tar -xzf frp_0.61.1_linux_amd64.tar.gz
mv frp_0.61.1_linux_amd64 frp

# 初始化配置 (Agent 会自动覆盖 [[proxies]] 部分)
cat > /opt/frp/frpc.toml << 'EOF'
serverAddr = "your_server_public_ip"
serverPort = 7000
auth.token = "your_secure_token_here"

# Admin API (必须开启，用于热重载)
webServer.addr = "127.0.0.1"
webServer.port = 7400
EOF
```

### 3.2 部署 FRP Agent

```bash
# 复制 Agent 脚本
scp root@your_server_ip:/opt/frp-manager/agent/frp_agent.py /opt/frp/

# 编辑配置 (修改 SERVER_URL 和 CLIENT_ID)
nano /opt/frp/frp_agent.py
```

**关键配置修改:**
```python
SERVER_URL = "http://your_server_public_ip:8000"  # 或通过 Nginx: http://your_domain/api
CLIENT_ID = "从Web界面获取的Client ID"
FRPC_CONFIG_PATH = "/opt/frp/frpc.toml"
```

### 3.3 创建 systemd 服务

```bash
# frpc 服务
cat > /etc/systemd/system/frpc.service << 'EOF'
[Unit]
Description=FRP Client
After=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frpc -c /opt/frp/frpc.toml
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Agent 服务
cat > /etc/systemd/system/frp-agent.service << 'EOF'
[Unit]
Description=FRP Manager Agent
After=network.target frpc.service

[Service]
Type=simple
WorkingDirectory=/opt/frp
ExecStart=/usr/bin/python3 /opt/frp/frp_agent.py
Restart=always
Environment="FRP_MANAGER_URL=http://your_server_ip:8000"
Environment="FRP_CLIENT_ID=your_client_id"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable frpc frp-agent
systemctl start frpc frp-agent
```

---

## 四、使用流程

1. **访问 Web 管理界面**: `http://your_server_ip`
2. **创建客户端**: 点击"添加"，输入客户端名称，获取 `Client ID`
3. **配置内网机器**: 将 `Client ID` 填入 Agent 脚本并启动
4. **添加隧道**: 在 Web 界面为客户端添加 TCP/UDP/HTTP 隧道
5. **自动生效**: Agent 每 10 秒检测配置变更并自动热重载

---

## 五、常见问题

| 问题 | 解决方案 |
|------|----------|
| 样式不显示 | 确保 `npm run build` 成功，检查 Nginx 静态文件路径 |
| API 连接失败 | 检查防火墙 8000 端口，确认后端服务运行中 |
| frpc 连接失败 | 确认 `auth.token` 服务端客户端一致 |
| Agent 无法同步 | 检查 `CLIENT_ID` 是否正确，API 是否可访问 |

---

## 六、安全建议

> [!CAUTION]
> 生产环境务必注意以下安全配置

1. **启用 HTTPS**: 使用 Let's Encrypt 配置 SSL 证书
2. **修改默认密码**: 更改 frps Dashboard 的 admin 密码
3. **限制 API 访问**: 考虑添加 Token 认证
4. **限制端口范围**: 仅开放必要的穿透端口
