"""
系统状态相关路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import crud
import models
import frp_deploy
from core import get_db, get_current_user

router = APIRouter(prefix="/system", tags=["系统状态"])


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
    import asyncio
    details = await asyncio.to_thread(frp_deploy.get_public_ip_details)
    ip = details.get("ip")
    if ip:
        return {"success": True, "ip": ip}
    return {"success": False, "ip": None}


@router.get("/public-ip/open")
async def get_public_ip_open():
    """自动检测服务器公网 IP（无需认证，用于初始化流程）"""
    import asyncio
    details = await asyncio.to_thread(frp_deploy.get_public_ip_details)
    ip = details.get("ip")
    if ip:
        return {"success": True, "ip": ip}
    return {"success": False, "ip": None}
