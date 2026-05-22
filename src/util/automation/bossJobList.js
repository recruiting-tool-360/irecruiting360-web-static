/**
 * BOSS 我的职位列表 - 抓取（新开 tab 方案）
 *
 * 实现方式：
 *   - 通过 `window.api.automation.captureViaNewTab`
 *   - main 进程在 TabManager 上新开一个 BOSS site tab（用户可在 TabBar 上看到，但焦点立刻切回原 tab）
 *   - 加载 BOSS list-new 页面 → did-finish-load 后 webContents.executeJavaScript 在 tab 上下文里 fetch 接口
 *   - 拿到 JSON 数据后立即关闭 tab
 *
 * 为什么不是隐藏窗口：之前 `captureFromHiddenView` 的 BrowserWindow 在某些
 * Electron / macOS 版本下 webContents 会被立刻 release，导致 attach debugger 后立刻
 * "target closed while handling command"。新开 tab 走 TabManager 的标准生命周期，
 * 稳定靠谱，唯一代价是用户会在 TabBar 上看到 tab 一闪而过。
 *
 * 登录态：复用 `persist:ihr360-boss` partition 的 cookie，
 * 用户在主 BOSS tab 已登录则新 tab 自动已登录。
 */

const LIST_NEW_PAGE = 'https://www.zhipin.com/web/frame/job/list-new'
const LIST_API_BASE = 'https://www.zhipin.com/wapi/zpjob/job/data/list'
const BOSS_CHANNEL = 'boss'

// 注意：曾经尝试给 LIST_NEW_PAGE 拼 `?_t=Date.now()` 强制 BOSS SPA 完整重启，
// 但 BOSS 服务端的"多 session 互斥"保护会把这种"全新 URL 进入"识别为新登录会话，
// 跟主 BOSS tab 已存在的 session 冲突 → 弹 native alert "您的账号已经登录过了，请勿重复登录"。
// 已回退：保持稳定固定 URL，依赖 BOSS partition 共享 cookie 实现登录。

/**
 * @typedef {Object} FetchBossJobListParams
 * @property {number} [position=0]
 * @property {number} [type=0]
 * @property {string} [searchStr='']
 * @property {string} [comId='']
 * @property {string} [tagIdStr='']
 * @property {number} [page=1]
 * @property {number} [timeoutMs=15000]
 * @property {string} [userAgent]
 *
 * @typedef {Object} BossJobZpData
 * @property {number} page
 * @property {number} pageSize
 * @property {boolean} hasMore
 * @property {number} totalSize
 * @property {Array<Object>} data
 *
 * @typedef {Object} FetchBossJobListResult
 * @property {boolean} ok
 * @property {BossJobZpData} [zpData]
 * @property {number} [httpStatus]
 * @property {string} [requestUrl]
 * @property {number} [durationMs]
 * @property {string} [errorCode]  one of: NOT_IN_CLIENT | API_ERROR | LOGIN_EXPIRED | EMPTY_BODY | RAW (passthrough from main)
 * @property {string} [message]
 * @property {Array<string>} [logs]
 */

/**
 * 主入口：触发一次抓取。
 *
 * @param {FetchBossJobListParams} [params]
 * @returns {Promise<FetchBossJobListResult>}
 */
export async function fetchBossJobList(params = {}) {
  if (!isInElectronClient()) {
    return {
      ok: false,
      errorCode: 'NOT_IN_CLIENT',
      message: '该功能仅在 i 快招客户端中可用（新 tab 抓取需要 Electron 主进程 TabManager）'
    }
  }

  const query = {
    position: params.position == null ? 0 : params.position,
    type: params.type == null ? 0 : params.type,
    searchStr: params.searchStr == null ? '' : String(params.searchStr),
    comId: params.comId == null ? '' : String(params.comId),
    tagIdStr: params.tagIdStr == null ? '' : String(params.tagIdStr),
    page: params.page == null ? 1 : Number(params.page),
    _: Date.now()
  }
  const apiUrl = `${LIST_API_BASE}?${new URLSearchParams(
    Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]))
  ).toString()}`

  const result = await window.api.automation.captureViaNewTab({
    channel: BOSS_CHANNEL,
    pageUrl: LIST_NEW_PAGE,
    apiUrl,
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*'
    },
    keepTab: !!params.keepTab,
    // 默认 hidden 模式：抓取 tab 不出现在 TabBar，用户全程无感知；
    // 调试时可传 visible=true 让 tab 显示出来观察加载过程
    visible: !!params.visible,
    navTimeoutMs: params.navTimeoutMs == null ? 15000 : Number(params.navTimeoutMs),
    fetchTimeoutMs: params.fetchTimeoutMs == null ? 10000 : Number(params.fetchTimeoutMs)
  })

  return normalize(result)
}

/**
 * 判断当前是否运行在 Electron 客户端里（preload 注入了 `window.api.automation.captureViaNewTab`）。
 */
export function isInElectronClient() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.api &&
      window.api.automation &&
      typeof window.api.automation.captureViaNewTab === 'function'
  )
}

/**
 * 把 main 进程返回的通用 tab-fetch 结果归一化成业务结果（含 BOSS 业务错误码）。
 * @param {{ ok: boolean; data?: any; error?: any; logs?: string[] }} raw
 * @returns {FetchBossJobListResult}
 */
function normalize(raw) {
  if (!raw) {
    return { ok: false, errorCode: 'RAW', message: 'no result from main' }
  }

  if (!raw.ok) {
    return {
      ok: false,
      errorCode: raw.error && raw.error.code ? raw.error.code : 'RAW',
      message: raw.error && raw.error.message ? raw.error.message : 'capture failed',
      logs: raw.logs
    }
  }

  const data = raw.data || {}
  const body = data.bodyJson

  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      errorCode: 'EMPTY_BODY',
      message: `interface returned empty/non-json body (status=${data.status})`,
      httpStatus: data.status,
      requestUrl: data.url,
      durationMs: data.durationMs,
      logs: raw.logs
    }
  }

  // HTTP 非 2xx 直接当业务失败
  if (data.status >= 400) {
    return {
      ok: false,
      errorCode: data.status === 401 || data.status === 403 ? 'LOGIN_EXPIRED' : 'HTTP_ERROR',
      message: `http ${data.status}`,
      httpStatus: data.status,
      requestUrl: data.url,
      durationMs: data.durationMs,
      logs: raw.logs
    }
  }

  const apiCode = Number(body.code)
  if (apiCode !== 0) {
    const msg = body.message || 'api error'
    const looksLikeLogin = /未登录|登录|login/i.test(String(msg))
    return {
      ok: false,
      errorCode: looksLikeLogin ? 'LOGIN_EXPIRED' : 'API_ERROR',
      message: `api code=${apiCode}, ${msg}`,
      httpStatus: data.status,
      requestUrl: data.url,
      durationMs: data.durationMs,
      logs: raw.logs
    }
  }

  return {
    ok: true,
    zpData: body.zpData,
    httpStatus: data.status,
    requestUrl: data.url,
    durationMs: data.durationMs,
    logs: raw.logs
  }
}

export default { fetchBossJobList, isInElectronClient }
