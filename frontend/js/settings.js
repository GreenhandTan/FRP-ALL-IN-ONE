/**
 * 面板设置模块：NAT 端口 + SSL 证书管理
 */
import { $, setText, show, hide, showAlert, hideAlert } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { openModal, closeModal } from './modal.js';
import { STATE } from './state.js';

export function initSettings() {
  // 打开面板设置
  $("btn-panel-settings").addEventListener("click", async () => {
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");
    
    // 隐藏证书模块的默认状态
    $("cert-management-group").style.display = "none";
    $("cert-status-text").textContent = "加载中...";
    $("cert-domain-text").textContent = "—";
    $("cert-expire-text").textContent = "—";
    $("cert-days-text").textContent = "—";
    $("btn-renew-cert").disabled = true;

    try {
      const data = await api.get("/api/settings/panel-port");
      $("inp-panel-access-port").value = data.port || "";
    } catch (err) {
      $("inp-panel-access-port").value = "";
    }

    // 获取证书信息
    try {
      const domainData = await api.get("/api/settings/domain");
      if (domainData.tls_enabled && domainData.tls_mode === "auto") {
        $("cert-management-group").style.display = "block";
        const certInfo = domainData.cert_info;
        if (certInfo) {
          $("cert-status-text").textContent = "有效";
          $("cert-status-text").style.color = "var(--green)";
          $("cert-domain-text").textContent = certInfo.domain;
          
          const expireDate = new Date(certInfo.expires_at);
          $("cert-expire-text").textContent = expireDate.toLocaleString();
          
          const days = certInfo.days_until_expiry;
          $("cert-days-text").textContent = days + " 天";
          if (days <= 30) {
            $("cert-days-text").style.color = "var(--orange)";
          } else {
            $("cert-days-text").style.color = "var(--text-color)";
          }
          
          $("btn-renew-cert").disabled = false;
        } else {
          $("cert-status-text").textContent = "未找到证书或已过期";
          $("cert-status-text").style.color = "var(--red)";
          $("btn-renew-cert").disabled = false;
        }
      }
    } catch (err) {
      console.error("获取证书信息失败:", err);
    }

    openModal("modal-panel-settings");
  });

  // 续期证书
  $("btn-renew-cert").addEventListener("click", async () => {
    const btn = $("btn-renew-cert");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "续期中...";
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");
    
    try {
      const res = await api.post("/api/settings/renew-cert");
      if (res.success) {
        showAlert("panel-settings-success", res.message);
        setTimeout(() => $("btn-panel-settings").click(), 2000);
      } else {
        showAlert("panel-settings-error", res.message || "证书续期失败");
      }
    } catch (err) {
      showAlert("panel-settings-error", "请求异常：" + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // 面板设置保存
  $("panel-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");
    const portVal = $("inp-panel-access-port").value.trim();
    const btn = $("btn-panel-settings-submit");
    btn.disabled = true;
    btn.textContent = t("loading");
    try {
      await api.post("/api/settings/panel-port", { port: portVal });
      showAlert("panel-settings-success", "保存成功");
      setTimeout(() => closeModal("modal-panel-settings"), 1200);
    } catch (err) {
      showAlert("panel-settings-error", err.message || "保存失败");
    } finally {
      btn.disabled = false;
      btn.textContent = t("save");
    }
  });

  // 错误横幅关闭
  $("btn-dismiss-error").addEventListener("click", () => {
    hide("error-banner");
    STATE._lastDismissedConflictTime = STATE._lastShownConflictTime || null;
  });
}
