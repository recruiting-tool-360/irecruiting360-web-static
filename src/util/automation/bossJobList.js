/**
 * BOSS 我的职位列表 - 抓取（方案A：复用 BOSS 单例会话，不再另开 tab）
 *
 * ⚠️ 历史问题：早期用 `captureViaNewTab` **另开一个 BOSS tab** 加载 list-new 页再 fetch。
 *   但客户端已有「常驻登录监视单例 tab」一直挂着 BOSS 会话，再开第二个 BOSS 应用页 →
 *   BOSS 服务端「多 session 互斥」判定为重复登录 → 弹「您的账号已经登录过了，请勿重复登录」
 *   并可能把其中一个会话挤下线 → header BOSS 登录态掉。
 *
 * 现方案：走 `window.api.recruitBridge.universalRequest`（跟 BOSS 推荐取数同机制）：
 *   - 传 tabUrl=zhipin → main 优先在 **BOSS 站点单例 webContents** 里 `fetch`（只发一个 XHR，
 *     不导航、不新建 tab，复用同一个已登录会话）；拿不到单例则兜底用 partition session 的 ses.fetch
 *     （仍带 `persist:ihr360-boss` cookie）。
 *   - 全程**只有一个 BOSS 会话**，不触发「重复登录」；也**不打断正在跑的推荐牛人任务**
 *     （只是在该 tab 页面上下文里并行发了一个接口请求，不影响 CDP 点击/滚动自动化）。
 */

const LIST_NEW_PAGE = 'https://www.zhipin.com/web/frame/job/list-new'
const LIST_API_BASE = 'https://www.zhipin.com/wapi/zpjob/job/data/list'

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

  // 方案A：用 universalRequest 复用 BOSS 单例会话取数（不新建 tab）。
  //   tabUrl 传 zhipin 页 → main 优先在 BOSS 站点单例 webContents 里 fetch（同源、不导航），
  //   没有单例则兜底走 partition session 的 ses.fetch（带 BOSS cookie）。
  const result = await window.api.recruitBridge.universalRequest({
    url: apiUrl,
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*'
    },
    tabUrl: LIST_NEW_PAGE
  })

  return normalize(result)
}

/**
 * 判断当前是否运行在 Electron 客户端里（preload 注入了 `window.api.recruitBridge.universalRequest`）。
 */
export function isInElectronClient() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.api &&
      window.api.recruitBridge &&
      typeof window.api.recruitBridge.universalRequest === 'function'
  )
}

/**
 * 把 universalRequest 返回（{ success, status, data }）归一化成业务结果（含 BOSS 业务错误码）。
 * data 已是解析后的 BOSS envelope（{ code, message, zpData }）或字符串（非 json，如被跳登录页）。
 * @param {{ success: boolean; status?: number; data?: any; message?: string }} resp
 * @returns {FetchBossJobListResult}
 */
function normalize(resp) {
  if (!resp) {
    return { ok: false, errorCode: 'RAW', message: 'no result from main' }
  }

  // 请求层失败（网络 / ses.fetch 抛错 / 非 2xx）
  if (!resp.success) {
    const status = resp.status
    const msg = resp.message || (status ? `http ${status}` : 'request failed')
    const looksLikeLogin = status === 401 || status === 403 || /未登录|登录|login/i.test(String(msg))
    return {
      ok: false,
      errorCode: looksLikeLogin ? 'LOGIN_EXPIRED' : status >= 400 ? 'HTTP_ERROR' : 'API_ERROR',
      message: msg,
      httpStatus: status
    }
  }

  const body = resp.data

  // 非 json（典型：被站点跳到登录页返回 HTML）→ 当登录失效/空体
  if (!body || typeof body !== 'object') {
    const isLoginHtml = typeof body === 'string' && /未登录|登录|login/i.test(body)
    return {
      ok: false,
      errorCode: isLoginHtml ? 'LOGIN_EXPIRED' : 'EMPTY_BODY',
      message: `interface returned empty/non-json body (status=${resp.status})`,
      httpStatus: resp.status
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
      httpStatus: resp.status
    }
  }

  return {
    ok: true,
    zpData: body.zpData,
    httpStatus: resp.status
  }
}

export default { fetchBossJobList, isInElectronClient }
