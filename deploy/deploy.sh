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

check_podman_version() {
    echo ""
    echo "[CHECK] 检查 Podman 版本..."

    PODMAN_VER=$(podman --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    PODMAN_MAJOR=$(echo "$PODMAN_VER" | cut -d. -f1)

    if [ -z "$PODMAN_VER" ]; then
        echo -e "${RED}[ERROR] 无法获取 Podman 版本${NC}"
        exit 1
    fi

    echo "   当前 Podman 版本: $PODMAN_VER"

    if [ "$PODMAN_MAJOR" -lt 4 ]; then
        echo -e "${YELLOW}[WARN] Podman $PODMAN_VER 版本过低，后端容器要求 4.x${NC}"
        echo "   低版本会导致后端无法管理 FRPS 容器（API 版本不兼容）"
        echo ""

        UPGRADE_DONE="0"
        case "$OS_ID" in
            ubuntu|debian)
                echo "正在通过 Kubic 仓库升级 Podman..."
                mkdir -p /etc/apt/keyrings
                curl -fsSL "https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/unstable/xUbuntu_$(lsb_release -rs)/Release.key" \
                    | gpg --dearmor -o /etc/apt/keyrings/kubic-podman.gpg 2>/dev/null || true
                echo "deb [signed-by=/etc/apt/keyrings/kubic-podman.gpg] https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/unstable/xUbuntu_$(lsb_release -rs)/ /" \
                    > /etc/apt/sources.list.d/kubic-podman.list
                apt-get update -qq
                if apt-get install -y podman; then
                    UPGRADE_DONE="1"
                fi
                ;;
        esac

        if [ "$UPGRADE_DONE" = "1" ]; then
            PODMAN_VER=$(podman --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
            echo -e "${GREEN}[OK] Podman 已升级到 $PODMAN_VER${NC}"
        else
            echo -e "${RED}[ERROR] 自动升级失败，请手动升级 Podman 到 4.x 后重试${NC}"
            echo "   参考: https://podman.io/docs/installation"
            exit 1
        fi
    else
        echo -e "${GREEN}[OK] Podman 版本兼容${NC}"
    fi
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

    for port in 8080 7000 7500; do
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

    echo "[PULL] 拉取最新镜像..."
    if ! run_compose pull backend frontend; then
        echo -e "${YELLOW}[WARN] 镜像拉取失败，检查本地缓存...${NC}"
        has_local="1"
        for img in sgccr.ccs.tencentyun.com/frp-all-in-one/frp-backend:latest \
                    sgccr.ccs.tencentyun.com/frp-all-in-one/frp-frontend:latest; do
            if ! podman image exists "$img" 2>/dev/null; then
                has_local="0"
                echo -e "${RED}[ERROR] 本地无缓存镜像: $img${NC}"
            fi
        done
        if [ "$has_local" = "0" ]; then
            echo -e "${RED}[ERROR] 镜像拉取失败且无本地缓存，请检查网络或镜像仓库配置${NC}"
            exit 1
        fi
        echo -e "${YELLOW}[OK] 使用本地缓存镜像继续部署${NC}"
    fi

    run_compose up -d

    echo ""
    echo "[CHECK] 验证容器启动状态..."
    sleep 3
    all_ok="1"
    for name in frp-manager-backend frp-manager-web frps; do
        if ! podman ps --filter "name=^${name}$" --format '{{.Status}}' 2>/dev/null | grep -qi "up"; then
            echo -e "${RED}[ERROR] 容器 ${name} 未正常运行${NC}"
            podman logs "$name" --tail 10 2>/dev/null || true
            echo ""
            all_ok="0"
        else
            echo -e "${GREEN}[OK] ${name} 运行中${NC}"
        fi
    done

    if [ "$all_ok" = "0" ]; then
        echo -e "${RED}[ERROR] 部分容器启动失败，请根据上方日志排查${NC}"
        exit 1
    fi

    echo -e "${GREEN}[OK] 所有服务启动成功${NC}"
}

show_info() {
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""

    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || \
                curl -s --max-time 5 ip.sb 2>/dev/null || \
                curl -s --max-time 5 api.ipify.org 2>/dev/null || \
                echo "")
    if [ -z "$PUBLIC_IP" ]; then
        PUBLIC_IP="<你的服务器IP>"
    fi

    echo "[访问地址]"
    echo "   Web 管理界面: http://${PUBLIC_IP}:8080"
    echo "   FRP 服务端口: ${PUBLIC_IP}:7000"
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

    # 从系统级持久化文件读取（服务器重启/重新部署后仍有效）
    SYSTEM_ENV="/etc/frp-all-in-one.env"
    if [ -f "$SYSTEM_ENV" ]; then
        . "$SYSTEM_ENV" 2>/dev/null || true
    fi

    # 从项目 .env 文件读取（如果存在）
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
        # 写入系统级持久化文件，后续重新部署无需重复填写
        _save_to_system_env "GITHUB_CLIENT_ID" "$GITHUB_CLIENT_ID"
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
        # 写入系统级持久化文件，后续重新部署无需重复填写
        _save_to_system_env "GITHUB_CLIENT_SECRET" "$GITHUB_CLIENT_SECRET"
    fi

    # ---- SECRET_KEY ----
    # 每次部署重新生成，使旧 JWT 令牌立即失效
    SECRET_KEY=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | head -c 64)
    # 清理系统持久化文件中的旧密钥（不再持久化 SECRET_KEY）
    if [ -f "/etc/frp-all-in-one.env" ]; then
        sed -i '/^SECRET_KEY=/d' /etc/frp-all-in-one.env 2>/dev/null || true
    fi
    echo -e "${GREEN}[OK] 已重新生成 SECRET_KEY（旧登录会话已失效）${NC}"

    # 写入项目 .env 文件（供 docker compose 使用）
    cat > "$ENV_FILE" <<ENVEOF
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
SECRET_KEY=${SECRET_KEY}
ENVEOF
    chmod 600 "$ENV_FILE"

    # 导出到当前 shell（供 docker compose 使用）
    export GITHUB_CLIENT_ID
    export GITHUB_CLIENT_SECRET
    export SECRET_KEY

    echo ""
    echo -e "${GREEN}[OK] 环境变量已保存到 .env 文件${NC}"
}

# 将环境变量追加到系统级持久化文件
_save_to_system_env() {
    local key="$1"
    local value="$2"
    local sys_env="/etc/frp-all-in-one.env"
    # 如果文件不存在则创建
    if [ ! -f "$sys_env" ]; then
        touch "$sys_env"
        chmod 600 "$sys_env"
    fi
    # 先删除旧值（如果有），再追加新值
    if grep -q "^${key}=" "$sys_env" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$sys_env"
    else
        echo "${key}=${value}" >> "$sys_env"
    fi
}

main() {
    require_root
    detect_os
    install_podman_stack
    check_podman_version
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
