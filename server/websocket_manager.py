"""
WebSocket 连接管理器
用于管理 Dashboard 客户端和 Agent 的 WebSocket 连接
"""
from fastapi import WebSocket
from typing import Dict, Set
import asyncio
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """管理所有 WebSocket 连接"""
    
    def __init__(self):
        # Dashboard 前端连接（多个浏览器标签）
        self.dashboard_connections: Set[WebSocket] = set()
        
        # Agent 连接（client_id -> WebSocket）
        self.agent_connections: Dict[str, WebSocket] = {}
        
        # 日志订阅者（client_id -> 订阅该客户端日志的 WebSocket 集合）
        self.log_subscribers: Dict[str, Set[WebSocket]] = {}
    
    # ========================
    # Dashboard 连接管理
    # ========================
    
    async def connect_dashboard(self, websocket: WebSocket):
        """接受 Dashboard 前端连接"""
        await websocket.accept()
        self.dashboard_connections.add(websocket)
        logger.info(f"Dashboard 已连接，当前连接数: {len(self.dashboard_connections)}")
    
    def disconnect_dashboard(self, websocket: WebSocket):
        """断开 Dashboard 前端连接"""
        self.dashboard_connections.discard(websocket)
        logger.info(f"Dashboard 已断开，当前连接数: {len(self.dashboard_connections)}")
    
    async def broadcast_status(self, status: dict):
        """向所有 Dashboard 广播状态更新"""
        if not self.dashboard_connections:
            return
        
        message = {"type": "status", "data": status}
        disconnected = []
        
        for ws in self.dashboard_connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"发送状态失败: {e}")
                disconnected.append(ws)
        
        # 清理断开的连接
        for ws in disconnected:
            self.disconnect_dashboard(ws)
    
    # ========================
    # Agent 连接管理
    # ========================
    
    async def connect_agent(self, websocket: WebSocket, client_id: str):
        """接受 Agent 连接"""
        await websocket.accept()
        
        # 如果已有同 ID 的连接，先断开旧连接
        if client_id in self.agent_connections:
            try:
                await self.agent_connections[client_id].close()
            except:
                pass
        
        self.agent_connections[client_id] = websocket
        logger.info(f"Agent {client_id} 已连接，当前 Agent 数: {len(self.agent_connections)}")
    
    def disconnect_agent(self, client_id: str):
        """断开 Agent 连接"""
        if client_id in self.agent_connections:
            del self.agent_connections[client_id]
            logger.info(f"Agent {client_id} 已断开，当前 Agent 数: {len(self.agent_connections)}")
    
    def is_agent_online(self, client_id: str) -> bool:
        """检查 Agent 是否在线"""
        return client_id in self.agent_connections
    
    async def send_to_agent(self, client_id: str, message: dict) -> bool:
        """向指定 Agent 发送消息"""
        ws = self.agent_connections.get(client_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except Exception as e:
                logger.warning(f"发送消息到 Agent {client_id} 失败: {e}")
                self.disconnect_agent(client_id)
        return False
    
    async def push_config_to_agent(self, client_id: str, config: str) -> bool:
        """推送配置更新到 Agent"""
        return await self.send_to_agent(client_id, {
            "type": "config_update",
            "data": config
        })
    
    # ========================
    # 日志订阅管理
    # ========================
    
    async def subscribe_logs(self, websocket: WebSocket, client_id: str):
        """订阅某客户端的日志"""
        await websocket.accept()
        
        if client_id not in self.log_subscribers:
            self.log_subscribers[client_id] = set()
        
        self.log_subscribers[client_id].add(websocket)
        logger.info(f"日志订阅: {client_id}，当前订阅者: {len(self.log_subscribers[client_id])}")
    
    def unsubscribe_logs(self, websocket: WebSocket, client_id: str):
        """取消日志订阅"""
        if client_id in self.log_subscribers:
            self.log_subscribers[client_id].discard(websocket)
            if not self.log_subscribers[client_id]:
                del self.log_subscribers[client_id]
    
    async def broadcast_log(self, client_id: str, log_line: str):
        """广播日志到所有订阅者"""
        subscribers = self.log_subscribers.get(client_id, set())
        if not subscribers:
            return
        
        message = {"type": "log", "data": log_line, "client_id": client_id}
        disconnected = []
        
        for ws in subscribers:
            try:
                await ws.send_json(message)
            except:
                disconnected.append(ws)
        
        # 清理断开的连接
        for ws in disconnected:
            self.unsubscribe_logs(ws, client_id)
    
    # ========================
    # 统计信息
    # ========================
    
    def get_stats(self) -> dict:
        """获取连接统计"""
        return {
            "dashboard_connections": len(self.dashboard_connections),
            "agent_connections": len(self.agent_connections),
            "online_agents": list(self.agent_connections.keys()),
            "log_subscribers": {k: len(v) for k, v in self.log_subscribers.items()}
        }


# 全局连接管理器实例
manager = ConnectionManager()
