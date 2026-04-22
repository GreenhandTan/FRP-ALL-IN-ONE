/**
 * 设置向导模块
 */
import { $, $$, setText, show, hide, showAlert, hideAlert } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { copyText } from './utils.js';

let setupStep = 0;
let setupMode = "ip"; // 'ip' | 'domain'
let deployResult = null;
let selectedPlatform = null;
let setupCreatedClientId = null;

function goSetupStep(n) {
  setupStep = n;
  [0, 1, 2, 3].forEach((i) => {
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

/**
 * 初始化设置向导
 * @param {Function} startDashboard - 进入仪表盘的回调
 */
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
    const token =
      (deployResult && deployResult.auth_token) || $("info-token").textContent;
    if (await copyText(token)) {
      $("btn-copy-token").textContent = t("setup.copied");
      setTimeout(() => setText("btn-copy-token", t("copy")), 2000);
    }
  });

  // 进入 Step 3
  $("btn-step3").addEventListener("click", () => {
    selectedPlatform = null;
    setupCreatedClientId = null;
    $("btn-finish-setup").disabled = true;
    hide("script-area");
    goSetupStep(3);
  });

  // 设置向导平台按钮
  $$(".platform-btn", $("setup-step-3")).forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedPlatform = btn.dataset.platform;
      $("script-platform-label").textContent = selectedPlatform;
      $("script-content").textContent = "加载中…";
      show("script-area");
      $("btn-finish-setup").disabled = true;
      try {
        let url = `/api/frp/agent/install-script/${selectedPlatform}`;
        if (setupCreatedClientId) url += `?client_id=${setupCreatedClientId}`;
        const script = await api.get(url);
        const scriptText =
          typeof script === "string" ? script : JSON.stringify(script);
        $("script-content").textContent = scriptText;
        if (!setupCreatedClientId) {
          const m = scriptText.match(/CLIENT_ID\s*=\s*"([^"]+)"/);
          if (m) setupCreatedClientId = m[1];
        }
        $("btn-finish-setup").disabled = false;
      } catch (err) {
        $("script-content").textContent = `# 获取失败: ${err.message}`;
        $("btn-finish-setup").disabled = false;
      }
    });
  });

  // 复制脚本
  $("btn-copy-script").addEventListener("click", async () => {
    const content = $("script-content").textContent;
    if (await copyText(content)) {
      setText("btn-copy-script", t("setup.scriptCopied"));
      setTimeout(() => setText("btn-copy-script", t("copy")), 2000);
    }
  });

  // 下载脚本
  $("btn-download-script").addEventListener("click", () => {
    const content = $("script-content").textContent;
    const ext = selectedPlatform === "windows" ? "ps1" : "sh";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deploy-frpc.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // 完成按钮
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

export { goSetupStep };
