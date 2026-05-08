/**
 * 客户端原生招聘站点桥接：取代浏览器插件的 webRequest / cookies / fetch 能力
 *
 * 主要能力（与 SPA 端 src/pluginSrc/util/PluginRequestManager.js 的 group/action 对应）：
 *
 *   - BASE_CONFIG/setBaseConfig    → 启动时挂 webRequest.onBeforeSendHeaders 抓请求头
 *                                  → 启动时挂 webRequest.onHeadersReceived 抓响应头
 *   - BASE_CONFIG/setCookieConfig  → 启动时记下 cookieStorageKey 与 partition 映射
 *   - BASE_CONFIG/getBaseConfig    → IPC 取出已抓到的 header / cookie
 *   - UPDATE_ROLES_CONFIG          → 启动时挂 webRequest.onBeforeSendHeaders 改写 Origin
 *   - UNIVERSAL_REQUEST(_BACKGROUND_MAIN) → ses.fetch 走对应站点 partition 自动带 cookie，或
 *                                  在站点窗口里 webContents.executeJavaScript 发 fetch
 *
 * 业务侧 SPA 不感知客户端 vs 浏览器，调用方式不变（仍走 i360Request），桥接由 BasePluginManager 完成
 */

import { ipcMain, session, BrowserWindow, type Session, type WebContents } from 'electron'
import { SITE_PARTITION, tabManager } from './TabManager'

// =============== 配置：站点 → partition / header 抓取规则 / Origin 改写规则 ===============

/**
 * 与 SPA 端 PluginRequestManager.pluginAllUrls 保持一致
 */
const SITE_BASE_URLS = {
  boss: 'https://www.zhipin.com',
  zhilian: 'https://rd6.zhaopin.com',
  liepin: 'https://api-lpt.liepin.com',
  liepinLogin: 'https://lpt.liepin.com',
  job51: 'https://ehirej.51job.com'
}

/**
 * channel → 启动时拿来 hydrate header 的"已登录访问页"URL
 * （与 SPA 端 goToLogin 用的 URL 保持一致；用户已登录的话这些页面会自动跳转到工作台、触发 XHR）
 */
const SITE_HYDRATE_URLS: Record<string, string> = {
  boss: `${SITE_BASE_URLS.boss}/web/user/`,
  zhilian: `${SITE_BASE_URLS.zhilian}/`,
  liepin: `${SITE_BASE_URLS.liepinLogin}/`,
  job51: 'https://ehire.51job.com/Revision/login'
}

/**
 * SPA 业务侧渠道 key（大写）
 */
const STORAGE_TO_CHANNEL: Record<string, string> = {
  BoosStorageKey: 'BOSS',
  ZHILIANRequestStorageKey: 'ZHILIAN',
  ZHILIANResponseStorageKey: 'ZHILIAN',
  LIEPINRequestStorageKey: 'LIEPIN',
  JOB51RequestStorageKey: 'JOB51'
}

/**
 * 与 ViewManager.ts 保持一致的桌面 Chrome UA（最新稳定版）
 */
const desktopChromeUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

interface HeaderCapture {
  partition: string
  urlFilter: string
  /** 监听请求头还是响应头 */
  type: 'request' | 'response'
  watchHeaders: string[]
  storageKey: string
}

const HEADER_CAPTURES: HeaderCapture[] = [
  // BOSS 请求头：zp_token
  {
    partition: SITE_PARTITION.boss,
    urlFilter: `${SITE_BASE_URLS.boss}/*`,
    type: 'request',
    watchHeaders: ['zp_token'],
    storageKey: 'BoosStorageKey'
  },
  // 智联请求头
  {
    partition: SITE_PARTITION.zhilian,
    urlFilter: `${SITE_BASE_URLS.zhilian}/*`,
    type: 'request',
    watchHeaders: ['X-Zp-Ai-Token', 'X-Zp-Page-Code', 'Y-Zp-Business-Type'],
    storageKey: 'ZHILIANRequestStorageKey'
  },
  // 智联响应头：page request id
  {
    partition: SITE_PARTITION.zhilian,
    urlFilter: `${SITE_BASE_URLS.zhilian}/*`,
    type: 'response',
    watchHeaders: ['X-zp-page-request-id'],
    storageKey: 'ZHILIANResponseStorageKey'
  },
  // 猎聘请求头
  {
    partition: SITE_PARTITION.liepin,
    urlFilter: `${SITE_BASE_URLS.liepin}/*`,
    type: 'request',
    watchHeaders: ['X-Fscp-Bi-Stat', 'X-Fscp-Std-Info', 'X-Xsrf-Token'],
    storageKey: 'LIEPINRequestStorageKey'
  },
  // 51Job 请求头
  {
    partition: SITE_PARTITION.job51,
    urlFilter: `${SITE_BASE_URLS.job51}/*`,
    type: 'request',
    watchHeaders: ['Accesstoken', 'Guid', 'Terminaltype'],
    storageKey: 'JOB51RequestStorageKey'
  }
]

/**
 * cookieStorageKey 对应的 partition + URL（用于 cookies.get）
 */
const COOKIE_TARGETS: Record<string, { partition: string; url: string }> = {
  BoosCookieStorageKey: { partition: SITE_PARTITION.boss, url: SITE_BASE_URLS.boss },
  ZHILIANCookieStorageKey: { partition: SITE_PARTITION.zhilian, url: SITE_BASE_URLS.zhilian },
  LIEPINCookieStorageKey: { partition: SITE_PARTITION.liepin, url: SITE_BASE_URLS.liepinLogin },
  JOB51CookieStorageKey: { partition: SITE_PARTITION.job51, url: SITE_BASE_URLS.job51 }
}

/**
 * universalRequest 时给请求补充 Origin（仅当业务方没传时）。
 *
 * ⚠️ 不要用 webRequest 全局改写 Origin —— 那会影响站点窗口里页面自己发的 XHR：
 *   比如 51Job 登录页跑在 ehire.51job.com（不带 j），但 XHR 发到 ehirej.51job.com（带 j）。
 *   全局把 Origin 改成 ehirej 后，51Job 服务器返回 ACAO=ehirej，
 *   但浏览器认为页面 origin 是 ehire，CORS 校验失败 → 扫码 API 全挂。
 *
 * 客户端 universalRequest 走的是 main 进程的 ses.fetch（不是浏览器 fetch），
 * 没有 SOP/CORS 限制。但部分站点服务器会校验 Origin 头，所以我们在这里**仅** 当业务方
 * 没显式传 Origin 时手动补一个，对站点窗口里自然产生的请求完全不动。
 */
const UNIVERSAL_REQUEST_ORIGIN: Record<string, string> = {
  [SITE_PARTITION.zhilian]: SITE_BASE_URLS.zhilian,
  [SITE_PARTITION.liepin]: SITE_BASE_URLS.liepin,
  [SITE_PARTITION.job51]: SITE_BASE_URLS.job51
}

/**
 * URL 前缀 → partition 的映射，universalRequest 时用来选择走哪个站点的 cookie
 */
/**
 * 根据 URL 的 host 推断 channel（覆盖各招聘站全部子域名：m.zhipin.com / ehire.51job.com 等）
 */
export function pickChannelForUrl(url: string): string | null {
  if (!url) return null
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    return null
  }
  if (host.endsWith('zhipin.com')) return 'boss'
  if (host.endsWith('zhaopin.com')) return 'zhilian'
  if (host.endsWith('liepin.com')) return 'liepin'
  if (host.endsWith('51job.com')) return 'job51'
  return null
}

function pickPartitionForUrl(url: string): string | null {
  const channel = pickChannelForUrl(url)
  if (!channel) return null
  return SITE_PARTITION[channel] ?? null
}

// =============== 内存存储：取代 chrome.storage.local ===============

interface CapturedEntry {
  url: string
  headersData: Record<string, string>
}

const HEADER_STORAGE = new Map<string, CapturedEntry>()

/**
 * 主页 tab 的 webContents 引用：用于在 header 抓到后通知 SPA 刷新登录态。
 *
 * ⚠️ 多标签架构下，"SPA"跑在主页 tab 的 WebContentsView 里，
 *    不再是主窗口本身的 webContents。所有 send('recruit:*') 都要发到这个 ref。
 */
let homeWcRef: WebContents | null = null

export function setHomeWebContentsForBridge(wc: WebContents): void {
  homeWcRef = wc
}

/**
 * 写入 header 存储；如果是新值，向主页 tab 发 IPC 事件，SPA 据此刷新对应渠道登录态
 */
function recordCapturedHeaders(storageKey: string, entry: CapturedEntry): void {
  const previous = HEADER_STORAGE.get(storageKey)
  HEADER_STORAGE.set(storageKey, entry)

  // 仅在内容变更时通知，避免抖动
  if (!previous || JSON.stringify(previous.headersData) !== JSON.stringify(entry.headersData)) {
    const channel = STORAGE_TO_CHANNEL[storageKey]
    console.log(
      `[recruitBridge] captured ${storageKey} (channel=${channel}):`,
      Object.keys(entry.headersData).join(',')
    )
    if (channel && homeWcRef && !homeWcRef.isDestroyed()) {
      homeWcRef.send('recruit:headersUpdated', { channel, storageKey })
    }
  }
}

// =============== webRequest 拦截器装配 ===============

const sessionsConfigured = new Set<string>()

function ensureSessionConfigured(partition: string): Session {
  const ses = session.fromPartition(partition)
  if (sessionsConfigured.has(partition)) return ses
  sessionsConfigured.add(partition)

  // 1) 装载所有该 partition 上的请求头抓取规则（仅监听 + 记录，不修改 header）
  const requestCaptures = HEADER_CAPTURES.filter(
    (c) => c.partition === partition && c.type === 'request'
  )

  if (requestCaptures.length > 0) {
    const allUrls = Array.from(new Set(requestCaptures.map((c) => c.urlFilter)))
    ses.webRequest.onBeforeSendHeaders({ urls: allUrls }, (details, callback) => {
      try {
        for (const cap of requestCaptures) {
          const picked: Record<string, string> = {}
          for (const target of cap.watchHeaders) {
            for (const [k, v] of Object.entries(details.requestHeaders)) {
              if (k.toLowerCase() === target.toLowerCase()) {
                picked[target] = String(v)
                break
              }
            }
          }
          if (Object.keys(picked).length > 0) {
            recordCapturedHeaders(cap.storageKey, { url: cap.urlFilter, headersData: picked })
          }
        }
      } catch (err) {
        console.error('[recruitBridge] onBeforeSendHeaders error', err)
      }
      // 关键：requestHeaders 完全不改，原样回调，避免影响站点窗口里页面自己发的 XHR
      callback({ requestHeaders: details.requestHeaders })
    })
  }

  // 2) 装载所有该 partition 上的响应头抓取规则
  const responseCaptures = HEADER_CAPTURES.filter(
    (c) => c.partition === partition && c.type === 'response'
  )
  if (responseCaptures.length > 0) {
    const respUrls = Array.from(new Set(responseCaptures.map((c) => c.urlFilter)))
    ses.webRequest.onHeadersReceived({ urls: respUrls }, (details, callback) => {
      try {
        for (const cap of responseCaptures) {
          const picked: Record<string, string> = {}
          for (const target of cap.watchHeaders) {
            const responseHeaders = details.responseHeaders ?? {}
            for (const [k, v] of Object.entries(responseHeaders)) {
              if (k.toLowerCase() === target.toLowerCase()) {
                picked[target] = Array.isArray(v) ? v[0] : String(v)
                break
              }
            }
          }
          if (Object.keys(picked).length > 0) {
            recordCapturedHeaders(cap.storageKey, { url: cap.urlFilter, headersData: picked })
          }
        }
      } catch (err) {
        console.error('[recruitBridge] onHeadersReceived error', err)
      }
      callback({ responseHeaders: details.responseHeaders })
    })
  }

  return ses
}

// =============== 启动时为所有招聘站 partition 装配拦截器 ===============

export function setupSiteSessions(): void {
  for (const partition of Object.values(SITE_PARTITION)) {
    ensureSessionConfigured(partition)
  }
}

// =============== 启动时自动 hydrate：检查每个站点的 partition 是否有持久化登录态 ===============
// 思路：原插件版用户在 Chrome 里有 BOSS tab 开着，插件 webRequest 持续抓 header。
// 客户端模式没有"常驻 tab"，所以在启动时如果检测到该站点已登录（partition 里有 cookie），
// 就开一个隐藏 BrowserWindow 加载该站点首页，让 BOSS 自家 JS 触发 XHR 把 zp_token / X-Zp-Ai-Token
// 等 header 通过我们的 webRequest 拦截器抓到 HEADER_STORAGE，5 秒后销毁窗口。
// SPA 端 onHeadersUpdated 监听器会在 header 抓到后被通知，自动刷新对应渠道登录状态。

const hydratedChannels = new Set<string>()

export async function hydrateLoggedInSites(): Promise<void> {
  for (const [channelKey, partition] of Object.entries(SITE_PARTITION)) {
    if (hydratedChannels.has(channelKey)) continue
    void hydrateOneSite(channelKey, partition)
  }
}

async function hydrateOneSite(channelKey: string, partition: string): Promise<void> {
  try {
    const ses = ensureSessionConfigured(partition)

    // 1. 没 cookie 直接跳过（用户从未在客户端里登录过该站）
    const cookieKey = getCookieStorageKeyForChannel(channelKey)
    const cookieTarget = cookieKey ? COOKIE_TARGETS[cookieKey] : null
    if (!cookieTarget) return
    const cookies = await ses.cookies.get({ url: cookieTarget.url })
    if (!cookies || cookies.length === 0) {
      console.log(`[recruitBridge] hydrate skip ${channelKey}: no cookies`)
      return
    }

    const hydrateUrl = SITE_HYDRATE_URLS[channelKey]
    if (!hydrateUrl) return

    console.log(`[recruitBridge] hydrating ${channelKey} via ${hydrateUrl}`)
    hydratedChannels.add(channelKey)

    // 2. 开个不可见的 BrowserWindow 加载首页，让站点自家 JS 发 XHR 触发 header 抓取
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      show: false,
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win.webContents.setUserAgent(desktopChromeUserAgent)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.loadURL(hydrateUrl).catch((err) => {
      console.error(`[recruitBridge] hydrate ${channelKey} loadURL error`, err)
    })

    // 3. 给 5 秒让首屏 XHR 跑完，然后销毁
    setTimeout(() => {
      try {
        if (!win.isDestroyed()) win.destroy()
      } catch {
        /* ignore */
      }
    }, 5000)
  } catch (err) {
    console.error(`[recruitBridge] hydrate ${channelKey} failed`, err)
  }
}

function getCookieStorageKeyForChannel(channel: string): string | null {
  const m: Record<string, string> = {
    boss: 'BoosCookieStorageKey',
    zhilian: 'ZHILIANCookieStorageKey',
    liepin: 'LIEPINCookieStorageKey',
    job51: 'JOB51CookieStorageKey'
  }
  return m[channel] ?? null
}

// =============== universalRequest：用 ses.fetch 通过对应 partition 发请求 ===============

interface UniversalRequestArgs {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  credentials?: string
  // SPA 端如果传了 tabUrl 表示希望"借站点窗口的上下文"，对应原插件 UNIVERSAL_REQUEST_BACKGROUND_MAIN
  tabUrl?: string
}

interface UniversalRequestResult {
  success: boolean
  data?: unknown
  status?: number
  message?: string
}

async function universalRequest(args: UniversalRequestArgs): Promise<UniversalRequestResult> {
  const { url, method = 'POST', headers = {}, body, tabUrl } = args
  const partition = pickPartitionForUrl(url)
  if (!partition) {
    return { success: false, message: `no partition for url: ${url}` }
  }
  const ses = ensureSessionConfigured(partition)

  // 拷贝一份 header，删除 Cookie（让 session 自己带）
  const finalHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'cookie') continue
    if (v != null) finalHeaders[k] = String(v)
  }

  // 优先尝试在站点 tab 的 webContents 里执行 fetch（绕过潜在的指纹/CORS 问题）
  if (tabUrl) {
    const channel = pickChannelForUrl(tabUrl) ?? pickChannelForUrl(url)
    if (channel) {
      const wc = tabManager.getSiteWebContentsForChannel(channel)
      if (wc) {
        try {
          return await fetchInsideWebContents(wc, { url, method, headers: finalHeaders, body })
        } catch (err) {
          console.warn('[recruitBridge] fetch in tab failed, fallback ses.fetch', err)
        }
      }
    }
  }

  // 兜底：通过 partition session 的 fetch（自动带 cookie）
  return await fetchViaSession(ses, { url, method, headers: finalHeaders, body })
}

async function fetchViaSession(
  ses: Session,
  args: { url: string; method: string; headers: Record<string, string>; body?: unknown }
): Promise<UniversalRequestResult> {
  try {
    // 按需补 Origin/Referer：仅对智联/猎聘/51Job 这种服务端校验 Origin 的站点
    // 业务方传了 Origin 就尊重业务方，没传才按 partition 反推默认值
    const partition = pickPartitionForUrl(args.url)
    const finalHeaders: Record<string, string> = { ...args.headers }
    if (partition) {
      const defaultOrigin = UNIVERSAL_REQUEST_ORIGIN[partition]
      if (defaultOrigin) {
        const hasOrigin = Object.keys(finalHeaders).some((k) => k.toLowerCase() === 'origin')
        if (!hasOrigin) finalHeaders['Origin'] = defaultOrigin
        const hasReferer = Object.keys(finalHeaders).some((k) => k.toLowerCase() === 'referer')
        if (!hasReferer) finalHeaders['Referer'] = defaultOrigin + '/'
      }
    }

    const init: RequestInit & { credentials?: 'include' } = {
      method: args.method,
      headers: finalHeaders,
      credentials: 'include'
    }
    if (args.body !== undefined && args.body !== null && args.method.toUpperCase() !== 'GET') {
      init.body = serializeBody(args.body, finalHeaders)
    }

    // Electron 25+: session.fetch 用该 session 的 cookie/proxy
    const ses2 = ses as unknown as {
      fetch: (input: string, init?: RequestInit) => Promise<Response>
    }
    const resp = await ses2.fetch(args.url, init)
    const contentType = resp.headers.get('content-type') ?? ''
    const data = contentType.includes('json') ? await resp.json() : await resp.text()
    return { success: resp.ok, status: resp.status, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[recruitBridge] fetchViaSession error', message)
    return { success: false, message }
  }
}

async function fetchInsideWebContents(
  wc: Electron.WebContents,
  args: { url: string; method: string; headers: Record<string, string>; body?: unknown }
): Promise<UniversalRequestResult> {
  const bodyStr = args.body == null ? null : serializeBodyForInPage(args.body, args.headers)
  const script = `(async () => {
    try {
      const init = ${JSON.stringify({
        method: args.method,
        headers: args.headers,
        credentials: 'include'
      })};
      ${bodyStr ? `init.body = ${JSON.stringify(bodyStr)};` : ''}
      const resp = await fetch(${JSON.stringify(args.url)}, init);
      const ct = resp.headers.get('content-type') || '';
      const data = ct.includes('json') ? await resp.json() : await resp.text();
      return { success: resp.ok, status: resp.status, data };
    } catch (e) {
      return { success: false, message: String(e && e.message || e) };
    }
  })()`
  const result = (await wc.executeJavaScript(script, true)) as UniversalRequestResult
  return result
}

function serializeBody(body: unknown, headers: Record<string, string>): string | URLSearchParams {
  if (typeof body === 'string') return body
  const ct = (headers['Content-Type'] ?? headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('json')) return JSON.stringify(body)
  // 默认 form-urlencoded（与原插件一致：plugin background 里也是 fetch + body 是对象时被引擎当 JSON 处理）
  // 这里保险起见走 form：
  if (typeof body === 'object' && body !== null) {
    const fd = new URLSearchParams()
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v !== undefined) fd.append(k, String(v))
    }
    return fd
  }
  return String(body)
}

function serializeBodyForInPage(body: unknown, headers: Record<string, string>): string {
  if (typeof body === 'string') return body
  const ct = (headers['Content-Type'] ?? headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('json')) return JSON.stringify(body)
  if (typeof body === 'object' && body !== null) {
    const fd = new URLSearchParams()
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v !== undefined) fd.append(k, String(v))
    }
    return fd.toString()
  }
  return String(body)
}

// =============== IPC handlers ===============

export function registerRecruitBridgeIpc(): void {
  // 已抓到的请求/响应 header
  ipcMain.handle('recruit:getCapturedHeaders', async (_e, storageKey: string) => {
    const entry = HEADER_STORAGE.get(storageKey)
    return entry ?? null
  })

  // 站点 cookie：通过 partition.cookies.get 实时取
  ipcMain.handle('recruit:getCapturedCookies', async (_e, storageKey: string) => {
    const target = COOKIE_TARGETS[storageKey]
    if (!target) return null
    const ses = ensureSessionConfigured(target.partition)
    const cookies = await ses.cookies.get({ url: target.url })
    if (!cookies || cookies.length === 0) return null
    const cookieData = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    return { url: target.url, cookieData }
  })

  // universalRequest
  ipcMain.handle('recruit:universalRequest', async (_e, req: UniversalRequestArgs) => {
    console.log(`[recruitBridge] universalRequest ${req.method ?? 'POST'} ${req.url}`)
    const result = await universalRequest(req)
    console.log(
      `[recruitBridge] universalRequest result success=${result.success} status=${result.status ?? 'n/a'}` +
        (result.message ? ` message=${result.message}` : '')
    )
    return result
  })

  // openSiteWindow（保留接口名以兼容 SPA；多标签架构下变成"开/激活招聘站 tab"）
  ipcMain.handle('recruit:openSiteWindow', async (_e, channel: string, url: string) => {
    if (typeof channel !== 'string' || typeof url !== 'string') {
      return { success: false, message: 'invalid params' }
    }
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, message: 'url must be http(s)' }
    }
    const tabId = tabManager.openOrActivateSiteTab(channel, url)
    const wc = tabManager.getSiteWebContentsForChannel(channel)
    // 站点 tab 加载完后过 2s 主动通知主页 SPA 刷新对应渠道登录态
    // （登录后 BOSS 自家 JS 会发一批 XHR，足够把 zp_token 抓到 HEADER_STORAGE）
    if (wc) {
      wc.once('did-finish-load', () => {
        setTimeout(() => {
          if (homeWcRef && !homeWcRef.isDestroyed()) {
            homeWcRef.send('recruit:siteWindowReady', {
              channel: channel.toUpperCase()
            })
          }
        }, 2000)
      })
    }
    return { success: true, tabId }
  })
}
