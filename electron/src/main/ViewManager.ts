import { BrowserWindow } from 'electron'

/**
 * 4 个招聘站点各自的独立 partition，保证 cookie / localStorage 隔离持久化。
 * partition 名同样用作 webRequest 拦截的 key（在 recruitBridge 里挂 header 抓取 / Origin 改写）
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

/**
 * 桌面版 Chrome UA — 跟着最新 Chrome 稳定版升级，避免被招聘站当作过期浏览器拒绝
 * （2026-05 实测 51Job 对 Chrome <140 的扫码 API 有问题，所以保持最新）
 */
const desktopChromeUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

/**
 * 招聘站点窗口管理器
 *
 * 关键设计：
 * - 每个 channel 用独立 BrowserWindow（**不绑 parent**），以便用户可以把它拖到主窗口旁边
 * - cookie / localStorage 走独立 partition 隔离持久化
 * - 同 channel 重复 open 不开新窗口：聚焦已有 + 必要时跳转 URL
 * - 主窗口关闭时统一清理
 */
class SiteWindowManager {
  private parent: BrowserWindow | undefined
  private windows = new Map<string, BrowserWindow>()

  setParent(window: BrowserWindow): void {
    this.parent = window
  }

  getPartition(channel: string): string | null {
    const key = (channel || '').toLowerCase()
    return SITE_PARTITION[key] ?? null
  }

  /**
   * 已经为该 channel 打开过的窗口（用于 webContents.executeJavaScript 在站点上下文里发请求）
   */
  getWindow(channel: string): BrowserWindow | undefined {
    const key = (channel || '').toLowerCase()
    const win = this.windows.get(key)
    return win && !win.isDestroyed() ? win : undefined
  }

  openSite(channel: string, url: string): BrowserWindow {
    const key = (channel || 'unknown').toLowerCase()
    const existing = this.windows.get(key)
    if (existing && !existing.isDestroyed()) {
      const currentUrl = existing.webContents.getURL()
      if (currentUrl !== url) {
        existing.loadURL(url)
      }
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return existing
    }

    const partition = SITE_PARTITION[key] ?? `persist:ihr360-site-${key}`
    const title = SITE_TITLE[key] ?? channel

    // 计算初始位置：尽量放到主窗口旁边（右侧）
    const bounds = this.parent?.getBounds()
    const screenW = 1280
    const initX = bounds ? Math.min(bounds.x + bounds.width + 12, screenW) : undefined
    const initY = bounds ? bounds.y : undefined

    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 600,
      x: initX,
      y: initY,
      title,
      autoHideMenuBar: true,
      // 关键：不设 parent，否则会强制叠在主窗口前面、不能独立移动
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition
      }
    })

    win.webContents.setUserAgent(desktopChromeUserAgent)

    win.webContents.setWindowOpenHandler(({ url: newUrl }) => {
      // 站点内部点链接弹新窗口时（如"查看详情"），直接在当前 site 窗口内导航
      if (newUrl) win.loadURL(newUrl)
      return { action: 'deny' }
    })

    // 调试：打印站点窗口里的请求失败和 console error，方便排查招聘站接口异常
    win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
      console.warn(`[siteWindow:${key}] did-fail-load`, code, desc, failedUrl)
    })
    // Electron 35+ console-message 接收单个 event 对象
    // 不过为兼容旧/新两种签名，先按新签名取，落空再按旧的
    win.webContents.on('console-message', ((arg1: unknown, arg2: unknown, arg3: unknown, arg4: unknown) => {
      let level: string | number = 'log'
      let message = ''
      let line: number | undefined
      let sourceId: string | undefined
      // 新签名：单 event 对象
      if (arg1 && typeof arg1 === 'object' && 'level' in (arg1 as object)) {
        const e = arg1 as { level: string; message: string; lineNumber?: number; sourceId?: string }
        level = e.level
        message = e.message
        line = e.lineNumber
        sourceId = e.sourceId
      } else {
        // 旧签名：(event, level, message, line, sourceId)
        level = (arg1 as { type?: number })?.type ?? 0
        message = String(arg2 ?? '')
        line = arg3 as number | undefined
        sourceId = arg4 as string | undefined
      }
      const isProblem = level === 'error' || level === 'warning' || level === 2 || level === 3
      if (isProblem) {
        console.log(
          `[siteWindow:${key}] page-${level}: ${message} (${sourceId ?? '?'}:${line ?? '?'})`
        )
      }
    }) as Parameters<typeof win.webContents.on>[1])

    win.loadURL(url)

    win.on('closed', () => {
      this.windows.delete(key)
    })

    this.windows.set(key, win)
    return win
  }

  destroyAll(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.windows.clear()
  }
}

export const siteWindowManager = new SiteWindowManager()
