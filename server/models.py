from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Enum
from sqlalchemy.orm import relationship
from database import Base
import enum

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

class Tunnel(Base):
    __tablename__ = "tunnels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # e.g., "ssh"
    type = Column(Enum(TunnelType))
    
    # FRP Config Fields
    local_ip = Column(String, default="127.0.0.1")
    local_port = Column(Integer)
    remote_port = Column(Integer, nullable=True) # For TCP/UDP
    custom_domains = Column(String, nullable=True) # For HTTP/HTTPS
    
    client_id = Column(String, ForeignKey("clients.id"))
    client = relationship("Client", back_populates="tunnels")
