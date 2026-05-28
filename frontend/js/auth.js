/**
 * 认证模块：GitHub OAuth 登录、登出
 */
import { $ } from './dom.js';
import { WS } from './ws.js';
import { STATE } from './state.js';

/** 从 URL fragment 中提取 access_token（GitHub OAuth 回调后） */
export function extractTokenFromHash() {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.substring(1));
  const token = params.get("access_token");
  if (token) {
    localStorage.setItem("token", token);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return token;
  }
  const error = params.get("error");
  if (error) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return { error };
  }
  return null;
}

/** 从 URL 参数中提取错误信息 */
export function extractErrorFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    window.history.replaceState(null, '', window.location.pathname);
    return error;
  }
  return null;
}

/** 登出 */
export function handleLogout() {
  WS.disconnect();
  if (STATE.logWs) {
    STATE.logWs.onclose = null;
    STATE.logWs.close();
    STATE.logWs = null;
  }
  localStorage.removeItem("token");
  showView("view-login");
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const el = $(viewId);
  if (el) el.classList.add("active");
}

/** 初始化认证相关的事件绑定 */
export function initAuth(checkAuthAndRoute) {
  $("btn-github-login").addEventListener("click", () => {
    window.location.href = "/api/auth/github";
  });

  $("btn-logout").addEventListener("click", handleLogout);
}
