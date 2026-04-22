/**
 * FRP Manager — 应用入口
 * ES Module 架构，零构建工具
 */
import { $, $$, setText, show, hide } from './js/dom.js';
import { api, getToken, setOn403Handler } from './js/api.js';
import { t, lang, setLang } from './js/i18n.js';
import { STATE } from './js/state.js';
import { WS } from './js/ws.js';
import { openModal, closeModal } from './js/modal.js';
import { renderStats, renderClients, onDashboardMessage, initTunnelForm, initLogControls } from './js/dashboard.js';
import { initAuth, openForcedPasswordChange } from './js/auth.js';
import { initSetup, goSetupStep } from './js/setup.js';
import { initSettings } from './js/settings.js';
import { initAgent, openAgentDeploy as _openAgentDeploy, confirmCleanupAgentClient, getAgentCreatedClientId } from './js/agent.js';

/* ---- 暴露给 HTML onclick 的全局函数 ---- */
window.openAgentDeploy = _openAgentDeploy;

/* ---- 视图切换 ---- */
function showView(viewId) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = $(viewId);
  if (el) el.classList.add("active");
}

/* ---- 语言切换 ---- */
function applyTranslations() {
  setText("nav-title", t("dashboard.title"));
  setText("stat-label-clients", t("dashboard.stats.totalClients"));
  setText("stat-label-online", t("dashboard.stats.onlineClients"));
  setText("stat-label-traffic-in", t("dashboard.stats.totalTraffic") + " (↓)");
  setText("stat-label-traffic-out", t("dashboard.stats.totalTraffic") + " (↑)");
  setText("clients-section-title", t("dashboard.clients.title"));
  setText("clients-empty-text", t("dashboard.clients.empty"));
  setText("lbl-username", t("login.username"));
  setText("lbl-password", t("login.password"));
  setText("btn-login", t("login.submit"));
  $("inp-username").placeholder = t("login.usernamePlaceholder");
  setText("setup-title", t("setup.title"));
  setText("setup-subtitle", t("setup.subtitle"));
  setText("lbl-port", t("setup.portLabel"));
  setText("btn-deploy", t("setup.deployButton"));
  setText("step-lbl-1", t("setup.step1"));
  setText("step-lbl-2", t("setup.step2"));
  setText("step-lbl-3", t("setup.step3"));
  setText("modal-change-pwd-title", t("changePassword.title"));
  setText("lbl-old-pwd", t("changePassword.oldPassword"));
  setText("lbl-new-pwd", t("changePassword.newPassword"));
  setText("lbl-confirm-pwd", t("changePassword.confirmPassword"));
  setText("btn-pwd-submit", t("changePassword.submit"));
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
  const token = getToken();
  if (!token) {
    showView("view-login");
    return;
  }

  if (localStorage.getItem("require_pwd_change") === "1") {
    showView("view-login");
    openForcedPasswordChange();
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

/* ---- 弹窗全局关闭代理 ---- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-close-modal");
  if (btn) {
    const modalId = btn.dataset.modal;
    if (modalId && !($(modalId) && $(modalId).dataset.forced === "1")) {
      if (modalId === "modal-agent-deploy" && getAgentCreatedClientId()) {
        confirmCleanupAgentClient();
        return;
      }
      closeModal(modalId);
    }
  }
});

/* ---- 初始化 ---- */
window.addEventListener("DOMContentLoaded", async () => {
  // 注入 403 回调（打破 api.js ↔ auth.js 循环依赖）
  setOn403Handler(() => openForcedPasswordChange());

  // 初始化各子模块
  initAuth(checkAuthAndRoute);
  initSetup(startDashboard);
  initSettings();
  initAgent();
  initTunnelForm();
  initLogControls();

  // 语言切换
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
