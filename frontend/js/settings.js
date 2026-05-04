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

    // 获取证书与域名信息
    try {
      const domainData = await api.get("/api/settings/domain");
      
      // 回显域名
      if (domainData.domain) {
        $("inp-panel-domain").value = domainData.domain;
      }
      
      if (domainData.tls_enabled && domainData.tls_mode === "auto") {
        $("cert-management-group").style.display = "block";
        $("tls-enable-group").style.display = "none";
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
      } else {
        $("cert-management-group").style.display = "none";
        $("tls-enable-group").style.display = "block";
      }
    } catch (err) {
      console.error("获取域名与证书信息失败:", err);
    }

    openModal("modal-panel-settings");
  });

  // 检测 DNS
  $("btn-check-dns").addEventListener("click", async () => {
    const domainVal = $("inp-panel-domain").value.trim();
    const resultDiv = $("dns-check-result");
    if (!domainVal) {
      resultDiv.textContent = "请先输入域名";
      return;
    }
    
    $("btn-check-dns").disabled = true;
    $("btn-check-dns").textContent = "检测中...";
    resultDiv.textContent = "正在查询 A 记录...";
    
    try {
      // check-dns 在后端是接收 Query 参数: ?domain=xxx
      const res = await api.post(`/api/settings/check-dns?domain=${encodeURIComponent(domainVal)}`);
      if (res.success) {
         resultDiv.textContent = "✅ " + res.message;
         resultDiv.style.color = "var(--green)";
      } else {
         resultDiv.textContent = "❌ " + res.message;
         resultDiv.style.color = "var(--red)";
      }
    } catch (err) {
      resultDiv.textContent = "❌ 检测异常: " + err.message;
      resultDiv.style.color = "var(--red)";
    } finally {
      $("btn-check-dns").disabled = false;
      $("btn-check-dns").textContent = "检测 DNS";
    }
  });

  // 一键申请证书并启用 HTTPS
  $("btn-enable-tls").addEventListener("click", async () => {
    const domainVal = $("inp-panel-domain").value.trim();
    if (!domainVal) {
      showAlert("panel-settings-error", "请先输入要申请证书的域名");
      return;
    }
    
    const btn = $("btn-enable-tls");
    btn.disabled = true;
    btn.textContent = "正在申请证书并配置 Nginx，请耐心等待 (约 1-2 分钟)...";
    hideAlert("panel-settings-error");
    hideAlert("panel-settings-success");
    
    try {
      const res = await api.post("/api/settings/enable-tls", { domain: domainVal, mode: "auto" });
      if (res.success) {
        showAlert("panel-settings-success", "HTTPS 启用成功！页面即将刷新并跳转...");
        setTimeout(() => {
          // 跳转到 HTTPS 协议的新域名
          window.location.href = `https://${domainVal}`;
        }, 3000);
      } else {
        showAlert("panel-settings-error", res.message || "证书申请失败");
      }
    } catch (err) {
      showAlert("panel-settings-error", "请求异常：" + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "一键申请 Let's Encrypt 证书并启用 HTTPS";
    }
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
    const domainVal = $("inp-panel-domain").value.trim();
    const btn = $("btn-panel-settings-submit");
    btn.disabled = true;
    btn.textContent = t("loading");
    try {
      // 先保存端口
      await api.post("/api/settings/panel-port", { port: portVal });
      // 如果输入了域名，则保存域名
      if (domainVal) {
        await api.post("/api/settings/domain", { domain: domainVal });
      }
      
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
