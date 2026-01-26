#!/bin/bash
# FRP Manager - Swap 设置脚本
# 用途: 为低内存服务器添加 Swap 空间，避免构建时 OOM

set -e

echo "🔧 开始配置 Swap 空间..."

# 检查是否已存在 swap
if swapon --show | grep -q '/swapfile'; then
    echo "✅ Swap 已存在，跳过创建"
    swapon --show
    exit 0
fi

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
    echo "❌ 请使用 root 权限运行此脚本: sudo $0"
    exit 1
fi

SWAP_SIZE="2G"

echo "📝 创建 ${SWAP_SIZE} Swap 文件..."
fallocate -l $SWAP_SIZE /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048

echo "🔒 设置权限..."
chmod 600 /swapfile

echo "⚙️  格式化 Swap..."
mkswap /swapfile

echo "🚀 启用 Swap..."
swapon /swapfile

echo "💾 添加到 fstab（重启后自动启用）..."
if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ""
echo "✅ Swap 配置完成！"
echo "当前内存状态:"
free -h

echo ""
echo "提示: 现在可以安全地运行 docker-compose up -d --build"
