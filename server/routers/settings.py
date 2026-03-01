"""
系统设置路由
包含域名设置、HTTPS 配置等
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

import models
import crud
from core import get_db, require_password_changed
from core.rate_limit import limiter
from services.dns_checker import check_dns_resolution, get_public_ip
from services.tls_manager import tls_manager
from core.container_engine import run_podman

router = APIRouter(prefix="/settings", tags=["系统设置"])


class DomainConfig(BaseModel):
    domain: str


class TLSEnableRequest(BaseModel):
    domain: str
    mode: str = "auto"  # auto 或 custom


@router.get("/domain")
async def get_domain_config(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """获取当前域名配置"""
    domain = crud.get_config(db, models.ConfigKeys.SERVER_DOMAIN) or ""
    tls_enabled = crud.get_config(db, models.ConfigKeys.TLS_ENABLED) == "true"
    tls_mode = crud.get_config(db, models.ConfigKeys.TLS_MODE) or "auto"
    
    cert_info = None
    if domain and tls_enabled:
        cert_info = tls_manager.get_cert_info(domain)
    
    return {
        "domain": domain,
        "tls_enabled": tls_enabled,
        "tls_mode": tls_mode,
        "public_ip": get_public_ip(),
        "cert_info": cert_info
    }


@router.post("/domain")
async def set_domain(
    config: DomainConfig,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """设置域名"""
    domain = config.domain.strip().lower()
    
    # 简单验证域名格式
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="无效的域名格式")
    
    # 检查 DNS 解析
    check_result = check_dns_resolution(domain)
    
    # 保存域名配置（即使 DNS 检查失败也保存）
    crud.set_config(db, models.ConfigKeys.SERVER_DOMAIN, domain)
    
    return {
        "success": True,
        "domain": domain,
        "dns_check": check_result
    }


@router.post("/check-dns")
async def check_domain_dns(
    domain: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """检查域名 DNS 解析状态"""
    return check_dns_resolution(domain)


@router.post("/enable-tls")
@limiter.limit("3/hour")  # 证书申请限流：3次/小时（防滥用 Let's Encrypt）
async def enable_tls(
    request: Request,  # slowapi 需要 request 参数
    tls_request: TLSEnableRequest,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """
    启用 HTTPS
    mode: auto - 自动申请 Let's Encrypt 证书
    mode: custom - 使用已上传的自定义证书
    """
    domain = tls_request.domain.strip().lower()
    mode = tls_request.mode
    
    # 验证 DNS 解析
    dns_check = check_dns_resolution(domain)
    if not dns_check["success"]:
        return {
            "success": False,
            "message": f"DNS 检查失败：{dns_check['message']}"
        }
    
    cert_path = None
    key_path = None
    
    if mode == "auto":
        # 自动申请 Let's Encrypt 证书
        result = tls_manager.issue_cert(domain)
        if not result["success"]:
            return result
        cert_path = result["cert_path"]
        key_path = result["key_path"]
    else:
        # 使用自定义证书
        cert_info = tls_manager.get_cert_info(domain)
        if not cert_info:
            return {
                "success": False,
                "message": "未找到自定义证书，请先上传证书"
            }
        cert_path = cert_info["cert_path"]
        key_path = cert_path.replace(".crt", ".key")
    
    # 生成 Nginx 配置
    nginx_config = tls_manager.generate_nginx_config(domain, cert_path, key_path, enable_https=True)
    
    # 写入 Nginx 配置文件
    config_path = f"/app/certs/nginx-{domain}.conf"
    with open(config_path, "w") as f:
        f.write(nginx_config)
    
    # 尝试复制到 Nginx 容器
    try:
        # 复制配置文件到 Nginx 容器
        cp_result = run_podman(
            ["cp", config_path, "frp-manager-web:/etc/nginx/conf.d/default.conf"],
            timeout=30
        )
        
        if cp_result.returncode != 0:
            return {
                "success": False,
                "message": f"复制 Nginx 配置失败：{cp_result.stderr}"
            }
        
        # 重载 Nginx
        reload_result = tls_manager.reload_nginx()
        if not reload_result["success"]:
            return reload_result
        
    except Exception as e:
        return {
            "success": False,
            "message": f"更新 Nginx 配置失败：{str(e)}"
        }
    
    # 保存配置到数据库
    crud.set_config(db, models.ConfigKeys.SERVER_DOMAIN, domain)
    crud.set_config(db, models.ConfigKeys.TLS_ENABLED, "true")
    crud.set_config(db, models.ConfigKeys.TLS_MODE, mode)
    
    return {
        "success": True,
        "message": f"HTTPS 已启用，请访问 https://{domain}",
        "domain": domain,
        "https_url": f"https://{domain}"
    }


@router.post("/disable-tls")
async def disable_tls(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """禁用 HTTPS，切换回 HTTP 模式"""
    domain = crud.get_config(db, models.ConfigKeys.SERVER_DOMAIN) or ""
    
    # 生成 HTTP 配置的 Nginx 配置
    nginx_config = tls_manager.generate_nginx_config(domain or "_", "", "", enable_https=False)
    
    config_path = "/app/certs/nginx-http.conf"
    with open(config_path, "w") as f:
        f.write(nginx_config)
    
    # 复制到 Nginx 容器
    try:
        run_podman(
            ["cp", config_path, "frp-manager-web:/etc/nginx/conf.d/default.conf"],
            timeout=30
        )
        
        tls_manager.reload_nginx()
    except Exception:
        pass
    
    # 更新数据库
    crud.set_config(db, models.ConfigKeys.TLS_ENABLED, "false")
    
    return {
        "success": True,
        "message": "HTTPS 已禁用，恢复 HTTP 访问"
    }


@router.post("/upload-cert")
async def upload_custom_cert(
    domain: str = Form(...),
    cert_file: UploadFile = File(...),
    key_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """上传自定义证书"""
    try:
        cert_content = (await cert_file.read()).decode("utf-8")
        key_content = (await key_file.read()).decode("utf-8")
        
        result = tls_manager.save_custom_cert(domain, cert_content, key_content)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"上传证书失败：{str(e)}")


@router.get("/tls-status")
async def get_tls_status(
    db: Session = Depends(get_db)
):
    """
    获取 TLS 状态（公开访问，用于 Agent 和前端检测协议）
    """
    domain = crud.get_config(db, models.ConfigKeys.SERVER_DOMAIN) or ""
    tls_enabled = crud.get_config(db, models.ConfigKeys.TLS_ENABLED) == "true"
    
    cert_info = None
    if domain and tls_enabled:
        cert_info = tls_manager.get_cert_info(domain)
    
    return {
        "domain": domain,
        "enabled": tls_enabled,
        "ws_protocol": "wss" if tls_enabled else "ws",
        "http_protocol": "https" if tls_enabled else "http",
        "cert_info": cert_info
    }


@router.post("/renew-cert")
async def renew_certificate(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(require_password_changed)
):
    """手动续期证书"""
    domain = crud.get_config(db, models.ConfigKeys.SERVER_DOMAIN)
    tls_mode = crud.get_config(db, models.ConfigKeys.TLS_MODE)
    
    if not domain:
        raise HTTPException(status_code=400, detail="未配置域名")
    
    if tls_mode != "auto":
        raise HTTPException(status_code=400, detail="自定义证书无法自动续期，请手动上传新证书")
    
    result = tls_manager.renew_cert(domain)
    
    if result["success"]:
        # 续期成功，自动重载 Nginx
        reload_result = tls_manager.reload_nginx()
        if reload_result["success"]:
            result["nginx_reloaded"] = True
            result["message"] += "，Nginx 已重载"
        else:
            result["nginx_reloaded"] = False
            result["nginx_error"] = reload_result["message"]
    
    return result
