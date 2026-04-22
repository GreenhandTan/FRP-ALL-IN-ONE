/**
 * DOM 工具模块
 */

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

export function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

export function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

export function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

export function toggle(id, visible) {
  visible ? show(id) : hide(id);
}

export function showAlert(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

export function hideAlert(id) {
  hide(id);
}
