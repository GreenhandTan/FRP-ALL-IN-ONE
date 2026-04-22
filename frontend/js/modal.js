/**
 * 弹窗与确认对话框模块
 */
import { $, show, hide, setText } from './dom.js';
import { t } from './i18n.js';

export function openModal(id) {
  show(id);
}

export function closeModal(id) {
  hide(id);
}

export function showConfirm(msg, options = {}) {
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

export function showGlobalError(msg) {
  setText("error-text", msg);
  show("error-banner");
}
