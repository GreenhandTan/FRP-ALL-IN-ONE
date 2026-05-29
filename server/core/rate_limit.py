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
