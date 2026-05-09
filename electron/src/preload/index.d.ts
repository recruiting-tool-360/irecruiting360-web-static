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

export interface HandoverBridge {
  getPendingPayload(): Promise<DeepLinkPayload | null>
  onDeepLink(callback: (data: DeepLinkPayload) => void): () => void
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
  code?: number
  message?: string
  data?: T
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
    }
    __IKUAIZHAO_NATIVE__?: IKuaiZhaoNative
  }
}
