/**
 * 系统版本号 — 唯一定义处
 *
 * 构建时可通过环境变量覆盖：
 *   VITE_APP_VERSION=2.5.0 npm run build
 *
 * 本地开发默认使用 'dev'，生产构建使用 package.json 中的版本号或环境变量
 */
export const APP_VERSION: string =
  (import.meta as any).env?.VITE_APP_VERSION ||
  (import.meta as any).env?.VITE_APP_VERSION_NAME ||
  'v2.4.0-Stable';

/** 格式化显示版本（如 "V2.4.0-Stable"） */
export const APP_VERSION_DISPLAY = `V${APP_VERSION.replace(/^v/i, '')}`;
