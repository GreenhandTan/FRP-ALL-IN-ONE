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
    // Re-trigger settings page load
    _settingsPageLoaded = false;
    showPage("settings");
  });

  $("btn-dismiss-error").addEventListener("click", () => {
    hide("error-banner");
    STATE._lastDismissedConflictTime = STATE._lastShownConflictTime || null;
  });
}

function showPage(pageId) {
  document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
  const section = document.getElementById(`page-${pageId}`);
  if (section) section.classList.add("active");
  document.querySelectorAll(".sidebar-nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageId);
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

    // 自动 HTTPS 开关
    const autoHttpsToggle = $("page-auto-https");
    if (autoHttpsToggle) {
      autoHttpsToggle.checked = domainData.tls_enabled && domainData.tls_mode === "auto";
    }

    // 证书管理区域
    if (domainData.tls_enabled && domainData.tls_mode === "auto") {
      show("cert-management-group");
      hide("tls-enable-group");
      const certInfo = domainData.cert_info;
      if (certInfo) {
        $("cert-status-text").textContent = "有效";
        $("cert-status-text").style.color = "#10B981";
        $("cert-domain-text").textContent = certInfo.domain;
        $("cert-expire-text").textContent = new Date(certInfo.expires_at).toLocaleString();
        const days = certInfo.days_until_expiry;
        $("cert-days-text").textContent = `${days} 天`;
        $("cert-days-text").style.color = days <= 30 ? "#F59E0B" : "#191c1e";
        $("btn-renew-cert").disabled = false;
      } else {
        $("cert-status-text").textContent = "未找到";
        $("cert-status-text").style.color = "#ba1a1a";
        $("btn-renew-cert").disabled = false;
      }
    } else {
      hide("cert-management-group");
      show("tls-enable-group");
    }
  } catch (err) {
    console.error("加载设置失败:", err);
  }

  // DNS 检查按钮
  const dnsBtn = $("page-btn-check-dns");
  if (dnsBtn) {
    dnsBtn.addEventListener("click", async () => {
      const domainVal = $("page-inp-domain").value.trim();
      const resultDiv = $("page-dns-check-result");
      if (!domainVal) return;

      dnsBtn.disabled = true;
      dnsBtn.textContent = "检查中…";
      resultDiv.textContent = "查询中…";

      try {
        const res = await api.post(`/api/settings/check-dns?domain=${encodeURIComponent(domainVal)}`);
        if (res.success) {
          resultDiv.textContent = "✅ " + res.message;
          resultDiv.style.color = "#10B981";
        } else {
          resultDiv.textContent = "❌ " + res.message;
          resultDiv.style.color = "#ba1a1a";
        }
      } catch (err) {
        resultDiv.textContent = "❌ DNS 检查失败: " + err.message;
        resultDiv.style.color = "#ba1a1a";
      } finally {
        dnsBtn.disabled = false;
        dnsBtn.textContent = "重新检查 DNS";
      }
    });
  }

  // TLS 启用按钮
  const tlsBtn = $("btn-enable-tls");
  if (tlsBtn) {
    tlsBtn.addEventListener("click", async () => {
      const domainVal = $("page-inp-domain").value.trim();
      if (!domainVal) return;

      tlsBtn.disabled = true;
      tlsBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> 正在申请证书…';

      try {
        const res = await api.post("/api/settings/enable-tls", { domain: domainVal, mode: "auto" });
        if (res.success) {
          setTimeout(() => { window.location.href = `https://${domainVal}`; }, 3000);
        } else {
          alert(res.message || "证书申请失败");
        }
      } catch (err) {
        alert(err.message || "证书申请失败");
      } finally {
        tlsBtn.disabled = false;
        tlsBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">lock</span> 一键申请 Let\'s Encrypt 证书并启用 HTTPS';
      }
    });
  }

  // 证书续期按钮
  const renewBtn = $("btn-renew-cert");
  if (renewBtn) {
    renewBtn.addEventListener("click", async () => {
      renewBtn.disabled = true;
      renewBtn.textContent = "续期中…";

      try {
        const res = await api.post("/api/settings/renew-cert");
        if (res.success) {
          alert(res.message || "证书续期成功");
          _settingsPageLoaded = false;
          initSettingsPage();
        } else {
          alert(res.message || "证书续期失败");
        }
      } catch (err) {
        alert(err.message || "证书续期失败");
      } finally {
        renewBtn.disabled = false;
        renewBtn.textContent = "手动续期证书";
      }
    });
  }

  // 保存按钮
  const saveBtn = $("btn-settings-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      const originalHTML = saveBtn.innerHTML;
      saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> 保存中…';
      try {
        const portVal = $("page-inp-panel-port").value.trim();
        const domainVal = $("page-inp-domain").value.trim();
        await api.post("/api/settings/panel-port", { port: portVal });
        if (domainVal) {
          await api.post("/api/settings/domain", { domain: domainVal });
        }
        saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check</span> 已保存';
        setTimeout(() => {
          saveBtn.innerHTML = originalHTML;
          saveBtn.disabled = false;
        }, 2000);
      } catch (err) {
        saveBtn.textContent = "保存失败";
        setTimeout(() => {
          saveBtn.innerHTML = originalHTML;
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
