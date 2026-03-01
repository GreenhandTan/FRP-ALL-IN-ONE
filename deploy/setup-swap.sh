#!/bin/sh
# FRP Manager - Swap 设置脚本
# 用途: 为低内存服务器添加 Swap 空间，避免构建时 OOM

set -e

echo "[INFO] 开始配置 Swap 空间..."

# 检查是否已存在 swap（兼容 BusyBox）
if [ -r /proc/swaps ] && awk 'NR>1 {print $1}' /proc/swaps | grep -q '^/swapfile$'; then
    echo "[OK] Swap 已存在，跳过创建"
    cat /proc/swaps
    exit 0
fi

# 检查 root 权限
if [ "$(id -u)" -ne 0 ]; then
    echo "[ERROR] 请使用 root 权限运行此脚本: sudo $0"
    exit 1
fi

SWAP_SIZE="1G"

echo "[INFO] 创建 ${SWAP_SIZE} Swap 文件..."
rm -f /swapfile
dd if=/dev/zero of=/swapfile bs=1M count=1024

echo "[INFO] 设置权限..."
chmod 600 /swapfile

echo "[INFO] 格式化 Swap..."
mkswap /swapfile

echo "[INFO] 启用 Swap..."
swapon /swapfile

echo "[INFO] 添加到 fstab（重启后自动启用）..."
if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ""
echo "[OK] Swap 配置完成"
echo "当前内存状态:"
free -h

echo ""
echo "提示: 现在可以安全地运行 podman compose -f compose.yml up -d --build"
