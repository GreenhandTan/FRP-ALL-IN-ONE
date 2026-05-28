/**
 * WebSocket 模块 - 对接后端实时数据推送
 */

import { getToken } from './api';

type MessageHandler = (data: any) => void;

class DashboardWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = '';

  connect() {
    const token = getToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws/dashboard?token=${token}`;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Dashboard connected');
      this.emit('connected', null);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ping') return;
        this.emit(msg.type, msg.data);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Dashboard disconnected:', event.code, event.reason);
      this.emit('disconnected', null);
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Dashboard error:', error);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (getToken()) {
        console.log('[WS] Attempting reconnect...');
        this.connect();
      }
    }, 3000);
  }

  on(event: string, handler: MessageHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: MessageHandler) {
    const list = this.handlers.get(event);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private emit(event: string, data: any) {
    const list = this.handlers.get(event);
    if (list) {
      list.forEach((h) => {
        try { h(data); } catch (e) { console.error('[WS] Handler error:', e); }
      });
    }
  }
}

/** 日志订阅 WebSocket */
class LogWebSocket {
  private ws: WebSocket | null = null;
  private clientId: string | null = null;
  private handlers: ((msg: any) => void)[] = [];

  connect(clientId: string) {
    this.disconnect();
    this.clientId = clientId;
    const token = getToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/logs/${clientId}?token=${token}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handlers.forEach((h) => h(msg));
      } catch {}
    };

    this.ws.onclose = () => {
      console.log('[WS] Log stream closed');
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.clientId = null;
  }

  onMessage(handler: (msg: any) => void) {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }
}

export const dashboardWs = new DashboardWebSocket();
export const logWs = new LogWebSocket();
