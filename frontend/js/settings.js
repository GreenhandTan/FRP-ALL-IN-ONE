/**
 * Panel Settings: NAT port + SSL certificate management
 */
import { $, setText, show, hide, showAlert, hideAlert } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { openModal, closeModal } from './modal.js';
import { STATE } from './state.js';

export function initSettings() {
  $("btn-panel-settings").addEventListener("click", async () => {
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");

    $("cert-management-group").classList.add("hidden");
    $("tls-enable-group").classList.add("hidden");
    $("cert-status-text").textContent = t("loading");
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

    try {
      const domainData = await api.get("/api/settings/domain");
      if (domainData.domain) {
        $("inp-panel-domain").value = domainData.domain;
      }

      if (domainData.tls_enabled && domainData.tls_mode === "auto") {
        $("cert-management-group").classList.remove("hidden");
        $("tls-enable-group").classList.add("hidden");
        const certInfo = domainData.cert_info;
        if (certInfo) {
          $("cert-status-text").textContent = t("settings.certValid");
          $("cert-status-text").style.color = "var(--status-online)";
          $("cert-domain-text").textContent = certInfo.domain;
          $("cert-expire-text").textContent = new Date(certInfo.expires_at).toLocaleString();
          const days = certInfo.days_until_expiry;
          $("cert-days-text").textContent = t("settings.certDaysValue", { days });
          $("cert-days-text").style.color = days <= 30 ? "var(--status-warning)" : "var(--on-surface)";
          $("btn-renew-cert").disabled = false;
        } else {
          $("cert-status-text").textContent = t("settings.certNotFound");
          $("cert-status-text").style.color = "var(--error)";
          $("btn-renew-cert").disabled = false;
        }
      } else {
        $("cert-management-group").classList.add("hidden");
        $("tls-enable-group").classList.remove("hidden");
      }
    } catch (err) {
      console.error(t("settings.loadFailed") + ":", err);
    }

    openModal("modal-panel-settings");
  });

  $("btn-check-dns").addEventListener("click", async () => {
    const domainVal = $("inp-panel-domain").value.trim();
    const resultDiv = $("dns-check-result");
    if (!domainVal) {
      resultDiv.textContent = t("settings.enterDomain");
      return;
    }

    $("btn-check-dns").disabled = true;
    $("btn-check-dns").textContent = t("settings.dnsChecking");
    resultDiv.textContent = t("settings.dnsQuerying");

    try {
      const res = await api.post(`/api/settings/check-dns?domain=${encodeURIComponent(domainVal)}`);
      if (res.success) {
        resultDiv.textContent = "✅ " + res.message;
        resultDiv.style.color = "var(--status-online)";
      } else {
        resultDiv.textContent = "❌ " + res.message;
        resultDiv.style.color = "var(--error)";
      }
    } catch (err) {
      resultDiv.textContent = "❌ " + t("settings.dnsCheckFailed") + ": " + err.message;
      resultDiv.style.color = "var(--error)";
    } finally {
      $("btn-check-dns").disabled = false;
      $("btn-check-dns").textContent = t("settings.checkDns");
    }
  });

  $("btn-enable-tls").addEventListener("click", async () => {
    const domainVal = $("inp-panel-domain").value.trim();
    if (!domainVal) {
      showAlert("panel-settings-error", t("settings.enterCertDomain"));
      return;
    }

    const btn = $("btn-enable-tls");
    btn.disabled = true;
    btn.textContent = t("settings.tlsWaiting");
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");

    try {
      const res = await api.post("/api/settings/enable-tls", { domain: domainVal, mode: "auto" });
      if (res.success) {
        showAlert("panel-settings-success", t("settings.tlsSuccess"));
        setTimeout(() => { window.location.href = `https://${domainVal}`; }, 3000);
      } else {
        showAlert("panel-settings-error", res.message || t("settings.tlsFailed"));
      }
    } catch (err) {
      showAlert("panel-settings-error", err.message || t("settings.tlsFailed"));
    } finally {
      btn.disabled = false;
      btn.textContent = t("settings.enableTls");
    }
  });

  $("btn-renew-cert").addEventListener("click", async () => {
    const btn = $("btn-renew-cert");
    btn.disabled = true;
    btn.textContent = t("settings.renewing");
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");

    try {
      const res = await api.post("/api/settings/renew-cert");
      if (res.success) {
        showAlert("panel-settings-success", res.message);
        setTimeout(() => $("btn-panel-settings").click(), 2000);
      } else {
        showAlert("panel-settings-error", res.message || t("settings.renewFailed"));
      }
    } catch (err) {
      showAlert("panel-settings-error", err.message || t("settings.renewFailed"));
    } finally {
      btn.disabled = false;
      btn.textContent = t("settings.renewCert");
    }
  });

  $("panel-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");
    const portVal = $("inp-panel-access-port").value.trim();
    const domainVal = $("inp-panel-domain").value.trim();
    const btn = $("btn-panel-settings-submit");
    btn.disabled = true;
    btn.textContent = t("loading");
    try {
      await api.post("/api/settings/panel-port", { port: portVal });
      if (domainVal) {
        await api.post("/api/settings/domain", { domain: domainVal });
      }
      showAlert("panel-settings-success", t("settings.saveSuccess"));
      setTimeout(() => closeModal("modal-panel-settings"), 1200);
    } catch (err) {
      showAlert("panel-settings-error", err.message || t("settings.saveFailed"));
    } finally {
      btn.disabled = false;
      btn.textContent = t("save");
    }
  });

  $("btn-dismiss-error").addEventListener("click", () => {
    hide("error-banner");
    STATE._lastDismissedConflictTime = STATE._lastShownConflictTime || null;
  });
}

/* ---- 全页面设置 ---- */
let _settingsPageLoaded = false;

export async function initSettingsPage() {
  if (_settingsPageLoaded) return;
  _settingsPageLoaded = true;

  // 加载当前设置值
  try {
    const data = await api.get("/api/settings/panel-port");
    const portInput = $("page-inp-panel-port");
    if (portInput) portInput.value = data.port || "";
  } catch {}

  try {
    const domainData = await api.get("/api/settings/domain");
    const domainInput = $("page-inp-domain");
    if (domainInput && domainData.domain) {
      domainInput.value = domainData.domain;
    }
  } catch {}

  // DNS 检查按钮
  const dnsBtn = $("page-btn-check-dns");
  if (dnsBtn) {
    dnsBtn.addEventListener("click", async () => {
      const domainVal = $("page-inp-domain").value.trim();
      const resultDiv = $("page-dns-check-result");
      if (!domainVal) return;

      dnsBtn.disabled = true;
      resultDiv.textContent = "查询中…";

      try {
        const res = await api.post(`/api/settings/check-dns?domain=${encodeURIComponent(domainVal)}`);
        if (res.success) {
          resultDiv.textContent = "✅ " + res.message;
          resultDiv.style.color = "var(--status-online)";
        } else {
          resultDiv.textContent = "❌ " + res.message;
          resultDiv.style.color = "var(--error)";
        }
      } catch (err) {
        resultDiv.textContent = "❌ DNS 检查失败: " + err.message;
        resultDiv.style.color = "var(--error)";
      } finally {
        dnsBtn.disabled = false;
      }
    });
  }

  // 保存按钮
  const saveBtn = $("btn-settings-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "保存中…";
      try {
        const portVal = $("page-inp-panel-port").value.trim();
        const domainVal = $("page-inp-domain").value.trim();
        await api.post("/api/settings/panel-port", { port: portVal });
        if (domainVal) {
          await api.post("/api/settings/domain", { domain: domainVal });
        }
        saveBtn.textContent = "✓ 已保存";
        setTimeout(() => {
          saveBtn.textContent = "保存配置";
          saveBtn.disabled = false;
        }, 2000);
      } catch (err) {
        saveBtn.textContent = "保存失败";
        setTimeout(() => {
          saveBtn.textContent = "保存配置";
          saveBtn.disabled = false;
        }, 2000);
      }
    });
  }

  // 放弃修改按钮
  const discardBtn = $("btn-settings-discard");
  if (discardBtn) {
    discardBtn.addEventListener("click", () => {
      _settingsPageLoaded = false;
      initSettingsPage();
    });
  }
}
