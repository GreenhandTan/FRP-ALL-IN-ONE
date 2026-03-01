"""
认证相关路由
包含登录、修改密码等
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Annotated

import auth
import crud
import models
import schemas
from core import get_db, get_current_user
from core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/token", response_model=schemas.Token)
@limiter.limit("5/minute")  # 登录接口限流：5次/分钟
async def login_for_access_token(
    request: Request,  # slowapi 需要 request 参数
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    """用户登录获取 JWT Token"""
    user = crud.get_admin_by_username(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "require_password_change": not user.is_password_changed
    }


@router.post("/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """修改当前用户密码（未修改密码的用户也可以访问）"""
    # 验证旧密码
    if not auth.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码不正确"
        )
    
    # 密码强度校验（8位以上，包含大小写字母和数字）
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度至少8位"
        )
    if not any(c.isupper() for c in new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含大写字母"
        )
    if not any(c.islower() for c in new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含小写字母"
        )
    if not any(c.isdigit() for c in new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含数字"
        )
    
    # 更新密码
    crud.update_admin_password(db, current_user.id, new_password)
    
    # 标记密码已修改
    if not current_user.is_password_changed:
        current_user.is_password_changed = True
        db.commit()
    
    return {"message": "密码修改成功"}
