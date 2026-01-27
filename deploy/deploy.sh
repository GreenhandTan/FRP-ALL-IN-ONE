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
        echo -e "${YELLOW}[WARN] 建议使用 root 权限运行以自动配置 Swap${NC}"
        echo "   如需继续，请输入 sudo 密码（或 Ctrl+C 取消）"
        sudo -v
    fi
}

# 检查 Docker 和 Docker Compose
check_docker() {
    echo "[CHECK] 检查 Docker 环境..."
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}[ERROR] Docker 未安装${NC}"
        echo "请先安装 Docker: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}[ERROR] Docker Compose 未安装${NC}"
        echo "请先安装 Docker Compose"
        exit 1
    fi
    
    echo -e "${GREEN}[OK] Docker 环境正常${NC}"
}

# 检查内存并配置 Swap
check_memory() {
    echo ""
    echo "[CHECK] 检查服务器内存..."
    
    # 获取总内存（MB）
    total_mem=$(free -m | awk '/^Mem:/{print $2}')
    echo "   当前内存: ${total_mem}MB"
    
    # 检查是否已有 Swap
    swap_total=$(free -m | awk '/^Swap:/{print $2}')
    
    if [ "$total_mem" -lt 1024 ]; then
        echo -e "${YELLOW}[WARN] 检测到低内存服务器 (<1GB)${NC}"
        
        if [ "$swap_total" -eq 0 ]; then
            echo "[INFO] 正在配置 Swap 空间..."
            if [ -f "./setup-swap.sh" ]; then
                chmod +x ./setup-swap.sh
                sudo ./setup-swap.sh
            else
                echo -e "${RED}[ERROR] setup-swap.sh 文件不存在${NC}"
                exit 1
            fi
        else
            echo -e "${GREEN}[OK] 已有 ${swap_total}MB Swap 空间${NC}"
        fi
    else
        echo -e "${GREEN}[OK] 内存充足${NC}"
        if [ "$swap_total" -eq 0 ]; then
            echo -e "${YELLOW}[TIP] 建议: 仍可运行 ./setup-swap.sh 添加 Swap 以提高稳定性${NC}"
        fi
    fi
}

# 清理旧容器和数据卷
clean_old_services() {
    echo ""
    echo "[CLEAN] 清理旧容器和数据卷..."
    
    # 检查 docker-compose.yml 是否存在
    if [ ! -f "./docker-compose.yml" ]; then
        echo -e "${YELLOW}[WARN] docker-compose.yml 文件不存在，跳过清理${NC}"
        return
    fi
    
    # 停止并清理旧服务（如果存在）
    docker-compose down -v --remove-orphans 2>/dev/null || true
    
    echo -e "${GREEN}[OK] 清理完成${NC}"
}

# 检查端口占用
check_ports() {
    echo ""
    echo "[CHECK] 检查端口占用..."
    
    ports=(80 7000)
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo -e "${YELLOW}[WARN] 端口 $port 已被占用${NC}"
            echo "   请释放端口或修改 docker-compose.yml 中的端口配置"
            read -p "是否继续部署？(y/N): " continue_deploy
            if [[ ! $continue_deploy =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    done
    
    echo -e "${GREEN}[OK] 端口检查完成${NC}"
}

# 部署服务
deploy_services() {
    echo ""
    echo "[DEPLOY] 开始部署服务..."
    echo ""
    
    # 检查 docker-compose.yml 是否存在
    if [ ! -f "./docker-compose.yml" ]; then
        echo -e "${RED}[ERROR] docker-compose.yml 文件不存在${NC}"
        echo "请确保在 deploy 目录中运行此脚本"
        exit 1
    fi
    
    # 构建并启动服务
    echo "[BUILD] 构建并启动服务（可能需要几分钟）..."
    docker-compose up -d --build
    
    echo ""
    echo -e "${GREEN}[OK] 服务启动成功！${NC}"
}

# 显示访问信息
show_info() {
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""
    
    echo "[访问地址]"
    echo "   Web 管理界面: http://Your Server IP"
    echo "   FRP 服务端口: Your Server IP:7000"
    echo ""
    echo "[默认账户]"
    echo "   用户名: admin"
    echo "   密码:   123456"
    echo -e "   ${YELLOW}* 请登录后及时修改密码${NC}"
    echo ""
    echo -e "${YELLOW}[重要：安全组/防火墙配置]${NC}"
    echo "   请确保云服务器安全组已开放以下端口："
    echo "   - 80/TCP    : Web 管理界面"
    echo "   - 7000/TCP  : FRP 服务端口 (客户端连接)"
    echo ""
    echo -e "   ${RED}* 后续通过 FRP 开放的任何端口也需要在安全组中放行！${NC}"
    echo "   例如: 开放内网 SSH (22端口) 到公网 6022，需要在安全组开放 6022/TCP"
    echo ""
    echo "[下一步]"
    echo "   1. 访问 Web 界面使用默认账户登录"
    echo "   2. 点击钥匙图标修改默认密码"
    echo "   3. 配置 FRPS 参数"
    echo "   4. 下载生成的 FRPC 脚本到内网机器"
    echo ""
    echo "[常用命令]"
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
    clean_old_services
    check_ports
    deploy_services
    show_info
}

# 运行主流程
main
