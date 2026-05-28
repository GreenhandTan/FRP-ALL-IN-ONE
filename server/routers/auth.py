"""
认证相关路由
GitHub OAuth 登录、管理员管理
"""
import os
import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

import auth
import crud
import models
from core import get_db, get_current_user
from core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["认证"])


class InviteCreate(BaseModel):
    github_username: str


def _build_callback_url(request: Request) -> str:
    """根据请求头构建回调 URL（兼容反向代理）"""
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.hostname))
    return f"{scheme}://{host}/api/auth/github/callback"


# ===========================
# GitHub OAuth 路由
# ===========================

@router.get("/github")
@limiter.limit("10/minute")
async def github_login(request: Request):
    """重定向到 GitHub 授权页面"""
    if not auth.GITHUB_CLIENT_ID or not auth.GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth 未配置。请设置 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET 环境变量。"
        )

    callback_url = _build_callback_url(request)
    state = auth.create_access_token(
        data={"state": secrets.token_urlsafe(32)},
        expires_delta=timedelta(minutes=10)
    )

    params = (
        f"client_id={auth.GITHUB_CLIENT_ID}"
        f"&redirect_uri={callback_url}"
        f"&scope=read:user"
        f"&state={state}"
    )
    return RedirectResponse(url=f"{auth.GITHUB_AUTHORIZE_URL}?{params}")


@router.get("/github/callback")
async def github_callback(
    request: Request,
    code: str = None,
    state: str = None,
    db: Session = Depends(get_db)
):
    """处理 GitHub OAuth 回调"""
    if not code:
        raise HTTPException(status_code=400, detail="缺少授权码")

    # 验证 state（CSRF 防护）
    if state:
        try:
            auth.jwt.decode(state, auth.get_secret_key(), algorithms=[auth.ALGORITHM])
        except auth.JWTError:
            raise HTTPException(status_code=400, detail="无效的 state 参数")

    callback_url = _build_callback_url(request)

    async with httpx.AsyncClient() as client:
        # 用 code 换取 access_token
        token_resp = await client.post(
            auth.GITHUB_TOKEN_URL,
            data={
                "client_id": auth.GITHUB_CLIENT_ID,
                "client_secret": auth.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": callback_url,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="换取 access_token 失败")

        github_access_token = token_resp.json().get("access_token")
        if not github_access_token:
            raise HTTPException(status_code=400, detail="未收到 GitHub access_token")

        # 获取用户信息
        user_resp = await client.get(
            auth.GITHUB_USER_API,
            headers={
                "Authorization": f"Bearer {github_access_token}",
                "Accept": "application/json",
            },
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="获取 GitHub 用户信息失败")

        github_user = user_resp.json()

    github_id = github_user["id"]
    github_username = github_user["login"]
    avatar_url = github_user.get("avatar_url", "")

    # 查找或创建管理员
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.hostname))
    frontend_base = f"{scheme}://{host}"

    admin = crud.get_admin_by_github_id(db, github_id)

    if not admin:
        admin_count = crud.count_admins(db)
        if admin_count == 0:
            # 首个用户自动成为超级管理员
            admin = crud.create_admin_from_github(
                db, github_id, github_username, avatar_url, is_superadmin=True
            )
            crud.add_invite(db, github_username, admin.id)
        elif crud.is_github_user_invited(db, github_username):
            admin = crud.create_admin_from_github(
                db, github_id, github_username, avatar_url, is_superadmin=False
            )
        else:
            return RedirectResponse(url=f"{frontend_base}/?error=not_invited")
    else:
        # 每次登录更新 GitHub 信息（用户名可能变更）
        crud.update_admin_github_info(db, admin.id, github_username, avatar_url)

    # 生成 JWT
    access_token = auth.create_access_token(
        data={"sub": str(github_id)},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return RedirectResponse(url=f"{frontend_base}/#access_token={access_token}")


# ===========================
# 用户信息
# ===========================

@router.get("/profile")
async def get_profile(current_user: models.Admin = Depends(get_current_user)):
    """获取当前用户信息"""
    return {
        "github_username": current_user.github_username,
        "avatar_url": current_user.avatar_url,
        "is_superadmin": current_user.is_superadmin,
    }


# ===========================
# 管理员管理（仅超级管理员）
# ===========================

@router.get("/admins")
async def list_admins(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """列出所有管理员和邀请"""
    admins = crud.get_all_admins(db)
    invites = crud.get_all_invites(db)
    return {
        "admins": [
            {
                "id": a.id,
                "github_username": a.github_username,
                "avatar_url": a.avatar_url,
                "is_superadmin": a.is_superadmin,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in admins
        ],
        "invites": [
            {"github_username": i.github_username}
            for i in invites
        ],
    }


@router.post("/admins/invite")
async def invite_admin(
    req: InviteCreate,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """邀请 GitHub 用户成为管理员（仅超级管理员）"""
    if not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="仅超级管理员可以邀请用户")

    username = req.github_username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")

    existing = db.query(models.AdminInvite).filter(
        models.AdminInvite.github_username == username
    ).first()
    if existing:
        return {"message": f"{username} 已在邀请列表中", "github_username": username}

    invite = crud.add_invite(db, username, current_user.id)
    return {"message": f"已邀请 {username}", "github_username": invite.github_username}


@router.delete("/admins/invite/{github_username}")
async def remove_invite(
    github_username: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """移除邀请（仅超级管理员）"""
    if not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="仅超级管理员可以管理邀请")

    username = github_username.strip().lower()
    if username == current_user.github_username.lower():
        raise HTTPException(status_code=400, detail="不能移除自己的邀请")

    ok = crud.remove_invite(db, username)
    if not ok:
        raise HTTPException(status_code=404, detail="邀请不存在")

    # 同时移除非超级管理员的管理员记录
    admin = db.query(models.Admin).filter(
        models.Admin.github_username.ilike(username)
    ).first()
    if admin and not admin.is_superadmin:
        db.delete(admin)
        db.commit()

    return {"message": f"已移除 {username}"}


@router.delete("/admins/{admin_id}")
async def remove_admin(
    admin_id: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """移除管理员（仅超级管理员，不能移除自己）"""
    if not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="仅超级管理员可以移除管理员")

    if admin_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能移除自己")

    admin = db.query(models.Admin).filter(models.Admin.id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="管理员不存在")

    if admin.is_superadmin:
        raise HTTPException(status_code=400, detail="不能移除超级管理员")

    crud.remove_invite(db, admin.github_username)
    crud.delete_admin(db, admin_id)
    return {"message": "已移除管理员"}
