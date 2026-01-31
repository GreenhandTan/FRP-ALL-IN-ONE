/**
 * WebSocket Hook - 用于实时数据推送
 * 
 * 功能:
 * - 自动连接/断开
 * - 自动重连（3秒间隔）
 * - 连接状态管理
 * - 消息解析
 */
import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * 通用 WebSocket Hook
 * @param {string} path - WebSocket 路径（如 /ws/dashboard）
 * @param {Object} options - 配置选项
 * @param {boolean} options.enabled - 是否启用连接（默认 true）
 * @param {number} options.reconnectInterval - 重连间隔（毫秒，默认 3000）
 * @param {function} options.onMessage - 收到消息时的回调
 * @returns {Object} { data, isConnected, send, reconnect }
 */
export function useWebSocket(path, options = {}) {
    const {
        enabled = true,
        reconnectInterval = 3000,
        onMessage = null
    } = options;

    const [data, setData] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);
    const reconnectTimer = useRef(null);
    const shouldReconnect = useRef(true);

    // 构建 WebSocket URL
    const getWebSocketUrl = useCallback(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const url = new URL(`${protocol}//${host}${path}`);
        const token = localStorage.getItem('token');
        if (token && path.startsWith('/ws/')) {
            url.searchParams.set('token', token);
        }
        return url.toString();
    }, [path]);

    // 连接 WebSocket
    const connect = useCallback(() => {
        if (!enabled) return;

        const url = getWebSocketUrl();
        console.log(`[WebSocket] 正在连接: ${path}`);

        try {
            ws.current = new WebSocket(url);

            ws.current.onopen = () => {
                console.log('[WebSocket] 连接成功');
                setIsConnected(true);
            };

            ws.current.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    setData(parsed);
                    if (onMessage) {
                        onMessage(parsed);
                    }
                } catch (e) {
                    console.warn('[WebSocket] 消息解析失败:', e);
                }
            };

            ws.current.onclose = (event) => {
                console.log(`[WebSocket] 连接关闭: ${event.code}`);
                setIsConnected(false);

                // 鉴权失败 (1008)，不重连，直接跳转登录
                if (event.code === 1008) {
                    console.error('[WebSocket] 鉴权失败，Token 可能已过期');
                    shouldReconnect.current = false;
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    // 强制刷新跳转到 Login，触发 App.jsx 的鉴权检查
                    window.location.reload();
                    return;
                }

                // 自动重连
                if (shouldReconnect.current && enabled) {
                    console.log(`[WebSocket] ${reconnectInterval}ms 后重连...`);
                    reconnectTimer.current = setTimeout(connect, reconnectInterval);
                }
            };

            ws.current.onerror = (error) => {
                console.error('[WebSocket] 连接错误:', error);
            };
        } catch (error) {
            console.error('[WebSocket] 创建连接失败:', error);
        }
    }, [enabled, getWebSocketUrl, reconnectInterval, onMessage]);

    // 发送消息
    const send = useCallback((message) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const data = typeof message === 'string' ? message : JSON.stringify(message);
            ws.current.send(data);
            return true;
        }
        return false;
    }, []);

    // 手动重连
    const reconnect = useCallback(() => {
        if (ws.current) {
            shouldReconnect.current = true;
            ws.current.close();
        }
        connect();
    }, [connect]);

    // 断开连接
    const disconnect = useCallback(() => {
        shouldReconnect.current = false;
        clearTimeout(reconnectTimer.current);
        if (ws.current) {
            ws.current.close();
        }
    }, []);

    // 生命周期管理
    useEffect(() => {
        if (enabled) {
            shouldReconnect.current = true;
            connect();
        }

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect]);

    return {
        data,
        isConnected,
        send,
        reconnect,
        disconnect
    };
}

/**
 * Dashboard 状态 Hook
 * 专门用于接收 Dashboard 实时状态
 */
export function useDashboardStatus() {
    const { data, isConnected, reconnect } = useWebSocket('/ws/dashboard');

    // 提取状态数据
    const status = data?.type === 'dashboard' ? data.data : null;

    return {
        status,
        isConnected,
        reconnect
    };
}

/**
 * 日志订阅 Hook
 * 用于订阅特定客户端的日志流
 */
export function useLogStream(clientId, enabled = true) {
    const [logs, setLogs] = useState([]);
    const maxLogs = 1000; // 最多保留 1000 条日志

    const handleMessage = useCallback((msg) => {
        if (msg?.type === 'log') {
            setLogs(prev => {
                const newLogs = [...prev, {
                    timestamp: new Date().toISOString(),
                    text: msg.data,
                    clientId: msg.client_id
                }];
                // 超过最大数量则截断
                return newLogs.slice(-maxLogs);
            });
        }
    }, []);

    const { isConnected, reconnect } = useWebSocket(
        `/ws/logs/${clientId}`,
        {
            enabled: enabled && !!clientId,
            onMessage: handleMessage
        }
    );

    // 清空日志
    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    return {
        logs,
        isConnected,
        reconnect,
        clearLogs
    };
}

export default useWebSocket;
