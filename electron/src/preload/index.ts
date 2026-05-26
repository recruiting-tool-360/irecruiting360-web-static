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
   * 检查 i 人事 manage 系统鉴权状态：
   *   - manage partition 是否还有 cookie（兜底，仅用于非 noauth 接口）
   *   - noauth 接口的 accessToken 是否还有效
   *
   * 业务侧调 addPools/assignPositions 等 noauth 接口若返回 errorCode='NOT_LOGGED_IN'，
   * 应弹 IhrAuthModal 引导用户回到招聘工作台触发新一轮 client/launch。
   */
  checkManageAuth: (): Promise<{
    enabled: boolean
    hasCookies: boolean
    cookieCount: number
    manageUrl: string
    hasAccessToken: boolean
    accessTokenExpired: boolean
    accessTokenRemainMs: number
  }> => ipcRenderer.invoke('ihrBridge:checkManageAuth'),

  /**
   * 单独查询 accessToken 状态。
   * 用于 SPA 启动后预检 / Devtools 调试。
   */
  getAccessTokenStatus: (): Promise<{
    hasToken: boolean
    expireAt: number
    remainMs: number
    expired: boolean
  }> => ipcRenderer.invoke('ihrBridge:getAccessTokenStatus'),

  /**
   * 引导用户登录 i 人事 manage 系统。
   *
   * @param opts.useSystemBrowser true → shell.openExternal 走系统浏览器
   *                              false / undefined → 主窗口新开 tab（cookie 写 partition）
   * @param opts.loginPath        拼到 manageUrl 后面的登录路径，默认 '/'
   *
   * ★ 老版本 preload 这里没透传 opts，导致渲染端传的 useSystemBrowser:true 永远收不到，
   *   main 进程总是按默认 false 走客户端 tab。修复：必须把 opts 转发进 ipcRenderer.invoke。
   */
  openManageLoginTab: (opts?: {
    useSystemBrowser?: boolean
    loginPath?: string
  }): Promise<{
    ok: boolean
    manageUrl: string
    message?: string
    via?: 'systemBrowser' | 'clientTab'
  }> => ipcRenderer.invoke('ihrBridge:openManageLoginTab', opts)
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
  /** 业务侧动态锁定（不可关 + X 按钮隐藏），跟 home pinned 区分。详见 main 进程 TabManager. */
  locked: boolean
}

const tabs = {
  list: (): Promise<TabState[]> => ipcRenderer.invoke('tabs:list'),
  create: (opts: { url: string; channel?: string; title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('tabs:create', opts),
  activate: (id: string): Promise<boolean> => ipcRenderer.invoke('tabs:activate', id),
  close: (id: string): Promise<boolean> => ipcRenderer.invoke('tabs:close', id),
  /**
   * 动态锁定/解锁 tab：locked=true 时 TabBar 隐藏 X 按钮 + 底层 close() 拒绝。
   * 用法：业务侧（如 BOSS 推荐自动化）开 tab 后立刻 setLocked(true)，任务完成 setLocked(false)。
   */
  setLocked: (opts: { id: string; locked: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('tabs:setLocked', opts),
  reorder: (orderedIds: string[]): Promise<boolean> =>
    ipcRenderer.invoke('tabs:reorder', orderedIds),
  goBack: (id: string): Promise<void> => ipcRenderer.invoke('tabs:goBack', id),
  goForward: (id: string): Promise<void> => ipcRenderer.invoke('tabs:goForward', id),
  reload: (id: string): Promise<void> => ipcRenderer.invoke('tabs:reload', id),
  /**
   * 强制让某个 tab loadURL 到指定 URL（绕过 openOrActivate 的 sameUrl 复用）。
   * 用于 BOSS 推荐第二次跑同 jobid 时强制 BOSS SPA 完整重启 + 重新发推荐 API。
   */
  loadUrl: (id: string, url: string): Promise<void> => ipcRenderer.invoke('tabs:loadUrl', id, url),
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
  /**
   * 在已有 tab 内执行 Playwright 脚本（docs/automation-protocol.md §4.5）。
   * scriptCode 是 async function body 字符串，沙箱内可用 page/ctx/log/sleep/jitter/AbortSignal。
   */
  runScript: (req: {
    tabId: string
    scriptCode: string
    ctx?: unknown
    timeoutMs?: number
    /** 期望 tab 已加载到的 host（如 'zhipin.com'），解决 loadURL 异步未完成的竞态 */
    expectedHost?: string
  }): Promise<{
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
      scriptCode?: string
    }
    elapsedMs: number
    logs: string[]
  }> => ipcRenderer.invoke('automation:runScript', req),

  /** 取当前激活 tab 信息（runScript 前用） */
  getActiveTab: (): Promise<{ tabId: string | null; url: string; channel: string | null }> =>
    ipcRenderer.invoke('automation:getActiveTab'),

  /** 打开或激活某个招聘站 tab（hidden=true 走隐藏模式） */
  openOrActivate: (opts: {
    channel: string
    url: string
    hidden?: boolean
  }): Promise<{ tabId: string }> => ipcRenderer.invoke('automation:openOrActivate', opts),

  /** 取消所有在跑的脚本 */
  cancelAll: (): Promise<{ cancelled: number }> => ipcRenderer.invoke('automation:cancelAll'),

  /**
   * 蒙层：聚合搜索 / 自动化期间锁住招聘站 tab，提示"客户端执行中，请勿操作"。
   *
   * 用法：
   *   await window.api.automation.showOverlay({ channelName: 'BOSS直聘' })
   *   try { ...await runBossRecommend(...)... }
   *   finally { await window.api.automation.hideOverlay() }
   *
   * 蒙层是一个独立 WebContentsView 叠在所有 tab 之上，覆盖标签栏下面整片
   * （tab 切换 / 关闭按钮还能操作）。详见 main 进程 automationOverlay.ts。
   */
  showOverlay: (payload?: {
    title?: string
    message?: string
    channelName?: string
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke('automation:showOverlay', payload ?? {}),
  hideOverlay: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('automation:hideOverlay'),
  isOverlayVisible: (): Promise<boolean> => ipcRenderer.invoke('automation:isOverlayVisible'),

  /**
   * CDP Input dispatchMouseEvent —— 在指定 tab 上模拟一次"用户点击"。
   *
   * 跟 runScript 路径完全不同：
   *   - 走 Electron 自带 `webContents.debugger`（同进程 CDP，无端口、无 WebSocket）
   *   - `Input.dispatchMouseEvent` 产生的事件 `isTrusted=true`，从 BOSS JS 视角下
   *     跟用户真实鼠标点击**完全无差别**
   *   - **不依赖** `--remote-debugging-port`，即便 ENABLE_REMOTE_DEBUG=0 也能用
   *
   * 元素定位：主进程内部 `executeJavaScript('document.querySelector(...)')`，
   * 找不到再扫所有同源 iframe。BOSS 推荐宿主 + iframe 同 zhipin.com 域，OK。
   *
   * 使用示例（在主页 SPA 中）：
   *   const opened = await window.api.automation.openOrActivate({ channel:'boss', url:'.../recommend?jobid=...' })
   *   await new Promise(r => setTimeout(r, 3000))    // 给 BOSS 自己加载完
   *   const r = await window.api.automation.clickOnTab({ tabId: opened.tabId, selector: '.filter-wrap' })
   *   if (r.ok) console.log('clicked at', r.data.x, r.data.y, 'in', r.data.foundIn)
   */
  clickOnTab: (opts: {
    tabId: string
    selector: string
    /** 鼠标按下到释放的间隔（ms），默认 50（模拟真实人类点击节奏） */
    pressHoldMs?: number
    /** 默认 true：元素必须在 viewport 内才点 */
    requireVisible?: boolean
  }): Promise<{
    ok: boolean
    data?: {
      x: number
      y: number
      width: number
      height: number
      foundIn: string
      elapsedMs: number
    }
    error?: { code: string; message: string }
    logs: string[]
  }> => ipcRenderer.invoke('automation:clickOnTab', opts),

  /**
   * 在指定 tab 的 page 上下文执行任意 JS（safe primitive，零风控风险）。
   *
   * 走 Electron 内置 `webContents.executeJavaScript`，**不连 CDP / debugger**，
   * 不会暴露 navigator.webdriver / DevTools attach 痕迹。
   *
   * 用途：
   *   - 拟人化滚动 / 滚到目标位置（scroll 事件 isTrusted=true，BOSS lazy load 会响应）
   *   - 读 DOM 数据（querySelector / getBoundingClientRect 等）
   *   - 等元素出现（MutationObserver / 轮询）
   *   - 注入引导浮层（独立 DOM，不污染原页面 state）
   *
   * ⚠️ **不要**用本 API 做 `el.click()` / `dispatchEvent(new MouseEvent(...))` ——
   * 这类合成事件 `isTrusted=false`，BOSS 一行 JS 就能识破。点击必须走 clickOnTab（CDP）。
   *
   * 参数：
   *   - code: JS 表达式字符串。返回值会被 returnByValue 序列化传回。
   *   - awaitPromise: 如果 code 是 IIFE async function（返回 Promise），
   *                   设 true 让本调用 await 它再 resolve。
   */
  evalOnTab: (opts: {
    tabId: string
    code: string
    awaitPromise?: boolean
  }): Promise<{
    ok: boolean
    result?: unknown
    error?: { code: string; message: string }
  }> => ipcRenderer.invoke('automation:evalOnTab', opts),

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
 * siteNetwork：长驻 CDP 抓包查询接口（与 TabManager 配合）
 *
 * 招聘站 tab 一打开就被 main 进程 `webContents.debugger.attach` 监听，
 * 命中 SITE_CAPTURE_MATCHERS 的响应进环形缓冲。本对象提供查询能力，
 * 业务侧用它替代 Playwright `page.waitForResponse` 路径，零反爬指纹。
 *
 * 用法（取 BOSS 推荐首屏）：
 *   const tsBefore = Date.now()
 *   await window.api.automation.openOrActivate({ channel: 'boss', url: '.../recommend?jobid=...' })
 *   const r = await window.api.siteNetwork.waitForResponse({
 *     siteKey: 'boss',
 *     urlPattern: '/wapi/zpjob/rec/geek/list',
 *     timeoutMs: 10000,
 *     sinceTs: tsBefore,  // 只接受 tab 打开之后的响应
 *   })
 *   if (r.ok) { const body = r.data.bodyJson }
 */
const siteNetwork = {
  /**
   * 等下一条匹配的响应。先扫缓存命中即返回；没命中挂等到 timeoutMs。
   */
  waitForResponse: (opts: {
    siteKey: string
    urlPattern: string
    timeoutMs?: number
    /** 仅接受 receivedAt > sinceTs 的响应（一般传 tab 打开前的 Date.now()） */
    sinceTs?: number
  }): Promise<
    | {
        ok: true
        data: {
          receivedAt: number
          url: string
          method: string
          status: number
          bodyJson: unknown | null
          bodyText: string | null
          bodyBytes: number
        }
      }
    | { ok: false; code: string; message: string }
  > => ipcRenderer.invoke('siteNetwork:waitForResponse', opts),

  /** 立刻取桶里最新一条匹配的响应（不等） */
  getLatest: (opts: {
    siteKey: string
    urlPattern: string
  }): Promise<
    | {
        ok: true
        data: {
          receivedAt: number
          url: string
          method: string
          status: number
          bodyJson: unknown | null
          bodyText: string | null
          bodyBytes: number
        }
      }
    | { ok: false; code: string; message: string }
  > => ipcRenderer.invoke('siteNetwork:getLatest', opts),

  /** 清空某个 siteKey 的缓存（"加载下一页前清掉旧响应"用） */
  clearCache: (siteKey: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('siteNetwork:clearCache', siteKey),

  /** 调试：列出当前缓存里所有响应 */
  listCache: (
    siteKey: string
  ): Promise<Array<{ url: string; receivedAt: number; status: number; bodyBytes: number }>> =>
    ipcRenderer.invoke('siteNetwork:listCache', siteKey)
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

/**
 * 自动更新 bridge
 *
 * Main 进程在 setupAutoUpdater 已自动定期检查并弹 dialog 询问；
 * 这里只暴露给渲染层"按钮主动触发" + "订阅进度事件"的能力，比如：
 *   - 设置弹框里的「检查更新」按钮：await window.api.appUpdater.check()
 *   - 显示下载进度条：window.api.appUpdater.onProgress(({percent}) => {...})
 *
 * 不传 mainWindow 参数；main 进程内已保存 mainWindow 引用做事件 send / dialog parent。
 */
const appUpdater = {
  /** 立即检查更新（不下载）。返回 { ok, version, available } 或 { ok:false, message } */
  check: (): Promise<{ ok: boolean; version?: string; available?: boolean; message?: string }> =>
    ipcRenderer.invoke('autoUpdater:check'),
  /** 主动触发下载（autoDownload=false 时手动调）。返回 { ok } 或 { ok:false, message } */
  download: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('autoUpdater:download'),
  /** 立刻退出 + 安装（适用于已 update-downloaded 状态） */
  quitAndInstall: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('autoUpdater:quitAndInstall'),
  /** 订阅事件：返回 unsubscribe 函数。事件名：checking / available / not-available / progress / downloaded / error */
  on: (
    event: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error',
    cb: (payload: unknown) => void
  ): (() => void) => {
    const channel = `autoUpdater:${event}`
    const handler = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
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
      automation,
      siteNetwork,
      appUpdater
    })
    contextBridge.exposeInMainWorld('__IKUAIZHAO_NATIVE__', native)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = { recruitBridge, handover, tabs, ihrBridge, browserBridge, automation, appUpdater }
  // @ts-ignore (define in dts)
  window.__IKUAIZHAO_NATIVE__ = native
}
