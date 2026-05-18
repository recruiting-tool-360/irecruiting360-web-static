/**
 * iHR 业务桥接（i 人事招聘工作台 API 代理）
 *
 * 客户端模式下取代"父 iframe"的角色：
 *   i 快招 SPA → window.api.ihrBridge.* IPC → 本模块 → ses.fetch → i 人事网关
 *
 * ============= 鉴权方案（accessToken）=============
 *
 * 详见 docs/07-ihr-client-usage.md。后端为客户端新增了 4 个 `client/noauth/**`
 * 包装接口，客户端通过 query 参数 `?accessToken=...` 鉴权，不再依赖 manage 域 cookie。
 *
 * 流程：
 *   1. IHR Web (recruit-assistant 页 iframe) 已登录态下调
 *      `POST /gateway/recruit/api/candidate/AiManager/client/launch` 拿 accessToken。
 *   2. accessToken / accessTokenExpireAt 通过 deep link payload 传给客户端。
 *   3. 主进程 `setAccessToken(token, expireAt)` 缓存 + 持久化（launcherStore）。
 *   4. 所有 4 个业务接口都通过 `noauthFetch(...)` 走
 *      `/gateway/recruit/api/candidate/AiManager/client/noauth/**?accessToken=...`。
 *   5. token 缺失 / 即将过期（30s 内）→ 返回 `errorCode='NOT_LOGGED_IN'`，
 *      SPA 侧 `electronMessengerShim` 弹 IhrAuthModal 引导用户回到工作台重新打开。
 *
 * cookie 旧方案（保留为非 noauth 接口的兜底，例如 uploadFile）：
 *   - 浏览器侧 launcher 调 manage 的 `/me/dumpClientSession` 拿 SESSION
 *   - deep link payload.manageCookies → syncCookiesFromLauncher 写入 partition
 *
 * manage URL 解析（优先级从高到低）：
 *   1. 环境变量 IHR_MANAGE_URL
 *   2. setManageUrl(url) 运行时设置（典型：launcher 透传父页 origin → main deep link
 *      handler 调 setManageUrl）
 *   3. 持久化值（launcherStore：上次 deep link 写入的 ihrManageUrl）
 *   4. 默认兜底：app.isPackaged ? https://vip.ihr360.com : https://qa2-vip.ihr360.com
 *
 * 业务接口清单（noauth 包装层，详见 docs/07-ihr-client-usage.md §2）：
 *   - getApplicationPosition()                       GET  /candidate/AiManager/client/noauth/application/position
 *   - batchGetPositionDetailByIds(ids)               POST /candidate/AiManager/client/noauth/headcount/v2/batch/getDetailByIds
 *   - assignPositions(req)                           POST /candidate/AiManager/client/noauth/import
 *   - addPools(req)                                  POST /candidate/AiManager/client/noauth/addPools
 *
 * 非 noauth 业务接口（仍走 cookie 鉴权）：
 *   - getSharedCandidateResume()                     GET  /candidate/resume/init
 *   - sharedCandidateResumeInit()                    GET  /candidate/resume/init
 *   - uploadFile({ arrayBuffer, name, ... })         POST /candidate/resume/upload (central)
 *                                                    或   /gateway/component/api/v1/file/upload
 *
 * 额外暴露：
 *   - setManageUrl(url)              动态设置 manage URL（来自 deep link payload）
 *   - setAccessToken(token, exp)     动态设置 accessToken（来自 deep link payload）
 *   - getAccessTokenStatus()         返回当前 token 状态供 SPA 诊断
 *   - syncCookiesFromLauncher(str)   浏览器侧拿到的 cookie 字符串写入 partition（兜底）
 *   - checkManageAuth()              返回当前 partition 是否已登录 manage
 *   - openManageLoginTab(opts)       引导用户登录（客户端新 tab / 系统浏览器）
 */

import { app, ipcMain, session, shell, type Session } from 'electron'
import { tabManager } from './TabManager'
import { loadStoredLauncherData, saveStoredLauncherData } from './util/launcherStore'

/** noauth 包装接口前缀（详见 docs/07-ihr-client-usage.md §2） */
const IHR_NOAUTH_BASE = '/gateway/recruit/api/candidate/AiManager/client/noauth'

/** accessToken 默认 TTL（文档约定 1800s，未带 expireAt 时兜底） */
const ACCESS_TOKEN_DEFAULT_TTL_MS = 25 * 60 * 1000

/**
 * 即将过期的提前量：剩余时间不足这个阈值就视为"过期"，
 * 让 SPA 提前看到 NOT_LOGGED_IN 走 IhrAuthModal 重新走 client/launch，
 * 避免业务请求在网络回程中刚好踩到 0 秒边界。
 */
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30 * 1000

// =============== 配置 ===============

/**
 * 客户端永远走 https，且会把"开发态"域名（localhost / qa*-vip / qa*.ihr360.com 等）
 * 统一改写到 `QA_FALLBACK_URL`，避免：
 *   1. 客户端打到用户本机 `localhost:5001`（用户机器没起 i 人事后端）
 *   2. 不同环境之间手动切换的运维麻烦
 * 生产域名（vip.ihr360.com / *.ihr360.com 公司其它正式子域）保持原样。
 *
 * 如果需要强制覆盖（联调 / 灰度），设环境变量 IHR_MANAGE_URL=<full-url>。
 */
const QA_FALLBACK_URL = 'https://qa2-vip.ihr360.com'

/**
 * 判断一个 URL 是不是"开发态/测试态"——需要改写到 QA_FALLBACK_URL。
 */
function isDevOrQaHost(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true
    if (host.endsWith('.localhost')) return true
    // qa2-vip / qa-vip / qa2 / qa / uatstable / uat 等开发/测试子域
    if (/^(qa\d*-?vip|qa\d*|uat(stable)?|test|sandbox|dev)\.ihr360\.com$/.test(host)) return true
    return false
  } catch {
    return false
  }
}

/**
 * 把检测/持久化拿到的 manage URL 规范化到客户端实际打的地址。
 *
 * 优先级：
 *   1. 环境变量 IHR_MANAGE_URL 显式给的，**完全信任**，不做任何改写（联调 / 灰度逃生口）
 *   2. 开发态域名（localhost / qa* / uat* / test / dev / sandbox）→ 改写到 QA_FALLBACK_URL
 *   3. 生产 / 公司其它正式域名 → 保持原样
 */
function normalizeManageUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '')
  if (!trimmed) return trimmed
  if (isDevOrQaHost(trimmed)) {
    if (trimmed !== QA_FALLBACK_URL) {
      console.log(`[ihrBridge] manage URL normalized: ${trimmed} → ${QA_FALLBACK_URL}`)
    }
    return QA_FALLBACK_URL
  }
  return trimmed
}

/**
 * i 人事 manage 系统入口 URL（运行时可变）。
 * lazy 初始化：首次访问时才解析（避免模块 import 时调 app.getPath 报错）。
 */
let _manageUrl: string | null = null

function resolveInitialManageUrl(): string {
  const fromEnv = (process.env.IHR_MANAGE_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  try {
    const stored = loadStoredLauncherData()
    if (typeof stored.ihrManageUrl === 'string' && stored.ihrManageUrl) {
      return normalizeManageUrl(stored.ihrManageUrl)
    }
  } catch {
    /* ignore */
  }
  return app.isPackaged ? 'https://vip.ihr360.com' : QA_FALLBACK_URL
}

function manageUrl(): string {
  if (_manageUrl !== null) return _manageUrl
  _manageUrl = resolveInitialManageUrl()
  console.log(`[ihrBridge] manage URL initialized: ${_manageUrl}`)
  return _manageUrl
}

/**
 * 由 deep link / 业务侧主动调用，更新 i 人事 manage URL。
 *   - 同一个 origin 重复 set 是 no-op
 *   - localhost / qa* / uat* 等开发态域名会被规范化到 QA_FALLBACK_URL
 *   - 不同 origin 时会清空 session 缓存 + 持久化到磁盘
 *
 * 如果环境变量 IHR_MANAGE_URL 已显式指定，本方法是 no-op（避免 deep link 覆盖联调配置）。
 */
export function setManageUrl(url: string | null | undefined): void {
  if (process.env.IHR_MANAGE_URL) {
    // 显式联调配置最优先，忽略 deep link 透传
    return
  }
  const normalized = normalizeManageUrl(url || '')
  if (!normalized) return
  const current = manageUrl()
  if (normalized === current) return
  console.log(`[ihrBridge] manageUrl updated: ${current} → ${normalized}`)
  _manageUrl = normalized
  manageSes = null
  saveStoredLauncherData({ ihrManageUrl: normalized, source: 'setManageUrl' })
}

/** 当前生效的 manage URL */
export function getManageUrl(): string {
  return manageUrl()
}

// =============== accessToken 状态 ===============

/**
 * 当前缓存的客户端 JWT。null 表示从未注入过 / 已显式清空。
 * 优先级：内存 > 持久化（loadStoredLauncherData）。
 */
let _accessToken: string | null = null
/** ms 时间戳；0 表示未知（按"过期"处理） */
let _accessTokenExpireAt = 0

function parseExpireAt(raw: string | number | null | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw) {
    const ts = Date.parse(raw)
    if (Number.isFinite(ts) && ts > 0) return ts
  }
  return Date.now() + ACCESS_TOKEN_DEFAULT_TTL_MS
}

/**
 * 设置 / 清空客户端 accessToken。
 *
 * 调用方：
 *   - main `handleDeepLink`：deep link payload.accessToken 抽出来后调一次
 *   - 客户端启动冷加载时主进程 `loadStoredLauncherData()` 兜底（见模块 init）
 *
 * @param token  null/空串 → 清空当前缓存（视为登出）
 * @param expireAt  ISO 字符串 / ms 时间戳 / null（按默认 TTL）
 */
export function setAccessToken(
  token: string | null | undefined,
  expireAt?: string | number | null
): void {
  if (!token) {
    _accessToken = null
    _accessTokenExpireAt = 0
    saveStoredLauncherData({
      accessToken: null,
      accessTokenExpireAt: null,
      source: 'setAccessToken/clear'
    })
    console.log('[ihrBridge] accessToken cleared')
    return
  }
  _accessToken = token
  _accessTokenExpireAt = parseExpireAt(expireAt)
  saveStoredLauncherData({
    accessToken: token,
    accessTokenExpireAt: _accessTokenExpireAt,
    source: 'setAccessToken'
  })
  const remainMs = Math.max(0, _accessTokenExpireAt - Date.now())
  console.log(
    `[ihrBridge] accessToken updated (remain=${Math.floor(remainMs / 1000)}s, expireAt=${new Date(_accessTokenExpireAt).toISOString()})`
  )
}

/**
 * 当前 accessToken 状态：
 *   - 内存命中直接返回
 *   - 否则尝试从持久化恢复（启动冷启动场景）
 *   - 剩余时间 ≤ ACCESS_TOKEN_REFRESH_BUFFER_MS 视为已过期，需要重新走 client/launch
 */
function getAccessToken(): { token: string | null; expireAt: number; expired: boolean } {
  if (!_accessToken) {
    try {
      const stored = loadStoredLauncherData()
      if (
        typeof stored.accessToken === 'string' &&
        stored.accessToken &&
        typeof stored.accessTokenExpireAt === 'number' &&
        stored.accessTokenExpireAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS
      ) {
        _accessToken = stored.accessToken
        _accessTokenExpireAt = stored.accessTokenExpireAt
        console.log(
          `[ihrBridge] accessToken restored from disk (remain=${Math.floor((_accessTokenExpireAt - Date.now()) / 1000)}s)`
        )
      }
    } catch (e) {
      console.warn('[ihrBridge] restore accessToken failed:', (e as Error).message)
    }
  }
  const expired =
    !_accessToken || Date.now() >= _accessTokenExpireAt - ACCESS_TOKEN_REFRESH_BUFFER_MS
  return { token: _accessToken, expireAt: _accessTokenExpireAt, expired }
}

/** 给 SPA / Devtools 的诊断信息（不暴露 token 本体，避免日志泄露） */
export function getAccessTokenStatus(): {
  hasToken: boolean
  expireAt: number
  remainMs: number
  expired: boolean
} {
  const { token, expireAt, expired } = getAccessToken()
  return {
    hasToken: !!token,
    expireAt,
    remainMs: expireAt > 0 ? Math.max(0, expireAt - Date.now()) : 0,
    expired
  }
}

/** 把 accessToken 拼到 URL query string 末尾 */
function appendAccessTokenQuery(url: string, token: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'accessToken=' + encodeURIComponent(token)
}

/** manage 系统的 cookie partition（与 TabManager.SITE_PARTITION['ihr-manage'] 一致） */
const IHR_MANAGE_PARTITION = 'persist:ihr360-ihr-manage'

/** manage 登录入口 */
const IHR_MANAGE_LOGIN_PATH = '/'

// =============== 通用响应包装 ===============

interface IhrApiResult<T = unknown> {
  success: boolean
  code?: number | string
  message?: string
  data?: T
  httpStatus?: number
  /** 'NOT_LOGGED_IN' 表示需要引导用户登录 manage */
  errorCode?: 'NOT_LOGGED_IN' | 'NETWORK' | 'PARSE' | 'OTHER'
}

function ok<T>(data: T, code: number | string = 0): IhrApiResult<T> {
  return { success: true, code, data }
}

function fail(
  message: string,
  opts: { errorCode?: IhrApiResult['errorCode']; httpStatus?: number; code?: number | string } = {}
): IhrApiResult<never> {
  return {
    success: false,
    message,
    errorCode: opts.errorCode ?? 'OTHER',
    httpStatus: opts.httpStatus,
    code: opts.code ?? -1
  }
}

// =============== Session / HTTP 工具 ===============

let manageSes: Session | null = null
function getManageSession(): Session {
  if (!manageSes) manageSes = session.fromPartition(IHR_MANAGE_PARTITION)
  return manageSes
}

/**
 * 统一请求封装：走 manage partition 的 ses.fetch。
 * - cookie 自动带（partition 持久化）
 * - 401/403 → errorCode=NOT_LOGGED_IN
 * - i 人事网关约定：{ code: 0, data: ..., message: '' } 才算业务成功
 */
async function manageFetch<T = unknown>(
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<IhrApiResult<T>> {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : manageUrl() + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl)
  const ses = getManageSession()
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined)
    }
    if (!headers['Content-Type'] && init.body && !(init.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
    const res = await ses.fetch(url, { ...init, headers })
    if (res.status === 401 || res.status === 403) {
      return fail('未登录 i 人事工作台，请先登录', {
        errorCode: 'NOT_LOGGED_IN',
        httpStatus: res.status
      })
    }
    let body: unknown = null
    const contentType = res.headers.get('content-type') || ''
    try {
      body = contentType.includes('application/json') ? await res.json() : await res.text()
    } catch (e) {
      return fail(`解析响应失败: ${(e as Error).message}`, {
        errorCode: 'PARSE',
        httpStatus: res.status
      })
    }
    if (body && typeof body === 'object' && 'code' in body) {
      const json = body as { code: number | string; data?: T; message?: string }
      if (json.code === 0 || json.code === '0') {
        return ok(json.data as T, json.code)
      }
      return fail(json.message || `i 人事网关错误 code=${json.code}`, {
        code: json.code,
        httpStatus: res.status
      })
    }
    return ok(body as T, 0)
  } catch (e) {
    return fail(`请求 i 人事网关失败: ${(e as Error).message}`, { errorCode: 'NETWORK' })
  }
}

/**
 * 调 noauth 包装接口的统一入口：
 *   - 校验 accessToken（缺失 / 即将过期 → 直接返回 NOT_LOGGED_IN，不发请求）
 *   - 自动拼 `?accessToken=...`
 *   - 复用 manageFetch（manageUrl / 错误码 / 业务包装解析）
 *
 * @param subPath  相对于 IHR_NOAUTH_BASE 的子路径，可带前导 '/'（自动补正）
 */
async function noauthFetch<T = unknown>(
  subPath: string,
  init: RequestInit = {}
): Promise<IhrApiResult<T>> {
  const { token, expired, expireAt } = getAccessToken()
  if (!token || expired) {
    console.warn(
      `[ihrBridge] noauth/${subPath} blocked: hasToken=${!!token} expired=${expired} expireAt=${expireAt}`
    )
    return fail('客户端访问令牌缺失或已过期，请回到招聘工作台重新打开 i 快招', {
      errorCode: 'NOT_LOGGED_IN'
    })
  }
  const path = `${IHR_NOAUTH_BASE}/${subPath.replace(/^\//, '')}`
  const remainMs = Math.max(0, expireAt - Date.now())
  // 入参全量打印（开发期排查 9001 / 字段缺失类业务错误用）
  // FormData 没法直接序列化，单独标注
  let bodyPreview = ''
  try {
    if (typeof init.body === 'string') {
      bodyPreview = `${init.body} (${init.body.length}B)`
    } else if (init.body instanceof FormData) {
      bodyPreview = '[FormData]'
    }
  } catch {
    /* ignore */
  }
  // token 脱敏：只露前 8 位，方便排查时跟父页 / DevTools 拿到的对比，
  // 又不会把完整 JWT 打到日志 / 截图 / 工单里（doc 07 §9.3）
  const tokenPreview = token.length > 12 ? `${token.slice(0, 8)}…(len=${token.length})` : '***'
  console.log(
    `[ihrBridge] → ${init.method ?? 'GET'} ${manageUrl()}${path}?accessToken=${tokenPreview} (remain=${Math.floor(remainMs / 1000)}s)`
  )
  if (bodyPreview) console.log(`[ihrBridge]   body: ${bodyPreview}`)
  const result = await manageFetch<T>(appendAccessTokenQuery(path, token), init)
  // response data 摘要（业务排查"接口 code=0 但数据没落库"时关键）
  let dataPreview = ''
  try {
    if (result.data !== undefined && result.data !== null) {
      const json = JSON.stringify(result.data)
      // 4000B 已经能完整看到 addPools 一条 newResumeInfos 末尾的 success 字段；
      // 真有超大 response（>4000B 业务字段）再调，避免 stdout 被刷屏
      dataPreview = json.length > 4000 ? json.slice(0, 4000) + `…(${json.length}B)` : json
    }
  } catch {
    /* ignore */
  }
  console.log(
    `[ihrBridge] ← noauth/${subPath} success=${result.success} code=${result.code} http=${result.httpStatus ?? '-'} message=${result.message ?? '-'}`
  )
  if (dataPreview) console.log(`[ihrBridge]   data: ${dataPreview}`)
  return result
}

/**
 * 把浏览器侧 launcher 拿到的 cookie 字符串（同 document.cookie 格式 "k1=v1; k2=v2"）
 * 写入客户端的 manage partition。
 *
 * 流程：
 *   launcher → fetch manage `/me/dumpClientSession` 拿 SESSION 值
 *   → 拼上 document.cookie 里其它非 HttpOnly cookie（satoken / XSRF-TOKEN 等）
 *   → 编进 deep link payload.manageCookies
 *   → main handleDeepLink → 调本方法
 *   → session.cookies.set 写到 partition
 *   → 之后 ihrBridge 所有 ses.fetch 自动带这些 cookie
 *
 * @param cookieStr "k1=v1; k2=v2; ..."
 */
export async function syncCookiesFromLauncher(cookieStr: string | undefined | null): Promise<{
  ok: boolean
  written: number
  errors?: string[]
}> {
  if (!cookieStr || typeof cookieStr !== 'string') {
    return { ok: false, written: 0, errors: ['empty cookieStr'] }
  }
  const url = manageUrl()
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return { ok: false, written: 0, errors: ['invalid manageUrl'] }
  }
  const isSecure = url.startsWith('https://')
  const pairs = cookieStr
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
  const ses = getManageSession()
  let written = 0
  const errors: string[] = []
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (!name) continue
    try {
      await ses.cookies.set({
        url,
        name,
        value,
        domain: host,
        path: '/',
        secure: isSecure,
        // 浏览器能传给我们的本就是非 HttpOnly cookie；SESSION 经服务端 dump 接口拿到，
        // 这里统一写为非 HttpOnly（无法还原原 HttpOnly 标志，但不影响功能）
        httpOnly: false,
        sameSite: 'no_restriction'
      })
      written++
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`)
    }
  }
  console.log(
    `[ihrBridge] syncCookiesFromLauncher: wrote ${written}/${pairs.length} cookies to ${host}`
  )
  if (errors.length) console.warn('[ihrBridge] cookie write errors:', errors)
  return { ok: errors.length === 0, written, errors: errors.length ? errors : undefined }
}

// =============== 业务实现 ===============
//
// 6 个走 accessToken / noauth 包装接口（docs/07-ihr-client-usage.md §2）：
//   GET  /candidate/AiManager/client/noauth/application/position
//   POST /candidate/AiManager/client/noauth/headcount/v2/batch/getDetailByIds
//   POST /candidate/AiManager/client/noauth/import
//   POST /candidate/AiManager/client/noauth/addPools
//   GET  /candidate/AiManager/client/noauth/resume/init        ← 2026-05-18 上线
//   POST /candidate/AiManager/client/noauth/resume/upload      ← 2026-05-18 上线

async function getApplicationPosition(): Promise<IhrApiResult<unknown>> {
  return noauthFetch<unknown>('application/position', { method: 'GET' })
}

async function batchGetPositionDetailByIds(ids: string[]): Promise<IhrApiResult<unknown>> {
  return noauthFetch<unknown>('headcount/v2/batch/getDetailByIds', {
    method: 'POST',
    body: JSON.stringify(ids)
  })
}

async function assignPositions(req: Record<string, unknown>): Promise<IhrApiResult<unknown>> {
  return noauthFetch<unknown>('import', {
    method: 'POST',
    body: JSON.stringify(req)
  })
}

async function addPools(req: Record<string, unknown>): Promise<IhrApiResult<unknown>> {
  return noauthFetch<unknown>('addPools', {
    method: 'POST',
    body: JSON.stringify(req)
  })
}

// ------- resume/init + resume/upload：后端 2026-05-18 上线新 noauth 包装版本 -------
// 跟 doc 07 §2 表里其他 4 个 noauth 接口一样走 accessToken query，**不再依赖 cookie**

async function getSharedCandidateResume(): Promise<IhrApiResult<unknown>> {
  return noauthFetch<unknown>('resume/init', { method: 'GET' })
}

/** 老入口保留兼容，本质跟 getSharedCandidateResume 同一个接口 */
async function sharedCandidateResumeInit(): Promise<IhrApiResult<unknown>> {
  return noauthFetch<unknown>('resume/init', { method: 'GET' })
}

/**
 * 简历文件上传 → noauth/resume/upload
 * 旧版本曾按 `centralUpload` 标志走两个不同 URL（manage / component），
 * 现在统一走 noauth 包装，`centralUpload` 字段保留但忽略（避免破坏老调用方）。
 */
async function uploadFile(arg: {
  arrayBuffer: ArrayBuffer
  name: string
  mime?: string
  centralUpload?: boolean // ← 已忽略，仅向后兼容
}): Promise<IhrApiResult<unknown>> {
  if (!arg || !arg.arrayBuffer) return fail('missing file payload')
  const fd = new FormData()
  fd.append(
    'file',
    new Blob([arg.arrayBuffer], { type: arg.mime ?? 'application/octet-stream' }),
    arg.name
  )
  return noauthFetch<unknown>('resume/upload', {
    method: 'POST',
    body: fd as unknown as BodyInit
  })
}

// =============== 鉴权辅助：检查 cookie / 引导登录 ===============

async function checkManageAuth(): Promise<{
  enabled: boolean
  hasCookies: boolean
  cookieCount: number
  manageUrl: string
  /** noauth 接口鉴权所需的 accessToken 状态 */
  hasAccessToken: boolean
  accessTokenExpired: boolean
  accessTokenRemainMs: number
}> {
  const url = manageUrl()
  const tokenStatus = getAccessTokenStatus()
  const result = {
    enabled: true,
    hasCookies: false,
    cookieCount: 0,
    manageUrl: url,
    hasAccessToken: tokenStatus.hasToken,
    accessTokenExpired: tokenStatus.expired,
    accessTokenRemainMs: tokenStatus.remainMs
  }
  try {
    const ses = getManageSession()
    const cookies = await ses.cookies.get({ url })
    result.cookieCount = cookies.length
    result.hasCookies = cookies.length > 0
  } catch (e) {
    console.warn('[ihrBridge] checkManageAuth failed', e)
  }
  return result
}

/**
 * 加载 i 人事 manage 入口让用户登录。
 *   useSystemBrowser=true  → 走系统默认浏览器（shell.openExternal）
 *   useSystemBrowser=false → 在主窗口新开 tab 加载（默认，cookie 写入 partition）
 *   loginPath              → 拼到 manageUrl 后面的登录路径，默认 '/'
 */
function openManageLoginTab(opts: { useSystemBrowser?: boolean; loginPath?: string } = {}): {
  ok: boolean
  manageUrl: string
  message?: string
  via?: 'systemBrowser' | 'clientTab'
} {
  const base = manageUrl()
  try {
    const path = opts.loginPath || IHR_MANAGE_LOGIN_PATH
    const url = base + (path.startsWith('/') ? path : '/' + path)
    if (opts.useSystemBrowser) {
      void shell.openExternal(url)
      return { ok: true, manageUrl: url, via: 'systemBrowser' }
    }
    tabManager.openOrActivateSiteTab('ihr-manage', url)
    return { ok: true, manageUrl: url, via: 'clientTab' }
  } catch (e) {
    return { ok: false, manageUrl: base, message: (e as Error).message }
  }
}

// =============== IPC 注册 ===============

export function registerIhrBridgeIpc(): void {
  console.log(`[ihrBridge] init: manage URL = ${manageUrl()}`)

  ipcMain.handle('ihrBridge:getApplicationPosition', () => getApplicationPosition())
  ipcMain.handle('ihrBridge:getSharedCandidateResume', () => getSharedCandidateResume())
  ipcMain.handle('ihrBridge:sharedCandidateResumeInit', () => sharedCandidateResumeInit())
  ipcMain.handle('ihrBridge:batchGetPositionDetailByIds', (_e, ids: string[]) =>
    batchGetPositionDetailByIds(ids)
  )
  ipcMain.handle('ihrBridge:assignPositions', (_e, req: Record<string, unknown>) =>
    assignPositions(req)
  )
  ipcMain.handle('ihrBridge:addPools', (_e, req: Record<string, unknown>) => addPools(req))
  ipcMain.handle(
    'ihrBridge:uploadFile',
    (
      _e,
      arg: {
        arrayBuffer: ArrayBuffer
        name: string
        mime?: string
        centralUpload?: boolean
      }
    ) => uploadFile(arg)
  )

  ipcMain.handle('ihrBridge:checkManageAuth', () => checkManageAuth())
  ipcMain.handle('ihrBridge:getAccessTokenStatus', () => getAccessTokenStatus())
  ipcMain.handle(
    'ihrBridge:openManageLoginTab',
    (_e, opts?: { useSystemBrowser?: boolean; loginPath?: string }) =>
      openManageLoginTab(opts ?? {})
  )
}

// app 就绪后预热 partition + 从磁盘恢复 accessToken（如果还没过期）
app.whenReady().then(() => {
  getManageSession()
  const status = getAccessTokenStatus()
  if (status.hasToken && !status.expired) {
    console.log(
      `[ihrBridge] accessToken hot from disk (remain=${Math.floor(status.remainMs / 1000)}s)`
    )
  } else if (status.hasToken && status.expired) {
    console.log('[ihrBridge] accessToken on disk is expired/near-expired, SPA will refresh')
  } else {
    console.log('[ihrBridge] no accessToken on disk (cold start without prior deep-link)')
  }
})
