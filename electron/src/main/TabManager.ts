/**
 * 标签管理器（Chrome 风格多标签）
 *
 * 设计要点：
 *   - 主窗口的 webContents 仅渲染"壳层"（自绘标题栏 + 标签栏），永不导航。
 *   - 每个标签是一个 WebContentsView，挂在 mainWindow.contentView 下。
 *     激活的 view 占满 chrome 之下的内容区；未激活的 setBounds(0,0,0,0) 隐藏。
 *   - 主页 tab pinned 不可关，channel='home'，使用主 partition + 完整 preload。
 *   - 招聘站点 tab 各自一个 partition（与原 SiteWindowManager 一致），preload 为空。
 *
 * 与 SPA 的契约（IPC）：
 *   tabs:list      → 取当前标签列表（含激活态）
 *   tabs:create    → { url, channel?, title? } → 新建并激活
 *   tabs:activate  → tabId
 *   tabs:close     → tabId（home tab 强拒）
 *   tabs:reorder   → orderedIds[]（home tab 强制保持首位）
 *   tabs:state     → 主进程→渲染端，全量推送 TabState[] 任何变化都推
 */

import { BrowserWindow, WebContentsView, session, shell } from 'electron'

// =============== 类型 ===============

export interface TabState {
  id: string
  pinned: boolean
  channel?: string // 'home' | 'boss' | 'zhilian' | 'liepin' | 'job51' | 其他
  title: string
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  active: boolean
}

interface InternalTab {
  id: string
  pinned: boolean
  channel?: string
  title: string
  view: WebContentsView
}

// =============== 配置 ===============

/**
 * 招聘站点 partition（与 ViewManager 保持一致；recruitBridge.ts 直接 import 这个常量更稳，
 * 这里复制一份只是为了解耦循环依赖）
 */
export const SITE_PARTITION: Record<string, string> = {
  boss: 'persist:ihr360-boss',
  zhilian: 'persist:ihr360-zhilian',
  liepin: 'persist:ihr360-liepin',
  job51: 'persist:ihr360-job51'
}

const SITE_TITLE: Record<string, string> = {
  boss: 'BOSS 直聘',
  zhilian: '智联招聘',
  liepin: '猎聘',
  job51: '前程无忧'
}

const HOME_TITLE = 'i快招'

/**
 * 桌面 Chrome UA（与 ViewManager 一致）
 */
const desktopChromeUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

/** 壳层（标题栏 + 标签栏）总高度，决定内容 view 的 y 偏移 */
const CHROME_HEIGHT = 40

// =============== TabManager ===============

class TabManager {
  private mainWindow: BrowserWindow | undefined
  private tabs = new Map<string, InternalTab>()
  /** 标签顺序（home 永远在 [0]） */
  private order: string[] = []
  private activeId: string | null = null
  /** home tab id（永远存在，且 pinned，不可关） */
  private homeTabId: string | null = null
  private nextSeq = 1

  // ----- 生命周期 -----

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
    win.on('resize', () => this.updateBounds())
    win.on('enter-full-screen', () => this.updateBounds())
    win.on('leave-full-screen', () => this.updateBounds())
  }

  isReady(): boolean {
    return Boolean(this.mainWindow && !this.mainWindow.isDestroyed())
  }

  // ----- 创建：home tab -----

  /**
   * 创建主页 tab（pinned，第一个，channel='home'）。
   * 应用启动时调用一次。
   */
  createHomeTab(opts: { url: string; preloadPath: string }): string {
    if (this.homeTabId) return this.homeTabId
    if (!this.mainWindow) throw new Error('TabManager: mainWindow not set')

    const homeSession = session.fromPartition('persist:ihr360-main')
    const view = new WebContentsView({
      webPreferences: {
        preload: opts.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        session: homeSession
      }
    })

    const id = 'home'
    const tab: InternalTab = {
      id,
      pinned: true,
      channel: 'home',
      title: HOME_TITLE,
      view
    }
    this.attachViewListeners(tab)
    this.attachWindowOpenHandler(tab)

    this.mainWindow.contentView.addChildView(view)
    this.tabs.set(id, tab)
    this.order.push(id)
    this.homeTabId = id

    void view.webContents.loadURL(opts.url)

    this.activate(id)
    return id
  }

  // ----- 创建：招聘站点 tab（紧挨当前 active 右侧） -----

  /**
   * 打开或激活某 channel 的招聘站点 tab。
   * - 已存在该 channel tab → 激活并按需 navigate
   * - 不存在 → 新建并激活，插入到 currentActive 之后
   */
  openOrActivateSiteTab(channel: string, url: string): string {
    if (!this.mainWindow) throw new Error('TabManager: mainWindow not set')
    const key = (channel || '').toLowerCase()
    const partition = SITE_PARTITION[key] ?? `persist:ihr360-site-${key}`
    const title = SITE_TITLE[key] ?? (channel || '新标签')

    // 已存在同 channel 的 tab → 激活
    for (const tab of this.tabs.values()) {
      if (tab.channel === key) {
        const currentUrl = tab.view.webContents.getURL()
        if (currentUrl !== url && url) {
          void tab.view.webContents.loadURL(url)
        }
        this.activate(tab.id)
        return tab.id
      }
    }

    const siteSession = session.fromPartition(partition)
    const view = new WebContentsView({
      webPreferences: {
        // 招聘站点不需要 client API，preload 留空
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: siteSession
      }
    })
    view.webContents.setUserAgent(desktopChromeUserAgent)

    const id = `tab-${this.nextSeq++}`
    const tab: InternalTab = {
      id,
      pinned: false,
      channel: key,
      title,
      view
    }
    this.attachViewListeners(tab)
    this.attachSiteWindowOpenHandler(tab)
    this.attachSiteDebugListeners(tab)

    this.mainWindow.contentView.addChildView(view)
    this.tabs.set(id, tab)

    // 紧挨当前 active 右侧插入（决策 E.b）
    const insertAfter = this.activeId ? this.order.indexOf(this.activeId) : -1
    if (insertAfter >= 0) {
      this.order.splice(insertAfter + 1, 0, id)
    } else {
      this.order.push(id)
    }

    void view.webContents.loadURL(url)
    this.activate(id)
    return id
  }

  // ----- 激活 / 关闭 / 重排 -----

  activate(id: string): void {
    if (!this.tabs.has(id)) return
    this.activeId = id
    this.updateBounds()
    this.broadcastState()
  }

  /**
   * 关闭 tab。home tab 强拒。
   * 关闭后切到相邻（优先右侧，无则左侧）。
   */
  close(id: string): boolean {
    const tab = this.tabs.get(id)
    if (!tab) return false
    if (tab.pinned) return false // home 不可关

    const idx = this.order.indexOf(id)
    if (idx < 0) return false

    // 计算下一个激活的 tab：右侧 > 左侧 > home
    let nextActive: string | null = null
    if (this.activeId === id) {
      nextActive = this.order[idx + 1] ?? this.order[idx - 1] ?? this.homeTabId
    } else {
      nextActive = this.activeId
    }

    if (this.mainWindow) {
      this.mainWindow.contentView.removeChildView(tab.view)
    }
    try {
      // 兼容 Electron 30+：webContents.close() / view 自身没有 close()
      // 通过 destroy webContents 来释放资源
      ;(tab.view.webContents as unknown as { close?: () => void }).close?.()
    } catch {
      /* noop */
    }
    this.tabs.delete(id)
    this.order.splice(idx, 1)

    if (nextActive && this.tabs.has(nextActive)) {
      this.activate(nextActive)
    } else if (this.homeTabId) {
      this.activate(this.homeTabId)
    } else {
      this.activeId = null
      this.updateBounds()
      this.broadcastState()
    }
    return true
  }

  /**
   * 重排标签顺序。home tab 强制保持首位。
   */
  reorder(orderedIds: string[]): void {
    const filtered = orderedIds.filter((id) => this.tabs.has(id) && id !== this.homeTabId)
    if (this.homeTabId) {
      this.order = [this.homeTabId, ...filtered]
    } else {
      this.order = filtered
    }
    this.broadcastState()
  }

  navigate(id: string, url: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    void tab.view.webContents.loadURL(url)
  }

  goBack(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    const wc = tab.view.webContents as unknown as {
      navigationHistory?: { goBack: () => void }
      goBack?: () => void
    }
    if (wc.navigationHistory) wc.navigationHistory.goBack()
    else if (wc.goBack) wc.goBack()
  }

  goForward(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    const wc = tab.view.webContents as unknown as {
      navigationHistory?: { goForward: () => void }
      goForward?: () => void
    }
    if (wc.navigationHistory) wc.navigationHistory.goForward()
    else if (wc.goForward) wc.goForward()
  }

  reload(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.view.webContents.reload()
  }

  // ----- 查询 -----

  getHomeTabId(): string | null {
    return this.homeTabId
  }

  getActiveTabId(): string | null {
    return this.activeId
  }

  getHomeWebContents(): Electron.WebContents | null {
    if (!this.homeTabId) return null
    const tab = this.tabs.get(this.homeTabId)
    return tab?.view.webContents ?? null
  }

  /**
   * 给定 channel 找到对应的招聘站 tab webContents（如果有）。
   * 用于 universalRequest 在站点 tab 内 executeJavaScript 发 fetch（替代原 siteWindowManager.getWindow）。
   */
  getSiteWebContentsForChannel(channel: string): Electron.WebContents | null {
    const key = (channel || '').toLowerCase()
    for (const tab of this.tabs.values()) {
      if (tab.channel === key && !tab.view.webContents.isDestroyed()) {
        return tab.view.webContents
      }
    }
    return null
  }

  getTabs(): TabState[] {
    return this.order.map((id) => this.toState(id)).filter((x): x is TabState => x !== null)
  }

  // ----- 内部：bounds / state ----

  private updateBounds(): void {
    if (!this.mainWindow) return
    const bounds = this.mainWindow.getContentBounds()
    for (const [id, tab] of this.tabs) {
      if (id === this.activeId) {
        tab.view.setBounds({
          x: 0,
          y: CHROME_HEIGHT,
          width: bounds.width,
          height: Math.max(0, bounds.height - CHROME_HEIGHT)
        })
      } else {
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
  }

  private toState(id: string): TabState | null {
    const tab = this.tabs.get(id)
    if (!tab) return null
    const wc = tab.view.webContents as unknown as {
      isLoading: () => boolean
      navigationHistory?: { canGoBack: () => boolean; canGoForward: () => boolean }
      canGoBack?: () => boolean
      canGoForward?: () => boolean
      getURL: () => string
    }
    const canBack = wc.navigationHistory
      ? wc.navigationHistory.canGoBack()
      : (wc.canGoBack?.() ?? false)
    const canFwd = wc.navigationHistory
      ? wc.navigationHistory.canGoForward()
      : (wc.canGoForward?.() ?? false)
    return {
      id: tab.id,
      pinned: tab.pinned,
      channel: tab.channel,
      title: tab.title,
      url: wc.getURL(),
      loading: wc.isLoading(),
      canGoBack: canBack,
      canGoForward: canFwd,
      active: this.activeId === id
    }
  }

  private broadcastState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('tabs:state', this.getTabs())
  }

  // ----- 内部：listeners -----

  /**
   * 监听标签自身的状态变化（标题 / loading / 导航），任何变化都广播。
   */
  private attachViewListeners(tab: InternalTab): void {
    const wc = tab.view.webContents
    const onChange = (): void => this.broadcastState()
    wc.on('page-title-updated', (_e, title) => {
      // 主页 tab 锁定标题（决策 D.a：写死"i快招"）
      if (!tab.pinned) tab.title = title
      this.broadcastState()
    })
    wc.on('page-favicon-updated', onChange)
    wc.on('did-start-loading', onChange)
    wc.on('did-stop-loading', onChange)
    wc.on('did-navigate', onChange)
    wc.on('did-navigate-in-page', onChange)
    wc.on('did-finish-load', onChange)
    // crash / unresponsive 暂不处理
  }

  /**
   * 主页 tab 的 setWindowOpenHandler：
   * 招聘域 → 新标签；其他 → 系统浏览器。
   */
  private attachWindowOpenHandler(tab: InternalTab): void {
    tab.view.webContents.setWindowOpenHandler(({ url }) => {
      const channel = pickChannelForUrl(url)
      if (channel) {
        this.openOrActivateSiteTab(channel, url)
      } else {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })
  }

  /**
   * 招聘站点 tab 的 setWindowOpenHandler：
   * 站点内的 target=_blank 直接在当前 tab 内导航（与原 ViewManager 行为一致）。
   * 跨站招聘域 → 新标签；其他外链 → 系统浏览器。
   */
  private attachSiteWindowOpenHandler(tab: InternalTab): void {
    tab.view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
      if (!newUrl) return { action: 'deny' }
      const targetChannel = pickChannelForUrl(newUrl)
      if (targetChannel && targetChannel !== tab.channel) {
        this.openOrActivateSiteTab(targetChannel, newUrl)
        return { action: 'deny' }
      }
      // 同站新窗口 → 在当前 tab 内 navigate
      const currentChannel = tab.channel
      const isSameSite = currentChannel ? targetChannel === currentChannel : false
      if (isSameSite || !targetChannel) {
        void tab.view.webContents.loadURL(newUrl)
      } else {
        void shell.openExternal(newUrl)
      }
      return { action: 'deny' }
    })
  }

  private attachSiteDebugListeners(tab: InternalTab): void {
    const key = tab.channel ?? tab.id
    tab.view.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
      console.warn(`[siteTab:${key}] did-fail-load`, code, desc, failedUrl)
    })
  }

  // ----- 销毁 -----

  destroyAll(): void {
    for (const tab of this.tabs.values()) {
      try {
        ;(tab.view.webContents as unknown as { close?: () => void }).close?.()
      } catch {
        /* noop */
      }
    }
    this.tabs.clear()
    this.order = []
    this.activeId = null
    this.homeTabId = null
  }
}

// =============== URL → channel 路由（与 recruitBridge.pickChannelForUrl 等价） ===============

/**
 * 注：和 recruitBridge.ts 里的同名函数功能一致。
 * 单独再放一份是为了让 TabManager 不强依赖 recruitBridge（避免循环依赖）。
 */
export function pickChannelForUrl(url: string): string | null {
  if (typeof url !== 'string' || !url) return null
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host.endsWith('zhipin.com')) return 'boss'
  if (host.endsWith('zhaopin.com')) return 'zhilian'
  if (host.endsWith('liepin.com')) return 'liepin'
  if (host.endsWith('51job.com')) return 'job51'
  return null
}

export const tabManager = new TabManager()
