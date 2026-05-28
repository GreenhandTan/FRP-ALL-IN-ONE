import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# GitHub OAuth 配置
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET")
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_API = "https://api.github.com/user"

# 全局变量，将在 init_secret_key 中初始化
SECRET_KEY = None


def init_secret_key():
    """
    初始化 JWT Secret Key
    优先级：1. 环境变量 SECRET_KEY  2. 内存中自动生成（重启失效）
    """
    global SECRET_KEY

    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        SECRET_KEY = env_key
        print("[Security] JWT Secret Key 从环境变量加载")
        return

    SECRET_KEY = secrets.token_urlsafe(64)
    print("[Security] ⚠️  未配置 SECRET_KEY 环境变量，已生成临时密钥（重启后所有登录会话将失效）")
    print("[Security] 生产环境建议在 compose.yml 中设置: SECRET_KEY=<your-random-key>")


def get_secret_key():
    """获取当前密钥，如果未初始化则先初始化"""
    if SECRET_KEY is None:
        init_secret_key()
    return SECRET_KEY


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)
    return encoded_jwt
