from fastapi import FastAPI, Depends, HTTPException, status, Header, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import PlainTextResponse
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
import frp_deploy
from pathlib import Path

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

# 数据库初始化
@app.on_event("startup")
def init_database():
    """初始化数据库表和默认管理员"""
    # 创建所有表
    models.Base.metadata.create_all(bind=engine)
    
    # 创建默认管理员（如果不存在）
    db = SessionLocal()
    try:
        if not crud.get_admin_by_username(db, "admin"):
            default_admin = schemas.UserCreate(username="admin", password="123456")
            crud.create_admin(db, default_admin)
            print("[OK] 默认管理员已创建 (admin / 123456)")
        else:
            print("[OK] 管理员账号已存在")
    finally:
        db.close()
    
    print("[OK] 数据库初始化完成")

    # 启动后台 Ping 任务
    asyncio.create_task(background_ping_task())

async def background_ping_task():
    """定期发送 Ping 保持 WebSocket 连接活跃"""
    while True:
        await asyncio.sleep(30) # 每 30 秒 Ping 一次
        try:
            await ws_manager.broadcast_ping()
        except Exception as e:
            print(f"[Error] Ping 广播失败: {e}")

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
async def create_tunnel_for_client(
    client_id: str, tunnel: schemas.TunnelCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)
):
    created = crud.create_tunnel(db=db, tunnel=tunnel, client_id=client_id)
    await _push_config_for_client(client_id)
    return created

@app.patch("/clients/{client_id}/tunnels/{tunnel_id}", response_model=schemas.Tunnel)
async def update_tunnel_for_client(
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
        await _push_config_for_client(client_id)
        return updated
    raise HTTPException(status_code=400, detail="No supported fields")

@app.delete("/clients/{client_id}/tunnels/{tunnel_id}")
async def delete_tunnel_for_client(
    client_id: str,
    tunnel_id: int,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    tunnel = db.query(models.Tunnel).filter(models.Tunnel.id == tunnel_id, models.Tunnel.client_id == client_id).first()
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    ok = crud.delete_tunnel(db, tunnel_id=tunnel_id)
    await _push_config_for_client(client_id)
    return {"success": ok}

# 获取公网 IP 接口
@app.get("/api/system/public-ip")
async def get_public_ip(current_user: models.Admin = Depends(get_current_user)):
    """获取服务器公网 IP"""
    return frp_deploy.get_public_ip_details()

# ===========================
# WebSocket 端点
# ===========================

def _get_admin_from_token(db: Session, token: str):
    if not token:
        return None
    try:
        # 使用 auth 模块中的 jwt（从 jose 导入）
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
        return crud.get_admin_by_username(db, username=username)
    except Exception:
        return None

@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """
    Dashboard 实时状态推送
    每秒推送一次 FRPS 状态，替代前端轮询
    """
    db = SessionLocal()
    try:
        token = websocket.query_params.get("token")
        admin = _get_admin_from_token(db, token)
        if not admin:
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    await websocket.accept()
    await ws_manager.connect_dashboard(websocket)
    
    try:
        while True:
            db = SessionLocal()
            try:
                status = await get_frps_status(db=db, current_user=None)
                disabled = await get_disabled_ports(db=db, current_user=None)
                agents = await get_agents(db=db, current_user=None)

                clients = crud.get_clients(db)
                
                # 获取 WebSocket 实时在线状态和内存缓存（CPU/Mem等）
                ws_agents_info = {
                    info["client_id"]: info 
                    for info in ws_manager.get_all_agents_info()
                }

                registered_clients = []
                for c in clients:
                    # 1. 基础信息
                    client_data = {
                        "id": c.id,
                        "name": c.name,
                        "auth_token": c.auth_token,
                        "status": c.status,
                        "last_seen": c.last_seen,  # Integer 时间戳
                    }

                    # 2. 注入 Agent 硬件信息 (优先从 DB 获取持久化数据)
                    agent_info_db = db.query(models.AgentInfo).filter(
                        models.AgentInfo.client_id == c.id
                    ).first()
                    
                    if agent_info_db:
                        client_data.update({
                            "hostname": agent_info_db.hostname,
                            "os": agent_info_db.os,
                            "arch": agent_info_db.arch,
                            "platform": agent_info_db.platform,
                            "agent_version": agent_info_db.agent_version,
                        })
                    
                    # 3. 注入实时状态和系统指标 (从 Memory Cache)
                    if c.id in ws_agents_info:
                        ws_info = ws_agents_info[c.id]
                        client_data.update({
                            # 使用 WS 连接状态覆盖数据库状态，更实时
                            "is_online": True, 
                            "cpu_percent": ws_info.get("cpu_percent"),
                            "memory_percent": ws_info.get("memory_percent"),
                            "memory_used": ws_info.get("memory_used"),
                            "memory_total": ws_info.get("memory_total"),
                            "disk_percent": ws_info.get("disk_percent"),
                            "disk_used": ws_info.get("disk_used"),
                            "disk_total": ws_info.get("disk_total"),
                        })
                    else:
                        client_data["is_online"] = False

                    # 4. 隧道信息
                    client_data["tunnels"] = [
                        {
                            "id": t.id,
                            "client_id": t.client_id,
                            "name": t.name,
                            "type": t.type.value if hasattr(t.type, "value") else str(t.type),
                            "enabled": getattr(t, "enabled", True),
                            "local_ip": t.local_ip,
                            "local_port": t.local_port,
                            "remote_port": t.remote_port,
                            "custom_domains": t.custom_domains,
                        }
                        for t in (c.tunnels or [])
                    ]
                    
                    registered_clients.append(client_data)

                await websocket.send_json({
                    "type": "dashboard",
                    "data": {
                        "status": status,
                        "disabled_ports": disabled.get("disabled_ports", []),
                        "agents": agents.get("agents", []),
                        "registered_clients": registered_clients,
                    }
                })
            finally:
                db.close()

            await asyncio.sleep(1)
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
    header_client_id = (websocket.headers.get("x-client-id") or "").strip()
    header_token = (websocket.headers.get("x-client-token") or "").strip()
    if header_client_id and header_client_id != client_id:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        client = crud.get_client(db, client_id=client_id)
        if not client or not header_token or header_token != client.auth_token:
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    await websocket.accept()
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
    db = SessionLocal()
    try:
        token = websocket.query_params.get("token")
        admin = _get_admin_from_token(db, token)
        if not admin:
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    await websocket.accept()
    await ws_manager.subscribe_logs(websocket, client_id)
    
    try:
        while True:
            # 保持连接，等待日志推送
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.unsubscribe_logs(websocket, client_id)
    except Exception:
        ws_manager.unsubscribe_logs(websocket, client_id)


def _render_frpc_toml(db: Session, client: models.Client) -> str | None:
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
    frps_port = crud.get_config(db, models.ConfigKeys.FRPS_PORT)
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
    if not server_ip or not frps_port or not auth_token:
        return None

    lines = [
        f'serverAddr = "{server_ip}"',
        f"serverPort = {int(frps_port)}",
        f'auth.token = "{auth_token}"',
        "",
        '# Admin API',
        'webServer.addr = "127.0.0.1"',
        "webServer.port = 7400",
        "",
    ]

    for t in (client.tunnels or []):
        if hasattr(t, "enabled") and not t.enabled:
            continue

        proxy_type = t.type.value if hasattr(t.type, "value") else str(t.type)
        proxy_name = f"{client.name}.{t.name}"
        lines.append("[[proxies]]")
        lines.append(f'name = "{proxy_name}"')
        lines.append(f'type = "{proxy_type}"')
        lines.append(f'localIP = "{t.local_ip}"')
        lines.append(f"localPort = {int(t.local_port)}")

        if t.remote_port:
            lines.append(f"remotePort = {int(t.remote_port)}")
        if t.custom_domains:
            domains = [d.strip() for d in (t.custom_domains or "").split(",") if d.strip()]
            if domains:
                items = '", "'.join(domains)
                lines.append(f'customDomains = ["{items}"]')
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


async def _push_config_for_client(client_id: str):
    db = SessionLocal()
    try:
        client = crud.get_client(db, client_id=client_id)
        if not client:
            return False
        toml = _render_frpc_toml(db, client)
        if not toml:
            return False
        return await ws_manager.push_config_to_agent(client_id, toml)
    finally:
        db.close()


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
            crud.touch_client(db, client_id=client_id, status="online")
            
            # 获取 hostname 并自动更新客户端名称
            hostname = data.get("hostname") if isinstance(data, dict) else None
            if hostname:
                client = crud.get_client(db, client_id=client_id)
                # 如果客户端名称是默认生成的（device-XXXXX 格式），则使用 hostname 更新
                if client and client.name and client.name.startswith("device-"):
                    crud.update_client_name(db, client_id=client_id, new_name=hostname)
            
            agent = db.query(models.AgentInfo).filter(
                models.AgentInfo.client_id == client_id
            ).first()
            
            if agent:
                # 更新现有记录
                agent.hostname = data.get("hostname", agent.hostname) if isinstance(data, dict) else agent.hostname
                agent.os = data.get("os", agent.os) if isinstance(data, dict) else agent.os
                agent.arch = data.get("arch", agent.arch) if isinstance(data, dict) else agent.arch
                agent.agent_version = data.get("version", agent.agent_version) if isinstance(data, dict) else agent.agent_version
                agent.platform = data.get("platform", agent.platform) if isinstance(data, dict) else agent.platform
                # is_online 和 last_heartbeat 已移除
            else:
                # 创建新记录
                agent = models.AgentInfo(
                    client_id=client_id,
                    hostname=data.get("hostname") if isinstance(data, dict) else None,
                    os=data.get("os") if isinstance(data, dict) else None,
                    arch=data.get("arch") if isinstance(data, dict) else None,
                    agent_version=data.get("version") if isinstance(data, dict) else None,
                    platform=data.get("platform") if isinstance(data, dict) else None,
                    # is_online=True, # 已移除
                    # last_heartbeat=datetime.utcnow() # 已移除
                )
                )
                db.add(agent)
            
            db.commit()
            client = crud.get_client(db, client_id=client_id)
            toml = _render_frpc_toml(db, client) if client else None
        finally:
            db.close()
        if toml:
            await ws_manager.push_config_to_agent(client_id, toml)
    

    
    elif msg_type == "system_info":
        # 系统信息上报 (同时视作心跳)
        if not isinstance(data, dict):
            return
        
        # 更新内存缓存（用于实时显示）
        ws_manager.update_agent_system_info(client_id, data)
        
        db = SessionLocal()
        try:
            # 更新在线状态和心跳时间
            crud.touch_client(db, client_id=client_id, status="online")
            agent = db.query(models.AgentInfo).filter(
                models.AgentInfo.client_id == client_id
            ).first()
            
            if agent:
                # agent.last_heartbeat = datetime.utcnow() # 已移除
                # agent.is_online = True # 已移除
                # 更新其他 Agent 信息
                if "hostname" in data: agent.hostname = data["hostname"]
                if "os" in data: agent.os = data["os"]
                if "arch" in data: agent.arch = data["arch"]
            
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
        
        # 获取实时系统信息
        system_info = ws_manager.agent_system_info.get(agent.client_id, {})
        
        result.append({
            "client_id": agent.client_id,
            "hostname": agent.hostname,
            "os": agent.os,
            "arch": agent.arch,
            "agent_version": agent.agent_version,
            "platform": agent.platform,
            "is_online": is_ws_connected,
            # "last_heartbeat": agent.last_heartbeat, # 已移除
            "created_at": agent.created_at.isoformat() if agent.created_at else None,
            # 实时系统信息
            "cpu_percent": system_info.get("cpu_percent"),
            "memory_percent": system_info.get("memory_percent"),
            "memory_used": system_info.get("memory_used"),
            "memory_total": system_info.get("memory_total"),
            "disk_percent": system_info.get("disk_percent"),
            "disk_used": system_info.get("disk_used"),
            "disk_total": system_info.get("disk_total"),
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

# 已移除旧版“FRPC 客户端脚本生成”接口。
# 当前系统统一使用 Go 版 frp-agent（WebSocket 双向）与 /api/agent/install-script/* 安装脚本。


# ===========================
# Agent 分发 API（服务器自托管）
# ===========================

from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
import os

@app.get("/api/agent/download/{platform}")
async def download_agent_binary(
    platform: str,
    current_user: models.Admin = Depends(get_current_user)
):
    """
    下载 Agent 二进制文件 (重定向到 GitHub Releases)
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
    
    # 重定向到 GitHub Releases
    github_url = f"https://github.com/GreenhandTan/FRP-ALL-IN-ONE/releases/latest/download/{filename}"
    return RedirectResponse(url=github_url)


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
        # 默认全部可用 (GitHub 托管)
        available = True
        
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
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    """
    获取动态生成的 Agent 安装脚本（包含服务器信息）
    platform: linux, darwin, windows
    """
    # 获取服务器配置
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN) or "frp-token"
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP) or "YOUR_SERVER_IP"
    frps_port = crud.get_config(db, models.ConfigKeys.FRPS_PORT) or "7000"
    frps_version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) or "0.61.1"

    # 确定客户端身份（用于 Agent WebSocket 鉴权）
    if client_id:
        client = crud.get_client(db, client_id=client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
    else:
        suffix = str(int(time.time()))[-6:]
        client = crud.create_client_with_token(db, name=f"device-{suffix}")
    client_id = client.id
    client_token = client.auth_token
    
    # 服务器下载地址（GitHub Releases）
    download_base = "https://github.com/GreenhandTan/FRP-ALL-IN-ONE/releases/latest/download"
    
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
            $FRPS_TOKEN = "{auth_token}"
            $CLIENT_TOKEN = "{client_token}"
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
    $agentUrl = "$DOWNLOAD_BASE/frp-agent-windows-amd64.exe"
    Write-Host "  下载地址: $agentUrl"
    Invoke-WebRequest -Uri $agentUrl -OutFile "$INSTALL_DIR\\frp-agent.exe" -UseBasicParsing -TimeoutSec 60
    Write-Host "[OK] Agent 下载完成" -ForegroundColor Green
}} catch {{
    Write-Host "[WARN] Agent 下载失败: $_" -ForegroundColor Yellow
    Write-Host "[WARN] 跳过 Agent 安装（FRPC 仍可正常使用）" -ForegroundColor Yellow
}}

# 创建配置文件
Write-Host "[4/5] 创建配置文件..." -ForegroundColor Blue
$config = @"
serverAddr = "$SERVER_IP"
serverPort = $FRPS_PORT
            auth.token = "$FRPS_TOKEN"

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

if (Test-Path "$INSTALL_DIR\\frp-agent.exe") {{
    $agentStartScript = @"
@echo off
cd /d "$INSTALL_DIR"
start /min "" "$INSTALL_DIR\\frp-agent.exe" -server ws://$SERVER_IP/ws/agent/$CLIENT_ID -id $CLIENT_ID -token $CLIENT_TOKEN -frpc "$INSTALL_DIR\\frpc.exe" -config "$INSTALL_DIR\\frpc.toml" -log "$INSTALL_DIR\\logs"
"@
    $agentStartScript | Out-File -FilePath "$INSTALL_DIR\\start-frp-agent.bat" -Encoding ASCII
}}

# 添加到开机启动
$startupFolder = [Environment]::GetFolderPath('Startup')
Copy-Item "$INSTALL_DIR\\start-frpc.bat" "$startupFolder\\start-frpc.bat" -Force
if (Test-Path "$INSTALL_DIR\\start-frp-agent.bat") {{
    Copy-Item "$INSTALL_DIR\\start-frp-agent.bat" "$startupFolder\\start-frp-agent.bat" -Force
}}
Write-Host "[OK] 已添加到开机启动" -ForegroundColor Green

# 启动 FRPC
Write-Host ""
Write-Host "正在启动 FRPC..." -ForegroundColor Blue
Start-Process -FilePath "$INSTALL_DIR\\frpc.exe" -ArgumentList "-c", "$INSTALL_DIR\\frpc.toml" -WindowStyle Minimized
if (Test-Path "$INSTALL_DIR\\frp-agent.exe") {{
    Write-Host "正在启动 Agent..." -ForegroundColor Blue
    Start-Process -FilePath "$INSTALL_DIR\\frp-agent.exe" -ArgumentList "-server", "ws://$SERVER_IP/ws/agent/$CLIENT_ID", "-id", "$CLIENT_ID", "-token", "$CLIENT_TOKEN", "-frpc", "$INSTALL_DIR\\frpc.exe", "-config", "$INSTALL_DIR\\frpc.toml", "-log", "$INSTALL_DIR\\logs" -WindowStyle Minimized
}}

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
        FRPS_TOKEN="{auth_token}"
        CLIENT_TOKEN="{client_token}"
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

# 3. 下载 Agent
log_info "[3/5] 下载 Agent ($OS-$ARCH)..."
AGENT_PATH="$INSTALL_DIR/frp-agent"
# 构造 GitHub Release 文件名
AGENT_FILENAME="frp-agent-${{OS}}-${{ARCH}}"
GITHUB_URL="$DOWNLOAD_BASE/$AGENT_FILENAME"
log_info "下载地址: $GITHUB_URL"

if command -v curl &> /dev/null; then
    curl -fsSL --connect-timeout 60 "$GITHUB_URL" -o "$AGENT_PATH"
elif command -v wget &> /dev/null; then
    wget -q "$GITHUB_URL" -O "$AGENT_PATH"
else
    false
fi

if [ $? -eq 0 ] && [ -f "$AGENT_PATH" ]; then
    chmod +x "$AGENT_PATH"
    log_ok "Agent 下载完成"
else
    log_warn "Agent 下载失败，跳过（FRPC 仍可正常使用）"
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

# 5. 创建 Agent 系统服务
log_info "[5/5] 创建系统服务..."
if [ "$OS" = "linux" ]; then
    # 创建 Agent 服务（Agent 会管理 FRPC 进程）
    if [ -f "$INSTALL_DIR/frp-agent" ]; then
        # 清理可能存在的独立 FRPC 服务，防止冲突
        systemctl stop frpc 2>/dev/null || true
        systemctl disable frpc 2>/dev/null || true
        rm -f /etc/systemd/system/frpc.service 2>/dev/null || true
        
        cat > /etc/systemd/system/frp-agent.service << AGENT_SERVICE
[Unit]
Description=FRP Manager Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/frp-agent -server ws://$SERVER_IP/ws/agent/$CLIENT_ID -id $CLIENT_ID -token $CLIENT_TOKEN -frpc $INSTALL_DIR/frpc -config $INSTALL_DIR/frpc.toml -log $INSTALL_DIR/logs
Restart=always
RestartSec=5
Environment=FRP_INSTALL_DIR=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
AGENT_SERVICE

        systemctl daemon-reload
        systemctl enable frp-agent
        systemctl start frp-agent
        log_ok "Agent 服务已创建并启动（Agent 将管理 FRPC 进程）"
    else
        log_warn "Agent 不存在，FRPC 需要手动启动"
    fi
else
    # macOS: 创建 Agent launchd 服务（Agent 会管理 FRPC 进程）
    if [ -f "$INSTALL_DIR/frp-agent" ]; then
        # 清理可能存在的独立 FRPC 服务，防止冲突
        launchctl unload ~/Library/LaunchAgents/frpc.plist 2>/dev/null || true
        rm -f ~/Library/LaunchAgents/frpc.plist 2>/dev/null || true

        AGENT_PLIST="$HOME/Library/LaunchAgents/com.frp-manager.agent.plist"
        mkdir -p "$HOME/Library/LaunchAgents"
        cat > "$AGENT_PLIST" << AGENT_PLIST_CONTENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frp-manager.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/frp-agent</string>
        <string>-server</string>
        <string>ws://$SERVER_IP/ws/agent/$CLIENT_ID</string>
        <string>-id</string>
        <string>$CLIENT_ID</string>
        <string>-token</string>
        <string>$CLIENT_TOKEN</string>
        <string>-frpc</string>
        <string>$INSTALL_DIR/frpc</string>
        <string>-config</string>
        <string>$INSTALL_DIR/frpc.toml</string>
        <string>-log</string>
        <string>$INSTALL_DIR/logs</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>FRP_INSTALL_DIR</key>
        <string>$INSTALL_DIR</string>
    </dict>
</dict>
</plist>
AGENT_PLIST_CONTENT
        launchctl load "$AGENT_PLIST"
        log_ok "Agent launchd 服务已创建并启动（Agent 将管理 FRPC 进程）"
    else
        log_warn "Agent 不存在，FRPC 需要手动启动"
    fi
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
if [ -f "$INSTALL_DIR/frp-agent" ]; then
    echo -e "${{GREEN}}✓ Agent 已安装并启动 (WebSocket 实时监控)${{NC}}"
else
    echo -e "${{YELLOW}}! Agent 未安装 (仅 FRPC 隧道功能)${{NC}}"
fi
echo ""
log_info "现在可以返回 Web 管理面板继续操作！"
echo ""

if [ "$OS" = "linux" ]; then
    echo "常用命令:"
    echo "  查看 FRPC 状态: sudo systemctl status frpc"
    echo "  查看 Agent 状态: sudo systemctl status frp-agent"
    echo "  查看日志: sudo journalctl -u frpc -f"
fi
echo ""
'''
        return PlainTextResponse(content=script, media_type="text/plain")


@app.get("/api/agent/install-script-info")
async def get_install_script_info(db: Session = Depends(get_db)):
    """获取安装脚本信息（用于前端显示）"""
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN) or "frp-token"
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP) or "YOUR_SERVER_IP"
    frps_port = crud.get_config(db, models.ConfigKeys.FRPS_PORT) or "7000"
    frps_version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) or "0.61.1"
    
    return {
        "server_ip": server_ip,
        "frps_port": frps_port,
        "frps_version": frps_version,
        "scripts": {
            "linux": f"http://{server_ip}/api/agent/install-script/linux",
            "darwin": f"http://{server_ip}/api/agent/install-script/darwin",
            "windows": f"http://{server_ip}/api/agent/install-script/windows"
        }
    }
