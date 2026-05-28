/**
 * FRP ALL IN ONE — 应用入口
 * ES Module 架构，零构建工具
 */
import { $, $$, setText, show, hide } from './js/dom.js';
import { api, getToken } from './js/api.js';
import { t, lang, setLang } from './js/i18n.js';
import { STATE } from './js/state.js';
import { WS } from './js/ws.js';
import { openModal, closeModal } from './js/modal.js';
import { renderStats, renderClients, onDashboardMessage, initTunnelForm, initLogControls } from './js/dashboard.js';
import { initAuth, handleLogout, extractTokenFromHash, extractErrorFromQuery } from './js/auth.js';
import { initSetup, goSetupStep } from './js/setup.js';
import { initSettings } from './js/settings.js';
import { initAgent, openAgentDeploy as _openAgentDeploy, confirmCleanupAgentClient, getAgentCreatedClientId } from './js/agent.js';

/* ---- 视图切换 ---- */
function showView(viewId) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = $(viewId);
  if (el) el.classList.add("active");
}

/* ---- 语言切换 ---- */
function applyTranslations() {
  // Navbar
  setText("nav-title", t("dashboard.title"));

  // Stats
  setText("stat-label-clients", t("dashboard.stats.totalClients"));
  setText("stat-label-online", t("dashboard.stats.onlineClients"));
  setText("stat-label-traffic-in", t("dashboard.stats.trafficIn"));
  setText("stat-label-traffic-out", t("dashboard.stats.trafficOut"));

  // Client list
  setText("clients-section-title", t("dashboard.clients.title"));
  setText("clients-empty-text", t("dashboard.clients.empty"));

  // Login
  setText("btn-github-login-text", t("login.submit"));
  setText("login-hint", t("login.hint"));

  // Setup
  setText("setup-title", t("setup.title"));
  setText("setup-subtitle", t("setup.subtitle"));
  setText("lbl-port", t("setup.portLabel"));
  setText("btn-deploy", t("setup.deployButton"));
  setText("step-lbl-0", t("setup.mode"));
  setText("step-lbl-1", t("setup.step1"));
  setText("step-lbl-2", t("setup.step2"));
  setText("step-lbl-3", t("setup.step3"));

  // Admin modal
  setText("modal-admin-title", t("adminManage.title"));
  setText("admin-list-title", t("adminManage.admins"));
  setText("invite-title", t("adminManage.inviteButton"));
  const inviteInput = $("inp-invite-username");
  if (inviteInput) inviteInput.placeholder = t("adminManage.invitePlaceholder");
  setText("invite-list-title", t("adminManage.invites"));

  // Tunnel modal
  setText("modal-tunnel-title", t("dashboard.tunnels.name"));
  setText("lbl-tunnel-name", t("dashboard.tunnels.name"));
  setText("lbl-tunnel-type", t("dashboard.tunnels.type"));
  setText("lbl-remote-port", t("dashboard.tunnels.remotePort"));

  // Settings modal
  setText("modal-panel-settings-title", t("settings.title"));
  setText("lbl-panel-access-port", t("settings.natPort"));
  setText("lbl-panel-domain", t("settings.domain"));
  const natPortInput = $("inp-panel-access-port");
  if (natPortInput) natPortInput.placeholder = t("settings.natPortPlaceholder");
  const domainInput = $("inp-panel-domain");
  if (domainInput) domainInput.placeholder = t("settings.domainPlaceholder");

  // data-i18n attribute support
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const translated = t(key);
    if (translated !== key) el.textContent = translated;
  });
  // data-i18n-title attribute support
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const translated = t(key);
    if (translated !== key) el.title = translated;
  });
}

/* ---- 仪表盘入口 ---- */
function startDashboard() {
  showView("view-dashboard");
  applyTranslations();
  renderStats();
  hide("clients-empty");
  $("clients-list").innerHTML = "";
  WS.connect("/ws/dashboard", onDashboardMessage);
}

/* ---- 路由检查 ---- */
async function checkAuthAndRoute() {
  // 检查 GitHub OAuth 回调
  const hashResult = extractTokenFromHash();
  if (hashResult && typeof hashResult === 'object' && hashResult.error) {
    showView("view-login");
    const errorEl = $("login-error");
    if (hashResult.error === "not_invited") {
      errorEl.textContent = t("login.errorNotInvited");
    } else {
      errorEl.textContent = t("login.error");
    }
    errorEl.classList.remove("hidden");
    return;
  }

  // 检查 URL 参数中的错误
  const queryError = extractErrorFromQuery();
  if (queryError) {
    showView("view-login");
    const errorEl = $("login-error");
    if (queryError === "not_invited") {
      errorEl.textContent = t("login.errorNotInvited");
    } else {
      errorEl.textContent = t("login.error");
    }
    errorEl.classList.remove("hidden");
    return;
  }

  const token = getToken();
  if (!token) {
    showView("view-login");
    return;
  }

  try {
    const st = await api.get("/api/system/status");
    if (!st.frps_deployed) {
      showView("view-setup");
      goSetupStep(0);
      return;
    }
    startDashboard();
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem("token");
      showView("view-login");
    } else {
      startDashboard();
    }
  }
}

/* ---- 弹窗全局关闭代理 + data-action 事件委托 ---- */
document.addEventListener("click", (e) => {
  // Modal close buttons
  const btn = e.target.closest(".btn-close-modal");
  if (btn) {
    const modalId = btn.dataset.modal;
    if (modalId) {
      if (modalId === "modal-agent-deploy" && getAgentCreatedClientId()) {
        confirmCleanupAgentClient();
        return;
      }
      closeModal(modalId);
    }
  }

  // data-action delegation
  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === "open-agent-deploy") {
      _openAgentDeploy();
    }
  }
});

/* ---- 初始化 ---- */
window.addEventListener("DOMContentLoaded", async () => {
  initAuth(checkAuthAndRoute);
  initSetup(startDashboard);
  initSettings();
  initAgent();
  initTunnelForm();
  initLogControls();

  $("btn-lang").addEventListener("click", () => {
    const newLang = lang === "zh" ? "en" : "zh";
    setLang(newLang);
    $("btn-lang").textContent = newLang === "zh" ? "EN" : "中";
    applyTranslations();
    renderStats();
    renderClients();
  });

  applyTranslations();
  $("btn-lang").textContent = lang === "zh" ? "EN" : "中";

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
