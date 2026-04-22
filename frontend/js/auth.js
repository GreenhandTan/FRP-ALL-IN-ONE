/**
 * 认证模块：登录、登出、改密、强制改密
 */
import { $, setText, show, hide, showAlert, hideAlert } from './dom.js';
import { api } from './api.js';
import { t, lang } from './i18n.js';
import { openModal, closeModal } from './modal.js';
import { WS } from './ws.js';
import { STATE } from './state.js';

/** 强制修改默认密码弹窗 */
export function openForcedPasswordChange() {
  $("inp-old-pwd").value = "";
  $("inp-new-pwd").value = "";
  $("inp-confirm-pwd").value = "";
  hideAlert("change-pwd-error");
  $("change-pwd-form").classList.remove("hidden");
  $("change-pwd-success").classList.add("hidden");
  $("change-pwd-forced-notice").classList.remove("hidden");
  $("modal-change-pwd").dataset.forced = "1";
  openModal("modal-change-pwd");
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
 * @param {Function} checkAuthAndRoute - 路由检查函数（由 app.js 注入）
 */
export function initAuth(checkAuthAndRoute) {
  // 修改密码按钮
  $("btn-change-pwd").addEventListener("click", () => {
    $("inp-old-pwd").value = "";
    $("inp-new-pwd").value = "";
    $("inp-confirm-pwd").value = "";
    hideAlert("change-pwd-error");
    $("change-pwd-form").classList.remove("hidden");
    $("change-pwd-success").classList.add("hidden");
    openModal("modal-change-pwd");
  });

  // 修改密码表单提交
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
      const wasForced = $("modal-change-pwd").dataset.forced === "1";
      setTimeout(async () => {
        delete $("modal-change-pwd").dataset.forced;
        $("change-pwd-forced-notice").classList.add("hidden");
        closeModal("modal-change-pwd");
        if (wasForced) {
          localStorage.removeItem("require_pwd_change");
          await checkAuthAndRoute();
        } else {
          handleLogout();
        }
      }, 1500);
    } catch (err) {
      showAlert(
        "change-pwd-error",
        err.message || t("changePassword.errorFailed"),
      );
      btn.disabled = false;
      btn.textContent = t("changePassword.submit");
    }
  });

  // 登录表单提交
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
      if (res.require_password_change) {
        localStorage.setItem("require_pwd_change", "1");
      } else {
        localStorage.removeItem("require_pwd_change");
      }
      await checkAuthAndRoute();
    } catch (err) {
      showAlert("login-error", t("login.error"));
    } finally {
      btn.disabled = false;
      btn.textContent = t("login.submit");
    }
  });

  // 登出按钮
  $("btn-logout").addEventListener("click", handleLogout);
}
