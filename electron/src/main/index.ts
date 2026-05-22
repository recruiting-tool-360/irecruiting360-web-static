import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import icon128 from '../../resources/icons/128x128.png?asset'
import iconIco from '../../resources/icons/128x128.png?asset'
import { tabManager, pickChannelForUrl } from './TabManager'
import {
  registerRecruitBridgeIpc,
  setupSiteSessions,
  hydrateLoggedInSites,
  setHomeWebContentsForBridge
} from './recruitBridge'
import {
  registerIhrBridgeIpc,
  setManageUrl,
  setAccessToken,
  syncCookiesFromLauncher
} from './ihrBridge'
import { registerHiddenViewIpc } from './hiddenViewRunner'
import { registerTabFetcherIpc } from './tabFetcher'
import { registerAutomationRunnerIpc } from './automation/runner'
import {
  waitForResponse as siteNetworkWait,
  getLatest as siteNetworkGetLatest,
  clearCache as siteNetworkClearCache,
  listCache as siteNetworkListCache
} from './siteNetworkCapture'
import {
  setOverlayMainWindow,
  showOverlay,
  hideOverlay,
  isOverlayVisible,
  type OverlayPayload
} from './automationOverlay'
import { dispatchClick as cdpDispatchClick } from './cdpInputDispatcher'

/**
 * ⚠️⚠️⚠️ 不要开 `--remote-debugging-port`！
 *
 * 历史教训（2026-05-18）：
 *   - 开了 9223 → BOSS 探测固定端口，触发反爬 → web 端账号被封 24h
 *   - 改成 0（随机端口） → BOSS 仍能通过其它指纹（navigator.webdriver / Runtime.evaluate
 *     痕迹 / DevTools attach 信号等）判断 Chromium 处于 debug 模式 → 同样封 24h
 *
 * 一旦开了这个 switch，Chromium 就**在内部留下"被远程调试"的痕迹**，BOSS 风控的
 * JS 探测就能识别。即使我们不连 Playwright、端口随机，痕迹也存在。
 *
 * → **彻底关掉**这个 switch，让 Electron 跟普通用户 Chrome 一样不暴露 debug 入口。
 * → 代价：playwright-core 的 `chromium.connectOverCDP()` 失效，runScript 接口完全不能用。
 * → 后续如果要做 BOSS 自动化，**只能用 `webContents.executeJavaScript`**（参考
 *    tabFetcher.ts / bossJobListAutoFetch.js，已经验证过 BOSS 检测不到），
 *    而不是 Playwright 方案。
 *
 * 如果以后要做"非招聘站"的自动化（不会被风控的内部页面 / 调试用），可以加 env
 * `ENABLE_REMOTE_DEBUG=1` 时再打开。生产 / 招聘站场景**永远关闭**。
 */
if (process.env.ENABLE_REMOTE_DEBUG === '1') {
  console.warn(
    '[main] ⚠️ ENABLE_REMOTE_DEBUG=1，打开 Chromium 远程调试端口。BOSS / 智联 / 51job / 猎聘 等反爬站点会识别并封号，仅用于内部调试！'
  )
  app.commandLine.appendSwitch('remote-debugging-port', '0')
}

/**
 * ⚠️ 不要给 `--remote-allow-origins` 设白名单！
 *
 * 一旦显式设了（哪怕 'http://localhost'），Chromium 改成 strict 模式：
 *   - 必须有 Origin header 且在白名单内才允许
 *   - playwright-core 用 Node.js `ws` 客户端连 CDP，**不发 Origin header**
 *   - → playwright-core 自己也被拦，`chromium.connectOverCDP()` 永远等不到 WS 握手
 *
 * Chromium 默认行为（不设 switch）：
 *   - 没 Origin header → 允许（playwright-core 这种 cli 工具走这条）
 *   - 有 Origin 且不是 localhost → 拒绝（BOSS / 智联等页面 JS 探测走这条）
 *     并打 ERROR 日志：
 *       "Rejected an incoming WebSocket connection from the https://www.zhipin.com origin"
 *
 * 这个 reject 是好事（防反爬），但 BOSS 拿到的是"连接失败"信号，依然能反推
 * "页面跑在被远程调试的 Chromium 里"，触发风控。短期接受这条日志，
 * 专注业务行为伪装；长期可考虑 `--remote-debugging-port=0` 随机端口 +
 * 通过 CDP devtools page list API 拿到真实端口给 playwright（避开端口探测）。
 */
import {
  loadStoredLauncherData,
  persistDeepLinkPayload,
  clearStoredLauncherData
} from './util/launcherStore'
import { parseDeepLink, isPayloadFresh, type ParsedDeepLink } from './util/deepLinkCodec'
import { startProbeServer, setHomeWebContentsForProbe } from './probeServer'

/**
 * 远端 SPA 部署地址。
 *   - release 包（productName="i快招"）        → https://login.ihire365.com  生产
 *   - QA2 包  （productName="i快招 QA2"）      → https://test.ihire365.com   测试
 *
 * 通过 electron-builder 的 productName / appId 区分（无需 build 时注入额外 env）。
 */
const PROD_TARGET_URL_RELEASE = 'https://login.ihire365.com'
const PROD_TARGET_URL_QA2 = 'https://test.ihire365.com'

const DEEP_LINK_PROTOCOL = 'ikuaizhao'

/**
 * 主窗口（"壳层"）的标题。
 * 自绘标题栏后系统标题不再可见，但保留以便 macOS 任务管理器 / Win 任务栏 hover 提示
 *
 * ⚠️ 关于"为什么 dev 模式下系统弹窗仍然显示 Electron"：
 *   - macOS LaunchServices 在 deep link 唤起时弹的对话框、dock 图标的应用名，
 *     都是基于 .app bundle 的 Info.plist 的 CFBundleName 决定的；dev 模式下跑的是
 *     node_modules/electron/dist/Electron.app，里面写的就是 "Electron"。
 *   - 打包后 electron-builder 会用 yml 里的 productName（i快招）写新的 Info.plist，
 *     系统弹窗 / dock 自动变成 "要打开 i快招 吗？" 和 "i快招" 图标。
 *   - 不要在 dev 模式 app.setName('i快招')！这会改 userData 路径，
 *     导致所有 partition cookie 失效（用户重新登录所有招聘站）。
 */
const WINDOW_TITLE = 'i快招 - 智能招聘助手'

/**
 * 主页 tab 加载哪个地址：
 *   1. dev 模式 + DEV_TARGET_URL env 优先（dev:el:local 用，指向本地 quasar dev）
 *   2. 按 app.getName()（= electron-builder.yml 的 productName）区分发版渠道：
 *        - "i快招"     → release  → https://login.ihire365.com
 *        - "i快招 QA2" → qa2      → https://test.ihire365.com
 *   3. 兜底 → release 域名
 *
 * 这样 QA2 客户端启动后自动加载 test 环境的 SPA，跟它的 ClientLauncher / 自动更新地址
 * （ikuaizhao-qa2/ 桶）保持环境一致。
 */
function resolveTargetUrl(): string {
  if (is.dev && process.env.DEV_TARGET_URL) {
    return process.env.DEV_TARGET_URL
  }
  // 按 productName 区分发版渠道
  let appName = ''
  try {
    appName = app.getName() || ''
  } catch {
    /* app 在某些早期 hook 里可能不可用，silent fallback */
  }
  if (/qa2/i.test(appName)) {
    return PROD_TARGET_URL_QA2
  }
  return PROD_TARGET_URL_RELEASE
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
 *
 * 设计原则：
 *   - 客户端冷启动时用户尚未登录，所有 intent 都必须先经过 /sso-login 完成 SSO
 *   - SSO 成功后 SPA `router.push('/')` 进主页
 *   - 主页 / 业务模块从 sessionStorage('ikuaizhao:initPayload') 取 payload，
 *     根据 payload.intent 字段（或 payload.action）分发到具体业务（导入简历 / 打开聊天 / ...）
 *
 * 因此本函数当前仅区分"已知 vs 未知"——已知 action 一律走 /sso-login，
 * 未知 action 返回 null（main/index.ts 走默认主页加载逻辑）。
 */
const KNOWN_ACTIONS = new Set(['sso', 'open-chat', 'import-resume'])

function pathForAction(action: string): string | null {
  if (KNOWN_ACTIONS.has(action)) {
    return '/sso-login'
  }
  return null
}

let mainWindow: BrowserWindow | null = null

// =============== Deep Link 处理 ===============

/**
 * 主进程缓存的"待消费 deep link"。
 * - 冷启动时被 deep link 唤起（macOS 走 open-url 事件、Windows/Linux 走 process.argv），
 *   主页 tab 还没就绪 → 缓存到这里，渲染端 ready 后调 handover:getPending 取。
 * - 已运行中收到新 deep link → 立即推送 'app:deep-link' 事件给主页 tab。
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
 * 关键：根据 action 强制把【主页 tab】 navigate 到对应 SPA 路由（不是壳层主窗口！），
 * 这样 SSOLogin.vue onMounted 时能通过 handover.getPendingPayload 取到 payload 接管业务。
 */
function handleDeepLink(url: string): void {
  const parsed = parseDeepLink(url)
  if (!parsed) {
    console.warn('[main] handleDeepLink: failed to parse url:', url)
    return
  }
  console.log('[main] deep link received:', parsed.action, 'v=' + parsed.version)

  // 把 launcher 探测到的 i 人事父页 origin 透传给 ihrBridge
  // 让"加入人才库/分配职位"等业务请求走对应环境（qa2 / vip / 私有部署 manage 域）
  const ihrManageUrl = (parsed.payload as { ihrManageUrl?: unknown })?.ihrManageUrl
  if (typeof ihrManageUrl === 'string' && ihrManageUrl) {
    setManageUrl(ihrManageUrl)
  }

  // 把 launcher 调 client/launch 拿到的 accessToken 注入 ihrBridge
  // 所有 /candidate/AiManager/client/noauth/** 业务调用都会自动拼 ?accessToken=...
  // 详见 docs/07-ihr-client-usage.md
  const accessToken = (parsed.payload as { accessToken?: unknown })?.accessToken
  if (typeof accessToken === 'string' && accessToken) {
    const accessTokenExpireAt = (parsed.payload as { accessTokenExpireAt?: unknown })
      ?.accessTokenExpireAt
    setAccessToken(
      accessToken,
      typeof accessTokenExpireAt === 'string' || typeof accessTokenExpireAt === 'number'
        ? accessTokenExpireAt
        : null
    )
  }

  // 把 launcher 拿到的 manage cookie 字符串写入 partition（兜底，仅用于非 noauth 接口）
  // （前提：i 人事 manage 父页的非 HttpOnly cookie 通过 postMessage 推给了 launcher）
  const manageCookies = (parsed.payload as { manageCookies?: unknown })?.manageCookies
  if (typeof manageCookies === 'string' && manageCookies) {
    void syncCookiesFromLauncher(manageCookies).then((res) => {
      console.log(`[main] syncCookiesFromLauncher: ok=${res.ok} written=${res.written}`)
    })
  }

  // 把整个 deep link payload 持久化到磁盘
  // 下次用户直接启动客户端（不走 deep link）时，业务侧可通过 launcher:getStoredPayload IPC 兜底拿数据
  try {
    persistDeepLinkPayload(parsed.payload as Record<string, unknown>)
  } catch (e) {
    console.warn('[main] persist launcher payload failed:', e)
  }

  rememberPendingDeepLink(parsed)

  if (!mainWindow || mainWindow.isDestroyed()) {
    // 主窗口还没创建（冷启动）：payload 已缓存，等 createMainWindow → createHomeTab 时根据
    // pendingDeepLink 决定加载 /sso-login，SSOLogin.vue onMounted 会主动调 getPending 取走
    return
  }

  const homeTabId = tabManager.getHomeTabId()
  const homeWc = tabManager.getHomeWebContents()
  if (!homeTabId || !homeWc || homeWc.isDestroyed()) return

  // 切到主页 tab
  tabManager.activate(homeTabId)

  // 根据 action 决定 navigate 还是只发事件给主页 tab 的渲染端
  const path = pathForAction(parsed.action)
  if (path) {
    const fullUrl = joinPath(resolveTargetUrl(), path)
    const currentUrl = homeWc.getURL()
    const onTargetPath = currentUrl.includes(path)
    if (!onTargetPath) {
      console.log('[main] navigating home tab to', fullUrl)
      tabManager.navigate(homeTabId, fullUrl)
      // SSOLogin.vue onMounted 时会读 pendingDeepLink，不需要额外 send 事件
    } else {
      // 已在 SSO 页面 → 直接推送事件让 SSOLogin onDeepLink 监听器响应
      homeWc.send('app:deep-link', parsed)
      pendingDeepLink = null
    }
  } else {
    homeWc.send('app:deep-link', parsed)
    pendingDeepLink = null
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * 协议注册：让操作系统知道 ikuaizhao:// 由本应用处理
 *
 * ⚠️ 关于 dev 模式：
 *   `electron-vite dev` 跑的是 node_modules/electron/dist/Electron.app（裸 Electron），
 *   如果调用 setAsDefaultProtocolClient(scheme, execPath, [argv[1]])，会把
 *   ikuaizhao:// 协议在 macOS LaunchServices 数据库里**永久绑定**到 node_modules
 *   下那个 Electron.app（bundle id = com.github.Electron，CFBundleName = "Electron"）。
 *
 *   后果：
 *     - dev 进程退出后注册依然在
 *     - 用户已安装的正式 i快招.app **未运行**时，浏览器再触发 ikuaizhao:// 会弹
 *       「要打开 Electron 吗？」并启动 node_modules 里的裸 Electron demo
 *     - 安装的 i快招.app 运行时表现正常（macOS 把 URL 路由给运行中的实例）
 *
 *   所以 dev 模式下默认**不注册**全局协议，避免污染 LSDB。
 *   如果开发者确实需要在 dev 下测试 deep link 唤起，设 DEV_REGISTER_PROTOCOL=1。
 *   生产打包后由 electron-builder 通过 Info.plist 的 CFBundleURLTypes 自动注册，
 *   不会走这条路径，is.dev 始终是 false。
 */
function registerProtocolClient(): void {
  if (is.dev) {
    if (process.env.DEV_REGISTER_PROTOCOL !== '1') {
      console.log(
        `[main] dev mode: skip setAsDefaultProtocolClient('${DEEP_LINK_PROTOCOL}') ` +
          `to avoid polluting macOS LaunchServices with node_modules/electron/dist/Electron.app. ` +
          `Set DEV_REGISTER_PROTOCOL=1 to enable.`
      )
      return
    }
    console.warn(
      `[main] dev mode + DEV_REGISTER_PROTOCOL=1: registering ${DEEP_LINK_PROTOCOL}:// to ` +
        `${process.execPath}. ` +
        `This will override the installed i快招.app's protocol registration on macOS. ` +
        `Run 'npm run reset-protocol' (or the lsregister command in docs) after dev exits to clean up.`
    )
  }

  if (process.defaultApp) {
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

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', (_event, argv) => {
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

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// =============== 主窗口（壳层）创建 ===============

/**
 * 创建主窗口（"浏览器外壳"）。
 *
 * 关键设计：
 *   - 主窗口的 webContents 加载内置 renderer（壳层 UI：自绘标题栏 + 标签栏）
 *   - 真实业务页面（主页 H5、招聘站点）全部走 WebContentsView 由 TabManager 管理
 *   - 不再 setWindowOpenHandler 在主窗口（壳几乎不会发起 window.open；真正的拦截在主页 tab）
 *
 * 标题栏（决策 A.a：Chrome 同款单行）：
 *   - macOS：titleBarStyle: 'hiddenInset' 保留红绿灯（系统会在窗口左上自动绘制）
 *   - Win/Linux：titleBarStyle: 'hidden' + titleBarOverlay 自绘三按钮（系统在右上 138x40 区域绘制）
 */
function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: WINDOW_TITLE,
    backgroundColor: '#171717',
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Win/Linux：让系统自绘三按钮在右上 138x40 区域，颜色与壳层标题栏一致（深色主题）
    titleBarOverlay: isMac
      ? false
      : {
          color: '#171717',
          symbolColor: '#e5e7eb',
          height: 40
        },
    ...(process.platform === 'linux' ? { icon } : {}),
    icon:
      !isMac && process.platform !== 'linux'
        ? path.join(__dirname, process.platform === 'win32' ? iconIco : icon128)
        : undefined,
    webPreferences: {
      // 壳层和主页 tab 共用同一个 preload（preload 内同时暴露 tabs / recruitBridge / handover；
      // 招聘站 tab 不挂 preload，互不干扰）
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 防止页面 <title> 覆盖窗口标题
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  if (isMac) {
    app.dock?.setIcon(icon128)
  }

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 壳层基本不会调 window.open；保险起见，全部走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    tabManager.destroyAll()
    mainWindow = null
  })

  // 加载壳层（内置 React renderer）
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 主窗口绑定到 TabManager
  tabManager.setMainWindow(mainWindow)

  // 蒙层 view 也绑定主窗口（用于跟随尺寸变化），首次 showOverlay 时才真正创建 view
  setOverlayMainWindow(mainWindow)

  // 壳层 React 加载好之后再创建主页 tab，避免太早 broadcast 状态丢失
  mainWindow.webContents.once('did-finish-load', () => {
    const baseUrl = resolveTargetUrl()
    const path = pendingDeepLink ? pathForAction(pendingDeepLink.action) : null
    const homeUrl = path ? joinPath(baseUrl, path) : baseUrl
    console.log('[main] creating home tab:', homeUrl)

    const homeTabId = tabManager.createHomeTab({
      url: homeUrl,
      preloadPath: join(__dirname, '../preload/index.js')
    })

    // 把主页 tab 的 webContents 注入 recruitBridge / probe dispatch，
    // 让 header 抓取事件、浏览器侧 POST /__ikuaizhao/dispatch 都能推到 SPA
    const homeWc = tabManager.getHomeWebContents()
    if (homeWc) {
      setHomeWebContentsForBridge(homeWc)
      setHomeWebContentsForProbe(homeWc)
    }

    // 主窗口创建之后再做 hydrate（让主页 SPA 先正常加载）
    void hydrateLoggedInSites()

    // 开发期可选开 devtools；设 OPEN_HOME_DEVTOOLS=1 才弹，默认不弹
    // （default 不弹，避免每次启动客户端都强制打开 devtools 面板）
    if (is.dev && process.env.OPEN_HOME_DEVTOOLS === '1' && homeWc && !homeWc.isDestroyed()) {
      homeWc.openDevTools({ mode: 'detach' })
    }

    void homeTabId
  })

  // 开发期为壳层也开 devtools（方便调试标签栏 UI）
  if (is.dev && process.env.OPEN_SHELL_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  return mainWindow
}

// =============== IPC handlers ===============

function registerIpc(): void {
  ipcMain.on('ping', () => console.log('pong'))

  /**
   * 渲染端启动后调用一次，取走主进程缓存的 deep link payload。
   */
  ipcMain.handle('handover:getPending', () => {
    const pending = pendingDeepLink
    pendingDeepLink = null
    return pending
  })

  // ========== Launcher 持久化数据 IPC ==========
  //
  // 用户首次通过 deep link 唤起客户端时，payload（含 ihrManageUrl / ssoConfig / sysConfig / ...）
  // 被写入 userData/launcher-data.json。
  // 下次用户直接启动客户端（双击图标，没 deep link），SPA 可以读这里兜底。

  /** 拿磁盘上持久化的整个 launcher 数据（含 ihrManageUrl + 上次 deep link payload） */
  ipcMain.handle('launcher:getStored', () => {
    try {
      return loadStoredLauncherData()
    } catch (e) {
      console.warn('[main] launcher:getStored failed:', e)
      return {}
    }
  })

  /** 清除持久化数据（用户退出登录时调） */
  ipcMain.handle('launcher:clearStored', () => {
    clearStoredLauncherData()
    return true
  })

  // ========== 标签管理 IPC ==========

  ipcMain.handle('tabs:list', () => tabManager.getTabs())

  ipcMain.handle('tabs:create', (_e, opts: { url: string; channel?: string; title?: string }) => {
    if (!opts || typeof opts.url !== 'string') return null
    const channel = opts.channel ?? pickChannelForUrl(opts.url) ?? 'unknown'
    return tabManager.openOrActivateSiteTab(channel, opts.url)
  })

  ipcMain.handle('tabs:activate', (_e, id: string) => {
    if (typeof id !== 'string') return false
    tabManager.activate(id)
    return true
  })

  ipcMain.handle('tabs:close', (_e, id: string) => {
    if (typeof id !== 'string') return false
    return tabManager.close(id)
  })

  ipcMain.handle('tabs:reorder', (_e, ids: string[]) => {
    if (!Array.isArray(ids)) return false
    tabManager.reorder(ids)
    return true
  })

  ipcMain.handle('tabs:goBack', (_e, id: string) => {
    if (typeof id !== 'string') return
    tabManager.goBack(id)
  })

  ipcMain.handle('tabs:goForward', (_e, id: string) => {
    if (typeof id !== 'string') return
    tabManager.goForward(id)
  })

  ipcMain.handle('tabs:reload', (_e, id: string) => {
    if (typeof id !== 'string') return
    tabManager.reload(id)
  })

  ipcMain.handle('tabs:loadUrl', (_e, id: string, url: string) => {
    if (typeof id !== 'string' || typeof url !== 'string' || !url) return
    tabManager.loadUrl(id, url)
  })

  // ========== Automation：隐藏 view 抓接口 ==========
  //
  // 用户不可见地起一个 BrowserWindow（show:false），加载指定页面，
  // 通过 CDP 监听某个接口 response body，拿到后立即销毁窗口。
  // 与 tab 系统完全解耦：不进 TabBar、不影响主窗口、cookie 走指定 partition。
  registerHiddenViewIpc()

  // ========== Automation：新开 tab 抓接口（用户视觉可见） ==========
  //
  // 复用现有 TabManager 创建一个真实的招聘站 tab（用户能在 TabBar 上看到，
  // 但焦点会立刻切回原来的 tab，不打断浏览）。tab 加载完成后用
  // webContents.executeJavaScript 在 tab 上下文里发 fetch 拿数据，然后关闭 tab。
  // 替代 hiddenViewRunner 的兜底方案（hidden BrowserWindow 在某些 Electron / macOS 版本下不稳）。
  registerTabFetcherIpc()

  // ========== Automation：Playwright 脚本运行时（docs/automation-protocol.md §4.5/§4.6） ==========
  //
  // vm 沙箱 + playwright-core CDP 连接，注入 page/ctx/log/sleep/jitter/AbortSignal，
  // 前端把"完整 async function body 字符串"发过来在沙箱内执行。
  registerAutomationRunnerIpc()

  // ========== siteNetworkCapture：长驻 CDP 抓包（替代 Playwright waitForResponse） ==========
  //
  // 招聘站 tab 在创建时 TabManager 已经自动 attach。这里只暴露查询接口：
  //   - waitForResponse: 等下一条匹配 URL 的响应（缓存兜底）
  //   - getLatest:        立刻取最新一条匹配的（不等）
  //   - clearCache:       清空缓存（"加载下一页前清掉旧响应"用）
  ipcMain.handle(
    'siteNetwork:waitForResponse',
    async (
      _e,
      opts: { siteKey: string; urlPattern: string; timeoutMs?: number; sinceTs?: number }
    ) => siteNetworkWait(opts)
  )
  ipcMain.handle(
    'siteNetwork:getLatest',
    async (_e, opts: { siteKey: string; urlPattern: string }) => siteNetworkGetLatest(opts)
  )
  ipcMain.handle('siteNetwork:clearCache', async (_e, siteKey: string) => {
    siteNetworkClearCache(siteKey)
    return { ok: true }
  })
  ipcMain.handle('siteNetwork:listCache', async (_e, siteKey: string) =>
    siteNetworkListCache(siteKey)
  )

  // ========== Automation：聚合搜索蒙层 ==========
  //
  // 用户启动"AI 聚合搜索"期间，把 BOSS / 智联 / 51job tab 锁住（蒙层覆盖），
  // 避免用户同步操作触发风控。蒙层是一个独立的 WebContentsView 叠在所有 tab 之上。
  // 详见 automationOverlay.ts 顶部注释。
  ipcMain.handle('automation:showOverlay', async (_e, payload: OverlayPayload) => {
    showOverlay(payload || {})
    return { ok: true }
  })
  ipcMain.handle('automation:hideOverlay', async () => {
    hideOverlay()
    return { ok: true }
  })
  ipcMain.handle('automation:isOverlayVisible', async () => isOverlayVisible())

  // ========== CDP Input dispatch：同进程 CDP 模拟点击 ==========
  //
  // 用途：在招聘站 tab 上"以用户身份"点击元素。同进程 CDP（webContents.debugger）
  // 发的 Input.dispatchMouseEvent 是 isTrusted=true 的合法事件，跟用户真实点击无差别。
  //
  // ❗❗❗ 重要：**必须**不开 `--remote-debugging-port` 启动客户端。本路径的安全前提
  // 是同进程 CDP，跟 Playwright `connectOverCDP` 完全不同。详见 docs/boss地址资料.md。
  ipcMain.handle(
    'automation:clickOnTab',
    async (
      _e,
      opts: { tabId: string; selector: string; pressHoldMs?: number; requireVisible?: boolean }
    ) => {
      if (!opts || typeof opts.tabId !== 'string' || typeof opts.selector !== 'string') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'tabId & selector required' } }
      }
      const wc = tabManager.getWebContentsById(opts.tabId)
      if (!wc) {
        return {
          ok: false,
          error: { code: 'TAB_NOT_FOUND', message: `tabId=${opts.tabId} not found` }
        }
      }
      return cdpDispatchClick(wc, opts.selector, {
        pressHoldMs: opts.pressHoldMs,
        requireVisible: opts.requireVisible
      })
    }
  )
}

// =============== App 生命周期 ===============

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ihire365.ikuaizhao')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerProtocolClient()

  // 启动 127.0.0.1:53531 health probe server，让浏览器侧（i 快招 H5 /client-launcher）
  // 能用 fetch 确定性探测客户端是否在跑，取代基于 window.blur 的启发式探测
  startProbeServer()

  // 启动时一次性给 4 个招聘站 partition 装配 webRequest 抓 header
  setupSiteSessions()

  registerRecruitBridgeIpc()

  // i 人事招聘业务桥（取代 iframe 模式下父端 React 调网关 + postMessage 推送的角色）
  registerIhrBridgeIpc()

  registerIpc()

  createMainWindow()

  // Windows / Linux 冷启动 deep link
  if (process.platform !== 'darwin') {
    const initialUrl = process.argv.find(
      (a) => typeof a === 'string' && a.startsWith(`${DEEP_LINK_PROTOCOL}://`)
    )
    if (initialUrl) {
      handleDeepLink(initialUrl)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
