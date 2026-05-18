/**
 * 站点网络抓包管理器（长驻 debugger.attach）
 *
 * 设计目标：用 Electron 自带的 `webContents.debugger`（同进程内 CDP，
 * 不开端口、不走 WebSocket、BOSS / 智联 / 51job 等反爬都探测不到）持续抓
 * 招聘站 tab 内发出的接口响应，对外提供"等下一条匹配" / "拿最新一条"
 * 的查询能力，替代 Playwright `page.waitForResponse` 路径。
 *
 * 历史背景：早期用 `--remote-debugging-port=N + chromium.connectOverCDP`
 * 抓 BOSS 推荐列表，被 BOSS 风控识别后封号（详见 docs/boss地址资料.md 顶部
 * "反爬警告"）。**纯 Electron 内置 debugger 没这个指纹问题**——你原来的
 * ihr360-ai-irecruiting 项目就是这么做的（L1970-2037）。
 *
 * 跟 `hiddenViewRunner.ts` 的区别：
 *   - hiddenViewRunner：每次新开一个隐藏 BrowserWindow，命中第一条即销毁
 *   - siteNetworkCapture（本文件）：长驻 attach 到现有 BOSS / 智联 tab 的
 *     webContents 上，连续抓所有匹配的响应进环形缓冲，对外开"查询 / 等候"
 *     接口。BOSS tab 关闭时自动 detach。
 *
 * 流程：
 *   1) TabManager 创建招聘站 tab 时调 ensureAttached(wc, siteKey, matchers)
 *   2) 内部 debugger.attach('1.3') + Network.enable，监听 responseReceived
 *      / loadingFinished，对命中 URL 调 Network.getResponseBody 拿 body
 *   3) 解析后的响应放进 siteKey 对应的环形缓冲（默认 cap=50）
 *   4) 渲染端通过 IPC 查：
 *      - `waitForResponse({siteKey, urlPattern, timeoutMs, sinceTs?})`：
 *        先扫缓冲（>=sinceTs 且 URL 匹配），命中立即返回；没有就挂 waiter，
 *        到时间未命中返回 TIMEOUT
 *      - `getLatest({siteKey, urlPattern})`：直接拿最新一条（不等）
 *      - `clearCache({siteKey})`：清空缓冲（"重新加载下一页"前可用）
 *
 * 安全：URL pattern 是字符串 substring 匹配（不做 RegExp.compile，避免
 * renderer 注入恶意正则导致 CPU spin），sinceTs/timeoutMs 都做有效性检查。
 */

import type { Debugger, WebContents } from 'electron'

/** 缓冲单条响应（解析后的业务格式） */
export interface CapturedResponse {
  /** 命中时的本地时间戳（waitForResponse 的 sinceTs 用这个对比） */
  receivedAt: number
  url: string
  method: string
  status: number
  /** 已尝试 JSON.parse 的 body；非 JSON 时为 null */
  bodyJson: unknown | null
  /** 解码后的文本 body（非 utf8 时为 null） */
  bodyText: string | null
  /** body 字节数（解码后） */
  bodyBytes: number
}

interface SiteBucket {
  /** 命中规则（substring 匹配；任一命中即缓存） */
  matchers: string[]
  /** 环形缓冲（最近的在末尾） */
  cache: CapturedResponse[]
  /** 缓冲容量 */
  cap: number
  /** 在等下一条匹配的 waiter 集合 */
  waiters: Waiter[]
}

interface Waiter {
  /** 完整 substring 匹配该值的响应即可命中 */
  urlPattern: string
  /** 仅匹配 receivedAt > sinceTs 的响应；undefined 则不限 */
  sinceTs?: number
  /** 命中后调用 */
  resolve: (resp: CapturedResponse) => void
  /** 超时时调用 */
  reject: (msg: string) => void
  /** 关联定时器（命中时要清掉） */
  timer: NodeJS.Timeout
}

interface AttachedRecord {
  wc: WebContents
  siteKey: string
  /** 内部记录：requestId → 暂存的 response meta（等 loadingFinished 后取 body） */
  pendingMeta: Map<string, { url: string; method: string; status: number }>
}

const buckets = new Map<string, SiteBucket>()

/**
 * 用 webContents.id 做主键去重，避免同一个 wc 重复 attach
 * （Electron 重复 attach 同一个 debugger 会抛 'Another debugger is already attached'）
 */
const attachedByWcId = new Map<number, AttachedRecord>()

/** 缓冲默认容量；按需可在 ensureAttached 里覆盖 */
const DEFAULT_CAP = 50

function getOrCreateBucket(siteKey: string, matchers: string[], cap: number): SiteBucket {
  let b = buckets.get(siteKey)
  if (!b) {
    b = { matchers: [...matchers], cache: [], cap, waiters: [] }
    buckets.set(siteKey, b)
  } else {
    // 已存在桶：合并 matchers（避免后注册的 tab 覆盖前一个 tab 的规则）
    for (const m of matchers) {
      if (!b.matchers.includes(m)) b.matchers.push(m)
    }
    if (cap > b.cap) b.cap = cap
  }
  return b
}

/**
 * 给某个 webContents 做"一次性 attach"，让它发出的响应进入对应 siteKey 的桶。
 *
 * - 幂等：同一个 wc 重复调直接返回（不会重 attach，不会丢已注册的 matchers）
 * - wc 销毁时自动 detach + 清理 attachedByWcId 记录
 *
 * @param wc        要监听的 webContents（一般是招聘站 tab 的 view.webContents）
 * @param siteKey   命名空间，如 'boss'、'zhilian'、'job51'
 * @param matchers  URL 命中规则（substring 任一匹配）
 * @param opts      cap 缓冲容量
 */
export function ensureAttached(
  wc: WebContents,
  siteKey: string,
  matchers: string[],
  opts?: { cap?: number }
): { ok: boolean; reason?: string } {
  if (!wc || wc.isDestroyed()) return { ok: false, reason: 'webContents destroyed' }
  if (!siteKey || !Array.isArray(matchers) || matchers.length === 0) {
    return { ok: false, reason: 'siteKey & matchers required' }
  }

  // 合并 matchers 到对应桶（即使 wc 已经 attach 过，也允许后续 tab 追加新规则）
  getOrCreateBucket(siteKey, matchers, opts?.cap ?? DEFAULT_CAP)

  // 已经 attach 过 → 只合并 matchers，不重 attach
  if (attachedByWcId.has(wc.id)) {
    return { ok: true }
  }

  let dbg: Debugger
  try {
    dbg = wc.debugger
    if (!dbg.isAttached()) {
      dbg.attach('1.3')
    }
  } catch (e) {
    const msg = (e as Error).message
    // "Another debugger is already attached"：可能 DevTools 正打开了，此时 debugger 被 DevTools 占用
    // 直接放弃 attach 但保留 bucket（之后 DevTools 关掉再 attach 会成功）
    console.warn(`[siteNetworkCapture] attach failed siteKey=${siteKey} wcId=${wc.id}: ${msg}`)
    return { ok: false, reason: msg }
  }

  const record: AttachedRecord = { wc, siteKey, pendingMeta: new Map() }
  attachedByWcId.set(wc.id, record)

  // Network.enable 失败一般是 wc 半 destroyed，记录后退出
  dbg
    .sendCommand('Network.enable')
    .then(() => {
      console.log(`[siteNetworkCapture] attached siteKey=${siteKey} wcId=${wc.id}`)
    })
    .catch((e) => {
      console.warn(
        `[siteNetworkCapture] Network.enable failed siteKey=${siteKey} wcId=${wc.id}: ${(e as Error).message}`
      )
    })

  dbg.on('message', (_e, method, params) => onCdpMessage(record, method, params))

  // wc 销毁时清理
  wc.once('destroyed', () => {
    try {
      if (dbg.isAttached()) dbg.detach()
    } catch {
      /* noop */
    }
    attachedByWcId.delete(wc.id)
    console.log(`[siteNetworkCapture] detached on wc destroyed siteKey=${siteKey} wcId=${wc.id}`)
  })

  // 用户手动打开 DevTools 时 Electron 会自动 detach 我们；监听一下记录日志
  dbg.on('detach', (_e, reason) => {
    console.log(
      `[siteNetworkCapture] debugger detached siteKey=${siteKey} wcId=${wc.id} reason=${reason}`
    )
    // 不删 attachedByWcId：DevTools 关闭后 ensureAttached 还能重新 attach
    // 但要把 detach 状态映射出来，让下次 ensureAttached 重试
    attachedByWcId.delete(wc.id)
  })

  return { ok: true }
}

/** CDP message 处理 */
function onCdpMessage(
  record: AttachedRecord,
  method: string,
  params: Record<string, unknown>
): void {
  const bucket = buckets.get(record.siteKey)
  if (!bucket) return

  if (method === 'Network.responseReceived') {
    const requestId = String(params['requestId'])
    const resp = params['response'] as
      | { url?: string; status?: number; mimeType?: string }
      | undefined
    const url = resp?.url || ''
    if (!url) return
    if (!isUrlMatched(url, bucket.matchers)) return
    // CDP 在 responseReceived 里不一定带 request.method，先记 GET，后面 loadingFinished 再补
    const method2 = String(
      (params as { request?: { method?: string } }).request?.method || 'GET'
    )
    record.pendingMeta.set(requestId, {
      url,
      method: method2,
      status: resp?.status ?? 0
    })
    // 命中日志：让"BOSS 推荐列表到底有没有发"在主进程 stdout 上一眼可见
    console.log(
      `[siteNetworkCapture] HIT siteKey=${record.siteKey} ${method2} ${resp?.status ?? '?'} ${url}`
    )
    return
  }

  if (method === 'Network.loadingFinished') {
    const requestId = String(params['requestId'])
    const meta = record.pendingMeta.get(requestId)
    if (!meta) return
    record.pendingMeta.delete(requestId)

    // 异步去拿 body，拿到后 push 进缓冲 + 唤醒 waiters
    record.wc.debugger
      .sendCommand('Network.getResponseBody', { requestId })
      .then((res) => {
        const r = res as { body?: string; base64Encoded?: boolean }
        const rawBody = r.body ?? ''
        const isB64 = !!r.base64Encoded
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
          console.warn(
            `[siteNetworkCapture] decode body err siteKey=${record.siteKey} url=${meta.url}: ${(e as Error).message}`
          )
        }

        // body 拿到后再打一行（区分"响应到达"和"body 解析完成"两阶段——
        // BOSS 偶发 loadingFinished 但 getResponseBody 拿不到的情况，靠这行能定位）
        console.log(
          `[siteNetworkCapture] BODY siteKey=${record.siteKey} bytes=${bodyBytes} json=${
            bodyJson !== null ? 'ok' : 'no'
          } ${meta.url}`
        )

        const captured: CapturedResponse = {
          receivedAt: Date.now(),
          url: meta.url,
          method: meta.method,
          status: meta.status,
          bodyJson,
          bodyText,
          bodyBytes
        }
        pushToBucket(bucket, captured)
        // 唤醒等候者
        wakeWaiters(bucket, captured)
      })
      .catch((e) => {
        // body 取不到（流式 / 大文件 / 已 GC）不影响后续接口，吞掉错误
        console.warn(
          `[siteNetworkCapture] getResponseBody err siteKey=${record.siteKey} url=${meta.url}: ${(e as Error).message}`
        )
      })
  }
}

function isUrlMatched(url: string, matchers: string[]): boolean {
  for (const m of matchers) {
    if (m && url.indexOf(m) !== -1) return true
  }
  return false
}

function pushToBucket(bucket: SiteBucket, resp: CapturedResponse): void {
  bucket.cache.push(resp)
  while (bucket.cache.length > bucket.cap) bucket.cache.shift()
}

function wakeWaiters(bucket: SiteBucket, resp: CapturedResponse): void {
  if (bucket.waiters.length === 0) return
  const remaining: Waiter[] = []
  for (const w of bucket.waiters) {
    const matchUrl = resp.url.indexOf(w.urlPattern) !== -1
    const matchSince = w.sinceTs === undefined || resp.receivedAt > w.sinceTs
    if (matchUrl && matchSince) {
      clearTimeout(w.timer)
      w.resolve(resp)
    } else {
      remaining.push(w)
    }
  }
  bucket.waiters = remaining
}

/**
 * 查询：等待一条匹配的响应（缓存兜底）。
 *
 * 行为：
 *   1) 先扫缓存 —— 如果 sinceTs 给了，找 `receivedAt > sinceTs` 且 url 包含 urlPattern
 *      的最新一条；否则找 url 包含 urlPattern 的最新一条
 *   2) 缓存没有 → 挂 waiter，在 timeoutMs 内等"下一条新到达的命中响应"
 *   3) 超时仍未命中 → 返回 ok=false
 *
 * 用法示例：
 *   const tsBefore = Date.now()
 *   await openBossRecommendTab(...)
 *   const r = await waitForResponse({
 *     siteKey: 'boss',
 *     urlPattern: '/wapi/zpjob/rec/geek/list',
 *     timeoutMs: 10000,
 *     sinceTs: tsBefore,  // 只接受 tab 打开之后的响应
 *   })
 */
export async function waitForResponse(opts: {
  siteKey: string
  urlPattern: string
  timeoutMs?: number
  sinceTs?: number
}): Promise<{ ok: true; data: CapturedResponse } | { ok: false; code: string; message: string }> {
  const { siteKey, urlPattern, timeoutMs = 10000, sinceTs } = opts || {}
  if (!siteKey || !urlPattern) {
    return { ok: false, code: 'BAD_REQUEST', message: 'siteKey & urlPattern required' }
  }
  const bucket = buckets.get(siteKey)
  if (!bucket) {
    return {
      ok: false,
      code: 'NOT_ATTACHED',
      message: `siteKey=${siteKey} not attached (open the corresponding tab first)`
    }
  }

  // 1) 先扫缓存（从最新到最旧）
  for (let i = bucket.cache.length - 1; i >= 0; i--) {
    const c = bucket.cache[i]
    if (c.url.indexOf(urlPattern) === -1) continue
    if (sinceTs !== undefined && c.receivedAt <= sinceTs) continue
    return { ok: true, data: c }
  }

  // 2) 挂 waiter
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bucket.waiters = bucket.waiters.filter((w) => w !== waiter)
      resolve({
        ok: false,
        code: 'TIMEOUT',
        message: `no response matched "${urlPattern}" within ${timeoutMs}ms (siteKey=${siteKey})`
      })
    }, timeoutMs)
    const waiter: Waiter = {
      urlPattern,
      sinceTs,
      timer,
      resolve: (data) => resolve({ ok: true, data }),
      reject: (msg) => resolve({ ok: false, code: 'CANCELLED', message: msg })
    }
    bucket.waiters.push(waiter)
  })
}

/**
 * 同步：拿桶里"最新一条匹配 urlPattern" 的响应（不等）。
 * 用于"我已经知道页面早就发过这个请求了，直接取最近一次结果"。
 */
export function getLatest(opts: {
  siteKey: string
  urlPattern: string
}): { ok: true; data: CapturedResponse } | { ok: false; code: string; message: string } {
  const { siteKey, urlPattern } = opts || {}
  const bucket = buckets.get(siteKey)
  if (!bucket) return { ok: false, code: 'NOT_ATTACHED', message: `siteKey=${siteKey} not attached` }
  for (let i = bucket.cache.length - 1; i >= 0; i--) {
    const c = bucket.cache[i]
    if (urlPattern && c.url.indexOf(urlPattern) === -1) continue
    return { ok: true, data: c }
  }
  return { ok: false, code: 'NOT_FOUND', message: 'no matching cached response' }
}

/** 清空某个 siteKey 的缓存（例如"重新加载下一页"前主动清，避免误读旧响应） */
export function clearCache(siteKey: string): void {
  const bucket = buckets.get(siteKey)
  if (!bucket) return
  bucket.cache.length = 0
  console.log(`[siteNetworkCapture] cache cleared siteKey=${siteKey}`)
}

/** 调试：列出某个 siteKey 当前缓存里所有响应的 URL+ts */
export function listCache(siteKey: string): Array<{
  url: string
  receivedAt: number
  status: number
  bodyBytes: number
}> {
  const bucket = buckets.get(siteKey)
  if (!bucket) return []
  return bucket.cache.map((c) => ({
    url: c.url,
    receivedAt: c.receivedAt,
    status: c.status,
    bodyBytes: c.bodyBytes
  }))
}
