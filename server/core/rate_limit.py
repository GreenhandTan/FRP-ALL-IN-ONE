"""
API 限流配置
使用 slowapi 实现基于内存的限流（无需 Redis）
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# 创建限流器（使用内存存储，基于客户端 IP）
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"]  # 默认限制：100次/分钟
)


# 各接口限流配置
RATE_LIMITS = {
    # 登录接口：5次/分钟（防暴力破解）
    "/token": ["5/minute"],
    "/api/auth/token": ["5/minute"],
    
    # 证书申请接口：3次/小时（防滥用 Let's Encrypt）
    "/api/settings/enable-tls": ["3/hour"],
    
    # 通用 API 接口
    "/api/*": ["100/minute"],
}


def setup_rate_limit(app):
    """
    在 FastAPI 应用中注册限流器
    
    Args:
        app: FastAPI 应用实例
    """
    # 注册限流器状态
    app.state.limiter = limiter
    
    # 注册限流异常处理
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
