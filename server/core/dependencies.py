"""
FastAPI 依赖项
包含数据库会话、用户认证、权限检查等
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import auth

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
) -> models.Admin:
    """
    获取当前登录用户
    验证 JWT Token 并返回用户对象
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, auth.get_secret_key(), algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        from schemas import TokenData
        token_data = TokenData(username=username)
    except auth.JWTError:
        raise credentials_exception
    
    # 延迟导入避免循环依赖
    import crud
    user = crud.get_admin_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user


async def require_password_changed(
    current_user: models.Admin = Depends(get_current_user)
) -> models.Admin:
    """
    检查用户是否已修改默认密码
    未修改密码时拒绝访问（修改密码接口除外）
    """
    if not current_user.is_password_changed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="请先在设置中修改默认密码",
            headers={"X-Require-Password-Change": "true"}
        )
    return current_user
