/**
 * Electron 自动更新（基于 electron-updater）
 *
 * 数据流：
 *   1. 安装包发布到 publish 服务器（electron-builder.yml/qa2.yml publish.url）：
 *      - release：http://download.ihr360.com/ikuaizhao/
 *      - qa2    ：http://download.ihr360.com/ikuaizhao-qa2/
 *   2. 客户端启动后 5s 调 autoUpdater.checkForUpdates()
 *      → 读取 publish.url 下的 latest.yml / latest-mac.yml 拿到最新版本号
 *      → 跟本地 app.getVersion() 比较；版本号更高才认为有更新
 *   3. 有更新 → dialog 询问"是否现在下载"
 *   4. 下载完成 → dialog 询问"是否立刻重启安装"
 *
 * 设计要点：
 *   - autoDownload=false：检测到更新后不自动下载，让用户确认（避免占带宽）
 *   - autoInstallOnAppQuit=true：用户即便选"稍后"，也会在下次退出时安装
 *   - dev 模式也启用（用户要求方便调试）：electron-updater 在 dev 下默认读 dev-app-update.yml，
 *     如果里面 url 不可用 checkForUpdates 会失败 console.warn 但不影响主流程；
 *     要在 dev 测真实更新流程，把 dev-app-update.yml 的 url 改成本地或 qa2 publish 地址即可
 *   - 渲染层进度回调：webContents.send('autoUpdater:progress')，可选 UI 显示
 *   - IPC：renderer 主动触发检查（autoUpdater:check） / 主动下载（autoUpdater:download）
 *
 * 排错：
 *   - 看 console 日志：`[autoUpdater]` 前缀
 *   - 服务器 latest.yml 必须跟实际安装包同步（用 publish:cos:qa2 / publish:cos 脚本上传）
 *   - 改 publish.url 后必须重新打包（写进 app.asar 的 app-update.yml）
 */

import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { dialog, ipcMain, BrowserWindow } from 'electron'

let initialized = false
let _mainWindow: BrowserWindow | null = null

/**
 * 标准日志前缀，方便 console 筛选。
 *
 * ⚠️ 不用 `[autoUpdater]`：electron-updater 包内部自己也会输出含 "autoUpdater" 字样的日志，
 *   混在一起没法用关键字定位。这里用 `[AppUpdate]` + 🔄 emoji，独一无二容易搜。
 *   排错时直接 devtools console 搜 `[AppUpdate]` 能拿到全套日志。
 */
const LOG_PREFIX = '🔄 [AppUpdate]'
function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}
function warn(...args: unknown[]): void {
  console.warn(LOG_PREFIX, ...args)
}

/**
 * 给 dialog.showMessageBox 拿一个 parent window；mainWindow 可能销毁中
 */
function getDialogParent(): BrowserWindow | undefined {
  if (_mainWindow && !_mainWindow.isDestroyed()) return _mainWindow
  const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  return all[0]
}

/**
 * 安全把 update 进度推给渲染层（可选 UI 显示用）
 *
 * renderer 可以 ipcRenderer.on('autoUpdater:progress', (_, info) => { ... })
 * 接收进度对象 { percent, transferred, total, bytesPerSecond }
 */
function sendToRenderer(channel: string, payload: unknown): void {
  if (!_mainWindow || _mainWindow.isDestroyed()) return
  try {
    _mainWindow.webContents.send(channel, payload)
  } catch (e) {
    warn(`send ${channel} 失败:`, (e as Error)?.message || e)
  }
}

/**
 * 初始化自动更新（幂等，重复调用安全）。
 *
 * 调用时机：app.whenReady → createMainWindow 之后，把 mainWindow 传进来。
 *
 * @param mainWindow 用于 dialog parent + 渲染层进度回调
 */
export function setupAutoUpdater(mainWindow: BrowserWindow | null): void {
  _mainWindow = mainWindow

  if (initialized) {
    log('已初始化，跳过重复 setup')
    return
  }

  // dev 模式也开（用户要求）：electron-updater 默认读 dev-app-update.yml，
  // 如果 dev-app-update.yml 的 url 不可用，checkForUpdates 会失败 console.warn 但不影响主流程。
  // 真要在 dev 模式测试自动更新，把 dev-app-update.yml 的 url 改成本地或 qa2 publish 地址即可。
  initialized = true

  // ★ 用户体验调优：
  //   autoDownload=false → 检测到更新后**不自动下载**，先弹 dialog 让用户确认（避免后台占带宽）
  //   autoInstallOnAppQuit=true → 即使用户选"稍后"，下次退出 app 时仍会安装（不丢更新)
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // ★ dev 模式强制启用：electron-updater 内部默认有保护，dev 下 app 未打包就直接跳过
  //   checkForUpdates（日志："Skip checkForUpdates because application is not packed
  //   and dev update config is not forced"）。
  //   设 forceDevUpdateConfig=true 让它读 dev-app-update.yml 真正发请求，方便联调。
  //   生产环境这个标志没副作用（app 已打包走 app-update.yml）。
  autoUpdater.forceDevUpdateConfig = true

  // ===== 事件回调 =====

  autoUpdater.on('error', (err) => {
    warn('error:', err?.message || err)
    sendToRenderer('autoUpdater:error', { message: err?.message || String(err) })
  })

  autoUpdater.on('checking-for-update', () => {
    log('正在检查更新...')
    sendToRenderer('autoUpdater:checking', null)
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log('当前已是最新版本：', info?.version)
    sendToRenderer('autoUpdater:not-available', { version: info?.version })
  })

  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    log('检测到新版本：', info?.version, 'releaseDate=', info?.releaseDate)
    sendToRenderer('autoUpdater:available', {
      version: info?.version,
      releaseDate: info?.releaseDate,
      releaseNotes: info?.releaseNotes
    })

    const parent = getDialogParent()
    const result = await dialog.showMessageBox(parent as BrowserWindow, {
      type: 'info',
      title: '发现新版本',
      message: `检测到新版本 ${info?.version}`,
      detail: '是否现在下载更新？下载完成后会询问是否立刻安装。',
      buttons: ['立即下载', '稍后再说'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })

    if (result.response === 0) {
      log('用户确认下载，开始 downloadUpdate')
      autoUpdater.downloadUpdate().catch((e) => {
        warn('downloadUpdate 失败：', (e as Error)?.message || e)
      })
    } else {
      log('用户选择稍后，跳过本次下载（autoInstallOnAppQuit=true 下次退出仍会安装如果之前已下载）')
    }
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const pct = progress.percent?.toFixed(1) ?? '?'
    const transMb = ((progress.transferred ?? 0) / 1024 / 1024).toFixed(1)
    const totalMb = ((progress.total ?? 0) / 1024 / 1024).toFixed(1)
    const speedKbs = ((progress.bytesPerSecond ?? 0) / 1024).toFixed(1)
    log(`下载进度 ${pct}% (${transMb}/${totalMb} MB) ${speedKbs} KB/s`)
    sendToRenderer('autoUpdater:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    log('下载完成：', info?.version)
    sendToRenderer('autoUpdater:downloaded', { version: info?.version })

    const parent = getDialogParent()
    const result = await dialog.showMessageBox(parent as BrowserWindow, {
      type: 'info',
      title: '更新就绪',
      message: `新版本 ${info?.version} 已下载完成`,
      detail: '是否立刻重启应用安装更新？\n（选"稍后"将在下次退出 / 启动时自动安装）',
      buttons: ['立刻重启安装', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })

    if (result.response === 0) {
      log('用户确认立刻安装，调 quitAndInstall')
      // isSilent=false 显示安装界面（仅 Windows nsis 有效，macOS 不需要）
      // isForceRunAfter=true 安装完自动启动新版本
      autoUpdater.quitAndInstall(false, true)
    } else {
      log('用户选择稍后，autoInstallOnAppQuit=true 会在下次退出时安装')
    }
  })

  // ===== 启动时 + 定时检查 =====

  // 启动 5s 后第一次检查（避免阻塞 UI、等 mainWindow 完全 ready）
  setTimeout(() => {
    log('启动后首次检查更新...')
    autoUpdater.checkForUpdates().catch((e) => {
      warn('首次 checkForUpdates 失败：', (e as Error)?.message || e)
    })
  }, 5000)

  // 每 4 小时再查一次（适合长时间挂着的客户端，比如运维场景）
  const PERIOD_MS = 4 * 60 * 60 * 1000
  setInterval(() => {
    log('定时检查更新...')
    autoUpdater.checkForUpdates().catch((e) => {
      warn('定时 checkForUpdates 失败：', (e as Error)?.message || e)
    })
  }, PERIOD_MS)

  registerIpcHandlers()
}

/**
 * 注册 IPC：让渲染层主动触发"检查更新" / "下载" / "退出安装"
 * 用于设置页 / 菜单里加"检查更新"按钮
 */
function registerIpcHandlers(): void {
  // 幂等：重复 handle 会抛错
  try {
    ipcMain.handle('autoUpdater:check', async () => {
      log('IPC autoUpdater:check 触发')
      try {
        const res = await autoUpdater.checkForUpdates()
        return {
          ok: true,
          version: res?.updateInfo?.version,
          available: !!res?.updateInfo?.version
        }
      } catch (e) {
        return { ok: false, message: (e as Error)?.message || String(e) }
      }
    })

    ipcMain.handle('autoUpdater:download', async () => {
      log('IPC autoUpdater:download 触发')
      try {
        await autoUpdater.downloadUpdate()
        return { ok: true }
      } catch (e) {
        return { ok: false, message: (e as Error)?.message || String(e) }
      }
    })

    ipcMain.handle('autoUpdater:quitAndInstall', async () => {
      log('IPC autoUpdater:quitAndInstall 触发')
      autoUpdater.quitAndInstall(false, true)
      return { ok: true }
    })
  } catch (e) {
    warn('registerIpcHandlers 失败（可能重复注册）：', (e as Error)?.message || e)
  }
}
