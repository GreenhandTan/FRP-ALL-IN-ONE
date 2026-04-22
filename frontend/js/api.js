/**
 * HTTP API 请求模块
 */

/** 403 回调：由 app.js 注入，避免循环依赖 */
let _on403 = null;
export function setOn403Handler(fn) {
  _on403 = fn;
}

export function getToken() {
  return localStorage.getItem("token");
}

async function request(method, url, body, opts = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  let init = { method, headers };

  if (body instanceof URLSearchParams) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body;
  } else if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const d = await res.json();
      detail = d.detail || d.message || "";
    } catch {}
    // 403: 未修改默认密码，强制弹出改密弹窗
    if (res.status === 403) {
      localStorage.setItem("require_pwd_change", "1");
      if (_on403) _on403();
    }
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export const api = {
  get: (url, opts) => request("GET", url, undefined, opts),
  post: (url, body, opts) => request("POST", url, body, opts),
  patch: (url, body, opts) => request("PATCH", url, body, opts),
  delete: (url, opts) => request("DELETE", url, undefined, opts),
};
