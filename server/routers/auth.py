"""
认证相关路由
GitHub OAuth 登录（单管理员模式）
"""
import os
import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

import auth
import crud
import models
from core import get_db, get_current_user
from core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["认证"])


def _build_callback_url(request: Request) -> str:
    """根据请求头构建回调 URL（兼容反向代理）"""
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.hostname))
    return f"{scheme}://{host}/api/auth/github/callback"


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
    print(f"[OAuth] redirect_uri sent to GitHub: {callback_url}")
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

    if state:
        try:
            auth.jwt.decode(state, auth.get_secret_key(), algorithms=[auth.ALGORITHM])
        except auth.JWTError:
            raise HTTPException(status_code=400, detail="无效的 state 参数")

    callback_url = _build_callback_url(request)

    async with httpx.AsyncClient() as client:
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

    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.hostname))
    frontend_base = f"{scheme}://{host}"

    admin = crud.get_admin_by_github_id(db, github_id)

    if not admin:
        admin_count = crud.count_admins(db)
        if admin_count == 0:
            # 首个用户自动成为唯一管理员
            admin = crud.create_admin_from_github(
                db, github_id, github_username, avatar_url, is_superadmin=True
            )
        else:
            # 已有管理员，拒绝其他用户登录
            return RedirectResponse(url=f"{frontend_base}/?error=not_authorized")
    else:
        # 已有管理员登录，更新 GitHub 信息
        crud.update_admin_github_info(db, admin.id, github_username, avatar_url)

    access_token = auth.create_access_token(
        data={"sub": str(github_id)},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return RedirectResponse(url=f"{frontend_base}/#access_token={access_token}")


@router.get("/profile")
async def get_profile(current_user: models.Admin = Depends(get_current_user)):
    """获取当前用户信息"""
    return {
        "github_username": current_user.github_username,
        "avatar_url": current_user.avatar_url,
        "is_superadmin": current_user.is_superadmin,
    }
