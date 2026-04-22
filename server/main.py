"""
FRP Manager API - 主入口
精简后的主文件，仅保留 WebSocket 和初始化逻辑
其他路由已拆分至 routers/ 目录
"""
import asyncio
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
import schemas
import crud
import auth
from database import SessionLocal, engine
from websocket_manager import manager as ws_manager
from core.rate_limit import setup_rate_limit
import time as _time

# FRPS Dashboard 状态缓存（每 5 秒刷新一次，避免 WS 循环每秒调用）
_frps_cache: dict = {"data": None, "ts": 0.0}

# 创建数据库表
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FRP Manager API")

# 注册限流器
setup_rate_limit(app)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境建议限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化 JWT Secret Key
auth.init_secret_key()


# ===========================
# 数据库初始化
# ===========================

@app.on_event("startup")
def init_database():
    """初始化数据库表和默认管理员"""
    # 创建所有表
    models.Base.metadata.create_all(bind=engine)
    
    # 创建默认管理员（如果不存在）
    db = SessionLocal()
    try:
        existing_admin = crud.get_admin_by_username(db, "admin")
        if not existing_admin:
            default_admin = schemas.UserCreate(username="admin", password="123456")
            admin = crud.create_admin(db, default_admin)
            # 标记为未修改密码（首次登录需要强制修改）
            admin.is_password_changed = False
            db.commit()
            print("[OK] 默认管理员已创建 (admin / 123456)，首次登录请修改密码")
        else:
            print("[OK] 管理员账号已存在")
    finally:
        db.close()
    
    print("[OK] 数据库初始化完成")
    
    # 启动后台任务
    asyncio.create_task(background_ping_task())
    asyncio.create_task(background_cert_renew_task())  # 证书自动续期任务
    asyncio.create_task(background_frps_status_task())  # FRPS 状态事件推送任务


async def background_ping_task():
    """定期发送 Ping 保持 WebSocket 连接活跃"""
    while True:
        await asyncio.sleep(30)  # 每 30 秒 Ping 一次
        try:
            await ws_manager.broadcast_ping()
        except Exception as e:
            print(f"[Error] Ping 广播失败: {e}")


async def background_cert_renew_task():
    """
    证书自动续期任务
    每天检查一次证书过期情况，过期前 30 天自动续期
    """
    # 延迟 60 秒启动，等待系统完全初始化
    await asyncio.sleep(60)
    
    from services.tls_manager import tls_manager
    import crud
    
    while True:
        try:
            db = SessionLocal()
            try:
                # 检查是否启用了 HTTPS 且是自动模式
                domain = crud.get_config(db, models.ConfigKeys.SERVER_DOMAIN)
                tls_enabled = crud.get_config(db, models.ConfigKeys.TLS_ENABLED) == "true"
                tls_mode = crud.get_config(db, models.ConfigKeys.TLS_MODE)
                
                if domain and tls_enabled and tls_mode == "auto":
                    # 检查是否需要续期
                    if tls_manager.check_cert_needs_renew(domain, days_before=30):
                        print(f"[CertRenew] 证书将在 30 天内过期，开始续期: {domain}")
                        
                        # 执行续期
                        result = tls_manager.renew_cert(domain)
                        
                        if result["success"]:
                            # 续期成功，重载 Nginx
                            reload_result = tls_manager.reload_nginx()
                            if reload_result["success"]:
                                print(f"[CertRenew] 证书续期成功并已重载 Nginx: {domain}")
                            else:
                                print(f"[CertRenew] 证书续期成功但重载 Nginx 失败: {reload_result['message']}")
                        else:
                            print(f"[CertRenew] 证书续期失败: {result['message']}")
                    else:
                        cert_info = tls_manager.get_cert_info(domain)
                        if cert_info and "days_until_expiry" in cert_info:
                            print(f"[CertRenew] 证书检查完成，还剩 {cert_info['days_until_expiry']} 天过期")
            finally:
                db.close()
        except Exception as e:
            print(f"[CertRenew] 证书续期任务异常: {e}")
        
        # 每 24 小时检查一次
        await asyncio.sleep(86400)


# ===========================
# 全量同步数据构建（仅首次 Dashboard 连接时调用）
# ===========================

def _build_full_sync_data(db) -> dict:
    """构建全量快照，供 Dashboard 初次连接时使用"""
    clients = crud.get_clients(db)
    ws_agents_info = {
        info["client_id"]: info
        for info in ws_manager.get_all_agents_info()
    }
    registered_clients = []
    for c in clients:
        client_data = {
            "id": c.id,
            "name": c.name,
            "auth_token": c.auth_token,
            "status": c.status,
            "last_seen": c.last_seen,
            "tunnels": [
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
            ],
        }
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
        is_ws_connected = ws_manager.is_agent_online(c.id)
        ws_info = ws_agents_info.get(c.id, {})
        client_data.update({
            "is_online": is_ws_connected,
            "cpu_percent":    ws_info.get("cpu_percent"),
            "memory_percent": ws_info.get("memory_percent"),
            "memory_used":    ws_info.get("memory_used"),
            "memory_total":   ws_info.get("memory_total"),
            "disk_percent":   ws_info.get("disk_percent"),
            "disk_used":      ws_info.get("disk_used"),
            "disk_total":     ws_info.get("disk_total"),
            "net_bytes_in":   ws_info.get("net_bytes_in"),
            "net_bytes_out":  ws_info.get("net_bytes_out"),
            "net_speed_in":   ws_info.get("net_speed_in"),
            "net_speed_out":  ws_info.get("net_speed_out"),
        })
        registered_clients.append(client_data)

    disabled_ports_str = crud.get_config(db, models.ConfigKeys.DISABLED_PORTS) or ""
    disabled_ports = [int(p) for p in disabled_ports_str.split(",") if p.strip()]

    return {
        "registered_clients": registered_clients,
        "disabled_ports": disabled_ports,
        "frps_status": _frps_cache["data"],
        "conflict_events": ws_manager.get_recent_conflicts(),
    }


async def background_frps_status_task():
    """
    每 10 秒轮询一次 FRPS 状态，仅在数据发生变化时向所有 Dashboard 推送。
    取代原先在 WS 循环中每 5 秒全量刷新的方式。
    """
    import json as _json
    await asyncio.sleep(15)  # 等待系统完全初始化后再启动
    _last_frps_hash = None

    while True:
        try:
            db = SessionLocal()
            try:
                from routers.frp_server import get_frps_status
                frps_data = await get_frps_status(db=db, current_user=None)
                current_hash = hash(_json.dumps(frps_data, sort_keys=True, default=str))
                if current_hash != _last_frps_hash:
                    _last_frps_hash = current_hash
                    # 同步更新缓存，供 full_sync 使用
                    _frps_cache["data"] = frps_data
                    _frps_cache["ts"] = _time.time()
                    await ws_manager.broadcast_frps_status(frps_data)
            finally:
                db.close()
        except Exception as e:
            print(f"[FRPSTask] 状态获取失败: {e}")

        await asyncio.sleep(10)


# ===========================
# 导入并注册路由
# ===========================

from routers import auth as auth_router
from routers import system as system_router
from routers import clients as clients_router
from routers import agents as agents_router
from routers import frp_server as frp_router
from routers import settings as settings_router

# 认证路由（无需密码修改检查）
app.include_router(auth_router.router, prefix="/api")

# 系统状态路由（公开访问）
app.include_router(system_router.router, prefix="/api")

# 需要密码修改检查的受保护路由
app.include_router(clients_router.router, prefix="/api")
app.include_router(agents_router.router, prefix="/api")
app.include_router(frp_router.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")


# ===========================
# WebSocket 端点
# ===========================

def _get_admin_from_token(db: Session, token: str):
    """从 Token 解析管理员信息"""
    if not token:
        return None
    try:
        payload = auth.jwt.decode(token, auth.get_secret_key(), algorithms=[auth.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
        return crud.get_admin_by_username(db, username=username)
    except Exception:
        return None


@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """
    Dashboard 实时状态推送（事件驱动模式）
    - 连接建立时发送一次 full_sync 全量数据
    - 后续由 Agent 上报、上下线事件、FRPS 状态变化触发增量推送
    - 服务端每 30 秒发送 ping 保持连接活跃
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
        # 首次连接：发送全量数据供前端初始化，此后所有更新均由事件驱动
        db = SessionLocal()
        try:
            full_data = _build_full_sync_data(db)
        finally:
            db.close()
        await websocket.send_json({"type": "full_sync", "data": full_data})

        # 保持连接；每 30 秒发送一次 ping 防止代理层断开空闲连接
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        print("[WS Dashboard] Client disconnected normally")
        ws_manager.disconnect_dashboard(websocket)
    except Exception as e:
        import traceback
        print(f"[WS Dashboard] ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()
        ws_manager.disconnect_dashboard(websocket)





@app.websocket("/ws/agent/{client_id}")
async def websocket_agent(websocket: WebSocket, client_id: str):
    """
    Agent 双向通信通道
    接收 Agent 上报的系统信息、日志等
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
        await ws_manager.disconnect_agent(client_id)
    except Exception:
        await ws_manager.disconnect_agent(client_id)


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
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.unsubscribe_logs(websocket, client_id)
    except Exception:
        ws_manager.unsubscribe_logs(websocket, client_id)


async def _handle_agent_message(client_id: str, msg: dict):
    """处理 Agent 上报的消息"""
    msg_type = msg.get("type")
    data = msg.get("data")
    
    if msg_type == "register":
        db = SessionLocal()
        try:
            crud.touch_client(db, client_id=client_id, status="online")
            
            hostname = data.get("hostname") if isinstance(data, dict) else None
            if hostname:
                client = crud.get_client(db, client_id=client_id)
                if client and client.name != hostname:
                    crud.update_client_name(db, client_id=client_id, new_name=hostname)
            
            agent = db.query(models.AgentInfo).filter(
                models.AgentInfo.client_id == client_id
            ).first()
            
            if agent:
                agent.hostname = data.get("hostname", agent.hostname) if isinstance(data, dict) else agent.hostname
                agent.os = data.get("os", agent.os) if isinstance(data, dict) else agent.os
                agent.arch = data.get("arch", agent.arch) if isinstance(data, dict) else agent.arch
                agent.agent_version = data.get("version", agent.agent_version) if isinstance(data, dict) else agent.agent_version
                agent.platform = data.get("platform", agent.platform) if isinstance(data, dict) else agent.platform
            else:
                agent = models.AgentInfo(
                    client_id=client_id,
                    hostname=data.get("hostname") if isinstance(data, dict) else None,
                    os=data.get("os") if isinstance(data, dict) else None,
                    arch=data.get("arch") if isinstance(data, dict) else None,
                    agent_version=data.get("version") if isinstance(data, dict) else None,
                    platform=data.get("platform") if isinstance(data, dict) else None,
                )
                db.add(agent)
            
            db.commit()
        finally:
            db.close()
    
    elif msg_type == "system_info":
        if not isinstance(data, dict):
            return

        # 1. 更新内存缓存
        ws_manager.update_agent_system_info(client_id, data)

        # 2. 立即广播增量指标给所有 Dashboard（事件驱动核心）
        await ws_manager.broadcast_metrics_patch(client_id, data)

        # 3. 数据库写入节流：每 30 秒持久化一次，大幅降低 SQLite 写压力
        import time as _t
        now = _t.time()
        last_write = ws_manager._metrics_last_write.get(client_id, 0)
        if now - last_write < 30:
            return  # 距上次写入还不到 30 秒，跳过
        ws_manager._metrics_last_write[client_id] = now

        db = SessionLocal()
        try:
            crud.touch_client(db, client_id=client_id, status="online")

            agent = db.query(models.AgentInfo).filter(
                models.AgentInfo.client_id == client_id
            ).first()

            if agent:
                if "hostname" in data:
                    agent.hostname = data["hostname"]
                if "os" in data:
                    agent.os = data["os"]
                if "arch" in data:
                    agent.arch = data["arch"]

            # 持久化当前指标（每 30 秒一条，取代每次都写）
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
                net_bytes_out=data.get("net_bytes_out"),
                net_speed_in=data.get("net_speed_in"),
                net_speed_out=data.get("net_speed_out")
            )
            db.add(metrics)

            # 清理超过 1000 条的旧数据
            count = db.query(models.SystemMetrics).filter(
                models.SystemMetrics.client_id == client_id
            ).count()
            if count > 1000:
                oldest = db.query(models.SystemMetrics).filter(
                    models.SystemMetrics.client_id == client_id
                ).order_by(models.SystemMetrics.timestamp.asc()).limit(count - 1000).all()
                for old in oldest:
                    db.delete(old)

            db.commit()
        finally:
            db.close()
    
    elif msg_type == "log":
        await ws_manager.broadcast_log(client_id, data)
    
    elif msg_type == "frpc_status":
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
