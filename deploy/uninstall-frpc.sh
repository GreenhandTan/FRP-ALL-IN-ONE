#!/bin/bash
# ============================================
# FRP Client 一键移除脚本
# 对应部署脚本: deploy-frpc.sh
# ============================================

set -e

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] 请以 root 用户运行此脚本"
    exit 1
fi

echo "[INFO] 正在停止 FRP 服务..."

# 停止并禁用服务（对应部署脚本的 systemctl enable/start）
systemctl stop frpc 2>/dev/null || true
systemctl stop frp-agent 2>/dev/null || true
systemctl disable frpc 2>/dev/null || true
systemctl disable frp-agent 2>/dev/null || true

# 删除 systemd 服务文件（对应部署脚本的 cat > /etc/systemd/system/...）
rm -f /etc/systemd/system/frpc.service
rm -f /etc/systemd/system/frp-agent.service
systemctl daemon-reload

echo "[INFO] 正在清理安装文件..."

# 删除安装目录（对应部署脚本的 INSTALL_DIR="/opt/frp"）
# 包含：frpc 二进制、frpc.toml、frp_agent.py、agent.json 等
rm -rf /opt/frp

# 清理残留进程
pkill -9 -f "/opt/frp/frpc" 2>/dev/null || true
pkill -9 -f "frp_agent.py" 2>/dev/null || true

echo "[INFO] FRP Client 已成功移除"