import subprocess
import requests
import secrets
from typing import Dict

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

def get_public_ip() -> str:
    """获取服务器公网 IP"""
    try:
        response = requests.get('https://api.ipify.org?format=json', timeout=5)
        return response.json()['ip']
    except:
        return "未知"

def generate_frps_config(port: int = 7000, auth_token: str = None, server_ip: str = None) -> Dict:
    """
    生成 FRPS 配置文件
    不再下载安装 FRPS，而是直接生成配置文件供 Docker 容器使用
    
    Args:
        port: FRPS 监听端口
        auth_token: 认证 Token，为空则自动生成
        server_ip: 公网 IP，为空则自动检测
    """
    if not auth_token:
        auth_token = secrets.token_hex(16)
    
    try:
        # 生成配置内容
        config_content = f"""bindPort = {port}
auth.token = "{auth_token}"

# 由 FRP Manager 自动生成
# 修改后需要重启 FRPS 容器: docker-compose restart frps
"""
        
        # 写入配置文件（写到项目根目录，Docker 会自动映射）
        with open(FRPS_CONFIG_PATH, 'w') as f:
            f.write(config_content)
        
        # 尝试重启 FRPS 容器（如果在 Docker Compose 环境中）
        try:
            # 使用 docker CLI 重启容器（不依赖 docker-compose）
            result = subprocess.run(
                ["docker", "restart", "frps"],
                check=False,
                capture_output=True,
                timeout=10,
                text=True
            )
            if result.returncode == 0:
                print("✅ FRPS 容器已成功重启")
            else:
                print(f"⚠️ FRPS 容器重启失败: {result.stderr}")
        except Exception as e:
            print(f"⚠️ 无法重启 FRPS 容器: {e}")
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
            "message": "FRPS 配置已生成",
            "info": {
                "version": frp_version,  # 从 GitHub API 获取的真实版本号
                "port": port,
                "auth_token": auth_token,
                "public_ip": public_ip
            }
        }
    except Exception as e:
        print(f"配置生成失败: {e}")
        return {
            "success": False,
            "message": f"配置生成失败: {str(e)}",
            "info": {}
        }
