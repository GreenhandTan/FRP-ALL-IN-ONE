#!/bin/bash
# ============================================
# FRP Client 一键卸载脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo_error "请以 root 用户运行此脚本"
    exit 1
fi

echo_warn "============================================"
echo_warn "FRP Client 卸载警告"
echo_warn "============================================"
echo "此操作将:"
echo "  1. 停止并禁用 frpc 服务"
echo "  2. 删除系统服务文件 (/etc/systemd/system/frpc.service)"
echo "  3. 删除 FRP 安装目录 (/opt/frp)"
echo "  4. 删除所有配置文件和日志"
echo ""

# 用户确认
read -p "是否继续卸载? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo_info "卸载操作已取消"
    exit 0
fi

echo_info "开始卸载 FRP Client..."

# 1. 停止服务
if systemctl list-unit-files | grep -q "^frpc.service"; then
    echo_info "正在停止 frpc 服务..."
    systemctl stop frpc 2>/dev/null || true
    systemctl disable frpc 2>/dev/null || true
    echo_info "服务已停止并禁用"
else
    echo_info "frpc 服务未找到，跳过停止步骤"
fi

# 2. 删除服务文件
if [ -f "/etc/systemd/system/frpc.service" ]; then
    echo_info "正在删除系统服务文件..."
    rm -f /etc/systemd/system/frpc.service
    echo_info "服务文件已删除"
else
    echo_info "服务文件不存在，跳过删除"
fi

# 3. 重新加载 systemd
echo_info "正在重新加载 systemd 配置..."
systemctl daemon-reload
systemctl reset-failed 2>/dev/null || true

# 4. 删除安装目录
if [ -d "/opt/frp" ]; then
    echo_info "正在删除安装目录 /opt/frp..."
    rm -rf /opt/frp
    echo_info "安装目录已删除"
else
    echo_info "安装目录不存在，跳过删除"
fi

# 5. 检查并提示残留
echo_info "正在检查残留文件..."
residual_files=()
[ -f "/etc/systemd/system/frpc.service" ] && residual_files+=("/etc/systemd/system/frpc.service")
[ -d "/opt/frp" ] && residual_files+=("/opt/frp")

if [ ${#residual_files[@]} -eq 0 ]; then
    echo ""
    echo_info "============================================"
    echo_info "FRP Client 卸载完成！"
    echo_info "============================================"
    echo ""
    echo "  所有组件已成功清除"
    echo ""
else
    echo_warn "警告：发现以下残留文件:"
    for file in "${residual_files[@]}"; do
        echo "  - $file"
    done
    echo "请手动删除这些文件"
fi

# 6. 显示最终状态
echo_info "最终服务状态:"
systemctl list-unit-files | grep -E "^frpc.service" || echo "  frpc.service: 已清除"

echo ""
echo_info "卸载脚本执行完毕"