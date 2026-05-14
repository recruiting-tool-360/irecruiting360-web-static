/**
 * iHR 业务桥接（i 人事招聘工作台 API 代理）
 *
 * 客户端模式下取代"父 iframe"的角色：
 *   i 快招 SPA → window.api.ihrBridge.* IPC → 本模块 → ses.fetch → i 人事网关
 *   走 `persist:ihr360-ihr-manage` partition + cookie 持久化。
 *
 * cookie 来源（manage SESSION 是 HttpOnly 浏览器 JS 读不到，所以走两条路）：
 *   1. 浏览器侧 launcher 调 manage 的 `/me/dumpClientSession` 拿 SESSION 字符串
 *      → deep link payload.manageCookies → syncCookiesFromLauncher 写入 partition
 *   2. 用户在客户端内开 manage tab 登录（fallback；会触发浏览器单点登录踢出）
 *
 * manage URL 解析（优先级从高到低）：
 *   1. 环境变量 IHR_MANAGE_URL
 *   2. setManageUrl(url) 运行时设置（典型：launcher 透传父页 origin → main deep link
 *      handler 调 setManageUrl）
 *   3. 持久化值（launcherStore：上次 deep link 写入的 ihrManageUrl）
 *   4. 默认兜底：app.isPackaged ? https://vip.ihr360.com : https://qa2-vip.ihr360.com
 *
 * 业务接口清单（与 ihr360-recruit-static/src/actions/recruit-assistant.ts 对齐）：
 *   - getApplicationPosition()                       GET  /headcount/open/position
 *   - getSharedCandidateResume()                     GET  /candidate/resume/init
 *   - sharedCandidateResumeInit()                    GET  /candidate/resume/init
 *   - batchGetPositionDetailByIds(ids)               POST /headcount/v2/batch/getDetailByIds
 *   - assignPositions(req)                           POST /candidate/AiManager/import
 *   - addPools(req)                                  POST /candidate/AiManager/addPools
 *   - uploadFile({ arrayBuffer, name, ... })         POST /candidate/resume/upload (central)
 *                                                    或   /gateway/component/api/v1/file/upload
 *
 * 额外暴露：
 *   - setManageUrl(url)              动态设置 manage URL（来自 deep link payload）
 *   - syncCookiesFromLauncher(str)   浏览器侧拿到的 cookie 字符串写入 partition
 *   - checkManageAuth()              返回当前 partition 是否已登录 manage
 *   - openManageLoginTab(opts)       引导用户登录（客户端新 tab / 系统浏览器）
 */

import { app, ipcMain, session, shell, type Session } from 'electron'
import { tabManager } from './TabManager'
import { loadStoredLauncherData, saveStoredLauncherData } from './util/launcherStore'

// =============== 配置 ===============

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
      return stored.ihrManageUrl.replace(/\/$/, '')
    }
  } catch {
    /* ignore */
  }
  return app.isPackaged ? 'https://vip.ihr360.com' : 'https://qa2-vip.ihr360.com'
}

function manageUrl(): string {
  if (_manageUrl !== null) return _manageUrl
  _manageUrl = resolveInitialManageUrl()
  console.log(`[ihrBridge] manage URL initialized: ${_manageUrl}`)
  return _manageUrl
}

/**
 * 由 deep link / 业务侧主动调用，更新 i 人事 manage URL。
 * 同一个 origin 重复 set 是 no-op；不同 origin 时会清空 session 缓存 + 持久化到磁盘。
 */
export function setManageUrl(url: string | null | undefined): void {
  const trimmed = (url || '').trim().replace(/\/$/, '')
  if (!trimmed) return
  const current = manageUrl()
  if (trimmed === current) return
  console.log(`[ihrBridge] manageUrl updated: ${current} → ${trimmed}`)
  _manageUrl = trimmed
  manageSes = null
  saveStoredLauncherData({ ihrManageUrl: trimmed, source: 'setManageUrl' })
}

/** 当前生效的 manage URL */
export function getManageUrl(): string {
  return manageUrl()
}

/** manage 系统的 cookie partition（与 TabManager.SITE_PARTITION['ihr-manage'] 一致） */
const IHR_MANAGE_PARTITION = 'persist:ihr360-ihr-manage'

/** API 网关 base 路径（参考 ihr360-recruit-static/.env.production REACT_APP_BASE_URL） */
const IHR_MANAGE_API_BASE = '/gateway/recruit/api'

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
  const pairs = cookieStr.split(';').map((p) => p.trim()).filter(Boolean)
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

async function getApplicationPosition(): Promise<IhrApiResult<unknown>> {
  return manageFetch<unknown>(`${IHR_MANAGE_API_BASE}/headcount/open/position`, {
    method: 'GET'
  })
}

async function getSharedCandidateResume(): Promise<IhrApiResult<unknown>> {
  return manageFetch<unknown>(`${IHR_MANAGE_API_BASE}/candidate/resume/init`, {
    method: 'GET'
  })
}

async function sharedCandidateResumeInit(): Promise<IhrApiResult<unknown>> {
  return manageFetch<unknown>(`${IHR_MANAGE_API_BASE}/candidate/resume/init`, {
    method: 'GET'
  })
}

async function batchGetPositionDetailByIds(ids: string[]): Promise<IhrApiResult<unknown>> {
  return manageFetch<unknown>(`${IHR_MANAGE_API_BASE}/headcount/v2/batch/getDetailByIds`, {
    method: 'POST',
    body: JSON.stringify(ids)
  })
}

async function assignPositions(req: Record<string, unknown>): Promise<IhrApiResult<unknown>> {
  return manageFetch<unknown>(`${IHR_MANAGE_API_BASE}/candidate/AiManager/import`, {
    method: 'POST',
    body: JSON.stringify(req)
  })
}

async function addPools(req: Record<string, unknown>): Promise<IhrApiResult<unknown>> {
  return manageFetch<unknown>(`${IHR_MANAGE_API_BASE}/candidate/AiManager/addPools`, {
    method: 'POST',
    body: JSON.stringify(req)
  })
}

async function uploadFile(arg: {
  arrayBuffer: ArrayBuffer
  name: string
  mime?: string
  centralUpload?: boolean
}): Promise<IhrApiResult<unknown>> {
  if (!arg || !arg.arrayBuffer) return fail('missing file payload')
  const url = arg.centralUpload
    ? `${IHR_MANAGE_API_BASE}/candidate/resume/upload`
    : `/gateway/component/api/v1/file/upload`
  const fd = new FormData()
  fd.append(
    'file',
    new Blob([arg.arrayBuffer], { type: arg.mime ?? 'application/octet-stream' }),
    arg.name
  )
  return manageFetch<unknown>(url, { method: 'POST', body: fd as unknown as BodyInit })
}

// =============== 鉴权辅助：检查 cookie / 引导登录 ===============

async function checkManageAuth(): Promise<{
  enabled: boolean
  hasCookies: boolean
  cookieCount: number
  manageUrl: string
}> {
  const url = manageUrl()
  const result = {
    enabled: true,
    hasCookies: false,
    cookieCount: 0,
    manageUrl: url
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
function openManageLoginTab(
  opts: { useSystemBrowser?: boolean; loginPath?: string } = {}
): { ok: boolean; manageUrl: string; message?: string; via?: 'systemBrowser' | 'clientTab' } {
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
  ipcMain.handle(
    'ihrBridge:openManageLoginTab',
    (_e, opts?: { useSystemBrowser?: boolean; loginPath?: string }) =>
      openManageLoginTab(opts ?? {})
  )
}

// app 就绪后预热 partition
app.whenReady().then(() => {
  getManageSession()
})
