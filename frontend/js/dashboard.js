/**
 * 仪表盘渲染 + WebSocket 消息路由模块
 */
import { $, $$, setText, show, hide, showAlert, hideAlert } from './dom.js';
import { api, getToken } from './api.js';
import { t } from './i18n.js';
import { STATE } from './state.js';
import { formatBytes, formatSpeed, escapeHtml } from './utils.js';
import { openModal, closeModal, showConfirm, showGlobalError } from './modal.js';

/* ---- 统计卡片渲染 ---- */
export function renderStats() {
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

/* ---- 客户端卡片渲染 ---- */
export function renderClients() {
  const list = $("clients-list");
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

function resBar(percent, label, colorClass) {
  if (percent == null) return "";
  const pct = Math.max(0, Math.min(100, percent));
  return `<div class="res-bar">
    <span style="width:28px">${label}</span>
    <div class="res-bar-track"><div class="res-bar-fill ${colorClass}" style="width:${pct}%"></div></div>
    <span style="width:28px;text-align:right">${pct.toFixed(0)}%</span>
  </div>`;
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

/* ---- 客户端操作 ---- */
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

/* ---- 添加隧道弹窗 ---- */
function openAddTunnelModal(clientId) {
  STATE.pendingTunnelClientId = clientId;
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

export function initTunnelForm() {
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
}

/* ---- 日志终端 ---- */

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

export function initLogControls() {
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
}

/* ---- WebSocket 消息路由 ---- */
function _recalcStats() {
  const onlineClients = STATE.registeredClients.filter((c) => c.is_online).length;
  const configuredTunnels = STATE.registeredClients.reduce(
    (acc, c) => acc + (c.tunnels?.length || 0), 0
  );
  const machineTrafficIn  = STATE.registeredClients.reduce((s, c) => s + (c.net_bytes_in  || 0), 0);
  const machineTrafficOut = STATE.registeredClients.reduce((s, c) => s + (c.net_bytes_out || 0), 0);
  STATE.stats = {
    totalClients:    STATE.registeredClients.length,
    onlineClients,
    totalProxies:    configuredTunnels,
    activeProxies:   STATE.frpProxies?.length || 0,
    onlineAgents:    onlineClients,
    machineTrafficIn,
    machineTrafficOut,
  };
}

function _updateClientMetricsDom(clientId, data) {
  const card = document.querySelector(`#clients-list [data-client-id="${CSS.escape(clientId)}"]`);
  if (!card) return;

  const resBarsEl = card.querySelector(".client-res-bars");
  if (resBarsEl && data.cpu_percent != null) {
    resBarsEl.innerHTML =
      resBar(data.cpu_percent,    "CPU",  "cpu")  +
      resBar(data.memory_percent, "Mem",  "mem")  +
      resBar(data.disk_percent,   "Disk", "disk");
  }

  const speedInEl  = card.querySelector(".speed-in");
  const speedOutEl = card.querySelector(".speed-out");
  if (speedInEl)  speedInEl.textContent  = formatSpeed(data.net_speed_in  || 0);
  if (speedOutEl) speedOutEl.textContent = formatSpeed(data.net_speed_out || 0);
}

function handleFullSync(data) {
  const { registered_clients, disabled_ports, frps_status, conflict_events } = data || {};
  STATE.registeredClients = registered_clients || [];
  STATE.disabledPorts     = disabled_ports     || [];

  if (frps_status?.success) {
    STATE.serverInfo = frps_status.server_info || {};
    STATE.frpProxies = frps_status.proxies     || [];
  }

  if (conflict_events && conflict_events.length > 0) {
    const latest = conflict_events[conflict_events.length - 1];
    if (latest.time !== STATE._lastDismissedConflictTime) {
      STATE._lastShownConflictTime = latest.time;
      const banner = $("error-banner");
      if (banner) {
        $("error-text").textContent = "⚠️ 设备冲突：" + latest.message;
        banner.classList.remove("hidden");
      }
    }
  }

  _recalcStats();
  renderStats();
  renderClients();
}

function handleMetricsUpdate(clientId, data) {
  if (!clientId || !data) return;
  const client = STATE.registeredClients.find((c) => c.id === clientId);
  if (!client) return;

  Object.assign(client, data);

  _recalcStats();
  renderStats();
  _updateClientMetricsDom(clientId, data);
}

function handleClientEvent(clientId, isOnline) {
  const client = STATE.registeredClients.find((c) => c.id === clientId);
  if (!client) return;

  client.is_online = isOnline;
  _recalcStats();
  renderStats();

  const nowSec = Math.floor(Date.now() / 1000);
  const proxiesByName = {};
  (STATE.frpProxies || []).forEach((p) => { if (p?.name) proxiesByName[p.name] = p; });

  const existingCard = document.querySelector(
    `#clients-list [data-client-id="${CSS.escape(clientId)}"]`
  );
  if (existingCard) {
    const tmp = document.createElement("div");
    tmp.innerHTML = renderClientCard(client, proxiesByName, nowSec);
    const newCard = tmp.firstElementChild;
    existingCard.replaceWith(newCard);
    newCard.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", handleClientAction);
    });
  }
}

function handleFrpsStatus(data) {
  if (!data?.success) return;
  STATE.serverInfo = data.server_info || {};
  STATE.frpProxies = data.proxies     || [];
  _recalcStats();
  renderStats();
}

export function onDashboardMessage(msg) {
  switch (msg.type) {
    case "full_sync":
      handleFullSync(msg.data);
      break;
    case "metrics_update":
      handleMetricsUpdate(msg.client_id, msg.data);
      break;
    case "client_event":
      handleClientEvent(msg.client_id, msg.is_online);
      break;
    case "frps_status":
      handleFrpsStatus(msg.data);
      break;
    case "ping":
      break;
    case "dashboard":
      handleFullSync(msg.data);
      break;
    default:
      break;
  }
}
