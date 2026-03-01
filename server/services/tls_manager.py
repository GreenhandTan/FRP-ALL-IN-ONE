"""
TLS 证书管理服务
处理 Let's Encrypt 证书申请、续期、Nginx 配置管理
"""
import os
import subprocess
import shutil
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path
from core.container_engine import run_podman

# 证书存储路径
CERTS_DIR = Path("/app/certs")
AUTO_CERTS_DIR = CERTS_DIR / "auto"
CUSTOM_CERTS_DIR = CERTS_DIR / "custom"
NGINX_CONFIG_PATH = Path("/etc/nginx/conf.d")

# acme.sh 路径
ACME_SH = "/opt/acme.sh/acme.sh"


class TLSManager:
    """TLS 证书管理器"""
    
    def __init__(self):
        AUTO_CERTS_DIR.mkdir(parents=True, exist_ok=True)
        CUSTOM_CERTS_DIR.mkdir(parents=True, exist_ok=True)
    
    def get_cert_info(self, domain: str) -> Optional[dict]:
        """获取证书信息"""
        cert_path = AUTO_CERTS_DIR / f"{domain}.crt"
        if not cert_path.exists():
            cert_path = CUSTOM_CERTS_DIR / f"{domain}.crt"
        
        if not cert_path.exists():
            return None
        
        # 使用 openssl 获取证书过期时间
        try:
            result = subprocess.run(
                ["openssl", "x509", "-in", str(cert_path), "-noout", "-dates", "-subject"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                info = {"domain": domain, "cert_path": str(cert_path)}
                for line in result.stdout.split("\n"):
                    if "notAfter=" in line:
                        expiry_str = line.split("=")[1]
                        # 解析日期
                        try:
                            expiry = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z")
                            info["expires_at"] = expiry.isoformat()
                            info["days_until_expiry"] = (expiry - datetime.utcnow()).days
                        except:
                            pass
                    if "subject=" in line:
                        info["subject"] = line
                return info
        except:
            pass
        return None
    
    def issue_cert(self, domain: str) -> dict:
        """
        使用 acme.sh 申请 Let's Encrypt 证书
        
        Returns:
            {"success": bool, "message": str, "cert_path": str or None}
        """
        try:
            # 设置环境变量
            env = os.environ.copy()
            env["LE_WORKING_DIR"] = "/opt/acme.sh"
            
            # 申请证书（使用独立模式，不依赖 Nginx 配置）
            cmd = [
                ACME_SH,
                "--issue",
                "-d", domain,
                "--standalone",
                "--httpport", "8080",  # 使用 8080 端口避免与 Nginx 冲突
                "--certhome", str(AUTO_CERTS_DIR),
                "--force"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                env=env
            )
            
            if result.returncode == 0:
                # 安装证书到标准位置
                cert_path = AUTO_CERTS_DIR / f"{domain}.crt"
                key_path = AUTO_CERTS_DIR / f"{domain}.key"
                
                install_cmd = [
                    ACME_SH,
                    "--install-cert",
                    "-d", domain,
                    "--certhome", str(AUTO_CERTS_DIR),
                    "--cert-file", str(cert_path),
                    "--key-file", str(key_path),
                    "--fullchain-file", str(AUTO_CERTS_DIR / f"{domain}.fullchain.crt")
                ]
                
                subprocess.run(install_cmd, capture_output=True, env=env)
                
                return {
                    "success": True,
                    "message": f"证书申请成功：{domain}",
                    "cert_path": str(cert_path),
                    "key_path": str(key_path)
                }
            else:
                error_msg = result.stderr or result.stdout
                # 提取有用的错误信息
                if "rate limit" in error_msg.lower():
                    return {
                        "success": False,
                        "message": "Let's Encrypt 申请次数超限，请 1 小时后重试",
                        "cert_path": None
                    }
                elif "DNS" in error_msg or "not resolve" in error_msg:
                    return {
                        "success": False,
                        "message": f"DNS 解析验证失败：域名 {domain} 的 A 记录未正确指向本服务器",
                        "cert_path": None
                    }
                else:
                    return {
                        "success": False,
                        "message": f"证书申请失败：{error_msg[:200]}",
                        "cert_path": None
                    }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "证书申请超时，请检查网络连接",
                "cert_path": None
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"证书申请异常：{str(e)}",
                "cert_path": None
            }
    
    def renew_cert(self, domain: str) -> dict:
        """续期证书"""
        try:
            env = os.environ.copy()
            env["LE_WORKING_DIR"] = "/opt/acme.sh"
            
            cmd = [
                ACME_SH,
                "--renew",
                "-d", domain,
                "--certhome", str(AUTO_CERTS_DIR),
                "--force"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                env=env
            )
            
            if result.returncode == 0:
                return {
                    "success": True,
                    "message": f"证书续期成功：{domain}"
                }
            else:
                return {
                    "success": False,
                    "message": f"证书续期失败：{result.stderr[:200]}"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"证书续期异常：{str(e)}"
            }
    
    def save_custom_cert(self, domain: str, cert_content: str, key_content: str) -> dict:
        """
        保存用户上传的自定义证书
        
        Args:
            domain: 域名
            cert_content: 证书内容（PEM 格式）
            key_content: 私钥内容（PEM 格式）
        """
        try:
            # 验证证书格式
            cert_path = CUSTOM_CERTS_DIR / f"{domain}.crt"
            key_path = CUSTOM_CERTS_DIR / f"{domain}.key"
            
            # 写入文件
            cert_path.write_text(cert_content)
            key_path.write_text(key_content)
            
            # 验证证书有效性
            result = subprocess.run(
                ["openssl", "x509", "-in", str(cert_path), "-noout", "-text"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                # 删除无效文件
                cert_path.unlink(missing_ok=True)
                key_path.unlink(missing_ok=True)
                return {
                    "success": False,
                    "message": "证书格式无效，请上传有效的 PEM 格式证书"
                }
            
            # 检查证书域名是否匹配
            if domain not in result.stdout:
                return {
                    "success": False,
                    "message": f"证书域名不匹配：证书不包含 {domain}"
                }
            
            return {
                "success": True,
                "message": "自定义证书保存成功",
                "cert_path": str(cert_path),
                "key_path": str(key_path)
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"保存证书失败：{str(e)}"
            }
    
    def generate_nginx_config(self, domain: str, cert_path: str, key_path: str, enable_https: bool = True) -> str:
        """生成 Nginx 配置文件"""
        if enable_https:
            config = f'''server {{
    listen 80;
    server_name {domain};
    
    # HTTP 自动跳转 HTTPS
    location / {{
        return 301 https://$host$request_uri;
    }}
}}

server {{
    listen 443 ssl http2;
    server_name {domain};
    
    # SSL 证书配置
    ssl_certificate {cert_path};
    ssl_certificate_key {key_path};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # 前端静态文件
    location / {{
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }}
    
    # API 代理
    location /api/ {{
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
    
    # WebSocket 代理
    location /ws/ {{
        proxy_pass http://127.0.0.1:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }}
}}
'''
        else:
            config = f'''server {{
    listen 80;
    server_name _;
    
    # 前端静态文件
    location / {{
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }}
    
    # API 代理
    location /api/ {{
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
    
    # WebSocket 代理
    location /ws/ {{
        proxy_pass http://127.0.0.1:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }}
}}
'''
        return config
    
    def reload_nginx(self) -> dict:
        """重载 Nginx 配置"""
        try:
            # 先测试配置
            test_result = run_podman(
                ["exec", "frp-manager-web", "nginx", "-t"],
                timeout=30
            )
            
            if test_result.returncode != 0:
                return {
                    "success": False,
                    "message": f"Nginx 配置测试失败：{test_result.stderr}"
                }
            
            # 重载配置
            reload_result = run_podman(
                ["exec", "frp-manager-web", "nginx", "-s", "reload"],
                timeout=30
            )
            
            if reload_result.returncode == 0:
                return {
                    "success": True,
                    "message": "Nginx 配置重载成功"
                }
            else:
                return {
                    "success": False,
                    "message": f"Nginx 重载失败：{reload_result.stderr}"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"重载 Nginx 异常：{str(e)}"
            }
    
    def check_cert_needs_renew(self, domain: str, days_before: int = 30) -> bool:
        """检查证书是否需要续期"""
        info = self.get_cert_info(domain)
        if info and "days_until_expiry" in info:
            return info["days_until_expiry"] <= days_before
        return False


# 全局实例
tls_manager = TLSManager()
