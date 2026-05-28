/**
 * WebSocket management module
 */
import { $ } from './dom.js';
import { getToken } from './api.js';
import { t } from './i18n.js';

function updateWsBadge(online) {
  const badges = [$("ws-badge"), $("ws-badge-desktop")];
  badges.forEach(badge => {
    if (!badge) return;
    badge.textContent = online ? t("dashboard.clients.online") : "Offline";
    badge.className = online
      ? "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-status-online/10 text-status-online font-label-sm text-label-sm"
      : "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-status-warning/10 text-status-warning font-label-sm text-label-sm";
  });
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
