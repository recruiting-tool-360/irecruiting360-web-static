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
 * iHR 业务桥（取代 i 人事 iframe 模式下父端 React 调网关 + postMessage 推送的角色）
 *
 * 与主进程 ihrBridge.ts 的 IPC 一一对应。i 快招 SPA 在客户端模式下通过 messenger shim
 * 把原本走 postMessage 的业务调用 (resumeList / assign-position / talent-pool / ...) 转到这里。
 */
const ihrBridge = {
  getApplicationPosition: (): Promise<IhrApiResult> =>
    ipcRenderer.invoke('ihrBridge:getApplicationPosition'),

  getSharedCandidateResume: (): Promise<IhrApiResult> =>
    ipcRenderer.invoke('ihrBridge:getSharedCandidateResume'),

  sharedCandidateResumeInit: (): Promise<IhrApiResult> =>
    ipcRenderer.invoke('ihrBridge:sharedCandidateResumeInit'),

  batchGetPositionDetailByIds: (ids: string[]): Promise<IhrApiResult> =>
    ipcRenderer.invoke('ihrBridge:batchGetPositionDetailByIds', ids),

  assignPositions: (req: Record<string, unknown>): Promise<IhrApiResult> =>
    ipcRenderer.invoke('ihrBridge:assignPositions', req),

  addPools: (req: Record<string, unknown>): Promise<IhrApiResult> =>
    ipcRenderer.invoke('ihrBridge:addPools', req),

  /**
   * 简历文件上传：通过 ArrayBuffer + 元数据 IPC 序列化到主进程
   * （Blob 不能直接走 IPC，shim 端会自动调 file.arrayBuffer() 完成转换）
   */
  uploadFile: (arg: {
    arrayBuffer: ArrayBuffer
    name: string
    mime?: string
    centralUpload?: boolean
  }): Promise<IhrApiResult> => ipcRenderer.invoke('ihrBridge:uploadFile', arg),

  /**
   * 检查 i 人事 manage 系统是否已登录（看 partition 里有无 cookie）。
   * 业务侧调 addPools/assignPositions 等接口时若返回 errorCode='NOT_LOGGED_IN'，
   * 应弹引导调 openManageLoginTab 让用户登录一次。
   */
  checkManageAuth: (): Promise<{
    enabled: boolean
    hasCookies: boolean
    cookieCount: number
    manageUrl: string
  }> => ipcRenderer.invoke('ihrBridge:checkManageAuth'),

  /**
   * 在主窗口里新开 tab 加载 i 人事 manage 入口，引导用户登录。
   * 登录成功后 cookie 持久化到该 partition，之后 ihrBridge 所有调用自动带 cookie。
   */
  openManageLoginTab: (): Promise<{ ok: boolean; manageUrl: string; message?: string }> =>
    ipcRenderer.invoke('ihrBridge:openManageLoginTab')
}

interface IhrApiResult<T = unknown> {
  success: boolean
  code?: number | string
  message?: string
  data?: T
  httpStatus?: number
  errorCode?: 'NOT_LOGGED_IN' | 'NETWORK' | 'PARSE' | 'OTHER'
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
 * 浏览器 → 客户端 SPA 数据通道（probe server /__ikuaizhao/dispatch 转发）
 *
 * 用法：
 *   const off = window.api.browserBridge.on('navigate', (payload, ctx) => {
 *     console.log('from browser:', payload, 'requestId:', ctx.requestId)
 *   })
 *   // ...
 *   off()
 *
 * 关键设计：
 *   - 主进程**不解析 type/payload**，原样从 HTTP body 透传到本事件
 *   - SPA 侧自己分发：按 type 注册不同 handler；新业务加 type 时 SPA 升级即可，**客户端无需重打包**
 *   - 因为是同机 HTTP，payload 大小不再受 deep link URL 长度限制
 *   - 安全：probe server 只 listen 127.0.0.1，外网打不进；SPA 侧需自行做 type 白名单 / 权限校验
 */
/**
 * Automation：隐藏窗口抓接口
 *
 * 设计：
 *   - 调用方传 `pageUrl + partition + capture.urlIncludes`，主进程开 show:false 的窗口加载该页面
 *   - 用 CDP 监听匹配的接口，第一条命中后拿 response body 返回
 *   - 拿到/超时/失败后窗口自动销毁，**用户全程不可见**
 *
 * 典型用例：BOSS 我的职位列表
 *   await window.api.automation.captureFromHiddenView({
 *     pageUrl: 'https://www.zhipin.com/web/frame/job/list-new',
 *     partition: 'persist:ihr360-boss',  // 复用 BOSS tab 的登录态
 *     capture: { urlIncludes: '/wapi/zpjob/job/data/list' },
 *     timeoutMs: 15000,
 *   })
 *   // → { ok: true, data: { bodyJson, status, url, ... } }
 */
const automation = {
  captureFromHiddenView: (req: {
    pageUrl: string
    partition: string
    capture: {
      urlIncludes?: string
      urlPattern?: string
      method?: string
      matchFirst?: boolean
    }
    timeoutMs?: number
    userAgent?: string
    extraHeaders?: Record<string, string>
  }): Promise<{
    ok: boolean
    data?: {
      url: string
      method: string
      status: number
      bodyJson: unknown | null
      bodyText: string | null
      bodyBytes: number
      responseHeaders: Record<string, string>
      durationMs: number
    }
    error?: { code: string; message: string }
    logs?: string[]
  }> => ipcRenderer.invoke('automation:captureFromHiddenView', req),

  /**
   * 在新开的招聘站 tab 里发同源 fetch 拿接口数据（用户可见，但焦点不被切走）。
   * tab 加载完成后通过 webContents.executeJavaScript 执行 fetch，拿到结果后关闭 tab。
   */
  captureViaNewTab: (req: {
    channel: string
    pageUrl: string
    apiUrl: string
    method?: string
    headers?: Record<string, string>
    body?: string
    keepTab?: boolean
    /** 是否在 TabBar 显示这个 tab（默认 false → hidden 模式，用户无感知） */
    visible?: boolean
    navTimeoutMs?: number
    fetchTimeoutMs?: number
  }): Promise<{
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
    error?: { code: string; message: string }
    logs?: string[]
  }> => ipcRenderer.invoke('automation:captureViaNewTab', req)
}

const browserBridge = {
  on: (
    type: string,
    callback: (payload: unknown, ctx: { type: string; requestId?: string; v: 1 }) => void
  ): (() => void) => {
    const handler = (
      _e: unknown,
      data: { v: 1; type: string; payload?: unknown; requestId?: string }
    ): void => {
      if (!data || data.type !== type) return
      callback(data.payload, { type: data.type, requestId: data.requestId, v: data.v })
    }
    ipcRenderer.on('app:browser-data', handler)
    return () => {
      ipcRenderer.removeListener('app:browser-data', handler)
    }
  },
  /**
   * 监听任意 type 的兜底入口（一般业务用上面的 on(type, cb)，这个适合 logger / debug 用）
   */
  onAny: (
    callback: (data: { v: 1; type: string; payload?: unknown; requestId?: string }) => void
  ): (() => void) => {
    const handler = (
      _e: unknown,
      data: { v: 1; type: string; payload?: unknown; requestId?: string }
    ): void => callback(data)
    ipcRenderer.on('app:browser-data', handler)
    return () => {
      ipcRenderer.removeListener('app:browser-data', handler)
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
    contextBridge.exposeInMainWorld('api', {
      recruitBridge,
      handover,
      tabs,
      ihrBridge,
      browserBridge,
      automation
    })
    contextBridge.exposeInMainWorld('__IKUAIZHAO_NATIVE__', native)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = { recruitBridge, handover, tabs, ihrBridge, browserBridge, automation }
  // @ts-ignore (define in dts)
  window.__IKUAIZHAO_NATIVE__ = native
}
