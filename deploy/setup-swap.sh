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

SWAP_SIZE="512M"

create_swapfile_standard() {
    rm -f /swapfile
    dd if=/dev/zero of=/swapfile bs=1M count=512
    sync
    chmod 600 /swapfile
    mkswap /swapfile
}

create_swapfile_nocow() {
    rm -f /swapfile
    : > /swapfile
    if command -v chattr >/dev/null 2>&1; then
        chattr +C /swapfile >/dev/null 2>&1 || true
    fi
    dd if=/dev/zero of=/swapfile bs=1M count=512 conv=notrunc
    sync
    chmod 600 /swapfile
    mkswap /swapfile
}

create_swapfile_btrfs() {
    rm -f /swapfile
    btrfs filesystem mkswapfile --size "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
}

echo "[INFO] 创建 ${SWAP_SIZE} Swap 文件..."
create_swapfile_standard

echo "[INFO] 启用 Swap..."
swapon_output="$(swapon /swapfile 2>&1)" || swapon_code=$?
swapon_code=${swapon_code:-0}

if [ "$swapon_code" -eq 0 ]; then
    echo "[OK] Swap 已启用"
else
    echo "$swapon_output"
    if echo "$swapon_output" | grep -qi "file has holes"; then
        echo "[WARN] 检测到 swapfile 空洞问题，尝试使用兼容方式重建..."

        rebuilt=0

        if command -v btrfs >/dev/null 2>&1; then
            if btrfs filesystem mkswapfile --help >/dev/null 2>&1; then
                echo "[INFO] 使用 btrfs 专用 mkswapfile 重建..."
                create_swapfile_btrfs && rebuilt=1
            fi
        fi

        if [ "$rebuilt" -eq 0 ]; then
            echo "[INFO] 使用 NoCOW 方式重建..."
            create_swapfile_nocow && rebuilt=1
        fi

        if [ "$rebuilt" -eq 1 ]; then
            swapon_retry_output="$(swapon /swapfile 2>&1)" || swapon_retry_code=$?
            swapon_retry_code=${swapon_retry_code:-0}

            if [ "$swapon_retry_code" -eq 0 ]; then
                echo "[OK] Swap 已启用（重建后）"
            else
                echo "$swapon_retry_output"
                echo "[ERROR] 仍无法启用 swapfile。当前文件系统可能不支持文件交换。"
                echo "[ERROR] 建议改用 zram 或独立 swap 分区。"
                exit 1
            fi
        else
            echo "[ERROR] 无法找到可用的重建方式启用 swapfile。"
            exit 1
        fi
    else
        echo "[ERROR] 启用 Swap 失败。"
        exit 1
    fi
fi

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
