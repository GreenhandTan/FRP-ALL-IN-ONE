/**
 * Agent 部署弹窗模块
 */
import { $, $$, setText, show, hide } from './dom.js';
import { api } from './api.js';
import { t, lang } from './i18n.js';
import { openModal, closeModal, showConfirm } from './modal.js';
import { escapeHtml, copyText } from './utils.js';

let agentScriptPlatform = null;
let agentCreatedClientId = null;

export function openAgentDeploy() {
  agentScriptPlatform = null;
  agentCreatedClientId = null;
  show("agent-platform-select");
  hide("agent-script-area");
  hide("btn-agent-done");
  openModal("modal-agent-deploy");

  // 获取服务器信息
  api.get("/api/frp/agent/install-script-info").then((info) => {
    const infoEl = $("agent-server-info");
    if (info && infoEl) {
      infoEl.innerHTML = `
        <div class="info-row"><span>服务器地址</span><code>${escapeHtml(info.server_ip || "—")}</code></div>
        <div class="info-row"><span>FRPS 端口</span><code>${escapeHtml(String(info.frps_port || "—"))}</code></div>
        <div class="info-row"><span>FRP 版本</span><code>v${escapeHtml(info.frps_version || "—")}</code></div>`;
    }
  }).catch(() => {});
}

async function confirmCleanupAgentClient() {
  const shouldDelete = await showConfirm(
    lang === "en"
      ? "A device record was created but the agent script has not been deployed. Delete this device?"
      : "已为此设备创建记录但尚未完成部署。是否删除该设备？",
    {
      title: lang === "en" ? "Confirm" : "关闭确认",
      confirmText: lang === "en" ? "Delete" : "删除设备",
      cancelText: lang === "en" ? "Keep" : "保留",
      tone: "danger",
    },
  );
  if (shouldDelete && agentCreatedClientId) {
    try {
      await api.delete(`/api/clients/${agentCreatedClientId}`);
    } catch {}
  }
  agentCreatedClientId = null;
  closeModal("modal-agent-deploy");
}

export function getAgentCreatedClientId() {
  return agentCreatedClientId;
}

export { confirmCleanupAgentClient };

export function initAgent() {
  // 平台按钮
  $$(".platform-btn", $("modal-agent-deploy")).forEach((btn) => {
    btn.addEventListener("click", async () => {
      agentScriptPlatform = btn.dataset.platform;
      hide("agent-platform-select");
      show("agent-script-area");
      show("btn-agent-done");
      $("agent-platform-label").textContent = agentScriptPlatform;
      $("agent-script-content").textContent = "加载中…";
      try {
        let url = `/api/frp/agent/install-script/${agentScriptPlatform}`;
        if (agentCreatedClientId) url += `?client_id=${agentCreatedClientId}`;
        const script = await api.get(url);
        const scriptText =
          typeof script === "string" ? script : JSON.stringify(script);
        $("agent-script-content").textContent = scriptText;
        if (!agentCreatedClientId) {
          const m = scriptText.match(/CLIENT_ID\s*=\s*"([^"]+)"/);
          if (m) agentCreatedClientId = m[1];
        }
      } catch (err) {
        $("agent-script-content").textContent = `# 获取失败: ${err.message}`;
      }
    });
  });

  // 返回按钮
  $("btn-agent-back").addEventListener("click", () => {
    show("agent-platform-select");
    hide("agent-script-area");
    hide("btn-agent-done");
  });

  // 复制脚本
  $("btn-copy-agent-script").addEventListener("click", async () => {
    const content = $("agent-script-content").textContent;
    if (await copyText(content)) {
      setText("btn-copy-agent-script", t("copySuccess"));
      setTimeout(() => setText("btn-copy-agent-script", t("copy")), 2000);
    }
  });

  // 下载脚本
  $("btn-download-agent-script").addEventListener("click", () => {
    const content = $("agent-script-content").textContent;
    const ext = agentScriptPlatform === "windows" ? "ps1" : "sh";
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
  $("btn-agent-done").addEventListener("click", () => {
    agentCreatedClientId = null;
    closeModal("modal-agent-deploy");
  });
}
