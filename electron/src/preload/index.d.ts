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
  openSiteWindow(
    channel: string,
    url: string
  ): Promise<{ success: boolean; message?: string }>

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
    }
    __IKUAIZHAO_NATIVE__?: IKuaiZhaoNative
  }
}
