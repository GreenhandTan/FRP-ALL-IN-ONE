from fastapi import FastAPI, Depends, HTTPException, status, Header, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import models, schemas, crud, auth
from database import SessionLocal, engine
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta
from typing import List
import re
import time
import asyncio
from websocket_manager import manager as ws_manager

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FRP Manager API")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生产环境建议限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据库自动初始化 + 默认管理员
@app.on_event("startup")
def init_database():
    """确保所有表都已创建，并创建默认管理员"""
    models.Base.metadata.create_all(bind=engine)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            cols = [r[1] for r in conn.execute(text("PRAGMA table_info(tunnels)")).fetchall()]
            if "enabled" not in cols:
                conn.execute(text("ALTER TABLE tunnels ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT 1"))
                conn.commit()
    except Exception:
        pass
    
    # 创建默认管理员（如果不存在）
    db = SessionLocal()
    try:
        if not crud.is_system_initialized(db):
            default_admin = schemas.UserCreate(username="admin", password="123456")
            crud.create_admin(db, default_admin)
            print("[OK] 默认管理员已创建 (admin / 123456)")
        else:
            print("[OK] 管理员账号已存在")
    finally:
        db.close()
    
    print("[OK] 数据库表已初始化")

# 依赖项
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except auth.JWTError:
        raise credentials_exception
    user = crud.get_admin_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

# 系统状态接口（无需认证）
@app.get("/api/system/status")
def get_system_status(db: Session = Depends(get_db)):
    """返回系统状态（FRPS 是否已部署）"""
    frps_deployed = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) is not None
    return {
        "frps_deployed": frps_deployed
    }

# 修改密码接口
@app.post("/api/auth/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """修改当前用户密码"""
    # 验证旧密码
    if not auth.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码不正确"
        )
    
    # 更新密码
    crud.update_admin_password(db, current_user.id, new_password)
    return {"message": "密码修改成功"}

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_admin_by_username(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    raise HTTPException(status_code=403, detail="Clients must be created by agent registration")

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    return crud.get_clients(db, skip=skip, limit=limit)

@app.get("/clients/{client_id}", response_model=schemas.Client)
def read_client(client_id: str, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return db_client

@app.patch("/clients/{client_id}", response_model=schemas.Client)
def update_client(
    client_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    updated = crud.update_client_name(db, client_id=client_id, new_name=name)
    if not updated:
        raise HTTPException(status_code=404, detail="Client not found")
    return updated

@app.post("/clients/{client_id}/tunnels/", response_model=schemas.Tunnel)
def create_tunnel_for_client(
    client_id: str, tunnel: schemas.TunnelCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)
):
    return crud.create_tunnel(db=db, tunnel=tunnel, client_id=client_id)

@app.patch("/clients/{client_id}/tunnels/{tunnel_id}", response_model=schemas.Tunnel)
def update_tunnel_for_client(
    client_id: str,
    tunnel_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    tunnel = db.query(models.Tunnel).filter(models.Tunnel.id == tunnel_id, models.Tunnel.client_id == client_id).first()
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    if "enabled" in payload:
        updated = crud.set_tunnel_enabled(db, tunnel_id=tunnel_id, enabled=payload.get("enabled"))
        return updated
    raise HTTPException(status_code=400, detail="No supported fields")

@app.delete("/clients/{client_id}/tunnels/{tunnel_id}")
def delete_tunnel_for_client(
    client_id: str,
    tunnel_id: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    tunnel = db.query(models.Tunnel).filter(models.Tunnel.id == tunnel_id, models.Tunnel.client_id == client_id).first()
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    ok = crud.delete_tunnel(db, tunnel_id=tunnel_id)
    return {"success": ok}

@app.get("/clients/{client_id}/config")
def get_client_config(
    client_id: str,
    db: Session = Depends(get_db),
    x_client_token: str = Header(default=None, alias="X-Client-Token"),
):
    """
    生成供客户端Agent下载的TOML配置。
    此接口不需要认证 (Agent只持有Token，不持有JWT)，或者我们为Client也实现Bearer认证？
    目前的 Client 模型有 'auth_token'，简单起见我们这里验证 Client Token。
    或者保持开放但隐晦 (UUID路径)。
    为安全起见，简单验证一下 Client 存在即可。Agent脚本通常是自动运行的。
    """
    client = crud.get_client(db, client_id=client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if not x_client_token or x_client_token != client.auth_token:
        raise HTTPException(status_code=403, detail="Invalid client token")
    
    # 生成配置内容
    config_data = {
        "proxies": []
    }
    
    for tunnel in client.tunnels:
        if hasattr(tunnel, "enabled") and not tunnel.enabled:
            continue
        proxy_name = f"{client.name}.{tunnel.name}"
        proxy = {
            "name": proxy_name,
            "type": tunnel.type.value,
            "localIP": tunnel.local_ip,
            "localPort": tunnel.local_port,
        }
        if tunnel.remote_port:
            proxy["remotePort"] = tunnel.remote_port
        if tunnel.custom_domains:
            proxy["customDomains"] = [d.strip() for d in tunnel.custom_domains.split(",")]
        
        config_data["proxies"].append(proxy)
            
    return config_data

def _normalize_client_name(name: str):
    name = (name or "").strip()
    if not name:
        name = "device"
    name = re.sub(r"[^a-zA-Z0-9_-]+", "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    return name or "device"

@app.post("/api/agent/register")
async def agent_register(payload: dict, db: Session = Depends(get_db)):
    frps_token = (payload.get("frps_token") or "").strip()
    name = _normalize_client_name(payload.get("name") or "")
    client_id = (payload.get("client_id") or "").strip()
    client_token = (payload.get("client_token") or "").strip()

    expected_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN) or ""
    if not expected_token or frps_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid frps_token")

    if client_id:
        client = crud.get_client(db, client_id=client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        if not client_token or client_token != client.auth_token:
            raise HTTPException(status_code=403, detail="Invalid client token")
        crud.touch_client(db, client_id=client_id, status="online")
        return {
            "client_id": client.id,
            "client_token": client.auth_token,
            "name": client.name,
        }

    suffix = str(int(time.time()))[-6:]
    client = crud.create_client_with_token(db, name=f"{name}-{suffix}")
    return {
        "client_id": client.id,
        "client_token": client.auth_token,
        "name": client.name,
    }

@app.post("/api/agent/heartbeat")
async def agent_heartbeat(payload: dict, db: Session = Depends(get_db)):
    client_id = (payload.get("client_id") or "").strip()
    client_token = (payload.get("client_token") or "").strip()
    if not client_id or not client_token:
        raise HTTPException(status_code=400, detail="Missing client_id or client_token")

    client = crud.get_client(db, client_id=client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if client_token != client.auth_token:
        raise HTTPException(status_code=403, detail="Invalid client token")

    crud.touch_client(db, client_id=client_id, status="online")
    return {"success": True}

# 获取公网 IP 接口
@app.get("/api/system/public-ip")
async def get_public_ip(current_user: models.Admin = Depends(get_current_user)):
    """获取服务器公网 IP"""
    return frp_deploy.get_public_ip_details()

# ===========================
# WebSocket 端点
# ===========================

@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """
    Dashboard 实时状态推送
    每秒推送一次 FRPS 状态，替代前端轮询
    """
    await ws_manager.connect_dashboard(websocket)
    
    try:
        import requests
        while True:
            # 获取 FRPS 状态
            db = SessionLocal()
            try:
                dashboard_pwd = crud.get_config(db, models.ConfigKeys.FRPS_DASHBOARD_PWD)
                if dashboard_pwd:
                    # 尝试连接 FRPS
                    auth = ("admin", dashboard_pwd)
                    possible_urls = [
                        "http://127.0.0.1:7500/api",
                        "http://host.docker.internal:7500/api",
                        "http://172.17.0.1:7500/api",
                        "http://frps:7500/api",
                    ]
                    
                    status_data = {"success": False, "clients": [], "proxies": []}
                    for url in possible_urls:
                        try:
                            resp = requests.get(f"{url}/serverinfo", auth=auth, timeout=2)
                            if resp.status_code == 200:
                                server_info = resp.json()
                                status_data = {
                                    "success": True,
                                    "server_info": server_info,
                                    "clients": [],
                                    "proxies": []
                                }
                                break
                        except:
                            continue
                    
                    await websocket.send_json({
                        "type": "status",
                        "data": status_data
                    })
                else:
                    await websocket.send_json({
                        "type": "status",
                        "data": {"success": False, "message": "FRPS 未配置"}
                    })
            finally:
                db.close()
            
            await asyncio.sleep(1)  # 1秒推送一次
    except WebSocketDisconnect:
        ws_manager.disconnect_dashboard(websocket)
    except Exception as e:
        ws_manager.disconnect_dashboard(websocket)


@app.websocket("/ws/agent/{client_id}")
async def websocket_agent(websocket: WebSocket, client_id: str):
    """
    Agent 双向通信通道
    接收 Agent 上报的系统信息、日志等
    推送配置更新、命令等
    """
    await ws_manager.connect_agent(websocket, client_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            await _handle_agent_message(client_id, data)
    except WebSocketDisconnect:
        ws_manager.disconnect_agent(client_id)
    except Exception as e:
        ws_manager.disconnect_agent(client_id)


@app.websocket("/ws/logs/{client_id}")
async def websocket_logs(websocket: WebSocket, client_id: str):
    """
    日志实时订阅
    前端订阅某个客户端的日志流
    """
    await ws_manager.subscribe_logs(websocket, client_id)
    
    try:
        while True:
            # 保持连接，等待日志推送
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.unsubscribe_logs(websocket, client_id)
    except Exception:
        ws_manager.unsubscribe_logs(websocket, client_id)


async def _handle_agent_message(client_id: str, msg: dict):
    """
    处理 Agent 上报的消息
    """
    from datetime import datetime
    
    msg_type = msg.get("type")
    data = msg.get("data")
    
    if msg_type == "register":
        # Agent 注册/上线
        db = SessionLocal()
        try:
            agent = db.query(models.AgentInfo).filter(
                models.AgentInfo.client_id == client_id
            ).first()
            
            if agent:
                # 更新现有记录
                agent.hostname = data.get("hostname", agent.hostname)
                agent.os = data.get("os", agent.os)
                agent.arch = data.get("arch", agent.arch)
                agent.agent_version = data.get("version", agent.agent_version)
                agent.platform = data.get("platform", agent.platform)
                agent.is_online = True
                agent.last_heartbeat = datetime.utcnow()
            else:
                # 创建新记录
                agent = models.AgentInfo(
                    client_id=client_id,
                    hostname=data.get("hostname"),
                    os=data.get("os"),
                    arch=data.get("arch"),
                    agent_version=data.get("version"),
                    platform=data.get("platform"),
                    is_online=True,
                    last_heartbeat=datetime.utcnow()
                )
                db.add(agent)
            
            db.commit()
        finally:
            db.close()
    
    elif msg_type == "heartbeat":
        # Agent 心跳
        db = SessionLocal()
        try:
            agent = db.query(models.AgentInfo).filter(
                models.AgentInfo.client_id == client_id
            ).first()
            
            if agent:
                agent.last_heartbeat = datetime.utcnow()
                agent.is_online = True
                db.commit()
        finally:
            db.close()
    
    elif msg_type == "system_info":
        # 系统信息上报
        if not isinstance(data, dict):
            return
        
        db = SessionLocal()
        try:
            # 存储系统指标
            metrics = models.SystemMetrics(
                client_id=client_id,
                timestamp=datetime.utcnow(),
                cpu_percent=data.get("cpu_percent"),
                memory_used=data.get("memory_used"),
                memory_total=data.get("memory_total"),
                memory_percent=data.get("memory_percent"),
                disk_used=data.get("disk_used"),
                disk_total=data.get("disk_total"),
                disk_percent=data.get("disk_percent"),
                net_bytes_in=data.get("net_bytes_in"),
                net_bytes_out=data.get("net_bytes_out")
            )
            db.add(metrics)
            
            # 清理旧数据（保留最近 1000 条）
            count = db.query(models.SystemMetrics).filter(
                models.SystemMetrics.client_id == client_id
            ).count()
            
            if count > 1000:
                # 删除最旧的记录
                oldest = db.query(models.SystemMetrics).filter(
                    models.SystemMetrics.client_id == client_id
                ).order_by(models.SystemMetrics.timestamp.asc()).limit(count - 1000).all()
                
                for old in oldest:
                    db.delete(old)
            
            db.commit()
        finally:
            db.close()
    
    elif msg_type == "log":
        # 日志上报，广播给订阅者
        await ws_manager.broadcast_log(client_id, data)
    
    elif msg_type == "frpc_status":
        # FRPC 进程状态更新
        db = SessionLocal()
        try:
            client = db.query(models.Client).filter(
                models.Client.id == client_id
            ).first()
            
            if client:
                status = data if isinstance(data, str) else data.get("status", "unknown")
                client.status = "online" if status == "running" else "offline"
                db.commit()
        finally:
            db.close()


@app.get("/api/ws/stats")
async def get_websocket_stats(current_user: models.Admin = Depends(get_current_user)):
    """获取 WebSocket 连接统计"""
    return ws_manager.get_stats()


# ===========================
# Agent 管理 API
# ===========================

@app.get("/api/agents")
async def get_agents(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """获取所有 Agent 列表"""
    agents = db.query(models.AgentInfo).all()
    
    result = []
    for agent in agents:
        # 检查是否真正在线（WebSocket 连接状态）
        is_ws_connected = ws_manager.is_agent_online(agent.client_id)
        
        result.append({
            "client_id": agent.client_id,
            "hostname": agent.hostname,
            "os": agent.os,
            "arch": agent.arch,
            "agent_version": agent.agent_version,
            "platform": agent.platform,
            "is_online": is_ws_connected,
            "last_heartbeat": agent.last_heartbeat.isoformat() if agent.last_heartbeat else None,
            "created_at": agent.created_at.isoformat() if agent.created_at else None
        })
    
    return {"agents": result, "total": len(result)}


@app.get("/api/agents/{client_id}")
async def get_agent_detail(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """获取单个 Agent 详情"""
    agent = db.query(models.AgentInfo).filter(
        models.AgentInfo.client_id == client_id
    ).first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    is_ws_connected = ws_manager.is_agent_online(client_id)
    
    return {
        "client_id": agent.client_id,
        "hostname": agent.hostname,
        "os": agent.os,
        "arch": agent.arch,
        "agent_version": agent.agent_version,
        "platform": agent.platform,
        "is_online": is_ws_connected,
        "last_heartbeat": agent.last_heartbeat.isoformat() if agent.last_heartbeat else None,
        "created_at": agent.created_at.isoformat() if agent.created_at else None
    }


@app.get("/api/agents/{client_id}/metrics")
async def get_agent_metrics(
    client_id: str,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """获取 Agent 系统指标历史"""
    metrics = db.query(models.SystemMetrics).filter(
        models.SystemMetrics.client_id == client_id
    ).order_by(models.SystemMetrics.timestamp.desc()).limit(limit).all()
    
    # 反转顺序（从旧到新）
    metrics = list(reversed(metrics))
    
    result = []
    for m in metrics:
        result.append({
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "cpu_percent": m.cpu_percent,
            "memory_used": m.memory_used,
            "memory_total": m.memory_total,
            "memory_percent": m.memory_percent,
            "disk_used": m.disk_used,
            "disk_total": m.disk_total,
            "disk_percent": m.disk_percent,
            "net_bytes_in": m.net_bytes_in,
            "net_bytes_out": m.net_bytes_out
        })
    
    return {"metrics": result, "total": len(result)}


@app.get("/api/agents/{client_id}/metrics/latest")
async def get_agent_latest_metrics(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """获取 Agent 最新系统指标"""
    latest = db.query(models.SystemMetrics).filter(
        models.SystemMetrics.client_id == client_id
    ).order_by(models.SystemMetrics.timestamp.desc()).first()
    
    if not latest:
        return {"success": False, "message": "No metrics found"}
    
    return {
        "success": True,
        "timestamp": latest.timestamp.isoformat() if latest.timestamp else None,
        "cpu_percent": latest.cpu_percent,
        "memory_used": latest.memory_used,
        "memory_total": latest.memory_total,
        "memory_percent": latest.memory_percent,
        "disk_used": latest.disk_used,
        "disk_total": latest.disk_total,
        "disk_percent": latest.disk_percent,
        "net_bytes_in": latest.net_bytes_in,
        "net_bytes_out": latest.net_bytes_out
    }


@app.post("/api/agents/{client_id}/push-config")
async def push_config_to_agent(
    client_id: str,
    config: dict,
    current_user: models.Admin = Depends(get_current_user)
):
    """推送配置更新到 Agent"""
    config_content = config.get("config", "")
    
    if not config_content:
        raise HTTPException(status_code=400, detail="Config content is required")
    
    success = await ws_manager.push_config_to_agent(client_id, config_content)
    
    if success:
        return {"success": True, "message": "Config pushed successfully"}
    else:
        return {"success": False, "message": "Agent not connected"}

# 获取 FRPS 实时状态（从 FRPS Dashboard API）
@app.get("/api/frp/server-status")
async def get_frps_status(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    从 FRPS Dashboard API 获取实时状态
    包括已连接的客户端和代理信息
    """
    import requests
    
    # 获取 Dashboard 密码
    dashboard_pwd = crud.get_config(db, models.ConfigKeys.FRPS_DASHBOARD_PWD)
    if not dashboard_pwd:
        return {
            "success": False,
            "message": "FRPS 尚未配置，请先完成服务端部署",
            "clients": [],
            "proxies": []
        }
    
    # 尝试多种可能的连接地址，以兼容 Linux/Mac/Bridge/Host 等不同环境
    possible_urls = [
        "http://127.0.0.1:7500/api",           # Host 模式 (首选，本机互连)
        "http://host.docker.internal:7500/api", # Mac/Win (需 extra_hosts)
        "http://172.17.0.1:7500/api",           # Linux Gateway
        "http://frps:7500/api",                  # Bridge 模式 (备用)
    ]

    base_url = None
    auth = ("admin", dashboard_pwd)
    server_info = {}

    # 1. 探测可用地址并获取服务器信息
    for url in possible_urls:
        try:
            resp = requests.get(f"{url}/serverinfo", auth=auth, timeout=3)
            if resp.status_code == 200:
                base_url = url
                server_info = resp.json()
                break # 找到可用地址
        except:
            continue
    
    # 如果所有地址都失败
    if not base_url:
        return {
            "success": False,
            "message": "无法连接到 FRPS Dashboard (尝试了 host.docker.internal, 172.17.0.1, frps)",
            "clients": [],
            "proxies": []
        }

    try:
        def _get_any(d: dict, keys, default=None):
            for k in keys:
                if k in d and d.get(k) is not None:
                    return d.get(k)
            return default

        def _to_int(value, default=0):
            try:
                if value is None:
                    return default
                if isinstance(value, bool):
                    return int(value)
                if isinstance(value, (int, float)):
                    return int(value)
                s = str(value).strip()
                if not s:
                    return default
                return int(float(s))
            except Exception:
                return default

        def _to_bytes(value, default=0):
            if value is None:
                return default
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                return int(value)
            s = str(value).strip()
            if not s:
                return default
            try:
                return int(float(s))
            except Exception:
                pass
            m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([KMGTP]?B)\s*$", s, re.IGNORECASE)
            if not m:
                return default
            num = float(m.group(1))
            unit = m.group(2).upper()
            scale = {
                "B": 1,
                "KB": 1024,
                "MB": 1024 ** 2,
                "GB": 1024 ** 3,
                "TB": 1024 ** 4,
                "PB": 1024 ** 5,
            }.get(unit, 1)
            return int(num * scale)

        def _normalize_proxy(proxy: dict) -> dict:
            if not isinstance(proxy, dict):
                return {}
            name = _get_any(proxy, ["name"], "")
            ptype = _get_any(proxy, ["type"], "")
            conf = _get_any(proxy, ["conf"], {}) or {}
            cur_conns = _to_int(_get_any(proxy, ["curConns", "cur_conns"], 0), 0)
            today_in = _to_bytes(_get_any(proxy, ["todayTrafficIn", "today_traffic_in"], 0), 0)
            today_out = _to_bytes(_get_any(proxy, ["todayTrafficOut", "today_traffic_out"], 0), 0)
            return {
                "name": name,
                "type": ptype,
                "conf": conf,
                "cur_conns": cur_conns,
                "today_traffic_in": today_in,
                "today_traffic_out": today_out,
            }

        # 获取代理列表（TCP）
        tcp_proxies = []
        try:
            resp = requests.get(f"{base_url}/proxy/tcp", auth=auth, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                tcp_proxies = data.get("proxies", []) or []
        except:
            pass
        
        # 获取代理列表（UDP）
        udp_proxies = []
        try:
            resp = requests.get(f"{base_url}/proxy/udp", auth=auth, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                udp_proxies = data.get("proxies", []) or []
        except:
            pass
        
        # 获取代理列表（HTTP）
        http_proxies = []
        try:
            resp = requests.get(f"{base_url}/proxy/http", auth=auth, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                http_proxies = data.get("proxies", []) or []
        except:
            pass
        
        # 合并所有代理
        all_proxies_raw = tcp_proxies + udp_proxies + http_proxies
        all_proxies = [_normalize_proxy(p) for p in all_proxies_raw]
        
        # 提取唯一的客户端名称
        client_names = set()
        for proxy in all_proxies:
            # 代理名称格式通常是 "clientName.proxyName"
            name = proxy.get("name", "")
            if "." in name:
                client_name = name.split(".")[0]
                client_names.add(client_name)
        
        # 构建客户端列表
        clients = []
        for name in client_names:
            # 获取该客户端的所有代理
            client_proxies = [p for p in all_proxies if p.get("name", "").startswith(f"{name}.")]
            clients.append({
                "name": name,
                "status": "online",
                "proxy_count": len(client_proxies),
                "proxies": client_proxies
            })
        
        normalized_server_info = dict(server_info or {})
        normalized_server_info["curConns"] = _to_int(_get_any(normalized_server_info, ["curConns", "cur_conns"], 0), 0)
        normalized_server_info["totalTrafficIn"] = _to_bytes(_get_any(normalized_server_info, ["totalTrafficIn", "total_traffic_in"], 0), 0)
        normalized_server_info["totalTrafficOut"] = _to_bytes(_get_any(normalized_server_info, ["totalTrafficOut", "total_traffic_out"], 0), 0)

        return {
            "success": True,
            "server_info": normalized_server_info,
            "total_clients": len(clients),
            "total_proxies": len(all_proxies),
            "clients": clients,
            "proxies": all_proxies
        }
        
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "message": "无法连接到 FRPS Dashboard，请确认 FRPS 已启动",
            "clients": [],
            "proxies": []
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "clients": [],
            "proxies": []
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "clients": [],
            "proxies": []
        }

# 端口管理 API
@app.get("/api/frp/disabled-ports")
async def get_disabled_ports(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    disabled_ports_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS)
    if disabled_ports_str:
        return {"disabled_ports": [int(p) for p in disabled_ports_str.split(",") if p.strip()]}
    return {"disabled_ports": []}

@app.post("/api/frp/ports/disable")
async def disable_port(
    port: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    # 1. 获取当前禁用列表
    current_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS) or ""
    current_ports = [int(p) for p in current_str.split(",") if p.strip()]
    
    # 2. 添加新端口
    if port not in current_ports:
        current_ports.append(port)
        crud.set_config(db, models.ConfigKeys.DISABLED_PORTS, ",".join(map(str, current_ports)))
        
        # 3. 重新生成配置并重启
        # 获取现有配置
        frps_port = int(crud.get_config(db, models.ConfigKeys.FRPS_PORT) or 7000)
        auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
        server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
        
        import frp_deploy
        frp_deploy.generate_frps_config(frps_port, auth_token, server_ip, current_ports)
        
        return {"success": True, "message": f"端口 {port} 已禁用，FRPS 已重启"}
    
    return {"success": True, "message": f"端口 {port} 已经是禁用状态"}

@app.post("/api/frp/ports/enable")
async def enable_port(
    port: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    # 1. 获取当前禁用列表
    current_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS) or ""
    current_ports = [int(p) for p in current_str.split(",") if p.strip()]
    
    # 2. 移除端口
    if port in current_ports:
        current_ports.remove(port)
        crud.set_config(db, models.ConfigKeys.DISABLED_PORTS, ",".join(map(str, current_ports)))
        
        # 3. 重新生成配置并重启
        frps_port = int(crud.get_config(db, models.ConfigKeys.FRPS_PORT) or 7000)
        auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
        server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
        
        import frp_deploy
        frp_deploy.generate_frps_config(frps_port, auth_token, server_ip, current_ports)
        
        return {"success": True, "message": f"端口 {port} 已启用，FRPS 已重启"}
    
    return {"success": True, "message": f"端口 {port} 未被禁用"}
# FRPS 配置生成接口
@app.post("/api/frp/deploy-server")
async def deploy_frp_server(
    port: int = 7000,
    auth_token: str = None,
    server_ip: str = None,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    生成 FRPS 配置文件
    FRPS 本身由 docker-compose 管理，这里只生成配置
    
    Args:
        port: 监听端口
        auth_token: 认证 Token (可选，为空自动生成)
        server_ip: 公网 IP (可选，为空自动检测)
    """
    import frp_deploy
    
    # 生成配置（不再下载安装）
    result = frp_deploy.generate_frps_config(port, auth_token, server_ip)
    
    if result["success"]:
        # 保存配置到数据库
        info = result["info"]
        crud.set_config(db, models.ConfigKeys.FRPS_VERSION, info["version"])
        crud.set_config(db, models.ConfigKeys.FRPS_PORT, str(info["port"]))
        crud.set_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN, info["auth_token"])
        crud.set_config(db, models.ConfigKeys.SERVER_PUBLIC_IP, info["public_ip"])
        crud.set_config(db, models.ConfigKeys.FRPS_DASHBOARD_PWD, info["dashboard_pwd"])
    
    return result

# 手动重启 FRPS
@app.post("/api/frp/restart-frps")
async def restart_frps(
    current_user: models.Admin = Depends(get_current_user)
):
    """
    手动重启 FRPS 容器
    """
    import subprocess
    try:
        result = subprocess.run(
            ["docker", "restart", "frps"],
            check=False,
            capture_output=True,
            timeout=30,
            text=True
        )
        if result.returncode == 0:
            return {"success": True, "message": "FRPS 重启成功"}
        else:
            return {"success": False, "message": f"重启失败: {result.stderr.strip()}"}
    except FileNotFoundError:
        return {"success": False, "message": "未找到 docker 命令"}
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "重启超时"}
    except Exception as e:
        return {"success": False, "message": str(e)}

# FRPC 脚本生成接口
@app.get("/api/frp/generate-client-script")
async def generate_frpc_script(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    生成 FRPC 自动部署脚本
    """
    # 从数据库读取 FRPS 配置
    version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION)
    port = crud.get_config(db, models.ConfigKeys.FRPS_PORT)
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
    
    if not all([version, port, auth_token, server_ip]):
        raise HTTPException(
            status_code=400,
            detail="FRPS 尚未部署，请先完成服务端配置"
        )
    
    # 生成 Shell 脚本（添加架构检测）
    script = f'''#!/bin/bash
# ============================================
# FRP Client 自动部署脚本
# 服务端地址: {server_ip}:{port}
# FRP 版本: {version}
# ============================================

set -e

# 颜色定义
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

echo_info() {{ echo -e "${{GREEN}}[INFO]${{NC}} $1"; }}
echo_warn() {{ echo -e "${{YELLOW}}[WARN]${{NC}} $1"; }}
echo_error() {{ echo -e "${{RED}}[ERROR]${{NC}} $1"; }}

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo_error "请以 root 用户运行此脚本"
    exit 1
fi

# 检测系统架构
detect_arch() {{
    local arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        armv7l|armv7)
            echo "arm"
            ;;
        i386|i686)
            echo "386"
            ;;
        mips)
            echo "mips"
            ;;
        mipsle)
            echo "mipsle"
            ;;
        *)
            echo_error "不支持的架构: $arch"
            exit 1
            ;;
    esac
}}

# 检测操作系统
detect_os() {{
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    case "$os" in
        linux)
            echo "linux"
            ;;
        darwin)
            echo "darwin"
            ;;
        freebsd)
            echo "freebsd"
            ;;
        *)
            echo_error "不支持的操作系统: $os"
            exit 1
            ;;
    esac
}}

echo_info "开始部署 FRP Client..."

# 1. 检测系统
OS=$(detect_os)
ARCH=$(detect_arch)
echo_info "检测到系统: $OS, 架构: $ARCH"

# 2. 设置变量
FRP_VERSION="{version}"
INSTALL_DIR="/opt/frp"
DOWNLOAD_URL="https://github.com/fatedier/frp/releases/download/v${{FRP_VERSION}}/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}.tar.gz"

echo_info "下载地址: $DOWNLOAD_URL"

# 3. 检查必要工具
for cmd in wget tar; do
    if ! command -v $cmd &> /dev/null; then
        echo_error "缺少必要工具: $cmd"
        echo "请先安装: apt install $cmd 或 yum install $cmd"
        exit 1
    fi
done

# 4. 下载 FRP
echo_info "正在下载 FRP v${{FRP_VERSION}}..."
wget -q --show-progress -O /tmp/frp.tar.gz "$DOWNLOAD_URL" || {{
    echo_error "下载失败，请检查网络或手动下载"
    exit 1
}}

# 5. 解压
echo_info "正在解压..."
mkdir -p $INSTALL_DIR
tar -xzf /tmp/frp.tar.gz -C /tmp/
cp -r /tmp/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}/* $INSTALL_DIR/
rm -rf /tmp/frp.tar.gz /tmp/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}

# 设置执行权限
chmod +x $INSTALL_DIR/frpc

# 验证二进制文件
echo_info "验证 frpc 二进制文件..."
if ! $INSTALL_DIR/frpc --version &> /dev/null; then
    echo_error "frpc 二进制文件无法执行，可能是架构不匹配"
    echo_error "当前系统架构: $ARCH"
    file $INSTALL_DIR/frpc
    exit 1
fi
echo_info "frpc 版本: $($INSTALL_DIR/frpc --version)"

# 6. 创建配置文件
echo_info "正在创建配置文件..."
cat > $INSTALL_DIR/frpc.toml << 'FRPC_CONFIG'
serverAddr = "{server_ip}"
serverPort = {port}
auth.token = "{auth_token}"

# Admin API (用于热重载)
webServer.addr = "127.0.0.1"
webServer.port = 7400
FRPC_CONFIG

# 7. 创建 systemd service
echo_info "正在创建系统服务..."
cat > /etc/systemd/system/frpc.service << 'SYSTEMD_SERVICE'
[Unit]
Description=FRP Client Service
Documentation=https://github.com/fatedier/frp
After=network.target syslog.target
Wants=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frpc -c /opt/frp/frpc.toml
Restart=always
RestartSec=5
StartLimitInterval=0
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SYSTEMD_SERVICE

# 8. 启动服务
echo_info "正在启动服务..."
systemctl daemon-reload
systemctl enable frpc
systemctl start frpc

# 等待并检查服务状态
sleep 2
if systemctl is-active --quiet frpc; then
    echo ""
    echo_info "============================================"
    echo_info "FRP Client 部署完成！"
    echo_info "============================================"
    echo ""
    echo "  服务端地址: {server_ip}:{port}"
    echo "  安装目录:   $INSTALL_DIR"
    echo "  配置文件:   $INSTALL_DIR/frpc.toml"
    echo ""
    echo "  常用命令:"
    echo "    查看状态:   systemctl status frpc"
    echo "    查看日志:   journalctl -u frpc -f"
    echo "    重启服务:   systemctl restart frpc"
    echo "    停止服务:   systemctl stop frpc"
    echo ""
    echo_info "安装并启动配置同步 Agent..."
    if ! command -v python3 &> /dev/null; then
        if command -v apt-get &> /dev/null; then
            apt-get update -y && apt-get install -y python3 python3-venv python3-pip || true
        elif command -v yum &> /dev/null; then
            yum install -y python3 || true
        fi
    fi

    if command -v python3 &> /dev/null; then
        cat > /opt/frp/frp_agent.py << 'FRP_AGENT_PY'
import os
import time
import json
import hashlib
import subprocess
import sys

import requests

SERVER_URL = os.environ.get("FRP_MANAGER_URL", "http://localhost")
REGISTER_TOKEN = os.environ.get("FRP_MANAGER_REGISTER_TOKEN", "")
CLIENT_ID = os.environ.get("FRP_CLIENT_ID", "")
CLIENT_TOKEN = os.environ.get("FRP_CLIENT_TOKEN", "")
AGENT_STATE_PATH = os.environ.get("FRP_AGENT_STATE_PATH", "/opt/frp/agent.json")
FRPC_CONFIG_PATH = os.environ.get("FRPC_CONFIG_PATH", "/opt/frp/frpc.toml")
FRPC_BIN = os.environ.get("FRPC_BIN", "/opt/frp/frpc")

def load_state():
    try:
        if os.path.exists(AGENT_STATE_PATH):
            with open(AGENT_STATE_PATH, "r") as f:
                return json.load(f)
    except Exception:
        return dict()
    return dict()

def save_state(state):
    try:
        os.makedirs(os.path.dirname(AGENT_STATE_PATH), exist_ok=True)
        with open(AGENT_STATE_PATH, "w") as f:
            json.dump(state, f)
        return True
    except Exception:
        return False

def register_if_needed():
    global CLIENT_ID, CLIENT_TOKEN
    state = load_state()
    if not CLIENT_ID:
        CLIENT_ID = state.get("client_id", "")
    if not CLIENT_TOKEN:
        CLIENT_TOKEN = state.get("client_token", "")
    if CLIENT_ID and CLIENT_TOKEN:
        return True
    if not REGISTER_TOKEN:
        print("Missing FRP_MANAGER_REGISTER_TOKEN", file=sys.stderr)
        return False
    try:
        name = os.environ.get("FRP_CLIENT_NAME") or os.uname().nodename
    except Exception:
        name = "device"
    try:
        resp = requests.post(
            SERVER_URL + "/api/agent/register",
            json=dict(frps_token=REGISTER_TOKEN, name=name),
            timeout=10,
        )
        if resp.status_code != 200:
            print("Register failed: " + str(resp.status_code) + " - " + resp.text, file=sys.stderr)
            return False
        data = resp.json()
        CLIENT_ID = data.get("client_id", "")
        CLIENT_TOKEN = data.get("client_token", "")
        if CLIENT_ID and CLIENT_TOKEN:
            save_state(dict(client_id=CLIENT_ID, client_token=CLIENT_TOKEN, name=data.get("name")))
            return True
        return False
    except Exception as e:
        print("Register error: " + str(e), file=sys.stderr)
        return False

def heartbeat():
    try:
        requests.post(
            SERVER_URL + "/api/agent/heartbeat",
            json=dict(client_id=CLIENT_ID, client_token=CLIENT_TOKEN),
            timeout=5,
        )
    except Exception:
        pass

def get_remote_config():
    try:
        resp = requests.get(
            SERVER_URL + "/clients/" + CLIENT_ID + "/config",
            headers=dict([("X-Client-Token", CLIENT_TOKEN)]),
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
        print("Fetch config failed: " + str(resp.status_code) + " - " + resp.text, file=sys.stderr)
        return None
    except Exception as e:
        print("Fetch config error: " + str(e), file=sys.stderr)
        return None

def generate_toml(config_data):
    lines = []
    for proxy in config_data.get("proxies", []) or []:
        lines.append("[[proxies]]")
        lines.append('name = "' + str(proxy.get("name", "")) + '"')
        lines.append('type = "' + str(proxy.get("type", "")) + '"')
        lines.append('localIP = "' + str(proxy.get("localIP", "")) + '"')
        lines.append('localPort = ' + str(proxy.get("localPort", 0)))
        if proxy.get("remotePort"):
            lines.append('remotePort = ' + str(proxy.get("remotePort")))
        if proxy.get("customDomains"):
            domains = '", "'.join(proxy.get("customDomains") or [])
            lines.append('customDomains = ["' + domains + '"]')
        lines.append("")
    return chr(10).join(lines)

def update_config_file(new_toml_content):
    common_part = ""
    if os.path.exists(FRPC_CONFIG_PATH):
        with open(FRPC_CONFIG_PATH, "r") as f:
            content = f.read()
            common_part = content.split("[[proxies]]")[0]
    else:
        common_part = 'serverAddr = "127.0.0.1"' + chr(10) + 'serverPort = 7000' + chr(10) + chr(10)
    full_content = common_part.strip() + chr(10) + chr(10) + new_toml_content
    with open(FRPC_CONFIG_PATH, "w") as f:
        f.write(full_content)
    return hashlib.md5(full_content.encode()).hexdigest()

def reload_frpc():
    try:
        subprocess.run([FRPC_BIN, "reload", "-c", FRPC_CONFIG_PATH], check=False)
    except Exception:
        pass

def main():
    if not register_if_needed():
        sys.exit(1)
    last_hash = ""
    while True:
        heartbeat()
        data = get_remote_config()
        if data is not None:
            toml = generate_toml(data)
            current_hash = hashlib.md5(toml.encode()).hexdigest()
            if current_hash != last_hash:
                last_hash = current_hash
                update_config_file(toml)
                reload_frpc()
        time.sleep(10)

if __name__ == "__main__":
    main()
FRP_AGENT_PY

        cat > /etc/systemd/system/frp-agent.service << 'FRP_AGENT_SERVICE'
[Unit]
Description=FRP Config Sync Agent
After=network.target
Wants=network.target

[Service]
Type=simple
Environment=FRP_MANAGER_URL=http://{server_ip}
Environment=FRP_MANAGER_REGISTER_TOKEN={auth_token}
Environment=FRP_AGENT_STATE_PATH=/opt/frp/agent.json
Environment=FRPC_CONFIG_PATH=/opt/frp/frpc.toml
Environment=FRPC_BIN=/opt/frp/frpc
ExecStart=/usr/bin/python3 /opt/frp/frp_agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
FRP_AGENT_SERVICE

        systemctl daemon-reload
        systemctl enable frp-agent
        systemctl restart frp-agent
    fi

    echo_warn "============================================"
    echo_warn "重要提示：安全组/防火墙配置"
    echo_warn "============================================"
    echo ""
    echo "  后续在 frpc.toml 中配置的每个代理端口,"
    echo "  都需要在云服务器安全组中开放对应端口！"
    echo ""
    echo "  建议：尽量使用私有端口范围 49152-65535（TCP/UDP），可减少端口冲突风险。"
    echo "        同时建议在安全组放行：80/TCP、{port}/TCP，以及 49152-65535 的 TCP/UDP。"
    echo ""
    echo "  例如: 配置 remote_port = 6022 代理 SSH,"
    echo "        需在安全组开放 6022/TCP 入站规则"
    echo ""
else
    echo_error "服务启动失败"
    echo "请查看日志: journalctl -u frpc -n 50"
    systemctl status frpc --no-pager
    exit 1
fi
'''
    
    return {"script": script}


# ===========================
# Agent 分发 API（服务器自托管）
# ===========================

from fastapi.responses import FileResponse, PlainTextResponse
import os

# Agent 二进制存放目录
AGENT_BINARIES_DIR = "/opt/agent-binaries"

@app.get("/api/agent/download/{platform}")
async def download_agent_binary(
    platform: str,
    current_user: models.Admin = Depends(get_current_user)
):
    """
    下载 Agent 二进制文件
    platform: linux-amd64, linux-arm64, darwin-amd64, darwin-arm64, windows-amd64
    """
    valid_platforms = [
        "linux-amd64", "linux-arm64", 
        "darwin-amd64", "darwin-arm64", 
        "windows-amd64"
    ]
    
    if platform not in valid_platforms:
        raise HTTPException(status_code=400, detail=f"Invalid platform. Valid: {valid_platforms}")
    
    # 确定文件名
    if platform.startswith("windows"):
        filename = f"frp-agent-{platform}.exe"
    else:
        filename = f"frp-agent-{platform}"
    
    filepath = os.path.join(AGENT_BINARIES_DIR, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Agent binary not found: {filename}")
    
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/octet-stream"
    )


@app.get("/api/agent/platforms")
async def get_available_agent_platforms():
    """获取可用的 Agent 平台列表"""
    platforms = []
    
    platform_info = {
        "linux-amd64": {"name": "Linux x64", "os": "linux", "arch": "amd64", "ext": ""},
        "linux-arm64": {"name": "Linux ARM64", "os": "linux", "arch": "arm64", "ext": ""},
        "darwin-amd64": {"name": "macOS Intel", "os": "darwin", "arch": "amd64", "ext": ""},
        "darwin-arm64": {"name": "macOS Apple Silicon", "os": "darwin", "arch": "arm64", "ext": ""},
        "windows-amd64": {"name": "Windows x64", "os": "windows", "arch": "amd64", "ext": ".exe"},
    }
    
    for platform_id, info in platform_info.items():
        filename = f"frp-agent-{platform_id}{info['ext']}"
        filepath = os.path.join(AGENT_BINARIES_DIR, filename)
        available = os.path.exists(filepath)
        
        platforms.append({
            "id": platform_id,
            "name": info["name"],
            "os": info["os"],
            "arch": info["arch"],
            "available": available,
            "filename": filename
        })
    
    return {"platforms": platforms}


@app.get("/api/agent/install-script/{platform}")
async def get_agent_install_script(
    platform: str,
    client_id: str = None,
    db: Session = Depends(get_db)
):
    """
    获取动态生成的 Agent 安装脚本（包含服务器信息）
    platform: linux, darwin, windows
    """
    # 获取服务器配置
    auth_token = crud.get_system_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN) or "frp-token"
    server_ip = crud.get_system_config(db, models.ConfigKeys.SERVER_PUBLIC_IP) or "YOUR_SERVER_IP"
    frps_port = crud.get_system_config(db, models.ConfigKeys.FRPS_PORT) or "7000"
    frps_version = crud.get_system_config(db, models.ConfigKeys.FRPS_VERSION) or "0.61.1"
    
    # 生成客户端 ID（如果未提供）
    if not client_id:
        import random
        import string
        client_id = "client-" + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    
    # 服务器下载地址（自托管）
    download_base = f"http://{server_ip}:8080/api/agent/download"
    
    if platform == "windows":
        # Windows PowerShell 脚本
        script = f'''# ============================================================
# FRP Manager Agent + FRPC 一键安装脚本 (Windows)
# ============================================================
# 使用方法: 以管理员身份运行 PowerShell，然后执行此脚本
# ============================================================

$ErrorActionPreference = "Stop"

# 配置信息（由服务器自动生成）
$SERVER_IP = "{server_ip}"
$FRPS_PORT = "{frps_port}"
$AUTH_TOKEN = "{auth_token}"
$CLIENT_ID = "{client_id}"
$FRP_VERSION = "{frps_version}"
$INSTALL_DIR = "C:\\frp"
$DOWNLOAD_BASE = "{download_base}"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  FRP Manager Agent 一键安装 (Windows)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# 创建安装目录
Write-Host "[1/5] 创建安装目录..." -ForegroundColor Blue
if (!(Test-Path $INSTALL_DIR)) {{
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}}
if (!(Test-Path "$INSTALL_DIR\\logs")) {{
    New-Item -ItemType Directory -Path "$INSTALL_DIR\\logs" -Force | Out-Null
}}
Write-Host "[OK] 目录创建完成: $INSTALL_DIR" -ForegroundColor Green

# 下载 FRPC
Write-Host "[2/5] 下载 FRPC..." -ForegroundColor Blue
$frpUrl = "https://github.com/fatedier/frp/releases/download/v$FRP_VERSION/frp_${{FRP_VERSION}}_windows_amd64.zip"
Write-Host "  下载地址: $frpUrl"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $frpUrl -OutFile "$INSTALL_DIR\\frp.zip" -UseBasicParsing
Expand-Archive -Path "$INSTALL_DIR\\frp.zip" -DestinationPath $INSTALL_DIR -Force
Copy-Item "$INSTALL_DIR\\frp_${{FRP_VERSION}}_windows_amd64\\frpc.exe" "$INSTALL_DIR\\frpc.exe" -Force
Remove-Item "$INSTALL_DIR\\frp.zip" -Force
Remove-Item "$INSTALL_DIR\\frp_${{FRP_VERSION}}_windows_amd64" -Recurse -Force
Write-Host "[OK] FRPC 下载完成" -ForegroundColor Green

# 下载 Agent
Write-Host "[3/5] 下载 Agent..." -ForegroundColor Blue
try {{
    Invoke-WebRequest -Uri "$DOWNLOAD_BASE/windows-amd64" -OutFile "$INSTALL_DIR\\frp-agent.exe" -UseBasicParsing
    Write-Host "[OK] Agent 下载完成" -ForegroundColor Green
}} catch {{
    Write-Host "[WARN] Agent 暂不可用，跳过" -ForegroundColor Yellow
}}

# 创建配置文件
Write-Host "[4/5] 创建配置文件..." -ForegroundColor Blue
$config = @"
serverAddr = "$SERVER_IP"
serverPort = $FRPS_PORT
auth.token = "$AUTH_TOKEN"

# 管理 API
webServer.addr = "127.0.0.1"
webServer.port = 7400
"@
$config | Out-File -FilePath "$INSTALL_DIR\\frpc.toml" -Encoding UTF8
Write-Host "[OK] 配置文件已创建" -ForegroundColor Green

# 创建启动脚本
Write-Host "[5/5] 创建启动脚本..." -ForegroundColor Blue
$startScript = @"
@echo off
cd /d "$INSTALL_DIR"
start /min "" "$INSTALL_DIR\\frpc.exe" -c "$INSTALL_DIR\\frpc.toml"
"@
$startScript | Out-File -FilePath "$INSTALL_DIR\\start-frpc.bat" -Encoding ASCII

# 添加到开机启动
$startupFolder = [Environment]::GetFolderPath('Startup')
Copy-Item "$INSTALL_DIR\\start-frpc.bat" "$startupFolder\\start-frpc.bat" -Force
Write-Host "[OK] 已添加到开机启动" -ForegroundColor Green

# 启动 FRPC
Write-Host ""
Write-Host "正在启动 FRPC..." -ForegroundColor Blue
Start-Process -FilePath "$INSTALL_DIR\\frpc.exe" -ArgumentList "-c", "$INSTALL_DIR\\frpc.toml" -WindowStyle Minimized

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "安装目录: $INSTALL_DIR"
Write-Host "客户端 ID: $CLIENT_ID"
Write-Host "服务器: $SERVER_IP`:$FRPS_PORT"
Write-Host ""
Write-Host "现在可以返回 Web 管理面板继续操作！" -ForegroundColor Cyan
Write-Host ""
'''
        return PlainTextResponse(content=script, media_type="text/plain")
    
    else:
        # Linux/macOS Bash 脚本
        os_type = "darwin" if platform == "darwin" else "linux"
        script = f'''#!/bin/bash
# ============================================================
# FRP Manager Agent + FRPC 一键安装脚本 (Linux/macOS)
# ============================================================
# 使用方法: chmod +x install.sh && sudo ./install.sh
# ============================================================

set -e

# 配置信息（由服务器自动生成）
SERVER_IP="{server_ip}"
FRPS_PORT="{frps_port}"
AUTH_TOKEN="{auth_token}"
CLIENT_ID="{client_id}"
FRP_VERSION="{frps_version}"
INSTALL_DIR="/opt/frp"
DOWNLOAD_BASE="{download_base}"

# 颜色输出
RED='\\033[0;31m'
GREEN='\\033[0;32m'
BLUE='\\033[0;34m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

log_info() {{ echo -e "${{BLUE}}[INFO]${{NC}} $1"; }}
log_ok() {{ echo -e "${{GREEN}}[OK]${{NC}} $1"; }}
log_warn() {{ echo -e "${{YELLOW}}[WARN]${{NC}} $1"; }}
log_error() {{ echo -e "${{RED}}[ERROR]${{NC}} $1"; }}

# 检测系统类型
detect_os() {{
    case "$(uname -s)" in
        Linux*) echo "linux" ;;
        Darwin*) echo "darwin" ;;
        *) echo "unknown" ;;
    esac
}}

detect_arch() {{
    case "$(uname -m)" in
        x86_64|amd64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "amd64" ;;
    esac
}}

OS=$(detect_os)
ARCH=$(detect_arch)

echo ""
echo -e "${{BLUE}}===============================================${{NC}}"
echo -e "${{BLUE}}  FRP Manager Agent 一键安装 ($OS-$ARCH)${{NC}}"
echo -e "${{BLUE}}===============================================${{NC}}"
echo ""

# 检查权限
if [ "$EUID" -ne 0 ] && [ "$OS" = "linux" ]; then
    log_warn "建议使用 sudo 运行"
fi

# 1. 创建安装目录
log_info "[1/5] 创建安装目录..."
mkdir -p $INSTALL_DIR
mkdir -p $INSTALL_DIR/logs
log_ok "目录创建完成: $INSTALL_DIR"

# 2. 下载 FRPC
log_info "[2/5] 下载 FRPC v$FRP_VERSION..."
FRP_URL="https://github.com/fatedier/frp/releases/download/v${{FRP_VERSION}}/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}.tar.gz"
log_info "下载地址: $FRP_URL"

if command -v curl &> /dev/null; then
    curl -fsSL "$FRP_URL" -o /tmp/frp.tar.gz
elif command -v wget &> /dev/null; then
    wget -q "$FRP_URL" -O /tmp/frp.tar.gz
else
    log_error "需要 curl 或 wget"
    exit 1
fi

tar -xzf /tmp/frp.tar.gz -C /tmp/
cp /tmp/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}/frpc $INSTALL_DIR/
chmod +x $INSTALL_DIR/frpc
rm -rf /tmp/frp.tar.gz /tmp/frp_*
log_ok "FRPC 下载完成"

# 3. 下载 Agent (可选)
log_info "[3/5] 下载 Agent..."
AGENT_URL="${{DOWNLOAD_BASE}}/${{OS}}-${{ARCH}}"
if curl -fsSL "$AGENT_URL" -o $INSTALL_DIR/frp-agent 2>/dev/null; then
    chmod +x $INSTALL_DIR/frp-agent
    log_ok "Agent 下载完成"
else
    log_warn "Agent 暂不可用，跳过"
fi

# 4. 创建配置文件
log_info "[4/5] 创建配置文件..."
cat > $INSTALL_DIR/frpc.toml << 'FRPC_CONFIG'
serverAddr = "{server_ip}"
serverPort = {frps_port}
auth.token = "{auth_token}"

# 管理 API (用于热重载)
webServer.addr = "127.0.0.1"
webServer.port = 7400
FRPC_CONFIG
log_ok "配置文件已创建"

# 5. 创建系统服务
log_info "[5/5] 创建系统服务..."
if [ "$OS" = "linux" ]; then
    cat > /etc/systemd/system/frpc.service << 'SYSTEMD_SERVICE'
[Unit]
Description=FRP Client Service
After=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frpc -c /opt/frp/frpc.toml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD_SERVICE

    systemctl daemon-reload
    systemctl enable frpc
    systemctl start frpc
    log_ok "systemd 服务已创建并启动"
else
    # macOS: 创建 launchd plist
    PLIST_PATH="$HOME/Library/LaunchAgents/com.frp.client.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frp.client</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/frpc</string>
        <string>-c</string>
        <string>$INSTALL_DIR/frpc.toml</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
PLIST
    launchctl load "$PLIST_PATH"
    log_ok "launchd 服务已创建并启动"
fi

echo ""
echo -e "${{GREEN}}===============================================${{NC}}"
echo -e "${{GREEN}}  安装完成！${{NC}}"
echo -e "${{GREEN}}===============================================${{NC}}"
echo ""
echo "安装目录: $INSTALL_DIR"
echo "客户端 ID: $CLIENT_ID"
echo "服务器: $SERVER_IP:$FRPS_PORT"
echo ""
log_info "现在可以返回 Web 管理面板继续操作！"
echo ""

if [ "$OS" = "linux" ]; then
    echo "常用命令:"
    echo "  查看状态: sudo systemctl status frpc"
    echo "  查看日志: sudo journalctl -u frpc -f"
fi
echo ""
'''
        return PlainTextResponse(content=script, media_type="text/plain")


@app.get("/api/agent/install-script-info")
async def get_install_script_info(db: Session = Depends(get_db)):
    """获取安装脚本信息（用于前端显示）"""
    auth_token = crud.get_system_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN) or "frp-token"
    server_ip = crud.get_system_config(db, models.ConfigKeys.SERVER_PUBLIC_IP) or "YOUR_SERVER_IP"
    frps_port = crud.get_system_config(db, models.ConfigKeys.FRPS_PORT) or "7000"
    frps_version = crud.get_system_config(db, models.ConfigKeys.FRPS_VERSION) or "0.61.1"
    
    return {
        "server_ip": server_ip,
        "frps_port": frps_port,
        "frps_version": frps_version,
        "scripts": {
            "linux": f"http://{server_ip}:8080/api/agent/install-script/linux",
            "darwin": f"http://{server_ip}:8080/api/agent/install-script/darwin",
            "windows": f"http://{server_ip}:8080/api/agent/install-script/windows"
        }
    }
