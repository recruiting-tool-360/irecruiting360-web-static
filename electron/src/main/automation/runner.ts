/**
 * Automation Runner
 *
 * 实现 docs/automation-protocol.md §4.5 / §4.6 描述的 runScript 运行时：
 *   1. 通过 chromium.connectOverCDP 连到 Electron 自带 Chromium
 *      （main 进程 appendSwitch('remote-debugging-port', '9223') 已开端口）
 *   2. 用 webContents URL 找到对应的 Playwright Page
 *   3. 用 vm.runInNewContext 在严格沙箱里执行前端发来的 scriptCode 字符串
 *      注入 { page, ctx, log, sleep, jitter, AbortSignal }
 *   4. 错误归一化（TIMEOUT / CANCELLED / SCRIPT_ERROR / PAGE_NOT_FOUND）+ 日志收集
 *
 * 与已有的 hiddenViewRunner / tabFetcher 是**互补**关系：
 *   - hiddenViewRunner：show:false 浏览器窗口，CDP 监听被动接口（业务难调，已不推荐）
 *   - tabFetcher：新开 site tab 后 executeJavaScript fetch（适合纯接口）
 *   - automation.runScript（本文件）：在**已有 tab** 内执行任意 Playwright 脚本
 *     （适合 DOM 交互 / 多步组合 / 等待接口 / 滚动等"任务式"工作流）
 */

import { app, ipcMain } from 'electron'
import vm from 'node:vm'
import { chromium, type Browser, type Page } from 'playwright-core'
import { tabManager } from '../TabManager'
import fs from 'node:fs'
import path from 'node:path'

/* ============ Playwright 连接 ============ */

let browser: Browser | null = null
let cdpEndpoint: string | null = null

/**
 * 从 userData/DevToolsActivePort 读 Chromium 选的真实端口（因为我们用 `--remote-debugging-port=0`）。
 * 文件格式（Chromium 内置约定）：
 *   第 1 行：端口号（数字）
 *   第 2 行：browser session id 形如 /devtools/browser/<uuid>
 *
 * 文件由 Chromium 在 remote debugging 启用后异步写入；启动初期可能还没有，要 poll 几次。
 */
async function readDevToolsActivePort(timeoutMs = 8000): Promise<number> {
  const file = path.join(app.getPath('userData'), 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  let lastErr: Error | null = null
  while (Date.now() < deadline) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim()
      const firstLine = raw.split(/\r?\n/)[0]
      const port = Number(firstLine)
      if (Number.isFinite(port) && port > 0 && port < 65536) return port
      lastErr = new Error(`DevToolsActivePort content invalid: "${firstLine}"`)
    } catch (e) {
      lastErr = e as Error
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(
    `failed to read DevToolsActivePort after ${timeoutMs}ms: ` +
      (lastErr ? lastErr.message : 'unknown')
  )
}

/** 从 /json/version 拿到 webSocketDebuggerUrl（playwright 需要 ws:// 形式） */
async function fetchCdpWsEndpoint(): Promise<string> {
  const port = await readDevToolsActivePort()
  const httpUrl = `http://127.0.0.1:${port}`
  console.log(`[runner] CDP port resolved from DevToolsActivePort = ${port}`)
  // Electron main 进程是 Node 18+，自带全局 fetch
  const resp = await fetch(`${httpUrl}/json/version`)
  if (!resp.ok) throw new Error(`/json/version returned ${resp.status}`)
  const data = (await resp.json()) as { webSocketDebuggerUrl?: string }
  if (!data.webSocketDebuggerUrl) throw new Error('webSocketDebuggerUrl missing in /json/version')
  return data.webSocketDebuggerUrl
}

/** 懒加载：第一次 runScript 时才连 CDP */
async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser
  if (!cdpEndpoint) cdpEndpoint = await fetchCdpWsEndpoint()
  browser = await chromium.connectOverCDP(cdpEndpoint)
  // 连接异常断开后清空，下次 ensure 重连
  browser.on('disconnected', () => {
    browser = null
  })
  return browser
}

/**
 * 通过 webContents 当前 URL 在 playwright 端找到对应 Page。匹配失败返回 null。
 *
 * 匹配策略（从严到宽）：
 *   1. p.url() === targetUrl 完全相等
 *   2. URL 对象比较：相同 origin + 相同 pathname + query 参数相同（容忍顺序差异 / 末尾斜杠）
 *   3. 主页面 URL 命中 origin + pathname（容忍 BOSS 这种页面自带 fragment / 末尾参数变化）
 *
 * 取最先命中的策略。
 */
function urlSimilar(a: string, b: string): boolean {
  if (a === b) return true
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    if (ua.origin !== ub.origin) return false
    // 容忍末尾斜杠差异
    const pa = ua.pathname.replace(/\/+$/, '')
    const pb = ub.pathname.replace(/\/+$/, '')
    if (pa !== pb) return false
    // 比较 query（顺序无关）
    const qa = Array.from(ua.searchParams.entries())
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    const qb = Array.from(ub.searchParams.entries())
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return qa === qb
  } catch {
    return false
  }
}

async function findPageForUrl(targetUrl: string): Promise<Page | null> {
  const br = await ensureBrowser()
  // Electron 自带 chromium 下所有 page 都在默认 context 里（不分 partition）
  // 一遍 strict + 一遍 similar，避免 BOSS 加了末尾 hash / query 顺序变化导致匹配不到
  const allPages: Page[] = []
  for (const ctx of br.contexts()) {
    for (const p of ctx.pages()) {
      try {
        if (p.url() === targetUrl) return p
        allPages.push(p)
      } catch {
        /* page 关闭中，跳过 */
      }
    }
  }
  for (const p of allPages) {
    try {
      if (urlSimilar(p.url(), targetUrl)) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

/* ============ runScript IPC ============ */

export interface RunScriptRequest {
  /** TabManager 里的 tabId（home / tab-N），main 进程会查 webContents 并对应到 page */
  tabId: string
  /** 脚本字符串（async function body，沙箱注入 page/ctx/log/sleep/jitter/AbortSignal） */
  scriptCode: string
  /** 业务上下文（被注入到沙箱的 ctx） */
  ctx?: unknown
  /** 单次任务超时（ms），默认 60000 */
  timeoutMs?: number
  /**
   * 期望 tab 已经加载到的 host（如 'zhipin.com'）。如果传了，runner 会 poll 等待
   * webContents URL 命中这个 host 后再连 CDP；否则只要 URL 不是空 / about:blank 就继续。
   * 主要用来解决 openOrActivate 后 loadURL 异步未完成导致 page.url() 空的问题。
   */
  expectedHost?: string
}

export interface RunScriptResult {
  ok: boolean
  data?: unknown
  error?: {
    code:
      | 'BAD_REQUEST'
      | 'TAB_NOT_FOUND'
      | 'PAGE_NOT_FOUND'
      | 'CDP_CONNECT_FAILED'
      | 'TIMEOUT'
      | 'CANCELLED'
      | 'SCRIPT_ERROR'
    message: string
    name?: string
    stack?: string
    /** 业务侧脚本通过 `throw err; err.code = '...'` 抛上来的语义错误码 */
    scriptCode?: string
  }
  elapsedMs: number
  logs: string[]
}

/** 同时活跃的 task 列表（用于 cancelAll） */
const activeRuns: Array<{ ac: AbortController; tabId: string }> = []

export async function runScript(req: RunScriptRequest): Promise<RunScriptResult> {
  const logs: string[] = []
  const log = (m: unknown): void => {
    const s = typeof m === 'string' ? m : JSON.stringify(m)
    logs.push(s)
    // 同时实时打到主进程 stderr，方便看脚本内部进度（不然 logs 数组只在 runScript 返回时才带回 renderer）
    console.log(`[script log][${req?.tabId ?? '-'}] ${s}`)
  }
  const startedAt = Date.now()

  if (!req || typeof req.scriptCode !== 'string' || typeof req.tabId !== 'string') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'tabId & scriptCode required' },
      elapsedMs: Date.now() - startedAt,
      logs
    }
  }

  // 1) 找到对应 tab 的 webContents
  const wc = tabManager.getWebContentsById(req.tabId)
  if (!wc) {
    return {
      ok: false,
      error: { code: 'TAB_NOT_FOUND', message: `tab "${req.tabId}" not found in TabManager` },
      elapsedMs: Date.now() - startedAt,
      logs
    }
  }

  // 1.5) 等 URL 就位：openOrActivate 后 webContents.loadURL 是异步的，
  //      几毫秒之内 getURL() 还是空 / about:blank，脚本就跑会拿到错误的 page。
  //      这里 poll 等待至多 10s（或调用方传入的 expectedHost 出现）。
  const expectedHost = typeof req.expectedHost === 'string' ? req.expectedHost : undefined
  const URL_READY_TIMEOUT_MS = 10000
  const urlReadyDeadline = Date.now() + URL_READY_TIMEOUT_MS
  const initialUrl = wc.getURL()
  console.log(
    `[runner] tabId=${req.tabId} initial url="${initialUrl}" expectedHost=${expectedHost ?? '<any>'}, polling for ready...`
  )
  let pollCount = 0
  while (Date.now() < urlReadyDeadline) {
    pollCount += 1
    const u = wc.getURL()
    if (u && u !== 'about:blank') {
      if (!expectedHost) break
      try {
        const host = new URL(u).hostname
        if (
          host === expectedHost ||
          host.endsWith('.' + expectedHost) ||
          host.endsWith(expectedHost)
        )
          break
      } catch {
        /* invalid URL while loading, keep polling */
      }
    }
    if (pollCount % 10 === 0) {
      // 每 1.5s 打一次进度，方便排查
      console.log(`[runner] still waiting url... currently="${u}" (poll #${pollCount})`)
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  const url = wc.getURL()
  if (!url || url === 'about:blank') {
    console.warn(
      `[runner] url-ready TIMEOUT for tabId=${req.tabId} after ${URL_READY_TIMEOUT_MS}ms (last="${url}")`
    )
    return {
      ok: false,
      error: {
        code: 'PAGE_NOT_FOUND',
        message: `tab url not ready after ${URL_READY_TIMEOUT_MS}ms (got "${url}"); did loadURL complete? 检查目标 URL 是否能访问 / 被反爬挡住`
      },
      elapsedMs: Date.now() - startedAt,
      logs
    }
  }
  console.log(`[runner] tabId=${req.tabId} url ready: ${url}`)
  logs.push(`runner: tab url ready: ${url}`)

  // 2) 连 CDP，找对应 page
  console.log(`[runner] tabId=${req.tabId} connecting CDP and finding Playwright Page...`)
  let page: Page | null
  try {
    page = await findPageForUrl(url)
  } catch (e) {
    console.warn(`[runner] CDP_CONNECT_FAILED:`, (e as Error).message)
    return {
      ok: false,
      error: { code: 'CDP_CONNECT_FAILED', message: (e as Error).message },
      elapsedMs: Date.now() - startedAt,
      logs
    }
  }
  if (!page) {
    // 列出当前 Playwright 看到的所有 page URL，便于排查 URL 不匹配问题
    const allPageUrls: string[] = []
    try {
      const br = await ensureBrowser()
      for (const ctx of br.contexts()) {
        for (const p of ctx.pages()) {
          try {
            allPageUrls.push(p.url())
          } catch {
            /* ignore closed */
          }
        }
      }
    } catch {
      /* noop */
    }
    console.warn(
      `[runner] PAGE_NOT_FOUND for tabId=${req.tabId} url=${url}, ` +
        `playwright sees ${allPageUrls.length} pages: ${JSON.stringify(allPageUrls)}`
    )
    return {
      ok: false,
      error: {
        code: 'PAGE_NOT_FOUND',
        message:
          `no playwright page matches url=${url}; ` +
          `playwright sees: ${allPageUrls.join(' | ') || '<none>'}`
      },
      elapsedMs: Date.now() - startedAt,
      logs
    }
  }
  // 校验 page.url() 是否跟 wc.getURL() 一致；不一致一般是 BOSS 反爬触发把页面替换了
  let playwrightPageUrl = ''
  try {
    playwrightPageUrl = page.url()
  } catch {
    /* ignore */
  }
  if (playwrightPageUrl !== url) {
    console.warn(
      `[runner] tabId=${req.tabId} URL MISMATCH: wc.getURL()="${url}" but playwright page.url()="${playwrightPageUrl}"; ` +
        `如果 page.url() 是空 / about:blank 且 wc 是 BOSS URL，大概率是 BOSS 反爬触发把 page 替换了`
    )
  }
  console.log(
    `[runner] tabId=${req.tabId} matched page (playwright page.url()="${playwrightPageUrl}"), running script body...`
  )

  // 3) 准备沙箱 + AbortController + timer
  const ac = new AbortController()
  const timeoutMs = req.timeoutMs ?? 60000
  const timer = setTimeout(() => ac.abort(new Error('TIMEOUT')), timeoutMs)
  activeRuns.push({ ac, tabId: req.tabId })

  try {
    // 沙箱里能用：page / ctx / log / sleep / jitter / AbortSignal
    // 显式不暴露：process / require / Buffer / global / globalThis 等
    const sandbox: Record<string, unknown> = {}
    const context = vm.createContext(sandbox, { name: `runScript[${req.tabId}]` })

    // 拼出 async 函数表达式，body 来自前端 scriptCode
    const wrapped = `(async ({ page, ctx, log, sleep, jitter, AbortSignal }) => { ${req.scriptCode} })`
    const fn = vm.runInContext(wrapped, context, {
      timeout: 5000, // 编译期超时（不影响运行期）
      displayErrors: true
    }) as (args: {
      page: Page
      ctx: unknown
      log: (m: unknown) => void
      sleep: (ms: number) => Promise<void>
      jitter: (a: number, b: number) => number
      AbortSignal: AbortSignal
    }) => Promise<unknown>

    const data = await fn({
      page,
      ctx: req.ctx,
      log,
      sleep: (ms: number) =>
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => resolve(), ms)
          ac.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t)
              reject(ac.signal.reason ?? new Error('aborted'))
            },
            { once: true }
          )
        }),
      jitter: (a: number, b: number) => a + Math.random() * (b - a),
      AbortSignal: ac.signal
    })

    console.log(
      `[runner] tabId=${req.tabId} script OK in ${Date.now() - startedAt}ms, data=`,
      data && typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : data
    )
    return { ok: true, data, elapsedMs: Date.now() - startedAt, logs }
  } catch (e) {
    const err = e as Error & { code?: string }
    const isAbort = err.name === 'AbortError' || /aborted|abort/i.test(err.message || '')
    const isTimeout = ac.signal.reason instanceof Error && ac.signal.reason.message === 'TIMEOUT'
    console.warn(
      `[runner] tabId=${req.tabId} script FAILED in ${Date.now() - startedAt}ms: ` +
        `name=${err.name} code=${err.code ?? '-'} msg=${err.message} isTimeout=${isTimeout}`
    )
    const code: NonNullable<RunScriptResult['error']>['code'] = isTimeout
      ? 'TIMEOUT'
      : isAbort
        ? 'CANCELLED'
        : 'SCRIPT_ERROR'
    return {
      ok: false,
      error: {
        code,
        message: err.message || String(e),
        name: err.name,
        stack: err.stack,
        scriptCode: err.code
      },
      elapsedMs: Date.now() - startedAt,
      logs
    }
  } finally {
    clearTimeout(timer)
    const idx = activeRuns.findIndex((r) => r.ac === ac)
    if (idx >= 0) activeRuns.splice(idx, 1)
  }
}

/* ============ 辅助 IPC ============ */

/** 取当前激活 tab 信息（前端要调 runScript 时先拿当前 tabId） */
function getActiveTab(): { tabId: string | null; url: string; channel: string | null } {
  const tabId = tabManager.getActiveTabId()
  if (!tabId) return { tabId: null, url: '', channel: null }
  const wc = tabManager.getWebContentsById(tabId)
  // tabManager 没暴露 channel 接口，通过 getTabs 找
  const tab = tabManager.getTabs().find((t) => t.id === tabId)
  return {
    tabId,
    url: wc ? wc.getURL() : '',
    channel: tab?.channel ?? null
  }
}

/** 打开或激活某个招聘站 tab（channel + url） */
function openOrActivate(opts: {
  channel: string
  url: string
  hidden?: boolean
  background?: boolean
}): {
  tabId: string
} {
  const tabId = tabManager.openOrActivateSiteTab(opts.channel, opts.url, {
    hidden: !!opts.hidden,
    background: !!opts.background
  })
  return { tabId }
}

/** 取消所有正在跑的脚本 */
function cancelAll(): { cancelled: number } {
  let n = 0
  for (const r of activeRuns.splice(0)) {
    try {
      r.ac.abort(new Error('CANCELLED'))
      n += 1
    } catch {
      /* ignore */
    }
  }
  return { cancelled: n }
}

/* ============ IPC 注册 ============ */

export function registerAutomationRunnerIpc(): void {
  // ⚠️ 风控历史教训（2026-05-18）：
  //   `runScript` 通过 Playwright connectOverCDP attach 到 Page 会在 Chromium 内部留下
  //   "被远程调试"的指纹（即使端口随机），BOSS 等招聘站风控能识别 → web 端账号封 24h。
  //   → 默认禁用 runScript / cancelAll；仅 ENABLE_REMOTE_DEBUG=1（即用户显式打开调试端口）
  //     时才注册真实实现；否则返回 'AUTOMATION_DISABLED'。
  //   → openOrActivate / getActiveTab 是纯 TabManager API，不连 CDP，**始终可用**
  //     （openOrActivateSiteTab 本身就是普通的 BrowserWindow 创建，跟 Playwright 无关）。
  const automationEnabled = process.env.ENABLE_REMOTE_DEBUG === '1'

  ipcMain.handle(
    'automation:runScript',
    async (_e, req: RunScriptRequest): Promise<RunScriptResult> => {
      if (!automationEnabled) {
        return {
          ok: false,
          error: {
            code: 'SCRIPT_ERROR',
            message:
              'automation:runScript 已被默认禁用（防止 BOSS / 智联 等反爬触发账号封禁）。' +
              '如需启用，设环境变量 ENABLE_REMOTE_DEBUG=1 启动 Electron。'
          },
          elapsedMs: 0,
          logs: []
        }
      }
      try {
        return await runScript(req)
      } catch (e) {
        return {
          ok: false,
          error: { code: 'SCRIPT_ERROR', message: (e as Error).message || 'unexpected' },
          elapsedMs: 0,
          logs: []
        }
      }
    }
  )

  ipcMain.handle('automation:getActiveTab', () => getActiveTab())
  ipcMain.handle('automation:openOrActivate', (_e, opts) => openOrActivate(opts))
  ipcMain.handle('automation:cancelAll', () => {
    if (!automationEnabled) return { cancelled: 0 }
    return cancelAll()
  })
}

// 应用退出前断开 playwright 连接
app.on('before-quit', () => {
  try {
    browser?.close()
  } catch {
    /* ignore */
  }
})
