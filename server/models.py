from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Enum, Float, BigInteger, DateTime
from sqlalchemy.orm import relationship
from database import Base
import enum
from datetime import datetime

class TunnelType(str, enum.Enum):
    TCP = "tcp"
    UDP = "udp"
    HTTP = "http"
    HTTPS = "https"

class Client(Base):
    __tablename__ = "clients"

    id = Column(String, primary_key=True, index=True) # UUID
    name = Column(String, index=True)
    auth_token = Column(String) # For Agent to authenticate
    status = Column(String, default="offline") # online/offline
    last_seen = Column(Integer, default=0) # Timestamp

    tunnels = relationship("Tunnel", back_populates="client", cascade="all, delete-orphan")

class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class SystemConfig(Base):
    __tablename__ = "system_config"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)  # 配置键
    value = Column(String)  # 配置值

# 常用配置键常量
class ConfigKeys:
    IS_INITIALIZED = "is_initialized"  # 系统是否已初始化
    FRPS_VERSION = "frps_version"      # FRPS 版本
    FRPS_PORT = "frps_port"            # FRPS 端口
    FRPS_AUTH_TOKEN = "frps_auth_token"  # FRPS 认证 Token
    SERVER_PUBLIC_IP = "server_public_ip"  # 服务器公网 IP
    FRPS_DASHBOARD_PWD = "frps_dashboard_pwd"  # FRPS Dashboard API 密码
    DISABLED_PORTS = "disabled_ports"  # 禁用的端口列表，逗号分隔，如 "6001,6005"

class Tunnel(Base):
    __tablename__ = "tunnels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # e.g., "ssh"
    type = Column(Enum(TunnelType))
    enabled = Column(Boolean, default=True)
    
    # FRP Config Fields
    local_ip = Column(String, default="127.0.0.1")
    local_port = Column(Integer)
    remote_port = Column(Integer, nullable=True) # For TCP/UDP
    custom_domains = Column(String, nullable=True) # For HTTP/HTTPS
    
    client_id = Column(String, ForeignKey("clients.id"))
    client = relationship("Client", back_populates="tunnels")


# ===========================
# Agent 相关模型
# ===========================

class AgentInfo(Base):
    """Agent 信息表，存储每个客户端 Agent 的基本信息"""
    __tablename__ = "agent_info"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, unique=True, index=True)  # 客户端唯一 ID
    hostname = Column(String, nullable=True)              # 主机名
    os = Column(String, nullable=True)                    # 操作系统
    arch = Column(String, nullable=True)                  # 架构
    agent_version = Column(String, nullable=True)         # Agent 版本
    platform = Column(String, nullable=True)              # 平台详情
    last_heartbeat = Column(DateTime, default=datetime.utcnow)  # 最后心跳时间
    is_online = Column(Boolean, default=False)            # 是否在线
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemMetrics(Base):
    """系统监控指标表，存储 Agent 上报的系统信息"""
    __tablename__ = "system_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True)                # 客户端 ID
    timestamp = Column(DateTime, default=datetime.utcnow) # 采集时间
    cpu_percent = Column(Float, nullable=True)            # CPU 使用率
    memory_used = Column(BigInteger, nullable=True)       # 已用内存 (bytes)
    memory_total = Column(BigInteger, nullable=True)      # 总内存 (bytes)
    memory_percent = Column(Float, nullable=True)         # 内存使用率
    disk_used = Column(BigInteger, nullable=True)         # 已用磁盘 (bytes)
    disk_total = Column(BigInteger, nullable=True)        # 总磁盘 (bytes)
    disk_percent = Column(Float, nullable=True)           # 磁盘使用率
    net_bytes_in = Column(BigInteger, nullable=True)      # 网络接收 (bytes)
    net_bytes_out = Column(BigInteger, nullable=True)     # 网络发送 (bytes)
