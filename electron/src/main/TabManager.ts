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

import { ensureAttached as ensureSiteNetworkAttached } from './siteNetworkCapture'
import { setActiveChannel as setOverlayActiveChannel } from './automationOverlay'

// =============== 类型 ===============

export type TabRole = 'home' | 'boss-main' | 'boss-detail' | 'site'

export interface TabState {
  id: string
  pinned: boolean
  role: TabRole
  /** 永久关闭能力；与任务期间动态 locked 分开。 */
  closable: boolean
  channel?: string // 'home' | 'boss' | 'zhilian' | 'liepin' | 'job51' | 其他
  title: string
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  active: boolean
  /**
   * 是否锁定（不可关）。跟 pinned 区别：
   *   - pinned：i快招/BOSS 主签固定在左侧并禁用拖拽；永久关闭能力由 closable 决定
   *   - locked：业务侧动态控制（比如 BOSS 推荐任务跑中），tab 还能拖能切但 X 按钮不显示，
   *     底层 close() 也会拒绝
   * 业务完成后调 setLocked(id, false) 解锁，用户就能正常关了。
   */
  locked: boolean
}

interface InternalTab {
  id: string
  pinned: boolean
  role: TabRole
  closable: boolean
  channel?: string
  title: string
  view: WebContentsView
  /**
   * 隐藏 tab：tab 仍然有 webContents / view（可以 loadURL / executeJavaScript），
   * 但不会出现在 TabBar UI 上，也不会被自动 activate。
   * 用于 tabFetcher 这类静默抓取场景（用户视觉无感）。
   */
  hidden?: boolean
  /** 见 TabState.locked 注释；业务侧通过 setLocked 控制 */
  locked?: boolean
}

// =============== 配置 ===============

/**
 * 招聘站点 partition（与 ViewManager 保持一致；recruitBridge.ts 直接 import 这个常量更稳，
 * 这里复制一份只是为了解耦循环依赖）
 */
/**
 * 招聘站 tab 创建后自动开启 CDP 网络抓包（webContents.debugger.attach），
 * 把这里 substring 匹配到的 URL 响应缓存到 siteNetworkCapture 里。
 * 渲染端通过 `window.api.siteNetwork.waitForResponse(...)` 取数据，
 * **替代** Playwright `page.waitForResponse` 路径（旧路径依赖 --remote-debugging-port
 * 会被 BOSS 风控识别，详见 docs/boss地址资料.md 顶部反爬警告）。
 *
 * 加新接口：往对应站 key 数组里追加 URL substring 即可；保持小而精，不要乱加大流量接口。
 */
export const SITE_CAPTURE_MATCHERS: Record<string, string[]> = {
  boss: [
    '/wapi/zpjob/rec/geek/list', // 推荐牛人列表（首屏 + 分页）
    '/wapi/zpjob/job/data/list' // 我的职位列表（hiddenViewRunner 之外的备份路径）
  ],
  zhilian: [],
  job51: [],
  liepin: []
}

export const SITE_PARTITION: Record<string, string> = {
  boss: 'persist:ihr360-boss',
  zhilian: 'persist:ihr360-zhilian',
  liepin: 'persist:ihr360-liepin',
  job51: 'persist:ihr360-job51',
  // i 人事 manage 系统：不是招聘渠道，但同样需要 partition + cookie 持久化
  // 与 ihrBridge.ts 的 IHR_MANAGE_PARTITION 必须一致
  'ihr-manage': 'persist:ihr360-ihr-manage'
}

const SITE_TITLE: Record<string, string> = {
  boss: 'BOSS 直聘',
  zhilian: '智联招聘',
  liepin: '猎聘',
  job51: '前程无忧',
  'ihr-manage': 'i 人事工作台'
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
  /**
   * 「后台渲染」tab id：以真实尺寸渲染但**被 active 视图遮挡**的 tab。
   *
   * 用途：BOSS 推荐自动化需要 tab 真实渲染（CDP 选职位点击 + 滚动懒加载都依赖布局），
   * 但产品要求"开任务时打开 tab 但用户继续停在主页，不切过去"。
   * 后台渲染 tab 在 tab 栏可见（用户可手动点进去看），active 仍是 home（视觉停在主页）。
   * 配合 webPreferences.backgroundThrottling=false 让被遮挡的视图仍响应 CDP / 定时器。
   */
  private bgRenderId: string | null = null

  /**
   * 「是否存在可见 BOSS tab」变化的监听器（bossLoginWatcher 用）。
   *
   * BOSS 同账号只允许一个活跃会话上下文：登录 / 推荐牛人等会打开可见 BOSS tab 时，
   * 常驻登录监视的隐藏窗口必须关掉；可见 BOSS tab 都关了再把隐藏窗口建回来继续监听。
   * 这里只统计**可见**（非 hidden）BOSS tab —— tabFetcher 的瞬时 hidden 抓取 tab 不算。
   */
  private bossTabPresenceListener: ((hasVisibleBoss: boolean) => void) | null = null
  private lastBossTabPresent = false

  /**
   * ★ BOSS 主业务 webContents（单例 tab）。
   *
   * BOSS 同账号只允许一个会话上下文：登录 / 推荐牛人 / 常驻登录监视都复用这同一个 tab（webContents）。
   *   - 默认隐藏（不在 TabBar 显示），加载「职位管理」页做登录态监视；
   *   - 登录 / 推荐牛人时把它切成可见（不新开 tab）；
   *   - 主签固定在标签栏且永久不可关闭；候选人详情使用独立、可关闭的 boss-detail tab；
   *   - BOSS 渠道被禁用 → destroyBossTab() 真正销毁。
   *
   * 注意：tabFetcher 的瞬时 hidden 抓取 tab 不走单例（它要导航到 list-new 抓数据，会干扰监视 URL），
   * 仍是独立的临时隐藏 tab。
   */
  private bossTabId: string | null = null

  /** BOSS 单例 tab 的 URL 变化监听（bossLoginWatcher 用来判登录态） */
  private bossUrlListener: ((url: string) => void) | null = null

  /**
   * ★ 隐藏视图聚焦守卫（修复"后台监视 tab reload 时整个客户端窗口被弹到最前抢焦点"）。
   *
   * 现象：BOSS 常驻登录监视是个**隐藏**的 WebContentsView，每 3 分钟 reload 一次职位管理页。
   *   reload 后 BOSS 页面里的 autofocus 输入框 / 页面 `focus()` 会让这个隐藏子视图获得焦点，
   *   在 macOS 上**激活整个 app** → 客户端窗口跳到最前，打断用户在其它程序里的操作；
   *   随后 mainWindow 'focus' 又触发 LeftMenu 刷新职位（日志里的 ihrBridge 拉职位即此）。
   *
   * 对策：我们**主动**触发隐藏 tab 加载（spawnSiteTab hidden / reloadBossMonitor）前，
   *   记一个守卫窗口 + 加载前 app 是否本就在前台。若加载前 app 在后台、而守卫窗口内窗口被
   *   "顶"到前台（只可能是这个隐藏加载导致 —— 用户不可能去点 0×0 隐藏视图），则立即 blur
   *   把焦点还回用户原来的程序。加载前 app 本就在前台（用户正在用）→ 不动，保证正常交互。
   */
  private hiddenLoadGuardUntil = 0
  private hiddenLoadAppWasActive = false

  /** BOSS 登录态监视的默认页（职位管理 shell 页） */
  private static readonly BOSS_MONITOR_URL = 'https://www.zhipin.com/web/chat/job/list'

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
      role: 'home',
      closable: false,
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
   * 打开招聘站点 tab：
   *   • 已有 tab 的 URL 与目标 URL 完全相同 → 激活该 tab（不重复开）
   *   • 否则新建一个 tab（即使同 channel 已有其它 tab 也新开）
   *
   * 设计原因：用户体验上"点链接"就应该是"新窗口"，跟浏览器一致；
   * 之前按 channel 唯一会把现有 tab 内容覆盖掉，丢失浏览历史，体验差。
   * 完全相同 URL 复用，避免用户重复点击产生大量重复 tab。
   */
  openOrActivateSiteTab(
    channel: string,
    url: string,
    opts?: { hidden?: boolean; background?: boolean; bossMode?: 'main' | 'detail' }
  ): string {
    if (!this.mainWindow) throw new Error('TabManager: mainWindow not set')
    const key = (channel || '').toLowerCase()
    const isHidden = !!opts?.hidden
    // background：tab 在 tab 栏可见 + 真实渲染（自动化能跑），但**不抢焦点**，active 仍停在 home
    const isBackground = !!opts?.background && !isHidden

    // 0) ★ BOSS 分流：主业务页复用固定单例；候选人详情使用普通可关闭 tab。
    // 调用方可显式指定 bossMode；未指定时按详情 URL 兜底识别。
    const bossMode =
      key === 'boss' ? (opts?.bossMode ?? (isBossDetailUrl(url) ? 'detail' : 'main')) : undefined
    if (key === 'boss' && !isHidden && bossMode === 'main') {
      return this.openBossSingleton(url, isBackground ? 'background' : 'active')
    }

    // 1) 已有 tab 的 URL 完全相同 → 复用，不新开
    //    hidden 模式不复用现有可见 tab（否则会把用户当前正在浏览的 tab 偷偷变成隐藏 tab）
    if (url && !isHidden) {
      let reused = false
      for (const tab of this.tabs.values()) {
        if (tab.pinned) continue // 跳过 home tab（home 永远不是招聘站点）
        if (tab.hidden) continue // 隐藏 tab 不参与"同 URL 复用"
        if (bossMode === 'detail' && tab.role !== 'boss-detail') continue
        const currentUrl = tab.view.webContents.getURL()
        if (currentUrl && sameUrl(currentUrl, url)) {
          console.log(
            `[TabManager] openOrActivateSiteTab REUSE tab=${tab.id} channel=${key}` +
              ` | currentUrl=${currentUrl}` +
              ` | requestedUrl=${url} | background=${isBackground}`
          )
          if (isBackground) {
            // 后台复用：标记后台渲染 + 不切焦点（active 保持 home）
            this.bgRenderId = tab.id
            this.updateBounds()
            this.bringActiveToFront()
            this.broadcastState()
          } else {
            this.activate(tab.id)
          }
          reused = true
          return tab.id
        }
      }
      if (!reused) {
        // 没复用 → 列一下当前所有同 channel 可见 tab 的 URL，方便排查"为啥又新开了一个"
        const candidates: string[] = []
        for (const tab of this.tabs.values()) {
          if (tab.pinned || tab.hidden) continue
          if (tab.channel !== key) continue
          candidates.push(`${tab.id}=${tab.view.webContents.getURL()}`)
        }
        console.log(
          `[TabManager] openOrActivateSiteTab NEW channel=${key} url=${url}` +
            ` | 既有 ${key} tabs (URL 不匹配)=[${candidates.join(', ') || 'none'}]`
        )
      }
    }
    // 2) URL 不同 → 新开 tab（即使同 channel 已经有其它 tab）
    return this.spawnSiteTab(key, url, {
      hidden: isHidden,
      background: isBackground,
      role: bossMode === 'detail' ? 'boss-detail' : 'site'
    })
  }

  /**
   * 新建一个招聘站点 tab（WebContentsView）。openOrActivateSiteTab 的"新开"分支 +
   * BOSS 单例首建都复用本方法。返回 tabId。
   */
  private spawnSiteTab(
    key: string,
    url: string,
    opts: { hidden: boolean; background: boolean; role?: TabRole }
  ): string {
    // 同时挡住「未设置」和「已销毁」两种情况（后者来自退出/关窗后仍触发的定时器）
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('TabManager: mainWindow not available (null or destroyed)')
    }
    const partition = SITE_PARTITION[key] ?? `persist:ihr360-site-${key}`
    const title = SITE_TITLE[key] ?? key
    const isHidden = opts.hidden
    const isBackground = opts.background && !isHidden
    const role = opts.role ?? 'site'

    const siteSession = session.fromPartition(partition)
    const view = new WebContentsView({
      webPreferences: {
        // 招聘站点不需要 client API，preload 留空
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: siteSession,
        // ★ 关掉后台节流：background 模式下 tab 被 home 遮挡（occluded），
        //   默认 Chromium 会 throttle 定时器 / 暂停渲染 → CDP 选职位点击坐标失效、
        //   滚动懒加载不触发。关掉后被遮挡的 BOSS 推荐 tab 仍能正常跑自动化。
        backgroundThrottling: false
      }
    })
    view.webContents.setUserAgent(desktopChromeUserAgent)

    // 启用 CDP 网络抓包（替代 Playwright waitForResponse 路径）。
    // 必须在 loadURL 之前 attach，否则错过早期请求。
    const captureMatchers = SITE_CAPTURE_MATCHERS[key]
    if (captureMatchers && captureMatchers.length > 0) {
      const r = ensureSiteNetworkAttached(view.webContents, key, captureMatchers)
      if (!r.ok) {
        console.warn(
          `[TabManager] siteNetworkCapture attach failed for ${key}: ${r.reason ?? 'unknown'} — \`window.api.siteNetwork.waitForResponse\` will return NOT_ATTACHED`
        )
      }
    }

    const id = `tab-${this.nextSeq++}`
    const tab: InternalTab = {
      id,
      // BOSS 主签跟 i快招一样固定在左侧；详情签仍在可滚动区域并允许关闭。
      pinned: role === 'boss-main',
      role,
      closable: role !== 'boss-main',
      channel: key,
      title,
      view,
      hidden: isHidden
    }
    this.attachViewListeners(tab)
    this.attachSiteWindowOpenHandler(tab)
    this.attachSiteDebugListeners(tab)

    this.mainWindow.contentView.addChildView(view)
    this.tabs.set(id, tab)

    // 紧挨当前 active 右侧插入（决策 E.b）；hidden tab 仍加进 order（统一管理 / close），
    // 只是 getTabs() 会过滤它，所以 TabBar 上看不到。
    const insertAfter = this.activeId ? this.order.indexOf(this.activeId) : -1
    if (insertAfter >= 0) {
      this.order.splice(insertAfter + 1, 0, id)
    } else {
      this.order.push(id)
    }

    // 隐藏 tab 加载：开启聚焦守卫（reload 后页面可能 autofocus 把隐藏视图 + 整个 app 顶到前台）
    if (isHidden) this.markHiddenLoadStart()
    void view.webContents.loadURL(url)
    if (isHidden) {
      // hidden tab：不 activate（保持原 active 不变），不显式 broadcast（getTabs 会过滤掉它）
      // 仅 updateBounds 一次，确保 hidden view 的尺寸保持 0x0 不占主窗口
      this.updateBounds()
    } else if (isBackground) {
      // ★ background tab：tab 栏可见 + 真实尺寸渲染（自动化能跑），但 active 仍是 home
      //   → 用户视觉停在主页，不被切到 BOSS 推荐页
      this.bgRenderId = id
      this.updateBounds() // 给 bg tab 真实 bounds（更新后的 updateBounds 会处理）
      this.bringActiveToFront() // 把 active(home) 视图重新置顶，遮住后台渲染的 bg tab
      this.broadcastState() // tab 栏出现新 tab，但 activeId 仍是 home
    } else {
      this.activate(id)
    }
    return id
  }

  // =============== BOSS 单例 tab ===============

  /**
   * 打开/复用 BOSS 单例 tab（登录 active / 推荐牛人 background）。
   * 有单例就导航 + 切可见；没有就新建并记为单例。
   */
  private openBossSingleton(url: string, mode: 'active' | 'background'): string {
    const existing = this.bossTabId ? this.tabs.get(this.bossTabId) : null
    if (existing && !existing.view.webContents.isDestroyed()) {
      if (url) void existing.view.webContents.loadURL(url)
      this.setBossTabVisibility(mode)
      console.log(`[TabManager] BOSS 单例复用 tab=${this.bossTabId} mode=${mode} url=${url}`)
      return this.bossTabId as string
    }
    // 新建单例
    const id = this.spawnSiteTab('boss', url, {
      hidden: false,
      background: mode === 'background',
      role: 'boss-main'
    })
    this.bossTabId = id
    console.log(`[TabManager] BOSS 单例新建 tab=${id} mode=${mode} url=${url}`)
    return id
  }

  /**
   * 确保 BOSS 监视用单例 tab 存在（隐藏 + 加载职位管理页）。bossLoginWatcher 启动时调。
   * 已存在则不动（避免打断登录/推荐可见态）；仅当不存在时新建隐藏单例。
   */
  ensureBossMonitorTab(): string {
    // ★ 主窗口已销毁（退出 / 窗口关闭）时直接返回，绝不再 spawnSiteTab。
    //   否则定时器（bossLoginWatcher poll）仍会触发 → spawnSiteTab 访问已销毁的
    //   mainWindow.contentView → 抛 "Object has been destroyed" 主进程崩溃弹框。
    if (!this.isReady()) return ''
    const existing = this.bossTabId ? this.tabs.get(this.bossTabId) : null
    if (existing && !existing.view.webContents.isDestroyed()) return this.bossTabId as string
    const id = this.spawnSiteTab('boss', TabManager.BOSS_MONITOR_URL, {
      hidden: true,
      background: false,
      role: 'boss-main'
    })
    this.bossTabId = id
    console.log(`[TabManager] BOSS 监视单例新建 tab=${id}`)
    return id
  }

  /** 设置 BOSS 主签可见性（active 抢焦点 / background 后台渲染）。 */
  private setBossTabVisibility(mode: 'active' | 'background'): void {
    const tab = this.bossTabId ? this.tabs.get(this.bossTabId) : null
    if (!tab) return
    if (mode === 'active') {
      tab.hidden = false
      this.activate(tab.id)
    } else if (mode === 'background') {
      tab.hidden = false
      this.bgRenderId = tab.id
      this.updateBounds()
      this.bringActiveToFront()
      this.broadcastState()
    }
  }

  /** BOSS 渠道被禁用时，系统级销毁主签和全部详情签。 */
  destroyBossTab(): void {
    const bossIds = [...this.tabs.values()]
      .filter((tab) => tab.channel === 'boss')
      .map((tab) => tab.id)
    if (bossIds.length === 0) return
    const wasActive = this.activeId ? bossIds.includes(this.activeId) : false
    this.bossTabId = null
    if (this.bgRenderId && bossIds.includes(this.bgRenderId)) this.bgRenderId = null
    for (const id of bossIds) {
      const tab = this.tabs.get(id)
      if (!tab) continue
      try {
        this.mainWindow?.contentView.removeChildView(tab.view)
      } catch {
        /* ignore */
      }
      try {
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
      } catch {
        /* ignore */
      }
      this.tabs.delete(id)
    }
    this.order = this.order.filter((id) => !bossIds.includes(id))
    if (wasActive) {
      const next = this.homeTabId
      if (next && this.tabs.has(next)) this.activate(next)
    }
    this.broadcastState()
    console.log(`[TabManager] BOSS 页签已销毁 tabs=${bossIds.join(',')}`)
  }

  /** 当前 BOSS 单例 tab 的 URL（无则空串） */
  getBossTabUrl(): string {
    const tab = this.bossTabId ? this.tabs.get(this.bossTabId) : null
    if (!tab || tab.view.webContents.isDestroyed()) return ''
    return tab.view.webContents.getURL()
  }

  /** BOSS 单例当前是否可见（active / background） —— 可见时不做监视 reload，避免打断登录/推荐 */
  private isBossTabVisible(): boolean {
    if (!this.bossTabId) return false
    return this.activeId === this.bossTabId || this.bgRenderId === this.bossTabId
  }

  /** 监视用：隐藏且空闲时 reload 职位管理页（让站点重新鉴权 → 失效会跳登录页） */
  reloadBossMonitor(): void {
    const tab = this.bossTabId ? this.tabs.get(this.bossTabId) : null
    if (!tab || tab.view.webContents.isDestroyed()) {
      this.ensureBossMonitorTab()
      return
    }
    // 不打断正在使用 BOSS tab 的业务：
    //   - 可见（active/background，登录/推荐切到前台）
    //   - 被业务锁定（locked，推荐任务跑中 setLocked(true)）——即使 bgRenderId 被别的 tab 顶掉、
    //     isBossTabVisible() 变 false，只要 locked 就说明推荐任务还在跑，绝不能 reload 回职位管理页
    //     （否则推荐牛人任务被异常中断）
    if (this.isBossTabVisible() || tab.locked) return
    // ★ 当前停在「推荐牛人」页时**不 reload**：
    //   reloadBossMonitor 会把单例 tab 导航回职位管理页（BOSS_MONITOR_URL），
    //   毁掉用户刚抓到的推荐牛人列表；且 BOSS 重新进推荐页会给每个牛人重新生成
    //   encryptGeekId（DOM 上的 data-geekid 变了），导致搜索结果里的「立即沟通」
    //   按 geekId 在推荐列表里匹配不到卡片。
    //   推荐页 URL（/web/frame/recommend、/web/chat/recommend）本身就算登录态
    //   （isLoggedInUrl 对 /web/ 返回 true），登录监视不依赖这次强制 reload；
    //   真被挤下线时站点 SPA 会自己跳登录页，30s 轮询的 poll() 仍能捕捉到。
    const curUrl = tab.view.webContents.getURL() || ''
    if (curUrl.includes('/web/frame/recommend') || curUrl.includes('/web/chat/recommend')) {
      console.log(
        '[TabManager] reloadBossMonitor skip：BOSS 单例当前在推荐牛人页，保留列表不 reload（避免 encryptGeekId 变化）'
      )
      return
    }
    // 隐藏监视 reload：开启聚焦守卫，防止 reload 后 BOSS 页面 autofocus 把窗口顶到前台抢焦点
    this.markHiddenLoadStart()
    void tab.view.webContents.loadURL(TabManager.BOSS_MONITOR_URL)
  }

  /** 注册 BOSS 单例 URL 变化监听（bossLoginWatcher 判登录态） */
  setBossUrlListener(cb: ((url: string) => void) | null): void {
    this.bossUrlListener = cb
  }

  /**
   * 标记"即将主动触发一次隐藏视图加载"——开启聚焦守卫窗口，并记下加载前 app 是否在前台。
   * 在 spawnSiteTab(hidden) / reloadBossMonitor 调 loadURL 之前调用。
   */
  private markHiddenLoadStart(): void {
    const focused = !!(
      this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      this.mainWindow.isFocused()
    )
    this.hiddenLoadAppWasActive = focused
    // 10s 守卫窗口：覆盖 reload 后页面异步 autofocus / 站点 JS 调 focus() 的时延
    this.hiddenLoadGuardUntil = Date.now() + 10_000
  }

  /**
   * mainWindow 'focus' 时调用：判断这次聚焦是否是"隐藏视图加载把 app 顶到前台"的非法聚焦。
   * 是 → 返回 true（调用方应立即 blur 并跳过职位刷新等副作用），并消费掉本次守卫（只判一次）。
   */
  shouldRejectFocusFromHiddenLoad(): boolean {
    const within = Date.now() < this.hiddenLoadGuardUntil
    const illegitimate = within && !this.hiddenLoadAppWasActive
    if (within) this.hiddenLoadGuardUntil = 0 // 消费：本次加载只拦一次，避免误伤后续真实用户聚焦
    return illegitimate
  }

  /**
   * 把当前 active 视图重新挂到 contentView 子视图最末（= z-order 最上层），
   * 遮住以真实尺寸渲染的 background tab。
   *
   * 背景：contentView 子视图按添加顺序决定 z-order（后添加的在上）。新建 background tab
   * 时它被 addChildView 到最上层，需要把 home（active）重新置顶才能"停在主页"的视觉。
   */
  private bringActiveToFront(): void {
    if (!this.mainWindow || !this.activeId) return
    const activeTab = this.tabs.get(this.activeId)
    if (!activeTab) return
    try {
      this.mainWindow.contentView.removeChildView(activeTab.view)
      this.mainWindow.contentView.addChildView(activeTab.view)
    } catch (e) {
      console.warn('[TabManager] bringActiveToFront failed:', (e as Error)?.message || e)
    }
  }

  // ----- 激活 / 关闭 / 重排 -----

  activate(id: string): void {
    if (!this.tabs.has(id)) return
    // 用户手动切到这个 tab（或它成为前台）→ 清掉它的"后台渲染"标记（已经是前台了）
    if (this.bgRenderId === id) this.bgRenderId = null
    this.activeId = id
    this.updateBounds()
    // 通知蒙层重新评估：active 是招聘站 tab 时显示，是 home / 其它时隐藏
    // 详见 automationOverlay.ts setActiveChannel 注释
    const tab = this.tabs.get(id)
    setOverlayActiveChannel(tab?.channel ?? null)
    this.broadcastState()
  }

  /**
   * 强制「聚焦主页 tab」并触发重绘 —— 等价于用户手动点一下「i快招」主页 tab。
   *
   * 背景：deep link 来回唤起客户端时，主页 tab 的 WebContentsView 偶发不重绘（黑屏），
   *   必须手动点一下主页 tab 才显示。除了 activate（设 activeId + bounds）外，这里额外：
   *     1) removeChildView + addChildView 把 home view 重新置顶 → 触发重新合成（修黑屏关键）
   *     2) updateBounds 重设真实 bounds
   *     3) webContents.focus() 聚焦内容区
   *   由 handleDeepLink 在窗口 show/focus 之后调用。
   */
  focusHomeTab(): void {
    if (!this.homeTabId || !this.tabs.has(this.homeTabId)) return
    const tab = this.tabs.get(this.homeTabId)
    if (!tab) return
    this.activeId = this.homeTabId
    if (this.bgRenderId === this.homeTabId) this.bgRenderId = null
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view)
        this.mainWindow.contentView.addChildView(tab.view)
      } catch {
        /* noop */
      }
    }
    this.updateBounds()
    setOverlayActiveChannel(tab.channel ?? null)
    try {
      const wc = tab.view.webContents
      if (wc && !wc.isDestroyed()) wc.focus()
    } catch {
      /* noop */
    }
    this.broadcastState()
  }

  /**
   * 关闭普通 tab。i快招与 BOSS 主签强拒，BOSS 详情签可正常关闭。
   * 关闭后切到相邻（优先右侧，无则左侧）。
   */
  close(id: string): boolean {
    const tab = this.tabs.get(id)
    if (!tab) return false
    if (!tab.closable || tab.role === 'boss-main') {
      console.log(`[TabManager] close 拒绝：tab=${id} role=${tab.role} 永久不可关闭`)
      return false
    }
    if (tab.pinned) return false
    if (tab.locked) {
      console.log(`[TabManager] close 拒绝：tab=${id} 已 locked (业务侧未 setLocked(false))`)
      return false
    }

    const idx = this.order.indexOf(id)
    if (idx < 0) return false

    // 关掉的是后台渲染 tab → 清标记
    if (this.bgRenderId === id) this.bgRenderId = null

    // 计算下一个激活的 tab：右侧 > 左侧 > home（跳过 hidden tab）
    let nextActive: string | null = null
    if (this.activeId === id) {
      nextActive = this.findVisibleNeighborTabId(idx) ?? this.homeTabId
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

  /**
   * 强制让某个 tab 重新加载到指定 URL（绕过 openOrActivateSiteTab 的 sameUrl 复用）。
   *
   * 场景：BOSS 推荐第二次跑同 jobid 的任务时，URL 完全一样 → openOrActivateSiteTab 只
   * activate 不 loadURL；调 reload() 也不一定让 BOSS SPA 重新发 `/wapi/zpjob/rec/geek/list`
   * （疑似 sessionStorage / 路由内部缓存）。这里直接 webContents.loadURL() 强制完整 navigation，
   * BOSS 必然要重新启动 SPA → 一定会重发推荐 API。
   *
   * 调用方一般传跟当前一样的 jobid URL 即可，也可以带 `&_t=Date.now()` 兜底防 HTTP 缓存。
   */
  loadUrl(id: string, url: string): void {
    const tab = this.tabs.get(id)
    if (!tab || !url) return
    void tab.view.webContents.loadURL(url)
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

  /** 按 tabId 拿 webContents（给 tabFetcher 等需要操作特定 tab 的工具用） */
  getWebContentsById(id: string): Electron.WebContents | null {
    const tab = this.tabs.get(id)
    if (!tab) return null
    if (tab.view.webContents.isDestroyed()) return null
    return tab.view.webContents
  }

  /**
   * 给定 channel 找到对应的招聘站 tab webContents（如果有）。
   * 用于 universalRequest 在站点 tab 内 executeJavaScript 发 fetch（替代原 siteWindowManager.getWindow）。
   */
  getSiteWebContentsForChannel(channel: string): Electron.WebContents | null {
    const key = (channel || '').toLowerCase()
    // 多个 BOSS tab 共存后，接口/RPA 默认必须使用主签，不能误拿候选人详情签。
    if (key === 'boss' && this.bossTabId) {
      const mainTab = this.tabs.get(this.bossTabId)
      if (mainTab && !mainTab.view.webContents.isDestroyed()) return mainTab.view.webContents
    }
    if (key === 'boss') return null
    for (const tab of this.tabs.values()) {
      if (tab.channel === key && !tab.view.webContents.isDestroyed()) {
        return tab.view.webContents
      }
    }
    return null
  }

  getTabs(): TabState[] {
    return this.order
      .map((id) => {
        const tab = this.tabs.get(id)
        if (tab?.hidden) return null // hidden tab 不出现在 TabBar
        return this.toState(id)
      })
      .filter((x): x is TabState => x !== null)
  }

  /**
   * 给定 order 索引，找右侧最近的非 pinned 非 hidden tab id；找不到再找左侧。
   * 用于 close 时计算 nextActive，跳过 hidden tab。
   */
  private findVisibleNeighborTabId(idx: number): string | null {
    for (let i = idx + 1; i < this.order.length; i++) {
      const id = this.order[i]
      const t = this.tabs.get(id)
      if (t && !t.hidden) return id
    }
    for (let i = idx - 1; i >= 0; i--) {
      const id = this.order[i]
      const t = this.tabs.get(id)
      if (t && !t.hidden) return id
    }
    return null
  }

  // ----- 内部：bounds / state ----

  private updateBounds(): void {
    if (!this.mainWindow) return
    const bounds = this.mainWindow.getContentBounds()
    const contentBounds = {
      x: 0,
      y: CHROME_HEIGHT,
      width: bounds.width,
      height: Math.max(0, bounds.height - CHROME_HEIGHT)
    }
    for (const [id, tab] of this.tabs) {
      // active 给真实 bounds（最上层可见）；
      // bgRender tab 也给真实 bounds（被 active 遮挡，但保证页面布局真实 → CDP / 懒加载能跑）；
      // 其它（含 hidden）一律 0x0 不占空间。
      if (id === this.activeId || (id === this.bgRenderId && id !== this.activeId)) {
        tab.view.setBounds(contentBounds)
      } else {
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
  }

  private toState(id: string): TabState | null {
    const tab = this.tabs.get(id)
    if (!tab) return null
    // 防御：view 可能在 close() / window 退出时已经销毁，但旧监听器还会异步触发一次。
    // 不防御的话会抛 "Cannot read properties of undefined (reading 'navigationHistory')"
    const view = tab.view as { webContents?: unknown } | null | undefined
    const wcRaw = view?.webContents
    if (!wcRaw) return null
    const wc = wcRaw as unknown as {
      isDestroyed?: () => boolean
      isLoading: () => boolean
      navigationHistory?: { canGoBack: () => boolean; canGoForward: () => boolean }
      canGoBack?: () => boolean
      canGoForward?: () => boolean
      getURL: () => string
    }
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return null
    const canBack = wc.navigationHistory
      ? wc.navigationHistory.canGoBack()
      : (wc.canGoBack?.() ?? false)
    const canFwd = wc.navigationHistory
      ? wc.navigationHistory.canGoForward()
      : (wc.canGoForward?.() ?? false)
    let url = ''
    let loading = false
    try {
      url = wc.getURL()
      loading = wc.isLoading()
    } catch {
      /* 销毁过程中再次兜底 */
    }
    return {
      id: tab.id,
      pinned: tab.pinned,
      role: tab.role,
      closable: tab.closable,
      channel: tab.channel,
      title: tab.title,
      url,
      loading,
      canGoBack: canBack,
      canGoForward: canFwd,
      active: this.activeId === id,
      locked: !!tab.locked
    }
  }

  /**
   * 动态锁定/解锁 tab：locked=true 时 TabBar 隐藏 X 按钮 + close() 拒绝。
   * 业务侧用：启动 BOSS 推荐任务时 setLocked(true) 防误关，任务完成 setLocked(false) 解锁。
   * 操作 home tab 无效；BOSS 主签虽永久不可关，仍允许设置 locked 供任务状态判断使用。
   *
   * @returns true=操作成功；false=tab 不存在 / 是 home
   */
  setLocked(id: string, locked: boolean): boolean {
    const tab = this.tabs.get(id)
    if (!tab) return false
    if (tab.role === 'home') return false
    tab.locked = !!locked
    this.broadcastState()
    console.log(`[TabManager] setLocked tab=${id} → ${tab.locked}`)
    return true
  }

  private broadcastState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('tabs:state', this.getTabs())
    this.notifyBossTabPresence()
  }

  /** 注册「可见 BOSS tab 是否存在」变化监听（index.ts 接到 bossLoginWatcher） */
  setBossTabPresenceListener(cb: (hasVisibleBoss: boolean) => void): void {
    this.bossTabPresenceListener = cb
  }

  /** 当前是否存在可见（非 hidden）BOSS tab —— 登录 / 推荐牛人等用户可见的 BOSS 上下文 */
  hasVisibleBossTab(): boolean {
    for (const tab of this.tabs.values()) {
      if (tab.channel === 'boss' && !tab.hidden) return true
    }
    return false
  }

  /** 可见 BOSS tab 存在性变化时通知监听器（只在布尔值翻转时触发） */
  private notifyBossTabPresence(): void {
    const has = this.hasVisibleBossTab()
    if (has === this.lastBossTabPresent) return
    this.lastBossTabPresent = has
    try {
      this.bossTabPresenceListener?.(has)
    } catch (e) {
      console.warn('[TabManager] bossTabPresenceListener error:', (e as Error)?.message || e)
    }
  }

  // ----- 内部：listeners -----

  /**
   * 监听标签自身的状态变化（标题 / loading / 导航），任何变化都广播。
   */
  private attachViewListeners(tab: InternalTab): void {
    const wc = tab.view.webContents
    const onChange = (): void => this.broadcastState()
    // BOSS 单例 tab 的 URL 变化额外通知 bossLoginWatcher 判登录态
    const onBossNav = (): void => {
      if (tab.id === this.bossTabId && this.bossUrlListener) {
        try {
          this.bossUrlListener(wc.getURL())
        } catch (e) {
          console.warn('[TabManager] bossUrlListener error:', (e as Error)?.message || e)
        }
      }
    }
    wc.on('page-title-updated', (_e, title) => {
      // 主页 tab 锁定标题（决策 D.a：写死"i快招"）
      if (!tab.pinned) tab.title = title
      this.broadcastState()
    })
    wc.on('page-favicon-updated', onChange)
    wc.on('did-start-loading', onChange)
    wc.on('did-stop-loading', () => {
      onChange()
      onBossNav()
    })
    wc.on('did-navigate', () => {
      onChange()
      onBossNav()
    })
    wc.on('did-navigate-in-page', () => {
      onChange()
      onBossNav()
    })
    wc.on('did-finish-load', onChange)

    // ★ BOSS 站点 tab 导航诊断：定位"推荐列表被刷新/换一批"到底是谁触发的。
    //   - did-navigate     → **整页导航**（loadURL / reload / location 跳转）= 真·页面刷新
    //   - did-navigate-in-page → SPA 路由内跳（不重载页面）
    //   通过 URL 即可反推触发源：
    //     · 含 /web/chat/job/list（BOSS_MONITOR_URL）→ reloadBossMonitor（登录监视）
    //     · 含 /web/frame/recommend 或 /web/chat/recommend 且带 _t= → autoSelectJob=false 的 tabs.loadUrl
    //     · 含 recommend 不带 _t → openBossSingleton 复用时 loadURL（又一次 openBossRecommend）
    //     · 含 geek/detail 等 → 用户/自动化点开了候选人详情（openChannelUrl）
    //   如果列表"换了一批"但这里**没有** did-navigate 打印 → 不是页面刷新，是 BOSS 自己 XHR 回填。
    if (tab.channel === 'boss') {
      wc.on('did-navigate', (_e, url) => {
        console.log(
          `[TabManager][bossNavDiag] 整页导航 did-navigate tab=${tab.id} ` +
            `isMonitorSingleton=${tab.id === this.bossTabId} url=${url} t=${new Date().toISOString()}`
        )
      })
      wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
        if (!isMainFrame) return
        console.log(
          `[TabManager][bossNavDiag] SPA 内跳 did-navigate-in-page tab=${tab.id} url=${url} t=${new Date().toISOString()}`
        )
      })
    }

    // 招聘站点自动化 tab：屏蔽站点 JS 弹窗（alert/confirm/prompt）。
    //   背景：BOSS 多 session 互斥保护会在"同账号多处进入"时弹原生 alert
    //   「您的账号已经登录过了，请勿重复登录」。客户端重启时常驻登录监视 tab + recruitBridge
    //   hydrate(/web/user) + 职位列表抓取 tab 会几乎同时进入 BOSS（同一账号），触发该弹窗，
    //   阻塞后台监视/抓取与用户操作（其实 checkAuth 仍是已登录）。这里把站点 tab 的 JS 弹窗
    //   静默化，避免阻塞。（home 主应用 tab 不屏蔽，保留正常对话框能力。）
    if (tab.channel && tab.channel !== 'home') {
      const suppressSiteDialogs = (): void => {
        wc.executeJavaScript(
          '(function(){try{window.alert=function(){};window.confirm=function(){return true;};window.prompt=function(){return null;};}catch(e){}})();'
        ).catch(() => {})
      }
      wc.on('dom-ready', suppressSiteDialogs)
      wc.on('did-navigate', suppressSiteDialogs)
    }
    // 不监听 'destroyed' 自动清理：
    //   - 加了之后发现 BOSS 推荐 tab 创建过程中会误触发该事件（机制未明，
    //     疑似 Electron 30 的某条内部销毁路径，或与 WebContentsView 重建 wc 有关），
    //     导致活着的 tab 被错误地从 tabs map 清掉 → TabBar 直接空了
    //   - 防崩溃只靠 toState 里的 isDestroyed 兜底就够了
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
   *   • 招聘域 URL（同站 / 跨站都算） → 走 openOrActivateSiteTab
   *     ↳ URL 相同复用，URL 不同新开（不再覆盖当前 tab）
   *   • 非招聘域 → 系统浏览器
   */
  private attachSiteWindowOpenHandler(tab: InternalTab): void {
    tab.view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
      if (!newUrl) return { action: 'deny' }
      const targetChannel = pickChannelForUrl(newUrl)
      if (targetChannel) {
        this.openOrActivateSiteTab(targetChannel, newUrl)
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

/**
 * 判断两个 URL 是否"实质相同"（用于 openOrActivateSiteTab 复用判定）。
 * 容忍以下无意义差异：
 *   - 协议大小写、host 大小写
 *   - 末尾斜杠（path 上）
 *   - URL 末尾 fragment hash（同一页面的锚点）
 * 不容忍 query string 顺序差异（同样的 query 不同顺序视为不同 URL，避免误判）
 */
/**
 * 忽略一些"我们自己加的"或"无业务意义"的 query 参数，避免破坏 tab 同 URL 复用判定。
 *
 * 典型场景：bossRecommend 给 chat/recommend 加 `_t=Date.now()` 做 cache-bust，
 * 让 BOSS SPA 完整重启。如果 sameUrl 严格比较 search，下次同 jobid 启动时：
 *   - 现有 tab URL: `?jobid=xxx&_t=12345`
 *   - 新请求 URL : `?jobid=xxx`
 * 严格比较会判不同 → 新开 tab → 用户看到一堆重复 BOSS tab。
 *
 * 这里把 `_t` 之类的 cache-bust 参数过滤掉再比较，保证同 jobid 一定能复用。
 */
const IGNORED_QUERY_PARAMS_FOR_SAMEURL: ReadonlySet<string> = new Set([
  '_t', // bossRecommend 用的 cache-bust 时间戳
  '_' // 兜底（很多框架默认用 `_` 作 cache-bust）
])

/** BOSS 候选人详情页：与登录、职位、推荐、互动等主业务页面分开打开。 */
function isBossDetailUrl(rawUrl: string): boolean {
  if (!rawUrl) return false
  try {
    const url = new URL(rawUrl)
    if (!/(^|\.)zhipin\.com$/i.test(url.hostname)) return false
    const path = url.pathname.toLowerCase()
    return (
      path.includes('/web/geek/detail') ||
      path.includes('/resume/detail') ||
      path.includes('/web/frame/recommend/resume')
    )
  } catch {
    return false
  }
}

function normalizedSearch(u: URL): string {
  const filtered = new URLSearchParams()
  // URLSearchParams 没保证有序，sort 一下避免顺序差异导致误判
  const entries: Array<[string, string]> = []
  u.searchParams.forEach((v, k) => {
    if (IGNORED_QUERY_PARAMS_FOR_SAMEURL.has(k)) return
    entries.push([k, v])
  })
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [k, v] of entries) filtered.append(k, v)
  const s = filtered.toString()
  return s ? `?${s}` : ''
}

function sameUrl(a: string, b: string): boolean {
  if (a === b) return true
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    if (ua.protocol !== ub.protocol) return false
    if (ua.host.toLowerCase() !== ub.host.toLowerCase()) return false
    const normPath = (p: string): string => (p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p)
    if (normPath(ua.pathname) !== normPath(ub.pathname)) return false
    // 忽略 `_t` / `_` 这类 cache-bust 参数，并对剩余 params 排序后再比，
    // 让同 jobid 不同时间戳的 URL 仍视为同一个页面
    if (normalizedSearch(ua) !== normalizedSearch(ub)) return false
    // 忽略 hash（同一页内锚点跳转，不需要新开 tab）
    return true
  } catch {
    return false
  }
}

export const tabManager = new TabManager()
