/**
 * 认证模块：GitHub OAuth 登录、登出、管理员管理
 */
import { $, showAlert, hideAlert } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { openModal, closeModal } from './modal.js';
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

/**
 * 初始化认证相关的事件绑定
 * @param {Function} checkAuthAndRoute - 路由检查函数
 */
export function initAuth(checkAuthAndRoute) {
  // GitHub 登录按钮
  $("btn-github-login").addEventListener("click", () => {
    window.location.href = "/api/auth/github";
  });

  // 登出按钮
  $("btn-logout").addEventListener("click", handleLogout);

  // 管理员管理按钮
  $("btn-manage-admins")?.addEventListener("click", async () => {
    await loadAdminList();
    openModal("modal-admin-manage");
  });

  // 邀请表单提交
  $("invite-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("inp-invite-username").value.trim();
    hideAlert("invite-error");
    hideAlert("invite-success");

    if (!username) return;

    try {
      await api.post("/api/auth/admins/invite", { github_username: username });
      $("inp-invite-username").value = "";
      showAlert("invite-success", t("adminManage.inviteSuccess"));
      await loadAdminList();
    } catch (err) {
      showAlert("invite-error", err.message || t("adminManage.inviteFailed"));
    }
  });
}

/** 加载管理员列表 */
async function loadAdminList() {
  try {
    const data = await api.get("/api/auth/admins");
    const container = $("admin-list-container");
    container.innerHTML = "";

    for (const admin of data.admins) {
      const div = document.createElement("div");
      div.className = "admin-item";
      const safeAvatar = escapeHtml(admin.avatar_url || '');
      const safeUsername = escapeHtml(admin.github_username || '');
      div.innerHTML = `
        <img src="${safeAvatar}" class="admin-avatar" width="32" height="32" alt="" />
        <span class="admin-name">${safeUsername}</span>
        ${admin.is_superadmin ? `<span class="badge badge-info">${t("adminManage.superadmin")}</span>` : ''}
        ${admin.is_superadmin ? '' : `<button class="btn btn-xs btn-danger" data-admin-id="${admin.id}" data-username="${safeUsername}">${t("adminManage.remove")}</button>`}
      `;
      container.appendChild(div);
    }

    container.querySelectorAll("button[data-admin-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const adminId = btn.dataset.adminId;
        const username = btn.dataset.username;
        if (confirm(`${t("adminManage.confirmRemove")} (${username})`)) {
          await api.delete(`/api/auth/admins/${adminId}`);
          await loadAdminList();
        }
      });
    });

    const inviteContainer = $("admin-invite-list");
    inviteContainer.innerHTML = "";

    for (const inv of data.invites) {
      const div = document.createElement("div");
      div.className = "invite-item";
      div.innerHTML = `
        <span>${inv.github_username}</span>
        <button class="btn btn-xs btn-danger" data-invite-user="${inv.github_username}">${t("adminManage.revoke")}</button>
      `;
      inviteContainer.appendChild(div);
    }

    inviteContainer.querySelectorAll("button[data-invite-user]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const username = btn.dataset.inviteUser;
        await api.delete(`/api/auth/admins/invite/${username}`);
        await loadAdminList();
      });
    });
  } catch (err) {
    console.error("Failed to load admin list:", err);
  }
}
