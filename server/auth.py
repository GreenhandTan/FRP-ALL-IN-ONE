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


def _get_db_session():
    """获取数据库会话（延迟导入避免循环依赖）"""
    from database import SessionLocal
    return SessionLocal()


def init_secret_key():
    """
    初始化 JWT Secret Key
    优先级：1. 环境变量 2. 数据库已存 3. 自动生成
    """
    global SECRET_KEY
    
    # 1. 优先从环境变量读取
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        SECRET_KEY = env_key
        print("[Security] JWT Secret Key 从环境变量加载")
        return
    
    # 2. 从数据库读取或生成
    try:
        db = _get_db_session()
        try:
            # 延迟导入避免循环依赖
            import models
            
            config = db.query(models.SystemConfig).filter(
                models.SystemConfig.key == models.ConfigKeys.JWT_SECRET_KEY
            ).first()
            
            if config and config.value:
                SECRET_KEY = config.value
                print("[Security] JWT Secret Key 从数据库加载")
            else:
                # 3. 自动生成新的密钥
                new_key = secrets.token_urlsafe(64)
                
                # 保存到数据库
                if config:
                    config.value = new_key
                else:
                    config = models.SystemConfig(
                        key=models.ConfigKeys.JWT_SECRET_KEY,
                        value=new_key
                    )
                    db.add(config)
                db.commit()
                
                SECRET_KEY = new_key
                print("[Security] 已自动生成新的 JWT Secret Key 并持久化到数据库")
        finally:
            db.close()
    except Exception as e:
        # 数据库未初始化时的临时密钥（仅用于启动阶段）
        SECRET_KEY = secrets.token_urlsafe(64)
        print(f"[Security] 数据库暂不可用，使用临时密钥（将在连接后持久化）: {e}")


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
