from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class TunnelType(str, Enum):
    TCP = "tcp"
    UDP = "udp"
    HTTP = "http"
    HTTPS = "https"

class TunnelBase(BaseModel):
    name: str
    type: TunnelType
    local_ip: str = "127.0.0.1"
    local_port: int
    remote_port: Optional[int] = None
    custom_domains: Optional[str] = None

class TunnelCreate(TunnelBase):
    pass

class Tunnel(TunnelBase):
    id: int
    client_id: str

    class Config:
        orm_mode = True

class ClientBase(BaseModel):
    name: str

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    id: str
    auth_token: str
    status: str
    last_seen: int
    tunnels: List[Tunnel] = []

    class Config:
        orm_mode = True
