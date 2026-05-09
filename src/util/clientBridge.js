/**
 * 浏览器 → i 快招 Electron 客户端 数据通道
 *
 * 走的是同机本地 HTTP（probe server）→ 主进程 IPC 透传 → SPA 监听。
 * 与 deep link 不同，本通道**只负责数据传递**，没有 OS 唤起 / 单例锁定等功能：
 *   - 优势：不受 URL 长度限制，新业务 type 不需要客户端重新发版
 *   - 前置条件：客户端必须已经在跑（probe 200）。没在跑 → 返回 not-running，
 *     由调用方自行决定是否走 deep link 唤起后再 dispatch。
 *
 * 与 useClientLauncher 的关系：
 *   - useClientLauncher.tryLaunch() —— 用于「拉起客户端」(deep link + 探活)
 *   - sendToClient()                 —— 用于「客户端在跑时往 SPA 推数据」
 *   - 一次完整的「打开客户端 + 推数据」组合可以是：先 tryLaunch 等 succeed,
 *     然后调 sendToClient('xxx', extraData) 把超出 deep link 大小的内容补推
 *
 * 协议形态（与 electron/src/main/probeServer.ts 一致）：
 *
 *   POST http://127.0.0.1:53531/__ikuaizhao/dispatch
 *   Content-Type: application/json
 *   Body: { v: 1, type: string, payload?: any, requestId?: string }
 *
 *   200 → { ok: true, dispatched: true, requestId? }
 *   400 → 参数不合法
 *   503 → 客户端在跑但 home tab 还没就绪（让浏览器侧重试）
 *   网络层 fail → 客户端没跑 / 端口冲突 fallback
 *
 * 业务约定：
 *   - type 字符串建议带模块前缀，例如 'launcher:init', 'recruit:resume', 'ihr:assign'
 *   - 主进程层不解析 payload；type 白名单 / 权限校验在 SPA 端完成
 */

const DISPATCH_URL = 'http://127.0.0.1:53531/__ikuaizhao/dispatch';
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * @typedef {Object} DispatchResult
 * @property {boolean} ok                   是否成功送达
 * @property {boolean} [dispatched]          主进程是否成功转发到 SPA
 * @property {'not-running'|'no-renderer'|'invalid-body'|'body-too-large'|'invalid-json'|'network-error'|'timeout'|'http-error'|'invalid-response'} [reason]
 * @property {number} [status]               非 200 时的 HTTP 状态码
 * @property {string} [requestId]            原样回显，用于关联 request/response（如果调用方传了）
 * @property {string} [error]                后端返回的 error code（透传）
 */

/**
 * 推一条消息给客户端 SPA
 *
 * @param {string} type    业务事件类型，对端 window.api.browserBridge.on(type, cb) 监听
 * @param {*}      [payload]  业务数据，会被 JSON.stringify。任意大小（端到端 8MB 上限）
 * @param {{ requestId?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<DispatchResult>}
 *
 * @example
 *   const res = await sendToClient('launcher:position-list', { positions: [...] })
 *   if (!res.ok) {
 *     // 客户端没在跑或者推送失败，决定 fallback 路径
 *   }
 */
export async function sendToClient(type, payload, opts = {}) {
  if (typeof fetch !== 'function') {
    return { ok: false, reason: 'network-error' };
  }
  if (!type || typeof type !== 'string') {
    return { ok: false, reason: 'invalid-body' };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestId = opts.requestId;

  let res;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    res = await fetch(DISPATCH_URL, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 1, type, payload, requestId }),
      signal: ctrl.signal
    });
    clearTimeout(t);
  } catch (e) {
    // ECONNREFUSED → 客户端未在跑；AbortError → 超时
    const reason = e?.name === 'AbortError' ? 'timeout' : 'not-running';
    return { ok: false, reason };
  }

  let body = null;
  try {
    body = await res.json();
  } catch (_e) {
    return { ok: false, reason: 'invalid-response', status: res.status };
  }

  if (res.status === 200 && body?.ok) {
    return {
      ok: true,
      dispatched: !!body.dispatched,
      requestId: body.requestId
    };
  }
  if (res.status === 503) {
    return { ok: false, reason: 'no-renderer', status: 503, error: body?.error };
  }
  if (res.status === 400) {
    return {
      ok: false,
      reason: body?.error === 'body_too_large' ? 'body-too-large' : 'invalid-body',
      status: 400,
      error: body?.error
    };
  }
  return { ok: false, reason: 'http-error', status: res.status, error: body?.error };
}

/**
 * 包装版：自动重试一次（针对 503 home tab 还没就绪场景）
 *
 * 用法上等价于直接调 sendToClient，但首次拿到 reason='no-renderer' 时会等 retryDelayMs 再试一次
 */
export async function sendToClientWithRetry(type, payload, opts = {}) {
  const retryDelayMs = opts.retryDelayMs ?? 500;
  const first = await sendToClient(type, payload, opts);
  if (first.ok || first.reason !== 'no-renderer') return first;
  await new Promise((r) => setTimeout(r, retryDelayMs));
  return sendToClient(type, payload, opts);
}
