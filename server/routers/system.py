"""
系统状态相关路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import crud
import models
from core import get_db

router = APIRouter(prefix="/system", tags=["系统状态"])


@router.get("/status")
def get_system_status(db: Session = Depends(get_db)):
    """返回系统状态（FRPS 是否已部署）"""
    frps_deployed = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) is not None
    return {
        "frps_deployed": frps_deployed
    }
