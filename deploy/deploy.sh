#!/bin/bash
# FRP-All in one - 一键部署脚本
# 用途: 自动检测环境并完成 Docker 部署

set -e

echo "=========================================="
echo "  FRP-All in one - 一键部署脚本"
echo "=========================================="
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否为 root
check_root() {
    if [ "$EUID" -ne 0 ]; then 
        echo -e "${YELLOW}⚠️  建议使用 root 权限运行以自动配置 Swap${NC}"
        echo "   如需继续，请输入 sudo 密码（或 Ctrl+C 取消）"
        sudo -v
    fi
}

# 检查 Docker 和 Docker Compose
check_docker() {
    echo "🔍 检查 Docker 环境..."
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker 未安装${NC}"
        echo "请先安装 Docker: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose 未安装${NC}"
        echo "请先安装 Docker Compose"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Docker 环境正常${NC}"
}

# 检查内存并配置 Swap
check_memory() {
    echo ""
    echo "💾 检查服务器内存..."
    
    # 获取总内存（MB）
    total_mem=$(free -m | awk '/^Mem:/{print $2}')
    echo "   当前内存: ${total_mem}MB"
    
    # 检查是否已有 Swap
    swap_total=$(free -m | awk '/^Swap:/{print $2}')
    
    if [ "$total_mem" -lt 1024 ]; then
        echo -e "${YELLOW}⚠️  检测到低内存服务器 (<1GB)${NC}"
        
        if [ "$swap_total" -eq 0 ]; then
            echo "📝 正在配置 Swap 空间..."
            if [ -f "./setup-swap.sh" ]; then
                chmod +x ./setup-swap.sh
                sudo ./setup-swap.sh
            else
                echo -e "${RED}❌ setup-swap.sh 文件不存在${NC}"
                exit 1
            fi
        else
            echo -e "${GREEN}✅ 已有 ${swap_total}MB Swap 空间${NC}"
        fi
    else
        echo -e "${GREEN}✅ 内存充足${NC}"
        if [ "$swap_total" -eq 0 ]; then
            echo -e "${YELLOW}💡 建议: 仍可运行 ./setup-swap.sh 添加 Swap 以提高稳定性${NC}"
        fi
    fi
}

# 检查端口占用
check_ports() {
    echo ""
    echo "🔌 检查端口占用..."
    
    ports=(80 7000)
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo -e "${YELLOW}⚠️  端口 $port 已被占用${NC}"
            echo "   请释放端口或修改 docker-compose.yml 中的端口配置"
            read -p "是否继续部署？(y/N): " continue_deploy
            if [[ ! $continue_deploy =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    done
    
    echo -e "${GREEN}✅ 端口检查完成${NC}"
}

# 部署服务
deploy_services() {
    echo ""
    echo "🚀 开始部署服务..."
    echo ""
    
    # 检查 docker-compose.yml 是否存在
    if [ ! -f "./docker-compose.yml" ]; then
        echo -e "${RED}❌ docker-compose.yml 文件不存在${NC}"
        echo "请确保在 deploy 目录中运行此脚本"
        exit 1
    fi
    
    # 停止旧服务（如果存在）
    echo "🛑 停止旧服务..."
    docker-compose down 2>/dev/null || true
    
    # 构建并启动服务
    echo "🔨 构建并启动服务（可能需要几分钟）..."
    docker-compose up -d --build
    
    echo ""
    echo -e "${GREEN}✅ 服务启动成功！${NC}"
}

# 显示访问信息
show_info() {
    echo ""
    echo "=========================================="
    echo "  🎉 部署完成！"
    echo "=========================================="
    echo ""
    
    # 获取公网 IP
    public_ip=$(curl -s https://api.ipify.org || echo "未知")
    
    echo "📍 访问地址:"
    echo "   Web 管理界面: http://${public_ip}"
    echo "   FRP 服务端口: ${public_ip}:7000"
    echo ""
    echo "📝 下一步:"
    echo "   1. 访问 Web 界面进行首次注册"
    echo "   2. 登录后配置 FRPS 参数"
    echo "   3. 下载生成的 FRPC 脚本到内网机器"
    echo ""
    echo "🔧 常用命令:"
    echo "   查看日志: docker-compose logs -f"
    echo "   重启服务: docker-compose restart"
    echo "   停止服务: docker-compose down"
    echo ""
}

# 主流程
main() {
    check_root
    check_docker
    check_memory
    check_ports
    deploy_services
    show_info
}

# 运行主流程
main
