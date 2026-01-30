#!/bin/bash
# =============================================================
# FRP Manager Agent 一键安装脚本 - Linux/macOS 通用
# =============================================================
# 使用方法:
#   curl -fsSL http://YOUR_SERVER/api/frp/agent-install.sh | bash
#
# 此脚本会自动从 GitHub Releases 下载 Agent 二进制
# =============================================================

set -e

# ==================== 配置区域 ====================
# 这些值会在服务端动态生成时被替换
GITHUB_REPO="${GITHUB_REPO:-__GITHUB_REPO__}"          # 如: GreenhandTan/FRP-ALL-IN-ONE
AGENT_VERSION="${AGENT_VERSION:-__AGENT_VERSION__}"    # 如: v1.0.0 或 latest
AGENT_SERVER_URL="${AGENT_SERVER_URL:-__SERVER_URL__}" # WebSocket 地址
AGENT_CLIENT_ID="${AGENT_CLIENT_ID:-__CLIENT_ID__}"    # 客户端 ID
AGENT_TOKEN="${AGENT_TOKEN:-__TOKEN__}"                # 认证 Token

INSTALL_DIR="/opt/frp"
AGENT_BINARY="frp-agent"
# =================================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# 检测操作系统和架构
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case "$ARCH" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            log_error "不支持的架构: $ARCH"
            exit 1
            ;;
    esac
    
    case "$OS" in
        linux)
            PLATFORM="linux"
            ;;
        darwin)
            PLATFORM="darwin"
            ;;
        *)
            log_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac
    
    BINARY_NAME="frp-agent-${PLATFORM}-${ARCH}"
    log_info "检测到平台: ${PLATFORM}-${ARCH}"
}

# 获取最新版本号
get_latest_version() {
    if [ "$AGENT_VERSION" = "latest" ] || [ "$AGENT_VERSION" = "__AGENT_VERSION__" ]; then
        log_info "获取最新版本号..."
        AGENT_VERSION=$(curl -sL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
        
        if [ -z "$AGENT_VERSION" ]; then
            log_error "无法获取最新版本，请手动指定 AGENT_VERSION"
            exit 1
        fi
        
        log_success "最新版本: $AGENT_VERSION"
    fi
}

# 检查必要条件
check_requirements() {
    # 检查 root 权限
    if [ "$EUID" -ne 0 ] && [ "$PLATFORM" = "linux" ]; then
        log_warn "建议使用 root 权限运行（使用 sudo）"
    fi
    
    # 检查下载工具
    if command -v curl &> /dev/null; then
        DOWNLOADER="curl -fsSL -o"
    elif command -v wget &> /dev/null; then
        DOWNLOADER="wget -qO"
    else
        log_error "需要 curl 或 wget"
        exit 1
    fi
    
    log_success "环境检查通过"
}

# 创建安装目录
setup_directories() {
    log_step "创建安装目录..."
    
    if [ "$EUID" -eq 0 ]; then
        mkdir -p "$INSTALL_DIR"
        mkdir -p "$INSTALL_DIR/logs"
    else
        sudo mkdir -p "$INSTALL_DIR"
        sudo mkdir -p "$INSTALL_DIR/logs"
        sudo chown -R $USER:$USER "$INSTALL_DIR"
    fi
    
    log_success "目录创建完成: $INSTALL_DIR"
}

# 从 GitHub 下载 Agent 二进制
download_agent() {
    log_step "从 GitHub 下载 Agent..."
    
    # 构建下载 URL
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${AGENT_VERSION}/${BINARY_NAME}"
    
    log_info "下载地址: $DOWNLOAD_URL"
    
    # 下载
    if command -v curl &> /dev/null; then
        curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/$AGENT_BINARY"
    else
        wget -qO "$INSTALL_DIR/$AGENT_BINARY" "$DOWNLOAD_URL"
    fi
    
    if [ $? -ne 0 ]; then
        log_error "下载失败，请检查网络或版本号"
        exit 1
    fi
    
    chmod +x "$INSTALL_DIR/$AGENT_BINARY"
    log_success "下载完成: $INSTALL_DIR/$AGENT_BINARY"
}

# 创建系统服务 (Linux systemd)
create_systemd_service() {
    log_step "创建 systemd 服务..."
    
    sudo tee /etc/systemd/system/frp-agent.service > /dev/null << EOF
[Unit]
Description=FRP Manager Agent
After=network.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/$AGENT_BINARY \\
    -server "$AGENT_SERVER_URL" \\
    -id "$AGENT_CLIENT_ID" \\
    -token "$AGENT_TOKEN" \\
    -frpc "$INSTALL_DIR/frpc" \\
    -config "$INSTALL_DIR/frpc.toml" \\
    -log "$INSTALL_DIR/logs"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable frp-agent
    log_success "systemd 服务创建完成"
}

# 创建 macOS launchd 服务
create_launchd_service() {
    log_step "创建 launchd 服务..."
    
    PLIST_PATH="$HOME/Library/LaunchAgents/com.frp-manager.agent.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    
    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frp-manager.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/$AGENT_BINARY</string>
        <string>-server</string>
        <string>$AGENT_SERVER_URL</string>
        <string>-id</string>
        <string>$AGENT_CLIENT_ID</string>
        <string>-token</string>
        <string>$AGENT_TOKEN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/logs/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/logs/agent-error.log</string>
</dict>
</plist>
EOF

    log_success "launchd 服务创建完成"
}

# 启动服务
start_service() {
    log_step "启动 Agent 服务..."
    
    if [ "$PLATFORM" = "linux" ]; then
        sudo systemctl start frp-agent
        sleep 2
        if sudo systemctl is-active --quiet frp-agent; then
            log_success "服务启动成功"
        else
            log_warn "服务启动可能有问题，请检查日志"
        fi
    else
        launchctl load "$HOME/Library/LaunchAgents/com.frp-manager.agent.plist"
        log_success "服务已加载"
    fi
}

# 显示安装摘要
show_summary() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}       FRP Manager Agent 安装完成！                         ${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "📁 安装目录: $INSTALL_DIR"
    echo "🆔 客户端 ID: $AGENT_CLIENT_ID"
    echo "🌐 服务端: $AGENT_SERVER_URL"
    echo "📦 版本: $AGENT_VERSION"
    echo ""
    
    if [ "$PLATFORM" = "linux" ]; then
        echo "📋 常用命令:"
        echo "   查看状态: sudo systemctl status frp-agent"
        echo "   查看日志: sudo journalctl -u frp-agent -f"
        echo "   重启服务: sudo systemctl restart frp-agent"
    else
        echo "📋 常用命令:"
        echo "   查看日志: tail -f $INSTALL_DIR/logs/agent.log"
        echo "   停止服务: launchctl unload ~/Library/LaunchAgents/com.frp-manager.agent.plist"
    fi
    
    echo ""
    echo -e "${CYAN}现在可以回到管理面板查看该客户端状态！${NC}"
    echo ""
}

# 主流程
main() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}       FRP Manager Agent 一键安装脚本                       ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    detect_platform
    check_requirements
    get_latest_version
    setup_directories
    download_agent
    
    if [ "$PLATFORM" = "linux" ]; then
        create_systemd_service
    else
        create_launchd_service
    fi
    
    start_service
    show_summary
}

# 运行
main "$@"
