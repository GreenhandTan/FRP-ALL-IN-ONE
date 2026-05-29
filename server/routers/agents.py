"""
Agent 管理路由
包含 Agent 列表、详情、指标查询、配置推送等
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
from core import get_db, get_current_user
from websocket_manager import manager as ws_manager

router = APIRouter(prefix="/agents", tags=["Agent 管理"])


@router.get("/")
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


@router.get("/{client_id}")
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
        "last_heartbeat": agent.last_heartbeat.isoformat() if hasattr(agent, 'last_heartbeat') and agent.last_heartbeat else None,
        "created_at": agent.created_at.isoformat() if agent.created_at else None
    }


@router.get("/{client_id}/metrics")
async def get_agent_metrics(
    client_id: str,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """获取 Agent 系统指标历史"""
    limit = min(max(limit, 1), 1000)
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


@router.get("/{client_id}/metrics/latest")
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
        "net_bytes_out": latest.net_bytes_out,
        "net_speed_in": latest.net_speed_in,
        "net_speed_out": latest.net_speed_out
    }


@router.post("/{client_id}/push-config")
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


@router.get("/ws/stats")
async def get_websocket_stats(
    current_user: models.Admin = Depends(get_current_user)
):
    """获取 WebSocket 连接统计"""
    return ws_manager.get_stats()
