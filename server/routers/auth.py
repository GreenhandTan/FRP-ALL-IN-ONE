"""
认证相关路由
GitHub OAuth 登录（单管理员模式）
"""
import os
import secrets
import time
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
from database import SessionLocal

router = APIRouter(prefix="/auth", tags=["认证"])

# 换绑 token 缓存：{token: {"admin_id": int, "expires": float}}
_rebind_tokens: dict = {}


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


@router.get("/github/rebind")
@limiter.limit("3/minute")
async def github_rebind(
    request: Request,
    token: str = None,
):
    """换绑 GitHub 账号：生成短期 token 并跳转 GitHub OAuth
    支持通过 query param ?token=xxx 传入 JWT（浏览器跳转无法设置 Authorization header）
    """
    if not token:
        raise HTTPException(status_code=401, detail="缺少认证 token")

    # 验证 JWT
    try:
        payload = auth.jwt.decode(token, auth.get_secret_key(), algorithms=[auth.ALGORITHM])
        github_id_str = payload.get("sub")
        if not github_id_str:
            raise HTTPException(status_code=401, detail="无效的 token")
    except Exception:
        raise HTTPException(status_code=401, detail="无效的 token")

    db = SessionLocal()
    try:
        current_user = crud.get_admin_by_github_id(db, github_id=int(github_id_str))
        if not current_user:
            raise HTTPException(status_code=401, detail="用户不存在")
    finally:
        db.close()

    if not auth.GITHUB_CLIENT_ID or not auth.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth 未配置")

    # 生成换绑 token（5 分钟有效）
    rebind_token = secrets.token_urlsafe(32)
    _rebind_tokens[rebind_token] = {
        "admin_id": current_user.id,
        "expires": time.time() + 300,
    }

    # 清理过期 token
    now = time.time()
    expired = [k for k, v in _rebind_tokens.items() if v["expires"] < now]
    for k in expired:
        _rebind_tokens.pop(k, None)

    callback_url = _build_callback_url(request)
    state = f"rebind:{rebind_token}"

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

    # 检查是否为换绑流程
    is_rebind = False
    rebind_admin_id = None
    if state and state.startswith("rebind:"):
        rebind_token = state.split("rebind:", 1)[1]
        rebind_data = _rebind_tokens.pop(rebind_token, None)
        if not rebind_data or rebind_data["expires"] < time.time():
            raise HTTPException(status_code=400, detail="换绑 token 已过期或无效")
        is_rebind = True
        rebind_admin_id = rebind_data["admin_id"]
    elif state:
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

    # 换绑流程：更新当前管理员的 github_id
    if is_rebind:
        admin = db.query(models.Admin).filter(models.Admin.id == rebind_admin_id).first()
        if not admin:
            return RedirectResponse(url=f"{frontend_base}/?error=admin_not_found")
        # 检查新账号是否已被其他管理员使用
        existing = crud.get_admin_by_github_id(db, github_id)
        if existing and existing.id != admin.id:
            return RedirectResponse(url=f"{frontend_base}/?error=account_in_use")
        crud.update_admin_github_id(db, admin.id, github_id, github_username, avatar_url)
        # 生成新 token 返回
        access_token = auth.create_access_token(
            data={"sub": str(github_id)},
            expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return RedirectResponse(url=f"{frontend_base}/#access_token={access_token}")

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
