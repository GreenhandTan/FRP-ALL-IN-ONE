# FRP Manager Agent

智能客户端代理，用于托管 FRPC 并提供系统监控、日志采集和配置热重载功能。

## 功能特性

- ⚡ **FRPC 进程托管** - 自动启动、监控和重启 FRPC
- 📊 **系统监控** - 实时采集 CPU、内存、磁盘、网络指标
- 📜 **日志采集** - 实时推送到服务端 + 本地文件存储
- 🔄 **配置热重载** - 服务端推送配置更新，1秒内生效
- 🔗 **WebSocket 通信** - 双向实时通信，自动重连

## 快速开始

### 方式一：一键安装脚本

```bash
curl -fsSL http://your-server.com/api/frp/deploy-client | bash
```

### 方式二：手动安装

1. 下载适合您系统的二进制文件：

| 系统 | 架构 | 下载 |
|------|------|------|
| Linux | x86_64 | `frp-agent-linux-amd64` |
| Linux | ARM64 | `frp-agent-linux-arm64` |
| macOS | Intel | `frp-agent-darwin-amd64` |
| macOS | Apple Silicon | `frp-agent-darwin-arm64` |
| Windows | x64 | `frp-agent-windows-amd64.exe` |

2. 运行 Agent：

```bash
./frp-agent \
  -server ws://your-server.com/ws/agent/YOUR_CLIENT_ID \
  -id YOUR_CLIENT_ID \
  -token YOUR_TOKEN \
  -frpc /path/to/frpc \
  -config /path/to/frpc.toml
```

## 命令行参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `-server` | ✅ | - | 服务端 WebSocket 地址 |
| `-id` | ✅ | - | 客户端唯一 ID |
| `-token` | ✅ | - | 认证 Token |
| `-frpc` | ❌ | `/opt/frp/frpc` | frpc 二进制路径 |
| `-config` | ❌ | `/opt/frp/frpc.toml` | frpc 配置文件路径 |
| `-log` | ❌ | `/opt/frp/logs` | 日志存储目录 |
| `-version` | ❌ | - | 显示版本信息 |

## 作为系统服务运行

### Linux (systemd)

创建 `/etc/systemd/system/frp-agent.service`：

```ini
[Unit]
Description=FRP Manager Agent
After=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frp-agent -server ws://your-server.com/ws/agent/CLIENT_ID -id CLIENT_ID -token TOKEN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable frp-agent
sudo systemctl start frp-agent
```

### macOS (launchd)

创建 `~/Library/LaunchAgents/com.frp-manager.agent.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frp-manager.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/frp/frp-agent</string>
        <string>-server</string>
        <string>ws://your-server.com/ws/agent/CLIENT_ID</string>
        <string>-id</string>
        <string>CLIENT_ID</string>
        <string>-token</string>
        <string>TOKEN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

加载服务：

```bash
launchctl load ~/Library/LaunchAgents/com.frp-manager.agent.plist
```

## 开发

### 环境要求

- Go 1.21+
- Make

### 构建

```bash
# 构建所有平台
make all

# 仅构建当前平台（开发用）
make dev

# 清理
make clean
```

### 项目结构

```
agent/
├── cmd/
│   └── frp-agent/
│       └── main.go           # 程序入口
├── internal/
│   ├── config/
│   │   └── config.go         # 配置管理
│   ├── frpc/
│   │   └── manager.go        # FRPC 进程托管
│   ├── monitor/
│   │   └── system.go         # 系统监控
│   ├── logger/
│   │   └── collector.go      # 日志采集
│   └── ws/
│       └── client.go         # WebSocket 客户端
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## 协议

MIT License
