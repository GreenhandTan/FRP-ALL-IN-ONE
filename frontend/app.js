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
import { renderStats, renderClients, renderOverviewDevices, renderDeviceStats, initDeviceSearch, clearDeviceSearch, onDashboardMessage, initTunnelForm, initLogControls } from './js/dashboard.js';
import { initAuth, handleLogout, extractTokenFromHash, extractErrorFromQuery } from './js/auth.js';
import { initSetup, goSetupStep } from './js/setup.js';
import { initSettings, initSettingsPage } from './js/settings.js';
import { initAgent, openAgentDeploy as _openAgentDeploy, confirmCleanupAgentClient, getAgentCreatedClientId } from './js/agent.js';

/* ---- 视图切换 ---- */
function showView(viewId) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = $(viewId);
  if (el) el.classList.add("active");
}

/* ---- 页面切换 (侧边栏导航) ---- */
let currentPage = "overview";

export function showPage(pageId) {
  currentPage = pageId;
  // 切换页面分区
  $$(".page-section").forEach((s) => s.classList.remove("active"));
  const section = $(`page-${pageId}`);
  if (section) section.classList.add("active");

  // 切换侧边栏 active 状态
  $$(".sidebar-nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageId);
  });

  // 页面特定初始化
  if (pageId === "overview") {
    renderOverviewDevices();
  } else if (pageId === "devices") {
    clearDeviceSearch();
    renderDeviceStats();
    renderClients();
  } else if (pageId === "settings") {
    initSettingsPage();
  }

  // 移动端关闭侧边栏
  closeMobileSidebar();
}

/* ---- 移动端侧边栏 ---- */
function openMobileSidebar() {
  const sidebar = $("sidebar");
  const overlay = $(".sidebar-overlay");
  if (sidebar) sidebar.classList.add("open");
  if (overlay) overlay.classList.add("active");
}

function closeMobileSidebar() {
  const sidebar = $("sidebar");
  const overlay = $(".sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

/* ---- 语言切换 ---- */
function applyTranslations() {
  setText("nav-title", t("dashboard.title"));
  setText("clients-section-title", t("dashboard.clients.title"));
  setText("clients-empty-text", t("dashboard.clients.empty"));
  setText("btn-github-login-text", t("login.submit"));

  // data-i18n attribute support
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const translated = t(key);
    if (translated !== key) el.textContent = translated;
  });
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
  // 默认显示概览页
  showPage("overview");
  renderStats();
  WS.connect("/ws/dashboard", onDashboardMessage);
}

/* ---- 路由检查 ---- */
async function checkAuthAndRoute() {
  const hashResult = extractTokenFromHash();
  if (hashResult && typeof hashResult === 'object' && hashResult.error) {
    showView("view-login");
    const errorEl = $("login-error");
    if (hashResult.error === "not_authorized") {
      errorEl.textContent = t("login.errorNotAuthorized");
    } else {
      errorEl.textContent = t("login.error");
    }
    errorEl.classList.remove("hidden");
    return;
  }

  const queryError = extractErrorFromQuery();
  if (queryError) {
    showView("view-login");
    const errorEl = $("login-error");
    if (queryError === "not_authorized") {
      errorEl.textContent = t("login.errorNotAuthorized");
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

  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === "open-agent-deploy") {
      _openAgentDeploy();
    }
  }

  // 侧边栏导航
  const navLink = e.target.closest(".sidebar-nav-link");
  if (navLink) {
    e.preventDefault();
    const page = navLink.dataset.page;
    if (page) showPage(page);
  }

  // 移动端汉堡菜单
  const hamburger = e.target.closest(".mobile-hamburger");
  if (hamburger) {
    openMobileSidebar();
  }

  // 移动端侧边栏遮罩
  const overlay = e.target.closest(".sidebar-overlay");
  if (overlay) {
    closeMobileSidebar();
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
  initDeviceSearch();

  // 语言切换按钮（桌面端和移动端）
  const langBtns = [$("btn-lang"), $("btn-lang-mobile")];
  langBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener("click", () => {
        const newLang = lang === "zh" ? "en" : "zh";
        setLang(newLang);
        langBtns.forEach(b => { if (b) b.textContent = newLang === "zh" ? "EN" : "中"; });
        applyTranslations();
        renderStats();
        renderClients();
      });
      btn.textContent = lang === "zh" ? "EN" : "中";
    }
  });

  applyTranslations();

  const hideLoading = () => {
    const ls = $("loading-screen");
    if (ls) {
      ls.style.opacity = "0";
      setTimeout(() => { ls.style.display = "none"; }, 310);
    }
  };

  await checkAuthAndRoute();
  hideLoading();
});
