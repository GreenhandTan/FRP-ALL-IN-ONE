#!/bin/bash
# ============================================
# FRP Manager Agent 一键移除脚本
# Agent 负责管理 FRPC 进程
# ============================================

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "============================================"
echo "  FRP Manager Agent 移除脚本"
echo "============================================"
echo ""

# 检测系统类型
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

if [ "$OS" = "darwin" ]; then
    # macOS 移除
    echo -e "${YELLOW}[macOS]${NC} 正在移除 FRP 服务..."
    
    # 卸载 Agent launchd 服务
    launchctl unload ~/Library/LaunchAgents/com.frp-manager.agent.plist 2>/dev/null || true
    rm -f ~/Library/LaunchAgents/com.frp-manager.agent.plist
    
    # 删除安装目录
    rm -rf /opt/frp
    
    # 清理进程
    pkill -9 -f "frpc" 2>/dev/null || true
    pkill -9 -f "frp-agent" 2>/dev/null || true
    
    echo -e "${GREEN}[OK]${NC} macOS 上的 FRP 已移除"
    
elif [ "$OS" = "linux" ]; then
    # Linux 移除（需要 root）
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} Linux 上请使用 sudo 运行此脚本"
        exit 1
    fi
    
    echo "[INFO] 正在停止服务..."
    
    # 停止并禁用 Agent 服务
    systemctl stop frp-agent 2>/dev/null || true
    systemctl disable frp-agent 2>/dev/null || true
    rm -f /etc/systemd/system/frp-agent.service
    systemctl daemon-reload
    
    echo "[INFO] 正在清理安装文件..."
    
    # 删除安装目录
    rm -rf /opt/frp
    
    # 清理残留进程
    pkill -9 -f "/opt/frp/frpc" 2>/dev/null || true
    pkill -9 -f "/opt/frp/frp-agent" 2>/dev/null || true
    
    echo -e "${GREEN}[OK]${NC} Linux 上的 FRP 已移除"
    
else
    echo -e "${RED}[ERROR]${NC} 不支持的操作系统: $OS"
    echo "Windows 用户请手动删除 C:\\frp 目录"
    exit 1
fi

echo ""
echo "已清理内容:"
echo "  - frp-agent systemd/launchd 服务"
echo "  - /opt/frp 目录"
echo "  - frpc 和 frp-agent 进程"
echo ""
echo -e "${GREEN}移除完成！${NC}"
echo ""