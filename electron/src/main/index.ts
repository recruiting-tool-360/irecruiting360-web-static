import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import icon128 from '../../resources/icons/128x128.png?asset'
import iconIco from '../../resources/icons/128x128.png?asset'
import { siteWindowManager } from './ViewManager'
import {
  registerRecruitBridgeIpc,
  setupSiteSessions,
  hydrateLoggedInSites,
  setMainWindowForBridge,
  pickChannelForUrl
} from './recruitBridge'
import { parseDeepLink, isPayloadFresh, type ParsedDeepLink } from './util/deepLinkCodec'

/**
 * 远端 SPA 部署地址（生产 / 默认开发回退用）
 */
const PROD_TARGET_URL = 'https://login.ihire365.com'

const DEEP_LINK_PROTOCOL = 'ikuaizhao'

/**
 * 主窗口标题
 *
 * ⚠️ 关于"为什么 dev 模式下系统弹窗仍然显示 Electron"：
 *   - macOS LaunchServices 在 deep link 唤起时弹的对话框、dock 图标的应用名，
 *     都是基于 .app bundle 的 Info.plist 的 CFBundleName 决定的；dev 模式下跑的是
 *     node_modules/electron/dist/Electron.app，里面写的就是 "Electron"。
 *   - 打包后 electron-builder 会用 yml 里的 productName（i快招）写新的 Info.plist，
 *     系统弹窗 / dock 自动变成 "要打开 i快招 吗？" 和 "i快招" 图标。
 *   - 不要在 dev 模式 app.setName('i快招')！这会改 userData 路径，
 *     导致所有 partition cookie 失效（用户重新登录所有招聘站）。
 *   - 这里只改 BrowserWindow.title，是无副作用的纯展示字段。
 */
const WINDOW_TITLE = 'i快招 - 智能招聘助手'

/**
 * 主窗口加载哪个地址：
 * 1. 设置了 DEV_TARGET_URL 环境变量 → 加载它（dev:el:local 用，指向本地 quasar dev）
 * 2. 否则 → 加载 PROD_TARGET_URL 远端 SPA
 *
 * electron-vite 自带 ELECTRON_RENDERER_URL 默认指向内嵌的 react renderer 占位页，
 * 我们已经不需要那个 splash，所以这里直接忽略它。
 */
function resolveTargetUrl(): string {
  if (is.dev && process.env.DEV_TARGET_URL) {
    return process.env.DEV_TARGET_URL
  }
  return PROD_TARGET_URL
}

/**
 * 把 baseUrl 拼上 path，处理结尾斜杠
 */
function joinPath(baseUrl: string, p: string): string {
  const base = baseUrl.replace(/\/$/, '')
  const path = p.startsWith('/') ? p : '/' + p
  return base + path
}

/**
 * deep link action → SPA 路由路径的映射（让客户端启动后命中正确页面）
 */
function pathForAction(action: string): string | null {
  switch (action) {
    case 'sso':
      return '/sso-login' // SSOLogin.vue onMounted 时会消费 pending payload
    default:
      return null
  }
}

let mainWindow: BrowserWindow | null = null

// =============== Deep Link 处理 ===============

/**
 * 主进程缓存的"待消费 deep link"。
 * - 冷启动时被 deep link 唤起（macOS 走 open-url 事件、Windows/Linux 走 process.argv），
 *   主窗口还没就绪 → 缓存到这里，渲染端 ready 后调 handover:getPending 取。
 * - 已运行中收到新 deep link → 立即推送 'app:deep-link' 事件给渲染端。
 */
let pendingDeepLink: ParsedDeepLink | null = null

function rememberPendingDeepLink(parsed: ParsedDeepLink): void {
  if (!isPayloadFresh(parsed.payload)) {
    console.warn('[main] deep link payload expired, dropping:', parsed.action)
    return
  }
  pendingDeepLink = parsed
  console.log('[main] pending deep link queued:', parsed.action, 'v=' + parsed.version)
}

/**
 * 解析并处理一条 deep link URL（不区分冷启动/运行中）
 *
 * 关键：根据 action 强制把主窗口 navigate 到对应 SPA 路由，
 * 这样 SSOLogin.vue onMounted 时能通过 handover.getPendingPayload 取到 payload 接管业务。
 * 否则用户已经在主页时，渲染端没有任何监听器接收 'app:deep-link' 事件，payload 会被丢弃。
 */
function handleDeepLink(url: string): void {
  const parsed = parseDeepLink(url)
  if (!parsed) {
    console.warn('[main] handleDeepLink: failed to parse url:', url)
    return
  }
  console.log('[main] deep link received:', parsed.action, 'v=' + parsed.version)
  rememberPendingDeepLink(parsed)

  if (!mainWindow || mainWindow.isDestroyed()) {
    // 主窗口还没创建（冷启动）：payload 已缓存，等 createMainWindow 时根据 pendingDeepLink
    // 决定加载 /sso-login，SSOLogin.vue onMounted 会主动调 getPending 取走
    return
  }

  // 主窗口已存在：根据 action 决定 navigate 还是只发事件
  const path = pathForAction(parsed.action)
  if (path) {
    const fullUrl = joinPath(resolveTargetUrl(), path)
    const currentUrl = mainWindow.webContents.getURL()
    // 只有当前不在目标路径时才 navigate（避免无意义重载）
    const onTargetPath = currentUrl.includes(path)
    if (!onTargetPath) {
      console.log('[main] navigating main window to', fullUrl)
      void mainWindow.loadURL(fullUrl)
      // SSOLogin.vue onMounted 时会读 pendingDeepLink，不需要额外 send 事件
    } else {
      // 已经在 SSO 页面 → 直接推送事件让 SSOLogin onDeepLink 监听器响应
      mainWindow.webContents.send('app:deep-link', parsed)
      // 也清掉 pendingDeepLink，因为事件已经送出
      pendingDeepLink = null
    }
  } else {
    // 未知 action：只推事件给渲染端，由渲染端自行处理
    mainWindow.webContents.send('app:deep-link', parsed)
    pendingDeepLink = null
  }

  // 把主窗口拉到前台
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * 协议注册：让操作系统知道 ikuaizhao:// 由本应用处理
 */
function registerProtocolClient(): void {
  if (process.defaultApp) {
    // 开发模式（electron-vite dev 启动）：argv 里有脚本路径，注册时要带上
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1])
      ])
    }
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL)
  }
}

// =============== Single Instance Lock ===============
// 必须在 app.ready 之前调用，确保第二个实例无法启动，第二次唤起会触发 second-instance 事件

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', (_event, argv) => {
  // Windows / Linux：第二次启动会带 deep link URL 在 argv 里
  const url = argv.find((a) => typeof a === 'string' && a.startsWith(`${DEEP_LINK_PROTOCOL}://`))
  if (url) {
    handleDeepLink(url)
  } else if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

// =============== macOS：open-url 必须在 whenReady 之前注册 ===============
// 冷启动时 deep link URL 可能在 ready 之前就到达
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// =============== 主窗口创建 ===============

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const mainSession = session.fromPartition('persist:ihr360-main')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: WINDOW_TITLE,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    icon:
      process.platform !== 'darwin' && process.platform !== 'linux'
        ? path.join(__dirname, process.platform === 'win32' ? iconIco : icon128)
        : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      session: mainSession
    }
  })

  // 防止页面 <title> 覆盖窗口标题（SPA 加载后会把 document.title 设成自家标题）
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon128)
  }

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 主窗口里 a target=_blank / window.open 的默认行为：智能路由
  //   - 招聘站 URL（zhipin / zhaopin / liepin / 51job 任意子域）→ 客户端独立窗口 + 对应 partition
  //   - 其它外部 URL（用户协议、官网外链等）→ 走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const channel = pickChannelForUrl(url)
    if (channel) {
      siteWindowManager.openSite(channel, url)
      return { action: 'deny' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  siteWindowManager.setParent(mainWindow)
  setMainWindowForBridge(mainWindow)

  mainWindow.on('closed', () => {
    siteWindowManager.destroyAll()
    mainWindow = null
  })

  // 决定首次加载哪个 URL：
  //   - 有 pendingDeepLink（被 deep link 唤起冷启动）→ 直接进对应 SPA 路由
  //     例如 sso 走 /sso-login，让 SSOLogin.vue onMounted 通过 handover 取 payload
  //   - 没有 → 加载主页 URL
  const baseUrl = resolveTargetUrl()
  const path = pendingDeepLink ? pathForAction(pendingDeepLink.action) : null
  const targetUrl = path ? joinPath(baseUrl, path) : baseUrl
  console.log('[main] loading target url:', targetUrl)
  void mainWindow.loadURL(targetUrl)

  // 开发期默认开 devtools，方便排查
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  return mainWindow
}

// =============== IPC handlers ===============

function registerIpc(): void {
  ipcMain.on('ping', () => console.log('pong'))

  /**
   * 渲染端启动后调用一次，取走主进程缓存的 deep link payload。
   * 消费一次后清掉，避免重复登录。
   */
  ipcMain.handle('handover:getPending', () => {
    const pending = pendingDeepLink
    pendingDeepLink = null
    return pending
  })
}

// =============== App 生命周期 ===============

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ihire365.ikuaizhao')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册自定义协议（必须在窗口创建之前；macOS 上 open-url 事件不依赖这个，但 Win/Linux 依赖）
  registerProtocolClient()

  // 启动时一次性给 4 个招聘站 partition 装配 webRequest 抓 header
  setupSiteSessions()

  // 注册客户端原生招聘能力 IPC（替代浏览器插件）
  registerRecruitBridgeIpc()

  // 注册 deep link / handover 等基础 IPC
  registerIpc()

  createMainWindow()

  // Windows / Linux 冷启动：deep link URL 在 process.argv 里，扫一遍
  if (process.platform !== 'darwin') {
    const initialUrl = process.argv.find(
      (a) => typeof a === 'string' && a.startsWith(`${DEEP_LINK_PROTOCOL}://`)
    )
    if (initialUrl) {
      handleDeepLink(initialUrl)
    }
  }

  // 主窗口创建之后再做 hydrate（这样 mainWindowRef 已设置，header 抓到时能通知到 SPA）
  // 不 await，让 SPA 先正常加载，hydrate 在后台跑 5s 内自动完成
  void hydrateLoggedInSites()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
