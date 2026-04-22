"""
客户端和隧道管理路由
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import crud
import models
import schemas
from database import SessionLocal
from core import require_password_changed
from websocket_manager import manager as ws_manager

router = APIRouter(prefix="/clients", tags=["客户端管理"])


def _render_frpc_toml(db: Session, client: models.Client) -> str | None:
    """渲染 FRPC 配置文件"""
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
    frps_port = crud.get_config(db, models.ConfigKeys.FRPS_PORT)
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
    if not server_ip or not frps_port or not auth_token:
        return None

    lines = [
        f'serverAddr = "{server_ip}"',
        f"serverPort = {int(frps_port or 7000)}",
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
        # 清洗名称，防止 TOML 语法错误 (例如包含双引号)
        safe_client_name = (client.name or "unknown").replace('"', '').strip()
        safe_tunnel_name = (t.name or f"tun_{t.id}").replace('"', '').strip()
        proxy_name = f"{safe_client_name}.{safe_tunnel_name}"
        lines.append("[[proxies]]")
        lines.append(f'name = "{proxy_name}"')
        lines.append(f'type = "{proxy_type}"')
        lines.append(f'localIP = "{t.local_ip}"')
        lines.append(f"localPort = {int(t.local_port or 0)}")

        if t.remote_port:
            lines.append(f"remotePort = {int(t.remote_port)}")
        if t.custom_domains:
            domains = [d.strip() for d in (t.custom_domains or "").split(",") if d.strip()]
            if domains:
                items = '", "'.join(domains)
                lines.append(f'customDomains = ["{items}"]')
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


async def _broadcast_dashboard_sync(db: Session):
    """向所有 Dashboard 广播最新全量状态"""
    from services.dashboard import build_full_sync_data
    full_data = build_full_sync_data(db)
    await ws_manager.broadcast_dashboard({"type": "full_sync", "data": full_data})


async def _push_config_for_client(client_id: str):
    """推送配置到 Agent，并触发 Dashboard 界面刷新"""
    db = SessionLocal()
    try:
        client = crud.get_client(db, client_id=client_id)
        if not client:
            return False
        toml = _render_frpc_toml(db, client)
        if not toml:
            return False
        
        ok = await ws_manager.push_config_to_agent(client_id, toml)
        await _broadcast_dashboard_sync(db)
        return ok
    finally:
        db.close()


@router.post("/", response_model=schemas.Client)
def create_client(
    client: schemas.ClientCreate,
    db: Session = Depends(lambda: SessionLocal())
):
    """创建客户端（仅允许 Agent 自动注册）"""
    raise HTTPException(status_code=403, detail="Clients must be created by agent registration")


@router.get("/", response_model=List[schemas.Client])
def read_clients(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """获取客户端列表"""
    return crud.get_clients(db, skip=skip, limit=limit)


@router.get("/{client_id}", response_model=schemas.Client)
def read_client(
    client_id: str,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """获取单个客户端详情"""
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return db_client


@router.delete("/{client_id}")
async def delete_client_endpoint(
    client_id: str,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """删除客户端及其所有隧道"""
    ok = crud.delete_client(db, client_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await _broadcast_dashboard_sync(db)
    return {"success": True}


@router.patch("/{client_id}", response_model=schemas.Client)
async def update_client(
    client_id: str,
    payload: dict,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """更新客户端名称"""
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    updated = crud.update_client_name(db, client_id=client_id, new_name=name)
    if not updated:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # 客户端名称修改会影响隧道的代理名称，需要重新推送配置
    await _push_config_for_client(client_id)
    return updated


@router.post("/{client_id}/tunnels/", response_model=schemas.Tunnel)
async def create_tunnel_for_client(
    client_id: str,
    tunnel: schemas.TunnelCreate,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """为客户端创建隧道"""
    created = crud.create_tunnel(db=db, tunnel=tunnel, client_id=client_id)
    await _push_config_for_client(client_id)
    return created


@router.patch("/{client_id}/tunnels/{tunnel_id}", response_model=schemas.Tunnel)
async def update_tunnel_for_client(
    client_id: str,
    tunnel_id: int,
    payload: dict,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """更新隧道状态"""
    tunnel = db.query(models.Tunnel).filter(
        models.Tunnel.id == tunnel_id,
        models.Tunnel.client_id == client_id
    ).first()
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    if "enabled" in payload:
        updated = crud.set_tunnel_enabled(db, tunnel_id=tunnel_id, enabled=payload.get("enabled"))
        await _push_config_for_client(client_id)
        return updated
    raise HTTPException(status_code=400, detail="No supported fields")


@router.delete("/{client_id}/tunnels/{tunnel_id}")
async def delete_tunnel_for_client(
    client_id: str,
    tunnel_id: int,
    db: Session = Depends(lambda: SessionLocal()),
    current_user: models.Admin = Depends(require_password_changed)
):
    """删除隧道"""
    tunnel = db.query(models.Tunnel).filter(
        models.Tunnel.id == tunnel_id,
        models.Tunnel.client_id == client_id
    ).first()
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    ok = crud.delete_tunnel(db, tunnel_id=tunnel_id)
    await _push_config_for_client(client_id)
    return {"success": ok}
