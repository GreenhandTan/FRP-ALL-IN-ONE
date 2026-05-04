"""
认证相关路由
包含登录、修改密码、修改用户名等
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Annotated
from pydantic import BaseModel

import auth
import crud
import models
import schemas
from core import get_db, get_current_user
from core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["认证"])


# ===========================
# 请求体模型
# ===========================

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class ChangeUsernameRequest(BaseModel):
    new_username: str
    password: str


# ===========================
# 路由
# ===========================

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
    token_ver = getattr(user, "token_version", 1) or 1
    access_token = auth.create_access_token(
        data={"sub": user.username, "ver": token_ver},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "require_password_change": not user.is_password_changed
    }


@router.post("/change-password")
@limiter.limit("5/minute")  # 改密限流：5次/分钟
async def change_password(
    request: Request,  # slowapi 需要 request 参数
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """修改当前用户密码（未修改密码的用户也可以访问）"""
    # 验证旧密码
    if not auth.verify_password(req.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码不正确"
        )
    
    # 密码强度校验（8位以上，包含大小写字母和数字）
    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度至少8位"
        )
    if not any(c.isupper() for c in req.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含大写字母"
        )
    if not any(c.islower() for c in req.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含小写字母"
        )
    if not any(c.isdigit() for c in req.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含数字"
        )
    
    # 更新密码
    crud.update_admin_password(db, current_user.id, req.new_password)
    
    # 标记密码已修改 + 递增 Token 版本号（使所有旧 Token 失效）
    if not current_user.is_password_changed:
        current_user.is_password_changed = True
    current_user.token_version = (current_user.token_version or 1) + 1
    db.commit()
    
    return {"message": "密码修改成功"}


@router.post("/change-username")
@limiter.limit("5/minute")  # 改名限流：5次/分钟
async def change_username(
    request: Request,  # slowapi 需要 request 参数
    req: ChangeUsernameRequest,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """修改当前用户的用户名（需验证密码）"""
    # 验证密码
    if not auth.verify_password(req.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码不正确"
        )
    
    # 用户名格式校验
    new_username = req.new_username.strip()
    if not new_username or len(new_username) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名长度至少3位"
        )
    if len(new_username) > 32:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名长度不超过32位"
        )
    if not all(c.isalnum() or c in ('-', '_') for c in new_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名只能包含字母、数字、下划线和连字符"
        )
    
    if new_username == current_user.username:
        return {"message": "用户名未变更", "username": new_username}
    
    success, message = crud.update_admin_username(db, current_user.id, new_username)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    # 颁发新 Token（旧 Token 中的 username 已过时）
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    token_ver = getattr(current_user, "token_version", 1) or 1
    new_token = auth.create_access_token(
        data={"sub": new_username, "ver": token_ver},
        expires_delta=access_token_expires
    )
    
    return {
        "message": "用户名修改成功",
        "username": new_username,
        "access_token": new_token,
        "token_type": "bearer"
    }


@router.get("/profile")
async def get_profile(
    current_user: models.Admin = Depends(get_current_user)
):
    """获取当前用户信息"""
    return {
        "username": current_user.username,
        "is_password_changed": current_user.is_password_changed
    }
