"""
系统状态相关路由
"""
import os
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import models
import frp_deploy
from core import get_db, get_current_user

router = APIRouter(prefix="/system", tags=["系统状态"])

# 服务启动时间（模块加载时记录）
_start_time = time.time()


@router.get("/status")
def get_system_status(db: Session = Depends(get_db)):
    """返回系统状态（FRPS 是否已部署）— 无需认证（前端路由判断需要）"""
    frps_deployed = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) is not None
    return {
        "frps_deployed": frps_deployed
    }


@router.get("/public-ip")
async def get_public_ip(
    current_user: models.Admin = Depends(get_current_user)
):
    """自动检测服务器公网 IP（需认证，防止泄露服务器信息）"""
    details = await frp_deploy.get_public_ip_details()
    ip = details.get("ip")
    if ip:
        return {"success": True, "ip": ip}
    return {"success": False, "ip": None}


@router.get("/public-ip/open")
async def get_public_ip_open(db: Session = Depends(get_db)):
    """自动检测服务器公网 IP（无需认证，仅初始化阶段可用）"""
    is_initialized = crud.get_config(db, models.ConfigKeys.IS_INITIALIZED)
    if is_initialized:
        raise HTTPException(status_code=403, detail="系统已完成初始化，此接口不再可用")
    details = await frp_deploy.get_public_ip_details()
    ip = details.get("ip")
    if ip:
        return {"success": True, "ip": ip}
    return {"success": False, "ip": None}


@router.get("/info")
def get_system_info(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """获取系统运行信息：数据库路径、运行时间、客户端/隧道统计"""
    uptime_seconds = int(time.time() - _start_time)
    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60

    if days > 0:
        uptime_str = f"{days}天 {hours}小时 {minutes}分钟"
    elif hours > 0:
        uptime_str = f"{hours}小时 {minutes}分钟"
    else:
        uptime_str = f"{minutes}分钟"

    # 数据库文件路径
    db_path = os.path.abspath("./data/frp_manager.db")
    db_size = 0
    try:
        db_size = os.path.getsize("./data/frp_manager.db")
    except OSError:
        pass

    def format_size(size_bytes):
        if size_bytes >= 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        elif size_bytes >= 1024:
            return f"{size_bytes / 1024:.1f} KB"
        return f"{size_bytes} B"

    # 统计数据
    client_count = db.query(models.Client).count()
    online_clients = db.query(models.Client).filter(models.Client.status == "online").count()
    tunnel_count = db.query(models.Tunnel).count()

    # FRPS 版本
    frps_version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) or "-"

    # 启动时间
    start_dt = datetime.fromtimestamp(_start_time)

    return {
        "uptime_seconds": uptime_seconds,
        "uptime_display": uptime_str,
        "start_time": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "database_path": db_path,
        "database_size": format_size(db_size),
        "database_size_bytes": db_size,
        "total_clients": client_count,
        "online_clients": online_clients,
        "total_tunnels": tunnel_count,
        "frps_version": frps_version,
    }
