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

# 默认 FRP 版本（用于 FRPC 脚本生成）
DEFAULT_FRP_VERSION = "0.61.1"

def get_public_ip() -> str:
    """获取服务器公网 IP"""
    try:
        response = requests.get('https://api.ipify.org?format=json', timeout=5)
        return response.json()['ip']
    except:
        return "未知"

def generate_frps_config(port: int = 7000, auth_token: str = None) -> Dict:
    """
    生成 FRPS 配置文件
    不再下载安装 FRPS，而是直接生成配置文件供 Docker 容器使用
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
        
        # 获取公网 IP
        public_ip = get_public_ip()
        
        return {
            "success": True,
            "message": "FRPS 配置已生成",
            "info": {
                "version": "latest",  # Docker 镜像始终为最新
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
