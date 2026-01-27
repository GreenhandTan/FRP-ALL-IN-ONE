import subprocess
import requests
import secrets
from typing import Dict
import ipaddress
import os
import re

# FRP 配置文件路径（映射到宿主机项目根目录）
# Backend 容器中 /app/frps.toml 映射到宿主机 ./frps.toml
# FRPS 容器会读取同一个文件
FRPS_CONFIG_PATH = "/app/frps.toml"

# Docker Compose 项目根目录
DOCKER_COMPOSE_DIR = "/app"

# 默认 FRP 版本（备用，当无法获取最新版本时使用）
DEFAULT_FRP_VERSION = "0.61.1"

def get_latest_frp_version() -> str:
    """从 GitHub API 获取 FRP 最新发布版本号"""
    try:
        response = requests.get(
            'https://api.github.com/repos/fatedier/frp/releases/latest',
            timeout=10,
            headers={'Accept': 'application/vnd.github.v3+json'}
        )
        if response.status_code == 200:
            tag_name = response.json().get('tag_name', '')
            # tag_name 格式为 "v0.61.1"，去掉 "v" 前缀
            if tag_name.startswith('v'):
                return tag_name[1:]
            return tag_name
    except Exception as e:
        print(f"获取 FRP 最新版本失败: {e}")
    return DEFAULT_FRP_VERSION

def _is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except Exception:
        return False
    if ip.version == 4 and str(ip).startswith("0."):
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
    )

def _extract_ip(text: str):
    if not text:
        return None
    m4 = re.search(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b", text)
    if m4 and _is_public_ip(m4.group(0)):
        return m4.group(0)
    m6 = re.search(r"\b([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b", text)
    if m6 and _is_public_ip(m6.group(0)):
        return m6.group(0)
    return None

def get_public_ip_details() -> Dict:
    urls_env = os.environ.get("PUBLIC_IP_URLS", "").strip()
    if urls_env:
        urls = [u.strip() for u in urls_env.split(",") if u.strip()]
    else:
        urls = [
            "https://4.ipw.cn",
            "https://ip.3322.net",
            "https://api.ipify.org?format=json",
            "https://api64.ipify.org?format=json",
            "https://myip.ipip.net",
            "https://ipinfo.io/ip",
            "https://icanhazip.com",
            "https://ifconfig.me/ip",
            "https://api.ip.sb/ip",
        ]

    headers = {
        "User-Agent": "FRP-ALL-IN-ONE/1.0 (public-ip)",
        "Accept": "application/json,text/plain,*/*",
    }

    errors = []
    for url in urls:
        try:
            resp = requests.get(url, timeout=(3, 6), headers=headers)
            if resp.status_code != 200:
                errors.append(f"{url}: http {resp.status_code}")
                continue

            ip = None
            content_type = (resp.headers.get("content-type") or "").lower()
            if "application/json" in content_type or url.endswith("format=json"):
                try:
                    data = resp.json()
                    ip = data.get("ip") or data.get("IP")
                except Exception:
                    ip = None
            if not ip:
                ip = _extract_ip(resp.text.strip())

            if ip and _is_public_ip(ip):
                version = 4 if ipaddress.ip_address(ip).version == 4 else 6
                return {
                    "success": True,
                    "ip": ip,
                    "ip_version": version,
                    "source": url,
                    "errors": errors,
                }

            errors.append(f"{url}: invalid response")
        except Exception as e:
            errors.append(f"{url}: {type(e).__name__}")

    return {"success": False, "ip": "未知", "ip_version": None, "source": None, "errors": errors}

def get_public_ip() -> str:
    return get_public_ip_details().get("ip") or "未知"

def generate_frps_config(port: int = 7000, auth_token: str = None, server_ip: str = None, disabled_ports: list = None) -> Dict:
    """
    生成 FRPS 配置文件
    
    Args:
        port: FRPS 监听端口
        auth_token: 认证 Token
        server_ip: 公网 IP
        disabled_ports: 禁用的端口列表，例如 [6001, 6005]
    """
    if not auth_token:
        auth_token = secrets.token_hex(16)
    
    # 生成 Dashboard 密码（用于 FRPS Admin API）
    dashboard_pwd = secrets.token_hex(8)
    
    # 计算 allowPorts
    # 默认允许所有端口 (1-65535)
    # 只有当存在禁用端口时，才生成 allowPorts 配置来排除它们
    allow_ports_config = ""
    
    if disabled_ports:
        # 全端口范围
        total_start = 1
        total_end = 65535
        
        allowed_ranges = []
        current_start = total_start
        
        # 排序并去重
        sorted_disabled = sorted(list(set([int(p) for p in disabled_ports if total_start <= int(p) <= total_end])))
        
        for p in sorted_disabled:
            if p > current_start:
                if p - 1 == current_start:
                    allowed_ranges.append(str(current_start))
                else:
                    allowed_ranges.append(f"{current_start}-{p-1}")
            current_start = p + 1
            
        if current_start <= total_end:
            if current_start == total_end:
                allowed_ranges.append(str(current_start))
            else:
                allowed_ranges.append(f"{current_start}-{total_end}")
        
        # 如果排除了所有端口（极端情况），allowed_ranges 为空，这将导致 allowPorts = []，即拒绝所有
        if allowed_ranges:
            allow_ports_config = f'allowPorts = [{", ".join([f"{r}" for r in allowed_ranges])}]'
        else:
            allow_ports_config = 'allowPorts = []' # 禁用所有端口
    else:
        # 没有任何禁用端口，不生成 allowPorts 配置，默认允许所有
        pass

    try:
        # 生成配置内容（包含 Dashboard API 配置）
        config_content = f"""bindPort = {port}
auth.token = "{auth_token}"

# Dashboard API (用于管理后台获取客户端状态)
webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "{dashboard_pwd}"

# 端口访问控制
{allow_ports_config}

# 由 FRP Manager 自动生成
# 修改后需要重启 FRPS 容器: docker-compose restart frps
"""
        
        # 写入配置文件（写到项目根目录，Docker 会自动映射）
        with open(FRPS_CONFIG_PATH, 'w') as f:
            f.write(config_content)
        
        # 尝试重启 FRPS 容器（如果在 Docker Compose 环境中）
        frps_restarted = False
        restart_message = ""
        
        try:
            # 使用 docker CLI 重启容器
            result = subprocess.run(
                ["docker", "restart", "frps"],
                check=False,
                capture_output=True,
                timeout=30,  # 增加超时时间
                text=True
            )
            if result.returncode == 0:
                print("✅ FRPS 容器已成功重启")
                frps_restarted = True
                restart_message = "FRPS 已重启"
                
                # 等待容器启动完成
                import time
                time.sleep(2)
            else:
                restart_message = f"FRPS 重启失败: {result.stderr.strip()}"
                print(f"⚠️ {restart_message}")
        except FileNotFoundError:
            restart_message = "未找到 docker 命令，请手动重启 FRPS"
            print(f"⚠️ {restart_message}")
        except subprocess.TimeoutExpired:
            restart_message = "FRPS 重启超时，请手动检查"
            print(f"⚠️ {restart_message}")
        except Exception as e:
            restart_message = f"无法重启 FRPS 容器: {str(e)}"
            print(f"⚠️ {restart_message}")
            print("提示: 配置已生成，请手动执行 'docker restart frps'")
        
        # 获取公网 IP（优先使用用户提供的）
        if server_ip and server_ip.strip():
            public_ip = server_ip.strip()
        else:
            public_ip = get_public_ip()
        
        # 获取 FRP 最新版本号
        frp_version = get_latest_frp_version()
        
        return {
            "success": True,
            "message": "FRPS 配置已生成" + (" 并已重启" if frps_restarted else ""),
            "frps_restarted": frps_restarted,
            "restart_message": restart_message,
            "info": {
                "version": frp_version,  # 从 GitHub API 获取的真实版本号
                "port": port,
                "auth_token": auth_token,
                "public_ip": public_ip,
                "dashboard_pwd": dashboard_pwd  # Dashboard API 密码
            }
        }
    except Exception as e:
        print(f"配置生成失败: {e}")
        return {
            "success": False,
            "message": f"配置生成失败: {str(e)}",
            "info": {}
        }
