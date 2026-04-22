import bcrypt
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# 全局变量，将在 init_secret_key 中初始化
SECRET_KEY = None


def init_secret_key():
    """
    初始化 JWT Secret Key
    优先级：1. 环境变量 SECRET_KEY  2. 内存中自动生成（重启失效）
    
    安全策略：不再将密钥持久化到数据库。
    若数据库被泄露，攻击者无法伪造管理员 Token。
    """
    global SECRET_KEY
    
    # 1. 优先从环境变量读取（推荐生产环境配置）
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        SECRET_KEY = env_key
        print("[Security] JWT Secret Key 从环境变量加载")
        return
    
    # 2. 自动生成内存中的临时密钥（重启后失效，用户需重新登录）
    SECRET_KEY = secrets.token_urlsafe(64)
    print("[Security] ⚠️  未配置 SECRET_KEY 环境变量，已生成临时密钥（重启后所有登录会话将失效）")
    print("[Security] 生产环境建议在 compose.yml 中设置: SECRET_KEY=<your-random-key>")


def get_secret_key():
    """获取当前密钥，如果未初始化则先初始化"""
    if SECRET_KEY is None:
        init_secret_key()
    return SECRET_KEY


def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)
    return encoded_jwt
