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
