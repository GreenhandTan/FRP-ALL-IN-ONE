/**
 * FRP Manager — 纯原生 JS 单页应用
 * 零依赖、零构建、最低资源占用
 */
"use strict";

/* =============================================================
   1. 国际化 (i18n)
   ============================================================= */
const TRANSLATIONS = {
  zh: {
    loading: "加载中…",
    confirm: "确认",
    cancel: "取消",
    save: "保存",
    delete: "删除",
    edit: "编辑",
    copy: "复制",
    copySuccess: "已复制",
    download: "下载",
    refresh: "刷新",
    logout: "退出登录",
    errorTitle: "错误",
    login: {
      title: "FRP Manager 登录",
      username: "用户名",
      password: "密码",
      submit: "登 录",
      submitting: "登录中…",
      error: "登录失败：用户名或密码错误",
      usernamePlaceholder: "admin",
    },
    changePassword: {
      title: "修改密码",
      oldPassword: "当前密码",
      newPassword: "新密码",
      confirmPassword: "确认新密码",
      submit: "确认修改",
      submitting: "提交中…",
      success: "密码修改成功！",
      errorMismatch: "两次输入的新密码不一致",
      errorFailed: "密码修改失败",
    },
    setup: {
      title: "FRPS 服务端配置",
      subtitle: "系统将自动生成配置并启动 FRPS 容器",
      portLabel: "监听端口",
      serverIpLabel: "公网 IP",
      serverIpRequired: "请输入公网 IP 地址",
      autoDetected: "已自动检测",
      detectingIp: "检测中…",
      ipDetectFailed: "无法自动检测 IP，请手动输入",
      deployButton: "开始部署",
      deploying: "部署中…",
      successTitle: "部署成功！",
      version: "版本",
      port: "端口",
      publicIP: "公网 IP",
      authToken: "认证 Token（自动生成）",
      copied: "Token 已复制",
      nextStep: "下一步：获取客户端脚本",
      deployFailed: "部署失败",
      frpsRestarted: "FRPS 已重启，Token 已生效",
      clientScriptTitle: "客户端部署脚本",
      clientScriptHint: "在内网机器上以 root 权限执行",
      scriptCopied: "脚本已复制",
      copyFailed: "复制失败",
      finish: "完成配置，进入控制面板",
      step1: "配置",
      step2: "部署",
      step3: "脚本",
    },
    dashboard: {
      title: "FRP 管理控制台",
      stats: {
        totalClients: "已连接客户端",
        onlineClients: "在线客户端",
        totalTraffic: "总流量",
        connections: "连接数",
      },
      clients: {
        title: "客户端列表",
        empty: "暂无客户端，请等待 Agent 自动注册",
        online: "在线",
        offline: "离线",
        trafficIn: "↓ 传入",
        trafficOut: "↑ 传出",
        addTunnel: "添加隧道",
        viewLogs: "查看日志",
        proxies: "个代理",
      },
      tunnels: {
        name: "隧道名称",
        type: "类型",
        remotePort: "远程端口",
        status: "状态",
        actions: "操作",
        active: "运行中",
        inactive: "已停止",
        disable: "禁用",
        enable: "启用",
        confirmDelete: "确定要删除此隧道吗？",
        remotePortSuggest: "建议使用私有端口范围 49152-65535",
        remotePortNonPrivate: "当前端口不在私有范围内，请确认已放行",
      },
    },
    language: { zh: "中文", en: "English" },
  },
  en: {
    loading: "Loading…",
    confirm: "Confirm",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    copy: "Copy",
    copySuccess: "Copied",
    download: "Download",
    refresh: "Refresh",
    logout: "Logout",
    errorTitle: "Error",
    login: {
      title: "FRP Manager Login",
      username: "Username",
      password: "Password",
      submit: "Login",
      submitting: "Logging in…",
      error: "Login failed: Invalid credentials",
      usernamePlaceholder: "admin",
    },
    changePassword: {
      title: "Change Password",
      oldPassword: "Current Password",
      newPassword: "New Password",
      confirmPassword: "Confirm Password",
      submit: "Confirm",
      submitting: "Submitting…",
      success: "Password changed!",
      errorMismatch: "New passwords do not match",
      errorFailed: "Failed to change password",
    },
    setup: {
      title: "FRP Server Deployment",
      subtitle: "Deploy your FRP server in minutes",
      portLabel: "Listen Port",
      serverIpLabel: "Public IP",
      serverIpRequired: "Public IP is required",
      autoDetected: "Auto-detected",
      detectingIp: "Detecting…",
      ipDetectFailed: "Cannot auto-detect IP, please enter manually",
      deployButton: "Deploy",
      deploying: "Deploying…",
      successTitle: "Deployment Successful!",
      version: "Version",
      port: "Port",
      publicIP: "Public IP",
      authToken: "Auth Token (Auto-generated)",
      copied: "Token copied",
      nextStep: "Next: Get Client Script",
      deployFailed: "Deployment failed",
      frpsRestarted: "FRPS restarted, token active",
      clientScriptTitle: "Client Deployment Script",
      clientScriptHint: "Run on your intranet machine with root privileges",
      scriptCopied: "Script copied",
      copyFailed: "Copy failed",
      finish: "Finish Setup, Enter Dashboard",
      step1: "Configure",
      step2: "Deploy",
      step3: "Script",
    },
    dashboard: {
      title: "FRP Management Console",
      stats: {
        totalClients: "Connected Clients",
        onlineClients: "Online Clients",
        totalTraffic: "Total Traffic",
        connections: "Connections",
      },
      clients: {
        title: "Client List",
        empty: "No clients yet. Waiting for agent registration.",
        online: "Online",
        offline: "Offline",
        trafficIn: "↓ In",
        trafficOut: "↑ Out",
        addTunnel: "Add Tunnel",
        viewLogs: "View Logs",
        proxies: "proxies",
      },
      tunnels: {
        name: "Tunnel",
        type: "Type",
        remotePort: "Remote Port",
        status: "Status",
        actions: "Actions",
        active: "Active",
        inactive: "Inactive",
        disable: "Disable",
        enable: "Enable",
        confirmDelete: "Delete this tunnel?",
        remotePortSuggest: "Recommended range: 49152-65535",
        remotePortNonPrivate: "Port outside private range, ensure it is open",
      },
    },
    language: { zh: "中文", en: "English" },
  },
};

let lang = localStorage.getItem("lang") || "zh";
function t(key) {
  const keys = key.split(".");
  let obj = TRANSLATIONS[lang];
  for (const k of keys) {
    if (obj == null) return key;
    obj = obj[k];
  }
  return obj ?? key;
}

/* =============================================================
   2. HTTP 工具
   ============================================================= */
function getToken() {
  return localStorage.getItem("token");
}

async function request(method, url, body, opts = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  let init = { method, headers };

  if (body instanceof URLSearchParams) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body;
  } else if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const d = await res.json();
      detail = d.detail || d.message || "";
    } catch {}
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

const api = {
  get: (url, opts) => request("GET", url, undefined, opts),
  post: (url, body, opts) => request("POST", url, body, opts),
  patch: (url, body, opts) => request("PATCH", url, body, opts),
  delete: (url, opts) => request("DELETE", url, undefined, opts),
};

/* =============================================================
   3. DOM 工具
   ============================================================= */
const $ = (id) => document.getElementById(id);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);
function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}
function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}
function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}
function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}
function toggle(id, visible) {
  visible ? show(id) : hide(id);
}

function showAlert(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideAlert(id) {
  hide(id);
}

/* =============================================================
   4. 确认对话框
   ============================================================= */
function showConfirm(msg, options = {}) {
  return new Promise((resolve) => {
    setText("confirm-title", options.title || t("confirm"));
    setText("confirm-message", msg);
    const okBtn = $("btn-confirm-ok");
    okBtn.className =
      "btn " + (options.tone === "danger" ? "btn-danger" : "btn-primary");
    setText("btn-confirm-ok", options.confirmText || t("confirm"));
    setText("btn-confirm-cancel", options.cancelText || t("cancel"));
    openModal("modal-confirm");
    const cleanup = (result) => {
      closeModal("modal-confirm");
      resolve(result);
      okBtn.removeEventListener("click", onOk);
      $("btn-confirm-cancel").removeEventListener("click", onCancel);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    $("btn-confirm-cancel").addEventListener("click", onCancel);
  });
}

/* =============================================================
   5. 弹窗系统
   ============================================================= */
function openModal(id) {
  show(id);
}
function closeModal(id) {
  hide(id);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-close-modal");
  if (btn) {
    const modalId = btn.dataset.modal;
    if (modalId) closeModal(modalId);
  }
  // 点击遮罩关闭（排除 confirm 弹窗）
  if (
    e.target.classList.contains("modal-overlay") &&
    e.target.id !== "modal-confirm"
  ) {
    closeModal(e.target.id);
  }
});

/* =============================================================
   6. 视图切换
   ============================================================= */
function showView(viewId) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = $(viewId);
  if (el) el.classList.add("active");
}

/* =============================================================
   7. 工具函数
   ============================================================= */
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) +
    " " +
    (sizes[i] || "PB")
  );
}

function formatSpeed(bps) {
  if (!bps || bps === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return (
    parseFloat((bps / Math.pow(k, i)).toFixed(1)) + " " + (sizes[i] || "GB/s")
  );
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =============================================================
   8. WebSocket 管理
   ============================================================= */
const WS = {
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

function updateWsBadge(online) {
  const badge = $("ws-badge");
  if (!badge) return;
  badge.textContent = online ? "Live" : "Offline";
  badge.className = "badge " + (online ? "badge-success" : "badge-warning");
}

/* =============================================================
   9. 应用状态
   ============================================================= */
const STATE = {
  registeredClients: [],
  frpProxies: [],
  disabledPorts: [],
  serverInfo: {},
  stats: {
    totalClients: 0,
    onlineClients: 0,
    machineTrafficIn: 0,
    machineTrafficOut: 0,
    activeProxies: 0,
    totalProxies: 0,
    onlineAgents: 0,
  },
  // 添加隧道上下文
  pendingTunnelClientId: null,
  // 日志 WS
  logWs: null,
  logPaused: false,
  logLines: [],
  logClientId: null,
};

/* =============================================================
   10. 仪表盘渲染
   ============================================================= */
function renderStats() {
  const { stats } = STATE;
  setText("stat-val-clients", stats.totalClients);
  setText(
    "stat-sub-clients",
    `代理: ${stats.activeProxies || 0} / ${stats.totalProxies}`,
  );
  setText("stat-val-online", stats.onlineClients);
  setText("stat-val-traffic-in", formatBytes(stats.machineTrafficIn));
  setText("stat-val-traffic-out", formatBytes(stats.machineTrafficOut));

  const agentBadge = $("agents-badge");
  if (agentBadge) {
    if (stats.onlineAgents > 0) {
      agentBadge.textContent = stats.onlineAgents + " Agent";
      agentBadge.classList.remove("hidden");
    } else {
      agentBadge.classList.add("hidden");
    }
  }
}

function renderClients() {
  const list = $("clients-list");
  const empty = $("clients-empty");
  if (!list) return;

  const clients = STATE.registeredClients;
  if (clients.length === 0) {
    list.innerHTML = "";
    show("clients-empty");
    return;
  }
  hide("clients-empty");

  const proxiesByName = {};
  (STATE.frpProxies || []).forEach((p) => {
    if (p?.name) proxiesByName[p.name] = p;
  });
  const nowSec = Math.floor(Date.now() / 1000);

  list.innerHTML = clients
    .map((client) => renderClientCard(client, proxiesByName, nowSec))
    .join("");

  // 绑定事件
  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", handleClientAction);
  });
}

function renderClientCard(client, proxiesByName, nowSec) {
  const online =
    client.is_online !== undefined
      ? client.is_online
      : client.last_seen && nowSec - client.last_seen < 30;
  const shortId = (client.id || "").slice(0, 8);
  const tunnels = client.tunnels || [];

  // 速率
  const netSpeedIn = client.net_speed_in || 0;
  const netSpeedOut = client.net_speed_out || 0;

  // 资源条
  let resBars = "";
  if (online && client.cpu_percent != null) {
    resBars = `
      <div class="client-res-bars">
        ${resBar(client.cpu_percent, "CPU", "cpu")}
        ${resBar(client.memory_percent, "Mem", "mem")}
        ${resBar(client.disk_percent, "Disk", "disk")}
      </div>`;
  }

  // OS 徽标
  let osBadge = "";
  if (online && client.os && client.arch) {
    osBadge = `<span class="badge badge-os">${escapeHtml(client.os)}/${escapeHtml(client.arch)}</span>`;
  } else {
    osBadge = `<span class="text-muted">${online ? "Unknown" : t("dashboard.clients.offline")}</span>`;
  }

  // 隧道行
  const tunnelRows = tunnels
    .map((tunnel) => {
      const proxyName = `${client.name}.${tunnel.name}`;
      const proxy = proxiesByName[proxyName];
      const enabled = tunnel.enabled !== false;
      const remotePort = tunnel.remote_port || 0;
      const trafficIn = proxy?.today_traffic_in || proxy?.todayTrafficIn || 0;
      const trafficOut =
        proxy?.today_traffic_out || proxy?.todayTrafficOut || 0;
      const conns = proxy?.cur_conns || proxy?.curConns || 0;

      return `<tr class="${enabled ? "" : "disabled-row"}" data-tunnel-id="${tunnel.id}" data-client-id="${escapeHtml(client.id)}">
      <td class="mono">${escapeHtml(proxyName)}</td>
      <td><span class="badge-type">${escapeHtml(tunnel.type)}</span></td>
      <td>${remotePort ? `<span class="port-chip">:${remotePort}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="text-right">
        <div class="traffic-cell">
          <span class="traffic-in">↓ ${formatBytes(trafficIn)}</span>
          <span class="traffic-out">↑ ${formatBytes(trafficOut)}</span>
        </div>
      </td>
      <td class="text-right mono">${conns}</td>
      <td class="text-right">
        <div class="tunnel-actions">
          <button class="btn-${enabled ? "disable" : "enable"}"
            data-action="${enabled ? "disable-tunnel" : "enable-tunnel"}"
            data-client-id="${escapeHtml(client.id)}"
            data-tunnel-id="${tunnel.id}"
            data-enabled="${enabled}">
            ${enabled ? t("dashboard.tunnels.disable") : t("dashboard.tunnels.enable")}
          </button>
          <button class="btn-del"
            data-action="delete-tunnel"
            data-client-id="${escapeHtml(client.id)}"
            data-tunnel-id="${tunnel.id}">
            ${t("delete")}
          </button>
        </div>
      </td>
    </tr>`;
    })
    .join("");

  const tunnelTable =
    tunnels.length > 0
      ? `
    <div class="tunnels-table-wrap">
      <table class="tunnels-table">
        <thead>
          <tr>
            <th>${t("dashboard.tunnels.name")}</th>
            <th>${t("dashboard.tunnels.type")}</th>
            <th>${t("dashboard.tunnels.remotePort")}</th>
            <th class="text-right">${t("dashboard.stats.totalTraffic")}</th>
            <th class="text-right">${t("dashboard.stats.connections")}</th>
            <th class="text-right">${t("dashboard.tunnels.actions")}</th>
          </tr>
        </thead>
        <tbody>${tunnelRows}</tbody>
      </table>
    </div>`
      : `<div style="padding:16px 22px;color:var(--slate-400);font-size:.85rem">暂无隧道配置</div>`;

  return `<div class="client-card" data-client-id="${escapeHtml(client.id)}">
    <div class="client-card-header">
      <div class="client-info">
        <div class="client-avatar ${online ? "online" : "offline"}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <div class="client-status-dot ${online ? "online" : "offline"}"></div>
        </div>
        <div>
          <div class="client-name">${escapeHtml(client.name)}</div>
          <div class="client-meta">
            ${osBadge}
            <span style="color:var(--slate-300)">|</span>
            <span>ID: ${shortId}</span>
          </div>
          ${resBars}
        </div>
      </div>
      <div class="client-stats">
        <div class="client-stat">
          <div class="client-stat-label">↓ ${t("dashboard.clients.trafficIn")}</div>
          <div class="client-stat-value speed-in">${formatSpeed(netSpeedIn)}</div>
        </div>
        <div class="client-stat">
          <div class="client-stat-label">↑ ${t("dashboard.clients.trafficOut")}</div>
          <div class="client-stat-value speed-out">${formatSpeed(netSpeedOut)}</div>
        </div>
        <div class="client-actions">
          <button class="btn-view-log" title="${t("dashboard.clients.viewLogs")}"
            data-action="view-logs" data-client-id="${escapeHtml(client.id)}" data-client-name="${escapeHtml(client.name)}"
            ${online ? "" : "disabled"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </button>
          <button class="btn-add-tunnel"
            data-action="open-add-tunnel" data-client-id="${escapeHtml(client.id)}">
            + ${t("dashboard.clients.addTunnel")}
          </button>
        </div>
      </div>
    </div>
    ${tunnelTable}
  </div>`;
}

function resBar(percent, label, colorClass) {
  if (percent == null) return "";
  const pct = Math.max(0, Math.min(100, percent));
  return `<div class="res-bar">
    <span style="width:28px">${label}</span>
    <div class="res-bar-track"><div class="res-bar-fill ${colorClass}" style="width:${pct}%"></div></div>
    <span style="width:28px;text-align:right">${pct.toFixed(0)}%</span>
  </div>`;
}

/* =============================================================
   11. 客户端操作处理
   ============================================================= */
async function handleClientAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const clientId = btn.dataset.clientId;
  const tunnelId = btn.dataset.tunnelId;

  switch (action) {
    case "open-add-tunnel":
      openAddTunnelModal(clientId);
      break;

    case "disable-tunnel":
    case "enable-tunnel": {
      const enabled = action === "enable-tunnel";
      try {
        await api.patch(`/api/clients/${clientId}/tunnels/${tunnelId}`, {
          enabled,
        });
      } catch (err) {
        showGlobalError(err.message);
      }
      break;
    }

    case "delete-tunnel": {
      const ok = await showConfirm(t("dashboard.tunnels.confirmDelete"), {
        tone: "danger",
        confirmText: t("delete"),
      });
      if (!ok) return;
      try {
        await api.delete(`/api/clients/${clientId}/tunnels/${tunnelId}`);
      } catch (err) {
        showGlobalError(err.message);
      }
      break;
    }

    case "view-logs": {
      const clientName = btn.dataset.clientName;
      openLogTerminal(clientId, clientName);
      break;
    }
  }
}

/* =============================================================
   12. 添加隧道弹窗
   ============================================================= */
function openAddTunnelModal(clientId) {
  STATE.pendingTunnelClientId = clientId;
  // 重置表单
  $("inp-tunnel-name").value = "";
  $("inp-tunnel-type").value = "tcp";
  $("inp-local-ip").value = "127.0.0.1";
  $("inp-local-port").value = "";
  $("inp-remote-port").value = "";
  $("inp-custom-domains").value = "";
  $("inp-custom-domains").disabled = true;
  $("inp-remote-port").disabled = false;
  hideAlert("add-tunnel-error");
  openModal("modal-add-tunnel");
}

$("inp-tunnel-type").addEventListener("change", function () {
  const type = this.value;
  const isHttp = type === "http" || type === "https";
  $("inp-remote-port").disabled = isHttp;
  $("inp-custom-domains").disabled = !isHttp;
});

$("add-tunnel-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientId = STATE.pendingTunnelClientId;
  if (!clientId) return;

  const name = $("inp-tunnel-name").value.trim();
  const type = $("inp-tunnel-type").value;
  const local_ip = $("inp-local-ip").value.trim() || "127.0.0.1";
  const local_port = parseInt($("inp-local-port").value, 10);
  const remote_port_raw = $("inp-remote-port").value;
  const remote_port = remote_port_raw ? parseInt(remote_port_raw, 10) : null;
  const custom_domains = $("inp-custom-domains").value.trim() || null;

  if (!name || !Number.isFinite(local_port)) {
    showAlert("add-tunnel-error", "请填写隧道名称和本地端口");
    return;
  }
  if ((type === "tcp" || type === "udp") && !Number.isFinite(remote_port)) {
    showAlert("add-tunnel-error", "请填写远程端口");
    return;
  }
  if ((type === "http" || type === "https") && !custom_domains) {
    showAlert("add-tunnel-error", "请填写自定义域名");
    return;
  }

  const btn = $("btn-add-tunnel-submit");
  btn.disabled = true;
  hideAlert("add-tunnel-error");
  try {
    await api.post(`/api/clients/${clientId}/tunnels/`, {
      name,
      type,
      local_ip,
      local_port,
      remote_port: type === "tcp" || type === "udp" ? remote_port : null,
      custom_domains:
        type === "http" || type === "https" ? custom_domains : null,
    });
    closeModal("modal-add-tunnel");
  } catch (err) {
    showAlert("add-tunnel-error", err.message);
  } finally {
    btn.disabled = false;
  }
});

/* =============================================================
   13. 日志终端
   ============================================================= */
function openLogTerminal(clientId, clientName) {
  STATE.logClientId = clientId;
  STATE.logLines = [];
  STATE.logPaused = false;
  setText("log-client-name", clientName || clientId);
  $("log-lines").innerHTML = "";
  show("log-empty");
  $("log-status-badge").textContent = "OFFLINE";
  $("log-status-badge").className = "badge badge-danger";
  $("btn-log-pause").textContent = "⏸";
  openModal("modal-log-terminal");
  connectLogWs(clientId);
}

function connectLogWs(clientId) {
  if (STATE.logWs) {
    STATE.logWs.onclose = null;
    STATE.logWs.close();
    STATE.logWs = null;
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const token = getToken();
  let url = `${proto}//${location.host}/ws/logs/${clientId}`;
  if (token) url += `?token=${token}`;

  const ws = new WebSocket(url);
  STATE.logWs = ws;

  ws.onopen = () => {
    $("log-status-badge").textContent = "LIVE";
    $("log-status-badge").className = "badge badge-success";
    hide("log-empty");
    appendLogLine("info", `Connected to log stream…`);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type !== "log" && msg.type !== "info") return;
      appendLogLine(msg.type || "log", msg.data || "");
    } catch {
      appendLogLine("log", e.data);
    }
  };

  ws.onclose = (ev) => {
    $("log-status-badge").textContent = "OFFLINE";
    $("log-status-badge").className = "badge badge-danger";
    appendLogLine("info", `Connection closed (${ev.code}).`);
  };

  ws.onerror = () => {
    appendLogLine("error", "WebSocket error.");
  };
}

function appendLogLine(type, content) {
  if (STATE.logPaused) return;
  STATE.logLines.push({ type, content });
  if (STATE.logLines.length > 1000)
    STATE.logLines.splice(0, STATE.logLines.length - 1000);

  const container = $("log-lines");
  if (!container) return;
  const span = document.createElement("span");
  span.className = "log-line log-" + type;
  span.textContent = content;
  container.appendChild(span);

  // 自动滚动
  const body = $("log-body");
  if (body) body.scrollTop = body.scrollHeight;

  // DOM 清理防止太多元素
  while (container.childNodes.length > 1000) {
    container.removeChild(container.firstChild);
  }
}

$("btn-log-pause").addEventListener("click", () => {
  STATE.logPaused = !STATE.logPaused;
  $("btn-log-pause").textContent = STATE.logPaused ? "▶" : "⏸";
});

$("btn-log-clear").addEventListener("click", () => {
  STATE.logLines = [];
  $("log-lines").innerHTML = "";
});

$("btn-log-download").addEventListener("click", () => {
  const text = STATE.logLines.map((l) => l.content).join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `frp-logs-${STATE.logClientId}-${new Date().toISOString().slice(0, 19)}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// 关闭日志弹窗时断开 WS
document
  .querySelector('[data-modal="modal-log-terminal"]')
  ?.addEventListener("click", () => {
    if (STATE.logWs) {
      STATE.logWs.onclose = null;
      STATE.logWs.close();
      STATE.logWs = null;
    }
  });

/* =============================================================
   14. WebSocket 实时状态处理
   ============================================================= */
function onDashboardMessage(msg) {
  if (msg.type !== "dashboard") return;
  const { status, registered_clients, agents } = msg.data || {};
  const nowSec = Math.floor(Date.now() / 1000);

  const agentMap = {};
  (agents || []).forEach((a) => {
    agentMap[a.client_id] = a;
  });

  // 丰富客户端数据
  const enriched = (registered_clients || []).map((c) => ({
    ...c,
    is_online:
      agentMap[c.id]?.is_online || (c.last_seen && nowSec - c.last_seen < 90),
    cpu_percent: agentMap[c.id]?.cpu_percent,
    memory_percent: agentMap[c.id]?.memory_percent,
    disk_percent: agentMap[c.id]?.disk_percent,
    net_speed_in: agentMap[c.id]?.net_speed_in,
    net_speed_out: agentMap[c.id]?.net_speed_out,
  }));

  STATE.registeredClients = enriched;
  STATE.disabledPorts = msg.data.disabled_ports || [];

  if (status?.success) {
    STATE.serverInfo = status.server_info || {};
    STATE.frpProxies = status.proxies || [];
  }

  // 计算统计
  const configuredTunnels = enriched.reduce(
    (acc, c) => acc + (c.tunnels?.length || 0),
    0,
  );
  const onlineClients = enriched.filter((c) => c.is_online).length;
  const onlineAgents = (agents || []).filter((a) => a.is_online).length;
  const machineTrafficIn = enriched.reduce(
    (s, c) => s + (c.net_bytes_in || 0),
    0,
  );
  const machineTrafficOut = enriched.reduce(
    (s, c) => s + (c.net_bytes_out || 0),
    0,
  );

  STATE.stats = {
    totalClients: Math.max(STATE.serverInfo.clientCounts || 0, enriched.length),
    onlineClients,
    totalProxies: configuredTunnels,
    activeProxies: status?.proxies?.length || 0,
    onlineAgents,
    machineTrafficIn,
    machineTrafficOut,
  };

  renderStats();
  renderClients();
}

/* =============================================================
   15. 修改密码弹窗
   ============================================================= */
$("btn-change-pwd").addEventListener("click", () => {
  $("inp-old-pwd").value = "";
  $("inp-new-pwd").value = "";
  $("inp-confirm-pwd").value = "";
  hideAlert("change-pwd-error");
  $("change-pwd-form").classList.remove("hidden");
  $("change-pwd-success").classList.add("hidden");
  openModal("modal-change-pwd");
});

$("change-pwd-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const oldPwd = $("inp-old-pwd").value;
  const newPwd = $("inp-new-pwd").value;
  const confirmPwd = $("inp-confirm-pwd").value;
  hideAlert("change-pwd-error");

  if (newPwd !== confirmPwd) {
    showAlert("change-pwd-error", t("changePassword.errorMismatch"));
    return;
  }

  const btn = $("btn-pwd-submit");
  btn.disabled = true;
  btn.textContent = t("changePassword.submitting");

  try {
    await api.post(
      "/api/auth/change-password?old_password=" +
        encodeURIComponent(oldPwd) +
        "&new_password=" +
        encodeURIComponent(newPwd),
      null,
    );
    $("change-pwd-form").classList.add("hidden");
    $("change-pwd-success").classList.remove("hidden");
    // 成功后 2 秒关闭并登出
    setTimeout(() => {
      closeModal("modal-change-pwd");
      handleLogout();
    }, 2000);
  } catch (err) {
    showAlert(
      "change-pwd-error",
      err.message || t("changePassword.errorFailed"),
    );
    btn.disabled = false;
    btn.textContent = t("changePassword.submit");
  }
});

/* =============================================================
   16. 错误横幅
   ============================================================= */
function showGlobalError(msg) {
  setText("error-text", msg);
  show("error-banner");
}
$("btn-dismiss-error").addEventListener("click", () => hide("error-banner"));

/* =============================================================
   17. 设置向导
   ============================================================= */
let setupStep = 1;
let deployResult = null;
let selectedPlatform = null;

function goSetupStep(n) {
  setupStep = n;
  [1, 2, 3].forEach((i) => {
    const el = $(`setup-step-${i}`);
    if (el) el.classList.toggle("hidden", i !== n);
    const dot = $(`step-dot-${i}`);
    if (dot) {
      dot.classList.toggle("active", i === n);
      dot.classList.toggle("done", i < n);
    }
  });
}

// 检测公网 IP
async function detectPublicIp() {
  const badge = $("ip-detect-status");
  if (badge) {
    badge.textContent = t("setup.detectingIp");
    badge.className = "badge badge-info";
  }
  try {
    const res = await api.get("/api/system/public-ip");
    if (res.success && res.ip) {
      $("inp-serverip").value = res.ip.trim();
      if (badge) {
        badge.textContent = t("setup.autoDetected");
        badge.className = "badge badge-success";
      }
    } else {
      if (badge) {
        badge.textContent = t("setup.ipDetectFailed");
        badge.className = "badge badge-warning";
      }
    }
  } catch {
    if (badge) {
      badge.textContent = t("setup.ipDetectFailed");
      badge.className = "badge badge-warning";
    }
  }
}

$("btn-deploy").addEventListener("click", async () => {
  const serverIp = $("inp-serverip").value.trim();
  const port = parseInt($("inp-port").value, 10) || 7000;
  if (!serverIp) {
    showAlert("setup-error", t("setup.serverIpRequired"));
    return;
  }
  hideAlert("setup-error");
  const btn = $("btn-deploy");
  btn.disabled = true;
  btn.textContent = t("setup.deploying");

  try {
    const res = await api.post(
      `/api/frp/deploy-server?port=${port}&server_ip=${encodeURIComponent(serverIp)}`,
      null,
    );
    if (res.success) {
      deployResult = { ...res.info, frps_restarted: res.frps_restarted };
      $("info-version").textContent = deployResult.version || "—";
      $("info-port").textContent = deployResult.port || port;
      $("info-ip").textContent = deployResult.server_ip || serverIp;
      $("info-token").textContent = deployResult.token || "—";
      if (res.frps_restarted) {
        $("frps-restart-notice").textContent = t("setup.frpsRestarted");
        show("frps-restart-notice");
      }
      goSetupStep(2);
    } else {
      showAlert("setup-error", res.message || t("setup.deployFailed"));
    }
  } catch (err) {
    showAlert("setup-error", err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t("setup.deployButton");
  }
});

$("btn-copy-token").addEventListener("click", async () => {
  const token = $("info-token").textContent;
  if (await copyText(token)) {
    $("btn-copy-token").textContent = t("setup.copied");
    setTimeout(() => setText("btn-copy-token", t("copy")), 2000);
  }
});

$("btn-step3").addEventListener("click", () => {
  selectedPlatform = null;
  hide("script-area");
  goSetupStep(3);
});

// 设置向导平台按钮
$$(".platform-btn", $("setup-step-3")).forEach((btn) => {
  btn.addEventListener("click", async () => {
    selectedPlatform = btn.dataset.platform;
    $("script-platform-label").textContent = selectedPlatform;
    $("script-content").textContent = "加载中…";
    show("script-area");
    try {
      const script = await api.get(
        `/api/agent/install-script/${selectedPlatform}`,
      );
      $("script-content").textContent =
        typeof script === "string" ? script : JSON.stringify(script);
    } catch (err) {
      $("script-content").textContent = `# 获取失败: ${err.message}`;
    }
  });
});

$("btn-copy-script").addEventListener("click", async () => {
  const content = $("script-content").textContent;
  if (await copyText(content)) {
    setText("btn-copy-script", t("setup.scriptCopied"));
    setTimeout(() => setText("btn-copy-script", t("copy")), 2000);
  }
});

$("btn-download-script").addEventListener("click", () => {
  const content = $("script-content").textContent;
  const ext = selectedPlatform === "windows" ? "ps1" : "sh";
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deploy-frpc.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

$("btn-finish-setup").addEventListener("click", async () => {
  // 重新检查系统状态后进入面板
  try {
    const st = await api.get("/api/system/status");
    if (st.frps_deployed) {
      startDashboard();
    } else {
      goSetupStep(1);
    }
  } catch {
    startDashboard();
  }
});

/* =============================================================
   18. Agent 部署弹窗（从仪表盘打开）
   ============================================================= */
let agentScriptPlatform = null;

async function openAgentDeploy() {
  agentScriptPlatform = null;
  show("agent-platform-select");
  hide("agent-script-area");
  hide("btn-agent-done");
  openModal("modal-agent-deploy");

  // 获取服务器信息
  try {
    const info = await api.get("/api/agent/install-script-info");
    const infoEl = $("agent-server-info");
    if (info && infoEl) {
      infoEl.innerHTML = `
        <div class="info-row"><span>服务器地址</span><code>${escapeHtml(info.server_ip || "—")}</code></div>
        <div class="info-row"><span>FRPS 端口</span><code>${escapeHtml(String(info.frps_port || "—"))}</code></div>
        <div class="info-row"><span>FRP 版本</span><code>v${escapeHtml(info.frps_version || "—")}</code></div>`;
    }
  } catch {}
}

$$(".platform-btn", $("modal-agent-deploy")).forEach((btn) => {
  btn.addEventListener("click", async () => {
    agentScriptPlatform = btn.dataset.platform;
    hide("agent-platform-select");
    show("agent-script-area");
    show("btn-agent-done");
    $("agent-platform-label").textContent = agentScriptPlatform;
    $("agent-script-content").textContent = "加载中…";
    try {
      const script = await api.get(
        `/api/agent/install-script/${agentScriptPlatform}`,
      );
      $("agent-script-content").textContent =
        typeof script === "string" ? script : JSON.stringify(script);
    } catch (err) {
      $("agent-script-content").textContent = `# 获取失败: ${err.message}`;
    }
  });
});

$("btn-agent-back").addEventListener("click", () => {
  show("agent-platform-select");
  hide("agent-script-area");
  hide("btn-agent-done");
});

$("btn-copy-agent-script").addEventListener("click", async () => {
  const content = $("agent-script-content").textContent;
  if (await copyText(content)) {
    setText("btn-copy-agent-script", t("copySuccess"));
    setTimeout(() => setText("btn-copy-agent-script", t("copy")), 2000);
  }
});

$("btn-download-agent-script").addEventListener("click", () => {
  const content = $("agent-script-content").textContent;
  const ext = agentScriptPlatform === "windows" ? "ps1" : "sh";
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deploy-frpc.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

$("btn-agent-done").addEventListener("click", () =>
  closeModal("modal-agent-deploy"),
);

/* =============================================================
   19. 登录流程
   ============================================================= */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert("login-error");
  const btn = $("btn-login");
  btn.disabled = true;
  btn.textContent = t("login.submitting");

  const params = new URLSearchParams();
  params.set("username", $("inp-username").value);
  params.set("password", $("inp-password").value);

  try {
    const res = await api.post("/api/auth/token", params);
    const token = res.access_token;
    localStorage.setItem("token", token);
    await checkAuthAndRoute();
  } catch (err) {
    showAlert("login-error", t("login.error"));
  } finally {
    btn.disabled = false;
    btn.textContent = t("login.submit");
  }
});

/* =============================================================
   20. 登出
   ============================================================= */
function handleLogout() {
  WS.disconnect();
  if (STATE.logWs) {
    STATE.logWs.onclose = null;
    STATE.logWs.close();
    STATE.logWs = null;
  }
  localStorage.removeItem("token");
  showView("view-login");
}

$("btn-logout").addEventListener("click", handleLogout);

/* =============================================================
   21. 语言切换
   ============================================================= */
$("btn-lang").addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh";
  localStorage.setItem("lang", lang);
  $("btn-lang").textContent = lang === "zh" ? "EN" : "中";
  applyTranslations();
  renderStats();
  renderClients();
});

function applyTranslations() {
  // 导航
  setText("nav-title", t("dashboard.title"));
  // 统计
  setText("stat-label-clients", t("dashboard.stats.totalClients"));
  setText("stat-label-online", t("dashboard.stats.onlineClients"));
  setText("stat-label-traffic-in", t("dashboard.stats.totalTraffic") + " (↓)");
  setText("stat-label-traffic-out", t("dashboard.stats.totalTraffic") + " (↑)");
  // 客户端区块
  setText("clients-section-title", t("dashboard.clients.title"));
  setText("clients-empty-text", t("dashboard.clients.empty"));
  // 登录
  setText("lbl-username", t("login.username"));
  setText("lbl-password", t("login.password"));
  setText("btn-login", t("login.submit"));
  $("inp-username").placeholder = t("login.usernamePlaceholder");
  // 设置向导
  setText("setup-title", t("setup.title"));
  setText("setup-subtitle", t("setup.subtitle"));
  setText("lbl-port", t("setup.portLabel"));
  setText("btn-deploy", t("setup.deployButton"));
  setText("step-lbl-1", t("setup.step1"));
  setText("step-lbl-2", t("setup.step2"));
  setText("step-lbl-3", t("setup.step3"));
  // 修改密码
  setText("modal-change-pwd-title", t("changePassword.title"));
  setText("lbl-old-pwd", t("changePassword.oldPassword"));
  setText("lbl-new-pwd", t("changePassword.newPassword"));
  setText("lbl-confirm-pwd", t("changePassword.confirmPassword"));
  setText("btn-pwd-submit", t("changePassword.submit"));
}

/* =============================================================
   22. 路由
   ============================================================= */
async function checkAuthAndRoute() {
  const token = getToken();
  if (!token) {
    showView("view-login");
    return;
  }

  try {
    const st = await api.get("/api/system/status");
    if (!st.frps_deployed) {
      showView("view-setup");
      detectPublicIp();
      goSetupStep(1);
      return;
    }
    startDashboard();
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem("token");
      showView("view-login");
    } else {
      // 网络错误，仍然尝试显示面板
      startDashboard();
    }
  }
}

function startDashboard() {
  showView("view-dashboard");
  applyTranslations();
  renderStats();
  hide("clients-empty");
  $("clients-list").innerHTML = "";
  WS.connect("/ws/dashboard", onDashboardMessage);
}

/* =============================================================
   23. 初始化
   ============================================================= */
window.addEventListener("DOMContentLoaded", async () => {
  applyTranslations();
  $("btn-lang").textContent = lang === "zh" ? "EN" : "中";

  // 淡出加载屏幕
  const hideLoading = () => {
    const ls = $("loading-screen");
    if (ls) {
      ls.classList.add("fade-out");
      setTimeout(() => ls.classList.add("hidden"), 310);
    }
  };

  await checkAuthAndRoute();
  hideLoading();
});
