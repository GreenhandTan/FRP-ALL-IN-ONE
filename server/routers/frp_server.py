"""
FRP 服务端管理路由
包含 FRPS 部署、端口管理、Agent 安装脚本生成等
"""
import subprocess
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from sqlalchemy.orm import Session

import crud
import frp_deploy
import models
from core import get_db, require_password_changed
from core.container_engine import run_podman

router = APIRouter(prefix="/frp", tags=["FRP 服务端管理"])


@router.get("/server-status")
async def get_frps_status(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """
    从 FRPS Dashboard API 获取实时状态
    包括已连接的客户端和代理信息
    """
    import requests
    import asyncio
    import re
    
    # 获取 Dashboard 密码
    dashboard_pwd = crud.get_config(db, models.ConfigKeys.FRPS_DASHBOARD_PWD)
    if not dashboard_pwd:
        return {
            "success": False,
            "message": "FRPS 尚未配置，请先完成服务端部署",
            "clients": [],
            "proxies": []
        }
    
    # 尝试多种可能的连接地址
    possible_urls = [
        "http://127.0.0.1:7500/api",
        "http://host.containers.internal:7500/api",
        "http://172.17.0.1:7500/api",
        "http://frps:7500/api",
    ]

    base_url = None
    auth = ("admin", dashboard_pwd)
    server_info = {}

    loop = asyncio.get_running_loop()
    
    async def _fetch(url, timeout=5):
        return await loop.run_in_executor(None, lambda: requests.get(f"{url}/serverinfo", auth=auth, timeout=timeout))

    for url in possible_urls:
        try:
            resp = await _fetch(url)
            if resp.status_code == 200:
                base_url = url
                server_info = resp.json()
                break
        except:
            continue
    
    if not base_url:
        return {
            "success": False,
            "message": "无法连接到 FRPS Dashboard",
            "clients": [],
            "proxies": []
        }

    try:
        def _get_any(d: dict, keys, default=None):
            for k in keys:
                if k in d and d.get(k) is not None:
                    return d.get(k)
            return default

        def _to_int(value, default=0):
            try:
                if value is None:
                    return default
                if isinstance(value, bool):
                    return int(value)
                if isinstance(value, (int, float)):
                    return int(value)
                s = str(value).strip()
                if not s:
                    return default
                return int(float(s))
            except Exception:
                return default

        def _to_bytes(value, default=0):
            if value is None:
                return default
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                return int(value)
            s = str(value).strip()
            if not s:
                return default
            try:
                return int(float(s))
            except Exception:
                pass
            m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([KMGTP]?B)\s*$", s, re.IGNORECASE)
            if not m:
                return default
            num = float(m.group(1))
            unit = m.group(2).upper()
            scale = {
                "B": 1,
                "KB": 1024,
                "MB": 1024 ** 2,
                "GB": 1024 ** 3,
                "TB": 1024 ** 4,
                "PB": 1024 ** 5,
            }.get(unit, 1)
            return int(num * scale)

        def _normalize_proxy(proxy: dict) -> dict:
            if not isinstance(proxy, dict):
                return {}
            name = _get_any(proxy, ["name"], "")
            ptype = _get_any(proxy, ["type"], "")
            conf = _get_any(proxy, ["conf"], {}) or {}
            cur_conns = _to_int(_get_any(proxy, ["curConns", "cur_conns"], 0), 0)
            today_in = _to_bytes(_get_any(proxy, ["todayTrafficIn", "today_traffic_in"], 0), 0)
            today_out = _to_bytes(_get_any(proxy, ["todayTrafficOut", "today_traffic_out"], 0), 0)
            return {
                "name": name,
                "type": ptype,
                "conf": conf,
                "cur_conns": cur_conns,
                "today_traffic_in": today_in,
                "today_traffic_out": today_out,
            }

        # 获取各类代理列表
        tcp_proxies, udp_proxies, http_proxies = [], [], []
        
        try:
            resp = await loop.run_in_executor(None, lambda: requests.get(f"{base_url}/proxy/tcp", auth=auth, timeout=5))
            if resp.status_code == 200:
                tcp_proxies = resp.json().get("proxies", []) or []
        except:
            pass
        
        try:
            resp = await loop.run_in_executor(None, lambda: requests.get(f"{base_url}/proxy/udp", auth=auth, timeout=5))
            if resp.status_code == 200:
                udp_proxies = resp.json().get("proxies", []) or []
        except:
            pass
        
        try:
            resp = await loop.run_in_executor(None, lambda: requests.get(f"{base_url}/proxy/http", auth=auth, timeout=5))
            if resp.status_code == 200:
                http_proxies = resp.json().get("proxies", []) or []
        except:
            pass
        
        all_proxies_raw = tcp_proxies + udp_proxies + http_proxies
        all_proxies = [_normalize_proxy(p) for p in all_proxies_raw]
        
        # 提取唯一的客户端名称
        client_names = set()
        for proxy in all_proxies:
            name = proxy.get("name", "")
            if "." in name:
                client_names.add(name.split(".")[0])
        
        clients = []
        for name in client_names:
            client_proxies = [p for p in all_proxies if p.get("name", "").startswith(f"{name}.")]
            clients.append({
                "name": name,
                "status": "online",
                "proxy_count": len(client_proxies),
                "proxies": client_proxies
            })
        
        normalized_server_info = dict(server_info or {})
        normalized_server_info["curConns"] = _to_int(_get_any(normalized_server_info, ["curConns", "cur_conns"], 0), 0)
        normalized_server_info["totalTrafficIn"] = _to_bytes(_get_any(normalized_server_info, ["totalTrafficIn", "total_traffic_in"], 0), 0)
        normalized_server_info["totalTrafficOut"] = _to_bytes(_get_any(normalized_server_info, ["totalTrafficOut", "total_traffic_out"], 0), 0)

        return {
            "success": True,
            "server_info": normalized_server_info,
            "total_clients": len(clients),
            "total_proxies": len(all_proxies),
            "clients": clients,
            "proxies": all_proxies,
            "aggregated_traffic_in": sum(p.get("today_traffic_in", 0) for p in all_proxies),
            "aggregated_traffic_out": sum(p.get("today_traffic_out", 0) for p in all_proxies)
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "clients": [],
            "proxies": []
        }


@router.post("/deploy-server")
async def deploy_frp_server(
    port: int = 7000,
    auth_token: str = None,
    server_ip: str = None,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """生成 FRPS 配置文件"""
    result = frp_deploy.generate_frps_config(port, auth_token, server_ip)
    
    if result["success"]:
        info = result["info"]
        crud.set_config(db, models.ConfigKeys.FRPS_VERSION, info["version"])
        crud.set_config(db, models.ConfigKeys.FRPS_PORT, str(info["port"]))
        crud.set_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN, info["auth_token"])
        crud.set_config(db, models.ConfigKeys.SERVER_PUBLIC_IP, info["public_ip"])
        crud.set_config(db, models.ConfigKeys.FRPS_DASHBOARD_PWD, info["dashboard_pwd"])
    
    return result


@router.post("/restart-frps")
async def restart_frps(
    current_user: models.Admin = Depends(require_password_changed)
):
    """手动重启 FRPS 容器"""
    try:
        result = run_podman(["restart", "frps"], timeout=30)
        if result.returncode == 0:
            return {"success": True, "message": "FRPS 重启成功"}
        else:
            return {"success": False, "message": f"重启失败: {result.stderr.strip()}"}
    except FileNotFoundError:
        return {"success": False, "message": "未找到 podman 命令"}
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "重启超时"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ===========================
# 端口管理
# ===========================

@router.get("/disabled-ports")
async def get_disabled_ports(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """获取禁用的端口列表"""
    disabled_ports_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS)
    if disabled_ports_str:
        return {"disabled_ports": [int(p) for p in disabled_ports_str.split(",") if p.strip()]}
    return {"disabled_ports": []}


@router.post("/ports/disable")
async def disable_port(
    port: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """禁用指定端口"""
    current_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS) or ""
    current_ports = [int(p) for p in current_str.split(",") if p.strip()]
    
    if port not in current_ports:
        current_ports.append(port)
        crud.set_config(db, models.ConfigKeys.DISABLED_PORTS, ",".join(map(str, current_ports)))
        
        frps_port = int(crud.get_config(db, models.ConfigKeys.FRPS_PORT) or 7000)
        auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
        server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
        
        frp_deploy.generate_frps_config(frps_port, auth_token, server_ip, current_ports)
        
        return {"success": True, "message": f"端口 {port} 已禁用，FRPS 已重启"}
    
    return {"success": True, "message": f"端口 {port} 已经是禁用状态"}


@router.post("/ports/enable")
async def enable_port(
    port: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """启用指定端口"""
    current_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS) or ""
    current_ports = [int(p) for p in current_str.split(",") if p.strip()]
    
    if port in current_ports:
        current_ports.remove(port)
        crud.set_config(db, models.ConfigKeys.DISABLED_PORTS, ",".join(map(str, current_ports)))
        
        frps_port = int(crud.get_config(db, models.ConfigKeys.FRPS_PORT) or 7000)
        auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
        server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
        
        frp_deploy.generate_frps_config(frps_port, auth_token, server_ip, current_ports)
        
        return {"success": True, "message": f"端口 {port} 已启用，FRPS 已重启"}
    
    return {"success": True, "message": f"端口 {port} 未被禁用"}


# ===========================
# Agent 分发 API
# ===========================

@router.get("/agent/download/{platform}")
async def download_agent_binary(
    platform: str,
    current_user: models.Admin = Depends(require_password_changed)
):
    """
    下载 Agent 二进制文件 (重定向到 GitHub Releases)
    platform: linux-amd64, linux-arm64, darwin-amd64, darwin-arm64, windows-amd64
    """
    valid_platforms = [
        "linux-amd64", "linux-arm64", 
        "darwin-amd64", "darwin-arm64", 
        "windows-amd64"
    ]
    
    if platform not in valid_platforms:
        raise HTTPException(status_code=400, detail=f"Invalid platform. Valid: {valid_platforms}")
    
    if platform.startswith("windows"):
        filename = f"frp-agent-{platform}.exe"
    else:
        filename = f"frp-agent-{platform}"
    
    github_url = f"https://github.com/GreenhandTan/FRP-ALL-IN-ONE/releases/latest/download/{filename}"
    return RedirectResponse(url=github_url)


@router.get("/agent/platforms")
async def get_available_agent_platforms():
    """获取可用的 Agent 平台列表"""
    platform_info = {
        "linux-amd64": {"name": "Linux x64", "os": "linux", "arch": "amd64", "ext": ""},
        "linux-arm64": {"name": "Linux ARM64", "os": "linux", "arch": "arm64", "ext": ""},
        "darwin-amd64": {"name": "macOS Intel", "os": "darwin", "arch": "amd64", "ext": ""},
        "darwin-arm64": {"name": "macOS Apple Silicon", "os": "darwin", "arch": "arm64", "ext": ""},
        "windows-amd64": {"name": "Windows x64", "os": "windows", "arch": "amd64", "ext": ".exe"},
    }
    
    platforms = []
    for platform_id, info in platform_info.items():
        filename = f"frp-agent-{platform_id}{info['ext']}"
        platforms.append({
            "id": platform_id,
            "name": info["name"],
            "os": info["os"],
            "arch": info["arch"],
            "available": True,
            "filename": filename
        })
    
    return {"platforms": platforms}


@router.get("/agent/install-script/{platform}")
async def get_agent_install_script(
    platform: str,
    client_id: str = None,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """
    获取动态生成的 Agent 安装脚本
    platform: linux, darwin, windows
    """
    import crud as crud_module
    
    auth_token = crud_module.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN) or "frp-token"
    server_ip = crud_module.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP) or "YOUR_SERVER_IP"
    frps_port = crud_module.get_config(db, models.ConfigKeys.FRPS_PORT) or "7000"
    frps_version = crud_module.get_config(db, models.ConfigKeys.FRPS_VERSION) or "0.61.1"
    panel_access_port = (crud_module.get_config(db, models.ConfigKeys.PANEL_ACCESS_PORT) or "").strip()

    # 优先级：① 已配置的面板访问端口（NAT 场景显式指定） → ② 请求 Host 头中携带的端口（浏览器经 NAT 访问时）
    # → ③ 启用 HTTPS+域名 → ④ 公网 IP（裸协议 80）
    forwarded_proto = ""
    forwarded_host = ""
    if request is not None:
        forwarded_proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "").split(",")[0].strip().lower()
        forwarded_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()

    if forwarded_proto in ("https", "wss"):
        ws_scheme = "wss"
    else:
        ws_scheme = "ws"

    if panel_access_port:
        # 显式 NAT 端口配置：使用公网 IP + 配置的端口
        manager_host = f"{server_ip}:{panel_access_port}"
    elif forwarded_host:
        manager_host = forwarded_host
    else:
        # 回退逻辑：启用 HTTPS + 域名时使用域名，否则使用公网 IP
        tls_enabled = crud_module.get_config(db, models.ConfigKeys.TLS_ENABLED) == "true"
        server_domain = (crud_module.get_config(db, models.ConfigKeys.SERVER_DOMAIN) or "").strip()
        manager_host = server_domain if (tls_enabled and server_domain) else server_ip

    if client_id:
        client = crud_module.get_client(db, client_id=client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
    else:
        suffix = str(int(time.time()))[-6:]
        client = crud_module.create_client_with_token(db, name=f"device-{suffix}")

    client_id = client.id
    client_token = client.auth_token
    download_base = "https://github.com/GreenhandTan/FRP-ALL-IN-ONE/releases/latest/download"

    if platform == "windows":
        script = _generate_windows_script(server_ip, frps_port, auth_token, client_id, client_token, frps_version, download_base, ws_scheme, manager_host)
        return PlainTextResponse(content=script, media_type="text/plain")
    else:
        os_type = "darwin" if platform == "darwin" else "linux"
        script = _generate_unix_script(server_ip, frps_port, auth_token, client_id, client_token, frps_version, download_base, os_type, ws_scheme, manager_host)
        return PlainTextResponse(content=script, media_type="text/plain")


def _generate_windows_script(server_ip, frps_port, auth_token, client_id, client_token, frp_version, download_base, ws_scheme="ws", manager_host=None):
    """生成 Windows PowerShell 安装脚本"""
    if manager_host is None:
        manager_host = server_ip
    manager_ws_url = f"{ws_scheme}://{manager_host}/ws/agent/{client_id}"
    return f'''# FRP Manager Agent + FRPC 一键安装脚本 (Windows)
$ErrorActionPreference = "Stop"

$SERVER_IP = "{server_ip}"
$FRPS_PORT = "{frps_port}"
$FRPS_TOKEN = "{auth_token}"
$CLIENT_TOKEN = "{client_token}"
$CLIENT_ID = "{client_id}"
$FRP_VERSION = "{frp_version}"
$INSTALL_DIR = "C:\\frp"
$DOWNLOAD_BASE = "{download_base}"
$MANAGER_WS_URL = "{manager_ws_url}"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  FRP Manager Agent 一键安装 (Windows)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

if (!(Test-Path $INSTALL_DIR)) {{ New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null }}
if (!(Test-Path "$INSTALL_DIR\\logs")) {{ New-Item -ItemType Directory -Path "$INSTALL_DIR\\logs" -Force | Out-Null }}

# 下载 FRPC
$frpUrl = "https://github.com/fatedier/frp/releases/download/v$FRP_VERSION/frp_${{FRP_VERSION}}_windows_amd64.zip"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $frpUrl -OutFile "$INSTALL_DIR\\frp.zip" -UseBasicParsing
Expand-Archive -Path "$INSTALL_DIR\\frp.zip" -DestinationPath $INSTALL_DIR -Force
Copy-Item "$INSTALL_DIR\\frp_${{FRP_VERSION}}_windows_amd64\\frpc.exe" "$INSTALL_DIR\\frpc.exe" -Force
Remove-Item "$INSTALL_DIR\\frp.zip" -Force
Remove-Item "$INSTALL_DIR\\frp_${{FRP_VERSION}}_windows_amd64" -Recurse -Force

# 下载 Agent
try {{
    $agentUrl = "$DOWNLOAD_BASE/frp-agent-windows-amd64.exe"
    Invoke-WebRequest -Uri $agentUrl -OutFile "$INSTALL_DIR\\frp-agent.exe" -UseBasicParsing -TimeoutSec 60
}} catch {{
    Write-Host "[WARN] Agent 下载失败，跳过" -ForegroundColor Yellow
}}

# 创建配置文件
$config = @"
serverAddr = "$SERVER_IP"
serverPort = $FRPS_PORT
auth.token = "$FRPS_TOKEN"
webServer.addr = "127.0.0.1"
webServer.port = 7400
"@
$config | Out-File -FilePath "$INSTALL_DIR\\frpc.toml" -Encoding UTF8

# 添加到开机启动
$startupFolder = [Environment]::GetFolderPath('Startup')
$startScript = "@echo off`ncd /d \"$INSTALL_DIR\"`nstart /min \"\" \"$INSTALL_DIR\\frpc.exe\" -c \"$INSTALL_DIR\\frpc.toml\""
$startScript | Out-File -FilePath "$INSTALL_DIR\\start-frpc.bat" -Encoding ASCII
Copy-Item "$INSTALL_DIR\\start-frpc.bat" "$startupFolder\\start-frpc.bat" -Force

# 启动 FRPC
Start-Process -FilePath "$INSTALL_DIR\\frpc.exe" -ArgumentList "-c", "$INSTALL_DIR\\frpc.toml" -WindowStyle Minimized

if (Test-Path "$INSTALL_DIR\\frp-agent.exe") {{
    $agentScript = "@echo off`ncd /d \"$INSTALL_DIR\"`nstart /min \"\" \"$INSTALL_DIR\\frp-agent.exe\" -server $MANAGER_WS_URL -id $CLIENT_ID -token $CLIENT_TOKEN -frpc \"$INSTALL_DIR\\frpc.exe\" -config \"$INSTALL_DIR\\frpc.toml\" -log \"$INSTALL_DIR\\logs\""
    $agentScript | Out-File -FilePath "$INSTALL_DIR\\start-frp-agent.bat" -Encoding ASCII
    Copy-Item "$INSTALL_DIR\\start-frp-agent.bat" "$startupFolder\\start-frp-agent.bat" -Force
    Start-Process -FilePath "$INSTALL_DIR\\frp-agent.exe" -ArgumentList "-server", "$MANAGER_WS_URL", "-id", "$CLIENT_ID", "-token", "$CLIENT_TOKEN", "-frpc", "$INSTALL_DIR\\frpc.exe", "-config", "$INSTALL_DIR\\frpc.toml", "-log", "$INSTALL_DIR\\logs" -WindowStyle Minimized
}}

Write-Host "安装完成！" -ForegroundColor Green
'''


def _generate_unix_script(server_ip, frps_port, auth_token, client_id, client_token, frp_version, download_base, os_type, ws_scheme="ws", manager_host=None):
    """生成 Linux/macOS Bash 安装脚本"""
    if manager_host is None:
        manager_host = server_ip
    manager_ws_url = f"{ws_scheme}://{manager_host}/ws/agent/{client_id}"
    return f'''#!/bin/bash
# FRP Manager Agent + FRPC 一键安装脚本 (Linux/macOS)

set -e

SERVER_IP="{server_ip}"
FRPS_PORT="{frps_port}"
FRPS_TOKEN="{auth_token}"
CLIENT_TOKEN="{client_token}"
CLIENT_ID="{client_id}"
FRP_VERSION="{frp_version}"
INSTALL_DIR="/opt/frp"
DOWNLOAD_BASE="{download_base}"
MANAGER_WS_URL="{manager_ws_url}"

RED='\\033[0;31m'
GREEN='\\033[0;32m'
BLUE='\\033[0;34m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

log_info() {{ echo -e "${{BLUE}}[INFO]${{NC}} $1"; }}
log_ok() {{ echo -e "${{GREEN}}[OK]${{NC}} $1"; }}
log_warn() {{ echo -e "${{YELLOW}}[WARN]${{NC}} $1"; }}
log_error() {{ echo -e "${{RED}}[ERROR]${{NC}} $1"; }}

detect_arch() {{
    case "$(uname -m)" in
        x86_64|amd64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "amd64" ;;
    esac
}}

ARCH=$(detect_arch)
OS="{os_type}"

echo ""
echo -e "${{BLUE}}===============================================${{NC}}"
echo -e "${{BLUE}}  FRP Manager Agent 一键安装 ($OS-$ARCH)${{NC}}"
echo -e "${{BLUE}}===============================================${{NC}}"
echo ""

# 创建安装目录
log_info "[1/5] 创建安装目录..."
mkdir -p $INSTALL_DIR
mkdir -p $INSTALL_DIR/logs
log_ok "目录创建完成: $INSTALL_DIR"

# 下载 FRPC
log_info "[2/5] 下载 FRPC v$FRP_VERSION..."
FRP_URL="https://github.com/fatedier/frp/releases/download/v${{FRP_VERSION}}/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}.tar.gz"

if command -v wget &> /dev/null; then
    wget -q --show-progress "$FRP_URL" -O /tmp/frp.tar.gz
else
    log_error "需要 wget"
    exit 1
fi

tar -xzf /tmp/frp.tar.gz -C /tmp/
cp /tmp/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}/frpc $INSTALL_DIR/
chmod +x $INSTALL_DIR/frpc
rm -rf /tmp/frp.tar.gz /tmp/frp_*
log_ok "FRPC 下载完成"

# 下载 Agent
log_info "[3/5] 下载 Agent ($OS-$ARCH)..."
AGENT_PATH="$INSTALL_DIR/frp-agent"
AGENT_FILENAME="frp-agent-${{OS}}-${{ARCH}}"
GITHUB_URL="$DOWNLOAD_BASE/$AGENT_FILENAME"

AGENT_DOWNLOAD_OK=0
if wget -q --show-progress "$GITHUB_URL" -O "$AGENT_PATH" 2>/dev/null; then
    chmod +x "$AGENT_PATH"
    log_ok "Agent 下载完成"
    AGENT_DOWNLOAD_OK=1
else
    log_warn "Agent 下载失败（$GITHUB_URL）"
    log_warn "管理控制台将无法监控该设备，FRPC 仍可正常建立隧道"
    log_warn "请确认 GitHub Releases 中已有 frp-agent-${{OS}}-${{ARCH}} 文件，或手动下载后放置到 $AGENT_PATH"
fi

# 创建配置文件
log_info "[4/5] 创建配置文件..."
cat > $INSTALL_DIR/frpc.toml << 'FRPC_CONFIG'
serverAddr = "{server_ip}"
serverPort = {frps_port}
auth.token = "{auth_token}"
webServer.addr = "127.0.0.1"
webServer.port = 7400
FRPC_CONFIG
log_ok "配置文件已创建"

# 创建系统服务
log_info "[5/5] 创建系统服务..."
if [ "$AGENT_DOWNLOAD_OK" = "1" ]; then
    if [ "$OS" = "linux" ]; then
        cat > /etc/systemd/system/frp-agent.service << AGENT_SERVICE
[Unit]
Description=FRP Manager Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/frp-agent -server $MANAGER_WS_URL -id $CLIENT_ID -token $CLIENT_TOKEN -frpc $INSTALL_DIR/frpc -config $INSTALL_DIR/frpc.toml -log $INSTALL_DIR/logs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
AGENT_SERVICE

        systemctl daemon-reload
        systemctl enable frp-agent
        systemctl start frp-agent
        log_ok "Agent 服务已创建并启动 (systemd)"
    elif [ "$OS" = "darwin" ]; then
        PLIST_PATH="$HOME/Library/LaunchAgents/com.frpmanager.agent.plist"
        mkdir -p "$HOME/Library/LaunchAgents"
        cat > "$PLIST_PATH" << DARWIN_PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.frpmanager.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/frp-agent</string>
        <string>-server</string><string>$MANAGER_WS_URL</string>
        <string>-id</string><string>$CLIENT_ID</string>
        <string>-token</string><string>$CLIENT_TOKEN</string>
        <string>-frpc</string><string>$INSTALL_DIR/frpc</string>
        <string>-config</string><string>$INSTALL_DIR/frpc.toml</string>
        <string>-log</string><string>$INSTALL_DIR/logs</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>$INSTALL_DIR/logs/agent.log</string>
    <key>StandardErrorPath</key><string>$INSTALL_DIR/logs/agent.err</string>
</dict>
</plist>
DARWIN_PLIST
        launchctl load "$PLIST_PATH" 2>/dev/null || true
        launchctl start com.frpmanager.agent 2>/dev/null || true
        log_ok "Agent 服务已创建并启动 (launchd)"
    fi
else
    log_warn "跳过 Agent 服务创建（Agent 二进制未下载成功）"
fi

echo ""
echo -e "${{GREEN}}===============================================${{NC}}"
echo -e "${{GREEN}}  安装完成！${{NC}}"
echo -e "${{GREEN}}===============================================${{NC}}"
echo ""
echo "安装目录: $INSTALL_DIR"
echo "客户端 ID: $CLIENT_ID"
echo "服务器: $SERVER_IP:$FRPS_PORT"
'''


@router.get("/agent/install-script-info")
async def get_install_script_info(db: Session = Depends(get_db)):
    """获取安装脚本信息"""
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP) or "YOUR_SERVER_IP"
    frps_port = crud.get_config(db, models.ConfigKeys.FRPS_PORT) or "7000"
    frps_version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) or "0.61.1"

    return {
        "server_ip": server_ip,
        "frps_port": frps_port,
        "frps_version": frps_version,
        "scripts": {
            "linux": f"http://{server_ip}/api/frp/agent/install-script/linux",
            "darwin": f"http://{server_ip}/api/frp/agent/install-script/darwin",
            "windows": f"http://{server_ip}/api/frp/agent/install-script/windows"
        }
    }


@router.get("/public-ip")
async def get_public_ip(
    current_user: models.Admin = Depends(require_password_changed)
):
    """获取服务器公网 IP"""
    import asyncio
    return await asyncio.to_thread(frp_deploy.get_public_ip_details)
