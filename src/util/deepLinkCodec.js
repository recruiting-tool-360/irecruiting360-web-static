/**
 * 把 SSO 数据编码成 base64url 字符串放进 deep link URL 的 d 参数。
 *
 * 算法选择：base64url(encodeURIComponent(JSON.stringify(payload)))
 *
 * 与 Electron 主进程 (electron/src/main/util/deepLinkCodec.ts) 的解码必须保持一致：
 *
 *   const b64 = d.replace(/-/g, '+').replace(/_/g, '/');
 *   const json = Buffer.from(b64, 'base64').toString('utf8');
 *   const obj = JSON.parse(decodeURIComponent(escape(json)));
 *
 * 注意 URL 长度限制：
 *   - macOS  : ~16KB 安全
 *   - Windows: ~2KB 严格上限（注册表 + 命令行）
 *   - Linux  : ~4KB 安全
 *   故 payload 不要带 positionList（带 jd 文本可能超过 2KB）
 */

export const PROTOCOL_VERSION = 1;

/**
 * 把 JSON 对象编码成 base64url
 * @param {object} payload
 * @returns {string}
 */
export function encodePayload(payload) {
  const json = JSON.stringify(payload);
  // 使用 unescape(encodeURIComponent) 处理中文字符，确保 btoa 不抛错
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 解码 base64url 回 JSON 对象（SPA 端调试用，正式解码在 Electron 主进程做）
 * @param {string} d
 * @returns {object}
 */
export function decodePayload(d) {
  // 补回 padding
  const padded = d + '='.repeat((4 - (d.length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

/**
 * 拼装完整 deep link URL
 * @param {string} action sso / open-chat / import-resume
 * @param {object} payload
 * @returns {string}
 */
export function buildDeepLink(action, payload) {
  const merged = { ...payload, ts: Date.now(), v: PROTOCOL_VERSION };
  const d = encodePayload(merged);
  return `ikuaizhao://${action}?d=${d}&v=${PROTOCOL_VERSION}`;
}
