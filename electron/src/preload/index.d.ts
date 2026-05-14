import { ElectronAPI } from '@electron-toolkit/preload'

export interface UniversalRequestArgs {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  credentials?: string
  tabUrl?: string
}

export interface UniversalRequestResult {
  success: boolean
  data?: unknown
  status?: number
  message?: string
}

export interface CapturedHeaders {
  url: string
  headersData: Record<string, string>
}

export interface CapturedCookies {
  url: string
  cookieData: string
}

export interface RecruitBridge {
  openSiteWindow(channel: string, url: string): Promise<{ success: boolean; message?: string }>

  getCapturedHeaders(storageKey: string): Promise<CapturedHeaders | null>

  getCapturedCookies(storageKey: string): Promise<CapturedCookies | null>

  universalRequest(req: UniversalRequestArgs): Promise<UniversalRequestResult>

  /**
   * 监听某渠道登录态可能发生变化的事件（header 抓到 / 站点窗口加载完成）
   * @returns 取消订阅函数
   */
  onChannelStatusChanged(
    callback: (data: { channel: string; reason: 'headers' | 'site-window' }) => void
  ): () => void
}

export interface DeepLinkPayload {
  action: string
  version: number
  payload: Record<string, unknown>
  rawUrl: string
}

export interface StoredLauncherData {
  /** 上次 deep link 写入的 i 人事 manage URL */
  ihrManageUrl?: string
  /** 上次 deep link payload 的完整副本（含 ssoConfig / sysConfig 等业务字段） */
  lastInitPayload?: Record<string, unknown>
  /** 写入时间戳 */
  savedAt?: number
  /** 写入来源（'deep-link' / 'setManageUrl' 等） */
  source?: string
}

export interface HandoverBridge {
  getPendingPayload(): Promise<DeepLinkPayload | null>
  onDeepLink(callback: (data: DeepLinkPayload) => void): () => void
  /** 跨次启动持久化的 launcher 数据，业务侧用作冷启动兜底 */
  getStoredLauncherData(): Promise<StoredLauncherData>
  clearStoredLauncherData(): Promise<boolean>
}

export interface TabState {
  id: string
  pinned: boolean
  channel?: string
  title: string
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  active: boolean
}

export interface TabsBridge {
  list(): Promise<TabState[]>
  create(opts: { url: string; channel?: string; title?: string }): Promise<string | null>
  activate(id: string): Promise<boolean>
  close(id: string): Promise<boolean>
  reorder(orderedIds: string[]): Promise<boolean>
  goBack(id: string): Promise<void>
  goForward(id: string): Promise<void>
  reload(id: string): Promise<void>
  onState(callback: (state: TabState[]) => void): () => void
}

export interface IhrApiResult<T = unknown> {
  success: boolean
  code?: number | string
  message?: string
  data?: T
  httpStatus?: number
  /** 'NOT_LOGGED_IN' 表示需要引导用户先登录 i 人事 manage 系统 */
  errorCode?: 'NOT_LOGGED_IN' | 'NETWORK' | 'PARSE' | 'OTHER'
}

export interface IhrManageAuthStatus {
  /** IHR_MANAGE_URL 是否已配（false 表示走 mock 模式，无需登录） */
  enabled: boolean
  hasCookies: boolean
  cookieCount: number
  manageUrl: string
}

export interface IhrBridge {
  getApplicationPosition(): Promise<IhrApiResult>
  getSharedCandidateResume(): Promise<IhrApiResult>
  sharedCandidateResumeInit(): Promise<IhrApiResult>
  batchGetPositionDetailByIds(ids: string[]): Promise<IhrApiResult>
  assignPositions(req: Record<string, unknown>): Promise<IhrApiResult>
  addPools(req: Record<string, unknown>): Promise<IhrApiResult>
  uploadFile(arg: {
    arrayBuffer: ArrayBuffer
    name: string
    mime?: string
    centralUpload?: boolean
  }): Promise<IhrApiResult>
  /** 检查 manage partition 是否已登录 */
  checkManageAuth(): Promise<IhrManageAuthStatus>
  /**
   * 引导用户登录 i 人事 manage 系统。
   * @param opts.useSystemBrowser true → shell.openExternal 走系统浏览器
   *                              false / undefined → 主窗口新开 tab
   * @param opts.loginPath 拼到 manageUrl 后面的登录路径，默认 '/'
   */
  openManageLoginTab(opts?: { useSystemBrowser?: boolean; loginPath?: string }): Promise<{
    ok: boolean
    manageUrl: string
    message?: string
    via?: 'systemBrowser' | 'clientTab'
  }>
}

/**
 * 浏览器 → 客户端 SPA 数据通道
 *
 * 来源：浏览器侧 POST http://127.0.0.1:53531/__ikuaizhao/dispatch
 *      → probe server 透传到 home tab webContents
 *      → preload 把它整理成 on/onAny 订阅 API
 *
 * 业务侧只关心 type，主进程层不参与 type/payload 校验，新增 type 不需要客户端发版。
 */
export interface BrowserBridgeMessage {
  v: 1
  type: string
  payload?: unknown
  requestId?: string
}

export interface BrowserBridge {
  /**
   * 订阅指定 type 的浏览器消息
   * @returns 取消订阅函数
   */
  on(
    type: string,
    callback: (payload: unknown, ctx: { type: string; requestId?: string; v: 1 }) => void
  ): () => void
  /**
   * 订阅所有 type 的兜底监听（debug / logger 用，业务一般用 on(type, cb)）
   * @returns 取消订阅函数
   */
  onAny(callback: (data: BrowserBridgeMessage) => void): () => void
}

/**
 * Automation：隐藏 view 抓接口
 *
 * 在 main 进程起 show:false 的 BrowserWindow，加载 pageUrl，
 * 用 CDP 监听匹配的接口 response body。窗口对用户完全不可见，
 * 拿到第一条匹配的响应（或超时）后自动销毁。
 */
export interface HiddenCaptureRequest {
  /** 要加载的页面 URL（接口由该页面自然触发） */
  pageUrl: string
  /** session partition，与对应招聘 tab 共用以继承登录态，如 'persist:ihr360-boss' */
  partition: string
  /** 抓取规则 */
  capture: {
    /** URL 包含的子串 */
    urlIncludes?: string
    /** URL 正则（字符串形式，main 进程 new RegExp(p)） */
    urlPattern?: string
    /** HTTP 方法过滤；不传 = 任意 */
    method?: string
    /** 命中第一条立即返回（默认 true） */
    matchFirst?: boolean
  }
  /** 单次任务超时 ms，默认 15000 */
  timeoutMs?: number
  /** 覆盖默认桌面 Chrome UA */
  userAgent?: string
  /** 额外请求头（追加到所有出站请求） */
  extraHeaders?: Record<string, string>
}

export interface HiddenCaptured {
  url: string
  method: string
  status: number
  /** 尝试 JSON.parse 后的 body；失败时为 null */
  bodyJson: unknown | null
  /** 文本 body（base64 已解码） */
  bodyText: string | null
  /** body 字节数（解码后） */
  bodyBytes: number
  responseHeaders: Record<string, string>
  durationMs: number
}

export interface HiddenCaptureResult {
  ok: boolean
  data?: HiddenCaptured
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
  logs?: string[]
}

export interface TabFetchRequest {
  /** 招聘站渠道：'boss' / 'zhilian' / 'job51' / ... */
  channel: string
  /** tab 加载的页面 URL（决定 Referer / 同源） */
  pageUrl: string
  /** tab 加载完成后要在 tab 上下文里 fetch 的接口 URL */
  apiUrl: string
  method?: string
  headers?: Record<string, string>
  body?: string
  /** 抓完是否保留 tab，默认 false 抓完关 */
  keepTab?: boolean
  /** 是否让 tab 出现在 TabBar 并 activate（默认 false：hidden 模式，用户无感知） */
  visible?: boolean
  navTimeoutMs?: number
  fetchTimeoutMs?: number
}

export interface TabFetchData {
  status: number
  url: string
  bodyText: string
  bodyJson: unknown | null
  bodyBytes: number
  durationMs: number
  finalPageUrl: string
}

export interface TabFetchResult {
  ok: boolean
  data?: TabFetchData
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

export interface AutomationBridge {
  captureFromHiddenView(req: HiddenCaptureRequest): Promise<HiddenCaptureResult>
  captureViaNewTab(req: TabFetchRequest): Promise<TabFetchResult>
}

export interface IKuaiZhaoNative {
  mode: 'electron'
  version: string
  platform: NodeJS.Platform
  arch: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      recruitBridge: RecruitBridge
      handover: HandoverBridge
      tabs: TabsBridge
      ihrBridge: IhrBridge
      browserBridge: BrowserBridge
      automation: AutomationBridge
    }
    __IKUAIZHAO_NATIVE__?: IKuaiZhaoNative
  }
}
