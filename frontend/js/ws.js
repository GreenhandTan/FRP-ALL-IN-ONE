/**
 * WebSocket management module
 */
import { $ } from './dom.js';
import { getToken } from './api.js';
import { t } from './i18n.js';

function updateWsBadge(online) {
  const badge = $("ws-badge");
  if (!badge) return;
  badge.textContent = online ? t("dashboard.clients.online") : t("dashboard.clients.offline");
  badge.className = "badge " + (online ? "badge-success" : "badge-warning");
}

export const WS = {
  socket: null,
  reconnectTimer: null,
  shouldReconnect: true,
  INTERVAL: 3000,
  connected: false,

  getUrl(path) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const token = getToken();
    const base = `${proto}//${location.host}${path}`;
    return token ? `${base}?token=${token}` : base;
  },

  connect(path, onMessage) {
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    clearTimeout(this.reconnectTimer);
    this.shouldReconnect = true;

    const url = this.getUrl(path);
    const ws = new WebSocket(url);
    this.socket = ws;

    ws.onopen = () => {
      this.connected = true;
      updateWsBadge(true);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onMessage(msg);
      } catch {}
    };

    ws.onclose = (ev) => {
      this.connected = false;
      updateWsBadge(false);
      if (ev.code === 1008) {
        // 认证失败，跳转登录
        localStorage.removeItem("token");
        location.reload();
        return;
      }
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(
          () => this.connect(path, onMessage),
          this.INTERVAL,
        );
      }
    };

    ws.onerror = () => {};
  },

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    updateWsBadge(false);
  },
};
