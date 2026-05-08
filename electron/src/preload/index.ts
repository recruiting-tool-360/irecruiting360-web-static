import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * 渲染端可调用的业务能力（与 main 进程的 IPC handler 一一对应）
 *
 * SPA 端封装见 src/pluginSrc/util/BasePluginManager.js 的 ElectronAdapter，
 * 业务模块（pluginSrc/channels/*）继续调 i360Request 即可，对客户端 vs 浏览器无感知
 */
const recruitBridge = {
  /**
   * 打开第三方招聘站点登录窗口（独立 BrowserWindow + 独立 partition）
   */
  openSiteWindow: (channel: string, url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('recruit:openSiteWindow', channel, url),

  /**
   * 取出已抓到的请求/响应 header（取代 chrome.storage.local 里 storageKey 对应的 headersData）
   */
  getCapturedHeaders: (
    storageKey: string
  ): Promise<{ url: string; headersData: Record<string, string> } | null> =>
    ipcRenderer.invoke('recruit:getCapturedHeaders', storageKey),

  /**
   * 取出当前 partition 下站点 cookie（拼成 "k=v; k=v" 串，与原插件返回格式一致）
   */
  getCapturedCookies: (storageKey: string): Promise<{ url: string; cookieData: string } | null> =>
    ipcRenderer.invoke('recruit:getCapturedCookies', storageKey),

  /**
   * 通过对应 partition session 发 fetch（自动带 cookie），
   * 或者在站点窗口里 webContents.executeJavaScript 发 fetch（tabUrl 提示用）
   */
  universalRequest: (req: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: unknown
    credentials?: string
    tabUrl?: string
  }): Promise<{
    success: boolean
    data?: unknown
    status?: number
    message?: string
  }> => ipcRenderer.invoke('recruit:universalRequest', req),

  /**
   * 主进程在抓到新 header / 站点窗口加载完成时会主动推送事件，
   * SPA 据此自动刷新对应渠道的登录状态展示，不用用户手动点刷新
   * @returns 取消订阅函数
   */
  onChannelStatusChanged: (
    callback: (data: { channel: string; reason: 'headers' | 'site-window' }) => void
  ): (() => void) => {
    const headersHandler = (_e: unknown, data: { channel: string }): void =>
      callback({ ...data, reason: 'headers' })
    const siteHandler = (_e: unknown, data: { channel: string }): void =>
      callback({ ...data, reason: 'site-window' })
    ipcRenderer.on('recruit:headersUpdated', headersHandler)
    ipcRenderer.on('recruit:siteWindowReady', siteHandler)
    return () => {
      ipcRenderer.removeListener('recruit:headersUpdated', headersHandler)
      ipcRenderer.removeListener('recruit:siteWindowReady', siteHandler)
    }
  }
}

/**
 * Deep link 接力（i 人事 → ikuaizhao://sso?d=xxx → 客户端唤起 → 取出 SSO payload 完成登录）
 *
 * SPA 端使用时机：
 *   - 启动后调一次 getPendingPayload() 取冷启动 deep link payload（如果客户端是被 deep link 拉起的）
 *   - 注册 onDeepLink(callback) 监听运行中收到的 deep link 推送
 */
const handover = {
  /**
   * 取走主进程缓存的 deep link payload（消费一次即清空）
   */
  getPendingPayload: (): Promise<{
    action: string
    version: number
    payload: Record<string, unknown>
    rawUrl: string
  } | null> => ipcRenderer.invoke('handover:getPending'),

  /**
   * 监听运行中到达的 deep link
   * @returns 取消订阅函数
   */
  onDeepLink: (
    callback: (data: {
      action: string
      version: number
      payload: Record<string, unknown>
      rawUrl: string
    }) => void
  ): (() => void) => {
    const handler = (_e: unknown, data: unknown): void =>
      callback(data as Parameters<typeof callback>[0])
    ipcRenderer.on('app:deep-link', handler)
    return () => {
      ipcRenderer.removeListener('app:deep-link', handler)
    }
  }
}

/**
 * 标签管理（壳层 React 调用）
 *
 * 与主进程 TabManager 一一对应。仅壳层 UI 用得到；
 * 主页 H5 / 招聘站点本来就在自己的 WebContentsView 里，不需要 tab API。
 */
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

const tabs = {
  list: (): Promise<TabState[]> => ipcRenderer.invoke('tabs:list'),
  create: (opts: { url: string; channel?: string; title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('tabs:create', opts),
  activate: (id: string): Promise<boolean> => ipcRenderer.invoke('tabs:activate', id),
  close: (id: string): Promise<boolean> => ipcRenderer.invoke('tabs:close', id),
  reorder: (orderedIds: string[]): Promise<boolean> =>
    ipcRenderer.invoke('tabs:reorder', orderedIds),
  goBack: (id: string): Promise<void> => ipcRenderer.invoke('tabs:goBack', id),
  goForward: (id: string): Promise<void> => ipcRenderer.invoke('tabs:goForward', id),
  reload: (id: string): Promise<void> => ipcRenderer.invoke('tabs:reload', id),
  /**
   * 订阅标签状态变化（任何创建 / 激活 / 关闭 / loading / 标题变化都会广播）
   * @returns 取消订阅函数
   */
  onState: (callback: (state: TabState[]) => void): (() => void) => {
    const handler = (_e: unknown, state: TabState[]): void => callback(state)
    ipcRenderer.on('tabs:state', handler)
    return () => {
      ipcRenderer.removeListener('tabs:state', handler)
    }
  }
}

/**
 * 客户端身份标识：SPA 启动时检测 window.__IKUAIZHAO_NATIVE__ 即可知道
 * 自己跑在 Electron 客户端里（用于隐藏插件相关 UI、走客户端原生能力）
 */
const native = {
  mode: 'electron' as const,
  version: process.env.npm_package_version ?? '0.0.0',
  platform: process.platform,
  arch: process.arch
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', { recruitBridge, handover, tabs })
    contextBridge.exposeInMainWorld('__IKUAIZHAO_NATIVE__', native)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = { recruitBridge, handover, tabs }
  // @ts-ignore (define in dts)
  window.__IKUAIZHAO_NATIVE__ = native
}
