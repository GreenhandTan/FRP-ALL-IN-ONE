#!/bin/sh
# FRP-All in one - Podman 一键部署脚本
# 用途: 自动识别 Linux 发行版并完成 Podman 部署

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE_FILE="$SCRIPT_DIR/compose.yml"
COMPOSE_MODE=""
LOW_MEM_NO_SWAP="0"
PROJECT_CONTAINERS="frp-manager-backend frp-manager-web frps"

echo "=========================================="
echo "  FRP-All in one - Podman 一键部署脚本"
echo "=========================================="
echo ""

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${RED}[ERROR] 请使用 root 运行: sudo sh deploy.sh${NC}"
        exit 1
    fi
}

detect_os() {
    if [ ! -f /etc/os-release ]; then
        echo -e "${RED}[ERROR] 无法识别系统发行版（缺少 /etc/os-release）${NC}"
        exit 1
    fi

    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_LIKE="${ID_LIKE:-}"

    echo "[INFO] 检测到系统: ${PRETTY_NAME:-$OS_ID}"
}

install_podman_stack() {
    echo "[INSTALL] 安装 Podman 与 compose 支持..."

    if command -v podman >/dev/null 2>&1 && (podman compose version >/dev/null 2>&1 || command -v podman-compose >/dev/null 2>&1); then
        echo -e "${GREEN}[OK] Podman 环境已就绪${NC}"
        return
    fi

    case "$OS_ID" in
        alpine)
            apk update
            apk add --no-cache podman podman-compose curl ca-certificates lsof
            ;;
        debian|ubuntu)
            apt-get update
            apt-get install -y podman podman-compose curl ca-certificates lsof
            ;;
        centos|rhel|rocky|almalinux|fedora)
            if command -v dnf >/dev/null 2>&1; then
                dnf install -y podman podman-compose curl ca-certificates lsof
            else
                yum install -y podman podman-compose curl ca-certificates lsof
            fi
            ;;
        *)
            if echo "$OS_LIKE" | grep -q "debian"; then
                apt-get update
                apt-get install -y podman podman-compose curl ca-certificates lsof
            elif echo "$OS_LIKE" | grep -Eq "rhel|fedora|centos"; then
                if command -v dnf >/dev/null 2>&1; then
                    dnf install -y podman podman-compose curl ca-certificates lsof
                else
                    yum install -y podman podman-compose curl ca-certificates lsof
                fi
            else
                echo -e "${RED}[ERROR] 暂不支持该发行版自动安装，请手动安装 Podman + podman-compose${NC}"
                exit 1
            fi
            ;;
    esac

    if ! command -v podman >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] Podman 安装失败${NC}"
        exit 1
    fi
    if ! podman compose version >/dev/null 2>&1 && ! command -v podman-compose >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] podman compose 不可用，请安装 podman-compose${NC}"
        exit 1
    fi

    echo -e "${GREEN}[OK] Podman 安装完成${NC}"
}

detect_compose_mode() {
    if podman compose version >/dev/null 2>&1; then
        COMPOSE_MODE="podman"
        echo -e "${GREEN}[OK] 使用 compose 实现: podman compose${NC}"
        return
    fi

    if command -v podman-compose >/dev/null 2>&1; then
        COMPOSE_MODE="podman-compose"
        echo -e "${GREEN}[OK] 使用 compose 实现: podman-compose${NC}"
        return
    fi

    echo -e "${RED}[ERROR] 未检测到可用的 compose 实现${NC}"
    exit 1
}

run_compose() {
    if [ "$COMPOSE_MODE" = "podman" ]; then
        podman compose -f "$COMPOSE_FILE" "$@"
    else
        podman-compose -f "$COMPOSE_FILE" "$@"
    fi
}

ensure_podman_socket() {
    echo "[CHECK] 启用 Podman Socket..."

    mkdir -p /run/podman
    if [ -S /run/podman/podman.sock ]; then
        echo -e "${GREEN}[OK] Podman Socket 已存在${NC}"
        return
    fi

    if command -v systemctl >/dev/null 2>&1; then
        systemctl enable --now podman.socket || true
        sleep 1
    fi

    if [ ! -S /run/podman/podman.sock ]; then
        nohup podman system service --time=0 unix:///run/podman/podman.sock >/var/log/podman-system-service.log 2>&1 &
        sleep 1
    fi

    if [ ! -S /run/podman/podman.sock ]; then
        echo -e "${RED}[ERROR] Podman Socket 启动失败${NC}"
        exit 1
    fi

    echo -e "${GREEN}[OK] Podman Socket 可用${NC}"
}

check_memory() {
    echo ""
    echo "[CHECK] 检查服务器内存..."

    total_mem=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    swap_total=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)

    echo "   当前内存: ${total_mem}MB"

    if [ "$total_mem" -lt 1024 ] && [ "$swap_total" -eq 0 ]; then
        echo -e "${YELLOW}[WARN] 检测到低内存且无 Swap${NC}"

        choice="${AUTO_CREATE_SWAP:-}"
        if [ -z "$choice" ]; then
            if [ -t 0 ]; then
                printf "是否创建 512MB Swap？(y/N): "
                read -r choice
            else
                choice="n"
                echo -e "${YELLOW}[WARN] 当前为非交互环境，默认跳过 Swap 创建（可设置 AUTO_CREATE_SWAP=y 自动创建）${NC}"
            fi
        fi

        case "$choice" in
            y|Y|yes|YES)
                chmod +x "$SCRIPT_DIR/setup-swap.sh"
                sh "$SCRIPT_DIR/setup-swap.sh"
                ;;
            *)
                echo -e "${YELLOW}[WARN] 已跳过 Swap 创建，继续部署${NC}"
                LOW_MEM_NO_SWAP="1"
                ;;
        esac
    else
        echo -e "${GREEN}[OK] 内存/Swap 状态可用${NC}"
    fi
}

check_ports() {
    echo ""
    echo "[CHECK] 检查端口占用..."

    for port in 8080 7000; do
        if command -v lsof >/dev/null 2>&1 && lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo -e "${YELLOW}[WARN] 端口 $port 已被占用${NC}"
            echo "   请释放端口或修改 compose.yml 中配置"
            exit 1
        fi
    done

    echo -e "${GREEN}[OK] 端口检查通过${NC}"
}

cleanup_existing_project_containers() {
    echo ""
    echo "[CHECK] 检查并清理本项目旧容器..."

    run_compose down --remove-orphans >/dev/null 2>&1 || true

    removed_any="0"
    for container_name in $PROJECT_CONTAINERS; do
        if podman container exists "$container_name" >/dev/null 2>&1; then
            echo -e "${YELLOW}[WARN] 发现旧容器: ${container_name}，正在移除...${NC}"
            podman rm -f "$container_name" >/dev/null 2>&1 || true
            removed_any="1"
        fi
    done

    if [ "$removed_any" = "1" ]; then
        echo -e "${GREEN}[OK] 旧容器已清理完成${NC}"
    else
        echo -e "${GREEN}[OK] 未发现本项目旧容器${NC}"
    fi
}

deploy_services() {
    echo ""
    echo "[DEPLOY] 构建并启动服务..."

    if [ ! -f "$COMPOSE_FILE" ]; then
        echo -e "${RED}[ERROR] compose.yml 不存在，请在 deploy 目录运行${NC}"
        exit 1
    fi

    if [ "$LOW_MEM_NO_SWAP" = "1" ]; then
        echo -e "${YELLOW}[WARN] 检测到低内存且未创建 Swap，继续构建很可能 OOM 失败${NC}"
        if [ -t 0 ]; then
            printf "是否仍继续构建与部署？(y/N): "
            read -r continue_without_swap
            case "$continue_without_swap" in
                y|Y|yes|YES)
                    ;;
                *)
                    echo -e "${RED}[ERROR] 已取消部署。建议先创建 Swap 后重试。${NC}"
                    exit 1
                    ;;
            esac
        else
            echo -e "${RED}[ERROR] 非交互环境下已终止部署。请先创建 Swap，或设置 AUTO_CREATE_SWAP=y。${NC}"
            exit 1
        fi
    fi

    run_compose down --remove-orphans >/dev/null 2>&1 || true
    run_compose up -d --build

    echo -e "${GREEN}[OK] 服务启动成功${NC}"
}

show_info() {
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""
    echo "[访问地址]"
    echo "   Web 管理界面: http://Your Server IP:8080"
    echo "   FRP 服务端口: Your Server IP:7000"
    echo ""
    echo "[登录方式]"
    echo "   使用 GitHub 账号登录"
    echo -e "   ${YELLOW}* 首个登录的用户将自动成为管理员${NC}"
    echo ""
    echo "[常用命令]"
    if [ "$COMPOSE_MODE" = "podman" ]; then
        echo "   查看日志: podman compose -f compose.yml logs -f"
        echo "   重启服务: podman compose -f compose.yml restart"
        echo "   停止服务: podman compose -f compose.yml down"
    else
        echo "   查看日志: podman-compose -f compose.yml logs -f"
        echo "   重启服务: podman-compose -f compose.yml restart"
        echo "   停止服务: podman-compose -f compose.yml down"
    fi
    echo ""
}

configure_env_vars() {
    echo ""
    echo "=========================================="
    echo "  环境变量配置"
    echo "=========================================="
    echo ""

    # 从 .env 文件读取（如果存在）
    ENV_FILE="$SCRIPT_DIR/.env"
    if [ -f "$ENV_FILE" ]; then
        . "$ENV_FILE" 2>/dev/null || true
    fi

    # ---- GITHUB_CLIENT_ID ----
    if [ -z "${GITHUB_CLIENT_ID:-}" ]; then
        echo -e "${YELLOW}本系统使用 GitHub OAuth 登录。${NC}"
        echo "请先创建 GitHub OAuth App: https://github.com/settings/developers"
        echo "  - Homepage URL:            http://<你的服务器IP>:8080"
        echo "  - Authorization callback:  http://<你的服务器IP>:8080/api/auth/github/callback"
        echo ""
        while true; do
            printf "请输入 GITHUB_CLIENT_ID: "
            read -r GITHUB_CLIENT_ID
            if [ -n "$GITHUB_CLIENT_ID" ]; then
                break
            fi
            echo -e "${RED}不能为空，请重新输入${NC}"
        done
    fi

    # ---- GITHUB_CLIENT_SECRET ----
    if [ -z "${GITHUB_CLIENT_SECRET:-}" ]; then
        while true; do
            printf "请输入 GITHUB_CLIENT_SECRET: "
            read -r GITHUB_CLIENT_SECRET
            if [ -n "$GITHUB_CLIENT_SECRET" ]; then
                break
            fi
            echo -e "${RED}不能为空，请重新输入${NC}"
        done
    fi

    # ---- SECRET_KEY ----
    if [ -z "${SECRET_KEY:-}" ]; then
        echo ""
        echo "SECRET_KEY 用于 JWT 签名，确保登录会话在重启后仍然有效。"
        printf "是否自动生成 SECRET_KEY？(Y/n): "
        read -r auto_key
        case "$auto_key" in
            n|N|no|NO)
                while true; do
                    printf "请输入 SECRET_KEY（建议 32 位以上随机字符串）: "
                    read -r SECRET_KEY
                    if [ -n "$SECRET_KEY" ]; then
                        break
                    fi
                    echo -e "${RED}不能为空，请重新输入${NC}"
                done
                ;;
            *)
                SECRET_KEY=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | head -c 64)
                echo -e "${GREEN}[OK] 已自动生成 SECRET_KEY${NC}"
                ;;
        esac
    fi

    # 写入 .env 文件
    cat > "$ENV_FILE" <<ENVEOF
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
SECRET_KEY=${SECRET_KEY}
ENVEOF

    # 导出到当前 shell（供 docker compose 使用）
    export GITHUB_CLIENT_ID
    export GITHUB_CLIENT_SECRET
    export SECRET_KEY

    echo ""
    echo -e "${GREEN}[OK] 环境变量已保存到 .env 文件${NC}"
}

main() {
    require_root
    detect_os
    install_podman_stack
    detect_compose_mode
    ensure_podman_socket
    check_memory
    cleanup_existing_project_containers
    check_ports
    configure_env_vars
    deploy_services
    show_info
}

main
