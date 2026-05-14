/**
 * Tab fetcher
 *
 * 在"新开一个 site tab（hidden 模式）"里完成接口抓取，绕开 hidden BrowserWindow 在某些
 * Electron / macOS 版本下 webContents 立刻 release 的 bug。
 *
 * 流程：
 *   1) tabManager.openOrActivateSiteTab(channel, pageUrl, { hidden: true })
 *      → tab 仍有 webContents（在主窗口 contentView 里），但**不出现在 TabBar**，
 *        也不被 activate（保持当前 active 不变）
 *   2) 等新 tab `did-finish-load`（同源在 zhipin.com 域名）
 *   3) `webContents.executeJavaScript('fetch(API_URL).then(r=>r.json())', true)` → 拿 JSON
 *   4) tabManager.close(newTabId) 销毁这个 tab
 *
 * 用户体验：用户**完全感知不到**（TabBar 上不会出现这个 tab，焦点也不会被切走）。
 */

import { ipcMain } from 'electron'
import { tabManager } from './TabManager'

export interface TabFetchRequest {
  /** 招聘站渠道，如 'boss' / 'zhilian' / 'job51'。决定 partition 和 SITE_TITLE */
  channel: string
  /** 在新 tab 里要打开的页面（一般是接口所属业务页，便于接口走同源 + 正确 Referer） */
  pageUrl: string
  /** 要 fetch 的接口 URL（绝对地址或相对地址都行，相对地址 / 开头会以 pageUrl 的 origin 拼接） */
  apiUrl: string
  /** HTTP method，默认 GET */
  method?: string
  /** 自定义 header（注入到 fetch 的 options.headers） */
  headers?: Record<string, string>
  /** 请求 body，string；调用方自行 JSON.stringify */
  body?: string
  /** 是否保留 tab（debug 用，默认 false 抓完就关） */
  keepTab?: boolean
  /**
   * 是否让新 tab 可见（出现在 TabBar 上 + activate）。
   * 默认 false → 走 hidden 模式：tab 不出现在 TabBar、不 activate，用户全程无感知。
   * 仅在调试 / 需要让用户看到加载过程时设为 true。
   */
  visible?: boolean
  /** 页面 navigation 总超时（含可能的重定向），默认 15000 */
  navTimeoutMs?: number
  /** fetch 自身的超时，默认 10000 */
  fetchTimeoutMs?: number
}

export interface TabFetchResult {
  ok: boolean
  data?: {
    status: number
    url: string
    bodyText: string
    bodyJson: unknown | null
    bodyBytes: number
    durationMs: number
    finalPageUrl: string
  }
  error?: {
    code:
      | 'BAD_REQUEST'
      | 'NAV_TIMEOUT'
      | 'NAV_FAILED'
      | 'FETCH_FAILED'
      | 'FETCH_TIMEOUT'
      | 'TAB_NOT_FOUND'
      | 'UNEXPECTED'
    message: string
  }
  logs?: string[]
}

export async function captureViaNewTab(req: TabFetchRequest): Promise<TabFetchResult> {
  const logs: string[] = []
  const log = (m: string): void => {
    const line = `[tabFetcher ${req.channel ?? '?'}] ${m}`
    logs.push(line)
    console.log(line)
  }

  if (!req || typeof req.channel !== 'string' || typeof req.pageUrl !== 'string' || typeof req.apiUrl !== 'string') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'channel / pageUrl / apiUrl required' }
    }
  }

  const navTimeoutMs = req.navTimeoutMs ?? 15000
  const fetchTimeoutMs = req.fetchTimeoutMs ?? 10000
  const isHidden = !req.visible
  const startedAt = Date.now()

  log(`start pageUrl=${req.pageUrl} apiUrl=${req.apiUrl} hidden=${isHidden}`)

  let tabId: string
  try {
    tabId = tabManager.openOrActivateSiteTab(req.channel, req.pageUrl, { hidden: isHidden })
  } catch (e) {
    return {
      ok: false,
      error: { code: 'UNEXPECTED', message: `openOrActivateSiteTab failed: ${(e as Error).message}` },
      logs
    }
  }
  log(`tab created id=${tabId} hidden=${isHidden}`)

  const wc = tabManager.getWebContentsById(tabId)
  if (!wc) {
    return {
      ok: false,
      error: { code: 'TAB_NOT_FOUND', message: `webContents not found for tab ${tabId}` },
      logs
    }
  }

  // 1) 等 did-finish-load
  try {
    await waitForLoad(wc, navTimeoutMs)
    log(`did-finish-load url=${wc.getURL()}`)
  } catch (e) {
    const msg = (e as Error).message
    log(`nav fail: ${msg}`)
    if (!req.keepTab) tabManager.close(tabId)
    return {
      ok: false,
      error: { code: /timeout/i.test(msg) ? 'NAV_TIMEOUT' : 'NAV_FAILED', message: msg },
      logs
    }
  }

  // 2) executeJavaScript 在 tab 上下文里 fetch
  const fetchScript = buildFetchScript(req, fetchTimeoutMs)
  let raw: { status: number; bodyText: string; url: string } | null = null
  try {
    raw = (await wc.executeJavaScript(fetchScript, true)) as typeof raw
  } catch (e) {
    const msg = (e as Error).message
    log(`executeJavaScript fail: ${msg}`)
    if (!req.keepTab) tabManager.close(tabId)
    return {
      ok: false,
      error: { code: 'FETCH_FAILED', message: msg },
      logs
    }
  }

  if (!raw) {
    if (!req.keepTab) tabManager.close(tabId)
    return {
      ok: false,
      error: { code: 'FETCH_FAILED', message: 'fetch returned no payload' },
      logs
    }
  }

  // executeJavaScript 里我们把 timeout/abort 包成结构化错误对象
  type FetchScriptResp = {
    status: number
    bodyText: string
    url: string
    errorCode?: 'FETCH_TIMEOUT' | 'FETCH_FAILED'
    errorMessage?: string
  }
  const r = raw as unknown as FetchScriptResp
  if (r.errorCode) {
    if (!req.keepTab) tabManager.close(tabId)
    return {
      ok: false,
      error: { code: r.errorCode, message: r.errorMessage || r.errorCode },
      logs
    }
  }

  let bodyJson: unknown = null
  try {
    bodyJson = JSON.parse(r.bodyText)
  } catch {
    bodyJson = null
  }

  const result: TabFetchResult = {
    ok: true,
    data: {
      status: r.status,
      url: r.url,
      bodyText: r.bodyText,
      bodyJson,
      bodyBytes: Buffer.byteLength(r.bodyText || '', 'utf8'),
      durationMs: Date.now() - startedAt,
      finalPageUrl: wc.getURL()
    },
    logs
  }
  log(`fetched status=${r.status} bytes=${result.data?.bodyBytes} duration=${result.data?.durationMs}ms`)

  if (!req.keepTab) {
    tabManager.close(tabId)
    log(`tab closed id=${tabId}`)
  }
  return result
}

/** 等 webContents 完成首次主 frame navigation */
function waitForLoad(wc: Electron.WebContents, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timer)
      wc.removeListener('did-finish-load', onFinish)
      wc.removeListener('did-fail-load', onFail)
    }
    const onFinish = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const onFail = (
      _e: Electron.Event,
      code: number,
      desc: string,
      _validatedURL: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) return
      // ERR_ABORTED (-3) 是重定向 / 客户端 nav，不算 fatal
      if (code === -3) return
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`did-fail-load: ${desc} (${code})`))
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`nav timeout ${timeoutMs}ms`))
    }, timeoutMs)
    wc.on('did-finish-load', onFinish)
    wc.on('did-fail-load', onFail)
  })
}

/** 构造在 tab 上下文执行的 fetch 脚本。结构化错误代替抛异常，便于 IPC 传回 */
function buildFetchScript(req: TabFetchRequest, fetchTimeoutMs: number): string {
  const payload = {
    apiUrl: req.apiUrl,
    method: req.method || 'GET',
    headers: req.headers || {},
    body: req.body,
    timeoutMs: fetchTimeoutMs
  }
  // 注意：必须返回一个 Promise，executeJavaScript(..., true) 会 await 它
  return `(async () => {
    const args = ${JSON.stringify(payload)};
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), args.timeoutMs);
    try {
      const resp = await fetch(args.apiUrl, {
        method: args.method,
        headers: args.headers,
        body: args.body,
        credentials: 'include',
        signal: ac.signal
      });
      const text = await resp.text();
      return { status: resp.status, url: resp.url, bodyText: text };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      const aborted = /abort/i.test(msg) || ac.signal.aborted;
      return {
        status: 0,
        url: '',
        bodyText: '',
        errorCode: aborted ? 'FETCH_TIMEOUT' : 'FETCH_FAILED',
        errorMessage: msg
      };
    } finally {
      clearTimeout(t);
    }
  })();`
}

/**
 * 注册 IPC：renderer → main 调用。
 * main/index.ts 的 registerIpc() 调一次即可。
 */
export function registerTabFetcherIpc(): void {
  ipcMain.handle('automation:captureViaNewTab', async (_e, req: TabFetchRequest) => {
    try {
      return await captureViaNewTab(req)
    } catch (e) {
      return {
        ok: false,
        error: { code: 'UNEXPECTED', message: (e as Error).message || 'unexpected' }
      } satisfies TabFetchResult
    }
  })
}
