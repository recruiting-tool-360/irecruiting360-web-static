/**
 * Hidden view runner
 *
 * 用途：起一个**用户完全不可见**的 BrowserWindow，加载指定 URL，
 *       通过 CDP (chrome devtools protocol) 监听某个接口的 response body，
 *       拿到后立即销毁窗口、detach debugger。
 *
 * 适用场景：
 *   - 后台静默拉取招聘站接口（如 BOSS 我的职位列表 / 智联渠道职位接口）
 *   - 不能/不想复用用户当前 tab（怕打扰用户、怕影响用户浏览状态）
 *   - 不能直接用 fetch（接口依赖页面自身发起，比如携带特殊 token / Origin）
 *
 * 实现要点：
 *   - 用 `BrowserWindow({ show: false })`：彻底不画面、不进 dock / 任务栏
 *     （比 attach 一个 0×0 的 WebContentsView 干净，且不污染主窗口的 contentView 列表）
 *   - 用 `session.fromPartition(partition)`：与对应招聘 tab 共用 cookie / storage，
 *     已登录态自动继承（不需要重新登录）
 *   - 用 `webContents.debugger`：唯一能拿到 response body 的标准方式
 *     （session.webRequest.onCompleted 拿不到 body）
 *   - 超时/成功/失败统一走 `cleanup()`，保证窗口与 debugger 都会释放
 *
 * 不引入 playwright-core：这条路径不需要 Playwright，纯 CDP 即可，依赖更轻。
 */

import { BrowserWindow, ipcMain, session } from 'electron'

/** 桌面 Chrome UA（与 TabManager 中保持一致，避免 BOSS 等站点感知到不同 UA） */
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

export interface HiddenCaptureRequest {
  /** 要加载的页面 URL（页面加载过程中会自然触发要抓的接口） */
  pageUrl: string
  /** session partition，如 'persist:ihr360-boss'。继承该站点登录态 */
  partition: string
  /** 抓取规则 */
  capture: {
    /** URL 包含的子串（任一命中即可） */
    urlIncludes?: string
    /** 或者 URL 正则（字符串形式，main 进程会 `new RegExp(p)`） */
    urlPattern?: string
    /** 限制 HTTP 方法（GET/POST/...）；不传则任意 */
    method?: string
    /**
     * 命中后是否立刻完成：
     *   - true（默认）：抓到第一条匹配的接口 + body 就返回并销毁窗口
     *   - false：等到 timeout，期间所有匹配都收集起来，最后一起返回（暂不支持，预留）
     */
    matchFirst?: boolean
  }
  /** 单次任务超时（ms），默认 15000 */
  timeoutMs?: number
  /** 覆盖默认 UA */
  userAgent?: string
  /** 额外请求头（附加到所有出站请求，一般无需） */
  extraHeaders?: Record<string, string>
}

export interface HiddenCaptureCaptured {
  url: string
  method: string
  status: number
  /** 已尝试 JSON.parse 的 body；失败时为 null */
  bodyJson: unknown | null
  /** 文本 body（如果不是 base64Encoded，且能 decode 成 utf8） */
  bodyText: string | null
  /** 大小（解码后字节） */
  bodyBytes: number
  responseHeaders: Record<string, string>
  /** ms */
  durationMs: number
}

export interface HiddenCaptureResult {
  ok: boolean
  /** ok=true 时填充 */
  data?: HiddenCaptureCaptured
  /** ok=false 时填充 */
  error?: {
    code:
      | 'TIMEOUT'
      | 'PAGE_LOAD_FAILED'
      | 'CDP_ATTACH_FAILED'
      | 'CDP_ERROR'
      | 'GET_BODY_FAILED'
      | 'BAD_REQUEST'
      | 'CANCELLED'
    message: string
  }
  /** 调试日志（无敏感信息） */
  logs?: string[]
}

interface PendingMatch {
  requestId: string
  url: string
  method: string
  status: number
  responseHeaders: Record<string, string>
  receivedAt: number
}

/**
 * 主入口：抓取一次。完成（成功 or 失败 or 超时）后窗口 + debugger 都被释放。
 */
export async function captureFromHiddenView(
  req: HiddenCaptureRequest
): Promise<HiddenCaptureResult> {
  const logs: string[] = []
  const log = (m: string): void => {
    logs.push(`[${new Date().toISOString()}] ${m}`)
  }

  if (!req || typeof req.pageUrl !== 'string' || typeof req.partition !== 'string') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'pageUrl & partition are required' },
      logs
    }
  }
  if (!req.capture || (!req.capture.urlIncludes && !req.capture.urlPattern)) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'capture.urlIncludes or capture.urlPattern is required'
      },
      logs
    }
  }

  const timeoutMs = req.timeoutMs ?? 15000
  const matchMethod = (req.capture.method || '').toUpperCase()
  let urlRegex: RegExp | null = null
  if (req.capture.urlPattern) {
    try {
      urlRegex = new RegExp(req.capture.urlPattern)
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: `invalid urlPattern: ${(e as Error).message}`
        },
        logs
      }
    }
  }

  const matchUrl = (u: string, m: string): boolean => {
    if (matchMethod && m.toUpperCase() !== matchMethod) return false
    if (urlRegex && !urlRegex.test(u)) return false
    if (req.capture.urlIncludes && !u.includes(req.capture.urlIncludes)) return false
    if (!urlRegex && !req.capture.urlIncludes) return false
    return true
  }

  const ses = session.fromPartition(req.partition)
  // 关键：不用 show:false。某些 Electron / macOS 版本下 show:false 且无 parent 的窗口
  // 会被自动 release，导致 webContents 在 attach 后立刻销毁、sendCommand 抛
  // "target closed while handling command"。
  // 改用 show:true + 摆到屏幕外 + skipTaskbar + opacity 0，用户视觉上仍然不可见。
  const win = new BrowserWindow({
    show: true,
    x: -32000,
    y: -32000,
    width: 1280,
    height: 800,
    opacity: 0,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: ses,
      // 显式关掉后台节流，避免某些站点的 setTimeout 触发的 lazy 请求被吃掉
      backgroundThrottling: false
    }
  })
  // 防止页面 <title> 把窗口标题改成奇怪东西（小概率出现在 dock hover）
  try {
    win.setTitle('')
  } catch {
    /* ignore */
  }
  win.webContents.setUserAgent(req.userAgent || DESKTOP_CHROME_UA)

  // 额外 header 注入（如果有）
  let headerHandlerRegistered = false
  if (req.extraHeaders && Object.keys(req.extraHeaders).length > 0) {
    ses.webRequest.onBeforeSendHeaders(
      { urls: ['<all_urls>'] },
      (details, callback) => {
        // 只对这个隐藏 window 自己的 webContents 注入
        if (details.webContents?.id !== win.webContents.id) {
          callback({ requestHeaders: details.requestHeaders })
          return
        }
        const merged = { ...details.requestHeaders, ...(req.extraHeaders || {}) }
        callback({ requestHeaders: merged })
      }
    )
    headerHandlerRegistered = true
  }

  const startedAt = Date.now()
  let settled = false
  let candidate: PendingMatch | null = null
  /** 隐藏窗口期间观察到的、与目标域名相关的所有请求（用于超时时回传诊断信息） */
  const seenZhipinUrls: Array<{ url: string; method: string; status?: number }> = []
  /** 从 pageUrl 推出来的"主域"（如 zhipin.com），用于 seenZhipinUrls 过滤 */
  let pageHost = ''
  try {
    pageHost = new URL(req.pageUrl).hostname
  } catch {
    pageHost = ''
  }
  /** 主域去掉前缀（boss → zhipin.com），保留 etld+1 段，给 endsWith 用 */
  const hostEtld = pageHost.split('.').slice(-2).join('.')
  /** main 进程日志前缀，方便从 dev:el:local 终端定位 */
  const tag = `[hiddenView ${pageHost}]`
  console.log(`${tag} start partition=${req.partition} url=${req.pageUrl} timeoutMs=${timeoutMs}`)

  return await new Promise<HiddenCaptureResult>((resolve) => {
    const finish = (result: HiddenCaptureResult): void => {
      if (settled) return
      settled = true
      result.logs = logs
      cleanup()
      resolve(result)
    }

    const cleanup = (): void => {
      try {
        if (win.webContents.debugger.isAttached()) {
          win.webContents.debugger.detach()
        }
      } catch (e) {
        log(`detach debugger err: ${(e as Error).message}`)
      }
      if (headerHandlerRegistered) {
        try {
          ses.webRequest.onBeforeSendHeaders(null)
        } catch (e) {
          log(`reset header handler err: ${(e as Error).message}`)
        }
      }
      if (!win.isDestroyed()) {
        try {
          win.destroy()
        } catch (e) {
          log(`destroy window err: ${(e as Error).message}`)
        }
      }
    }

    const timer = setTimeout(() => {
      // 超时诊断：把当前页面实际 URL + 这段时间观察到的目标域请求清单都写进 logs
      const finalUrl = (() => {
        try {
          return win.isDestroyed() ? '<destroyed>' : win.webContents.getURL()
        } catch {
          return '<unknown>'
        }
      })()
      log(`finalUrl=${finalUrl}`)
      if (seenZhipinUrls.length === 0) {
        log(`saw 0 requests on host=${hostEtld || pageHost} during ${timeoutMs}ms`)
      } else {
        log(`saw ${seenZhipinUrls.length} requests on host=${hostEtld || pageHost}:`)
        for (const r of seenZhipinUrls.slice(0, 30)) {
          log(`  - ${r.method} ${r.status ?? '?'} ${r.url}`)
        }
        if (seenZhipinUrls.length > 30) {
          log(`  ... and ${seenZhipinUrls.length - 30} more`)
        }
      }
      finish({
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: `timed out after ${timeoutMs}ms (matched=${candidate ? 'response_received_but_no_body' : 'none'}, finalUrl=${finalUrl}, seen=${seenZhipinUrls.length})`
        }
      })
    }, timeoutMs)

    // attach debugger 必须在 loadURL 之前
    try {
      win.webContents.debugger.attach('1.3')
      console.log(`${tag} debugger attached`)
    } catch (e) {
      console.log(`${tag} debugger attach FAILED: ${(e as Error).message}`)
      clearTimeout(timer)
      finish({
        ok: false,
        error: { code: 'CDP_ATTACH_FAILED', message: (e as Error).message }
      })
      return
    }

    win.webContents.debugger.on('detach', (_event, reason) => {
      console.log(`${tag} debugger detached: ${reason}`)
      log(`debugger detached: ${reason}`)
    })

    // 让 main 终端能看到隐藏窗口的导航生命周期（诊断"没抓到接口"用）
    win.webContents.on('did-start-loading', () => {
      console.log(`${tag} did-start-loading`)
    })
    win.webContents.on('did-stop-loading', () => {
      const u = win.isDestroyed() ? '<destroyed>' : win.webContents.getURL()
      console.log(`${tag} did-stop-loading url=${u}`)
    })
    win.webContents.on('did-redirect-navigation', (_e, url) => {
      console.log(`${tag} did-redirect-navigation → ${url}`)
    })
    win.webContents.on('did-finish-load', () => {
      const u = win.isDestroyed() ? '<destroyed>' : win.webContents.getURL()
      console.log(`${tag} did-finish-load url=${u}`)
    })

    win.webContents.debugger.on(
      'message',
      (_event, method: string, params: Record<string, unknown>) => {
        // 诊断：把目标域所有出站请求 URL 都记到 seenZhipinUrls，超时时回传给前端
        if (method === 'Network.requestWillBeSent' && hostEtld) {
          const reqUrl = String(
            (params as { request?: { url?: string } }).request?.url || ''
          )
          const reqMethod = String(
            (params as { request?: { method?: string } }).request?.method || 'GET'
          )
          try {
            const u = new URL(reqUrl)
            if (u.hostname.endsWith(hostEtld)) {
              seenZhipinUrls.push({ url: reqUrl, method: reqMethod })
            }
          } catch {
            // ignore
          }
        }
        if (method === 'Network.responseReceived') {
          const requestId = String(params['requestId'])
          const resp = params['response'] as
            | {
                url?: string
                status?: number
                requestHeaders?: Record<string, string>
                headers?: Record<string, string>
              }
            | undefined
          const requestHeaderPair = params['request'] as
            | { method?: string }
            | undefined
          const requestPair2 = params as { request?: { method?: string } }
          const url = resp?.url || ''
          // CDP 在 responseReceived 里不一定带 request.method；用 fallback
          const method2 =
            requestHeaderPair?.method ||
            requestPair2.request?.method ||
            'GET'
          if (!url) return
          if (!matchUrl(url, method2)) return
          // 命中候选；等 loadingFinished 再取 body
          candidate = {
            requestId,
            url,
            method: method2,
            status: resp?.status ?? 0,
            responseHeaders: resp?.headers ?? {},
            receivedAt: Date.now()
          }
          log(`matched response: ${method2} ${url} status=${candidate.status}`)
        } else if (method === 'Network.loadingFinished') {
          if (!candidate) return
          const requestId = String(params['requestId'])
          if (requestId !== candidate.requestId) return

          const cur = candidate
          // 已 settle 就不重复处理
          if (settled) return
          win.webContents.debugger
            .sendCommand('Network.getResponseBody', { requestId })
            .then((res) => {
              const result = res as { body?: string; base64Encoded?: boolean }
              const rawBody = result.body ?? ''
              const isB64 = !!result.base64Encoded
              let bodyText: string | null = null
              let bodyJson: unknown = null
              let bodyBytes = 0
              try {
                if (isB64) {
                  const buf = Buffer.from(rawBody, 'base64')
                  bodyBytes = buf.byteLength
                  try {
                    bodyText = buf.toString('utf8')
                  } catch {
                    bodyText = null
                  }
                } else {
                  bodyText = rawBody
                  bodyBytes = Buffer.byteLength(rawBody, 'utf8')
                }
                if (bodyText) {
                  try {
                    bodyJson = JSON.parse(bodyText)
                  } catch {
                    bodyJson = null
                  }
                }
              } catch (e) {
                log(`decode body err: ${(e as Error).message}`)
              }

              clearTimeout(timer)
              finish({
                ok: true,
                data: {
                  url: cur.url,
                  method: cur.method,
                  status: cur.status,
                  bodyJson,
                  bodyText,
                  bodyBytes,
                  responseHeaders: cur.responseHeaders,
                  durationMs: Date.now() - startedAt
                }
              })
            })
            .catch((e) => {
              clearTimeout(timer)
              finish({
                ok: false,
                error: { code: 'GET_BODY_FAILED', message: (e as Error).message }
              })
            })
        }
      }
    )

    // 启用网络抓包域
    win.webContents.debugger
      .sendCommand('Network.enable')
      .then(() => {
        console.log(`${tag} Network.enable ok → loadURL`)
        // Network.enable 完成后再 loadURL，避免错过早期请求
        return win.loadURL(req.pageUrl)
      })
      .then(() => {
        console.log(`${tag} loadURL resolved url=${win.isDestroyed() ? '<destroyed>' : win.webContents.getURL()}`)
      })
      .catch((e) => {
        const msg = String((e as Error).message || '')
        console.log(`${tag} loadURL/Network.enable error: ${msg}`)
        const isCdp = /Debugger is not attached|target is not attached|debugger/i.test(msg)
        const isAborted = /ERR_ABORTED/i.test(msg)
        // ERR_ABORTED 大多是 SPA 重定向或客户端 nav 被打断，不算真错；其它 page error 才 fail
        if (isAborted) {
          console.log(`${tag} loadURL aborted (likely redirect), waiting capture timeout`)
          return
        }
        clearTimeout(timer)
        finish({
          ok: false,
          error: {
            code: isCdp ? 'CDP_ERROR' : 'PAGE_LOAD_FAILED',
            message: msg
          }
        })
      })

    // 页面加载失败兜底（DNS / 网络层错误）
    win.webContents.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
      console.log(
        `${tag} did-fail-load mainFrame=${isMainFrame} code=${code} desc=${desc} url=${validatedURL}`
      )
      // 子资源失败常见，不影响主任务
      if (!isMainFrame) return
      // ERR_ABORTED (-3) 在 SPA 重定向/客户端 nav 时常见，不算真错
      if (code === -3) return
      clearTimeout(timer)
      finish({
        ok: false,
        error: { code: 'PAGE_LOAD_FAILED', message: `${desc} (${code}) ${validatedURL}` }
      })
    })

    // 窗口意外关闭兜底
    win.on('closed', () => {
      clearTimeout(timer)
      if (!settled) {
        finish({
          ok: false,
          error: { code: 'CANCELLED', message: 'window closed before capture finished' }
        })
      }
    })
  })
}

/**
 * 注册 IPC：renderer → main 调用。
 * 在 main/index.ts 的 registerIpc() 里调用一次即可。
 */
export function registerHiddenViewIpc(): void {
  ipcMain.handle(
    'automation:captureFromHiddenView',
    async (_e, req: HiddenCaptureRequest): Promise<HiddenCaptureResult> => {
      try {
        return await captureFromHiddenView(req)
      } catch (e) {
        return {
          ok: false,
          error: {
            code: 'CDP_ERROR',
            message: (e as Error).message || 'unexpected error'
          }
        }
      }
    }
  )
}
