/**
 * 设置向导模块（3 步：模式选择 → 配置 → 部署成功）
 */
import { $, setText, show, hide, showAlert, hideAlert } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { copyText } from './utils.js';

let setupStep = 0;
let setupMode = "ip";
let deployResult = null;

export function goSetupStep(n) {
  setupStep = n;
  [0, 1, 2].forEach((i) => {
    const el = $(`setup-step-${i}`);
    if (el) el.classList.toggle("hidden", i !== n);
    const dot = $(`step-dot-${i}`);
    if (dot) {
      dot.classList.toggle("active", i === n);
      dot.classList.toggle("done", i < n);
    }
  });
}

async function detectPublicIp() {
  const badge = $("ip-detect-status");
  if (badge) {
    badge.textContent = t("setup.detectingIp");
    badge.className = "badge badge-info";
  }
  try {
    const res = await api.get("/api/system/public-ip");
    if (res.success && res.ip) {
      $("inp-serverip").value = res.ip.trim();
      if (badge) {
        badge.textContent = t("setup.autoDetected");
        badge.className = "badge badge-success";
      }
    } else {
      if (badge) {
        badge.textContent = t("setup.ipDetectFailed");
        badge.className = "badge badge-warning";
      }
    }
  } catch {
    if (badge) {
      badge.textContent = t("setup.ipDetectFailed");
      badge.className = "badge badge-warning";
    }
  }
}

export function initSetup(startDashboard) {
  // 模式选择
  $("mode-btn-ip").addEventListener("click", () => {
    setupMode = "ip";
    $("domain-group").classList.add("hidden");
    detectPublicIp();
    goSetupStep(1);
  });
  $("mode-btn-domain").addEventListener("click", () => {
    setupMode = "domain";
    $("domain-group").classList.remove("hidden");
    detectPublicIp();
    goSetupStep(1);
  });

  // 部署按钮
  $("btn-deploy").addEventListener("click", async () => {
    const serverIp = $("inp-serverip").value.trim();
    const port = parseInt($("inp-port").value, 10) || 7000;
    const domain = $("inp-domain").value.trim();

    if (!serverIp) {
      showAlert("setup-error", t("setup.serverIpRequired"));
      return;
    }
    hideAlert("setup-error");
    const btn = $("btn-deploy");
    btn.disabled = true;
    btn.textContent = t("setup.deploying");

    try {
      const res = await api.post(
        `/api/frp/deploy-server?port=${port}&server_ip=${encodeURIComponent(serverIp)}`,
        null,
      );
      if (res.success) {
        if (setupMode === "domain" && domain) {
          try {
            await api.post("/api/settings/domain", { domain: domain });
          } catch (err) {
            console.warn("Failed to save domain:", err);
          }
        }

        deployResult = { ...res.info, frps_restarted: res.frps_restarted };
        $("info-version").textContent = deployResult.version || "—";
        $("info-port").textContent = deployResult.port || port;
        $("info-ip").textContent = deployResult.server_ip || serverIp;
        $("info-token").textContent = deployResult.token || "—";
        if (res.frps_restarted) {
          $("frps-restart-notice").textContent = t("setup.frpsRestarted");
          show("frps-restart-notice");
        }
        goSetupStep(2);
      } else {
        showAlert("setup-error", res.message || t("setup.deployFailed"));
      }
    } catch (err) {
      showAlert("setup-error", err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = t("setup.deployButton");
    }
  });

  // 复制 Token
  $("btn-copy-token").addEventListener("click", async () => {
    const token = (deployResult && deployResult.auth_token) || $("info-token").textContent;
    if (await copyText(token)) {
      $("btn-copy-token").textContent = t("setup.copied");
      setTimeout(() => setText("btn-copy-token", t("copy")), 2000);
    }
  });

  // 完成按钮 → 直接进入仪表盘
  $("btn-finish-setup").addEventListener("click", async () => {
    try {
      const st = await api.get("/api/system/status");
      if (st.frps_deployed) {
        startDashboard();
      } else {
        goSetupStep(1);
      }
    } catch {
      startDashboard();
    }
  });
}
