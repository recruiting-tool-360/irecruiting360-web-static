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
 *   3. 有更新 → **只 send IPC 事件**，弹框由 renderer UpdateModal.vue 接管
 *   4. 下载进度 / 完成同上：全部走 IPC，主进程不弹任何 dialog
 *
 * ⚠️ 设计变更（2026-05）：
 *   - **不再用 Electron dialog.showMessageBox 弹原生对话框**
 *   - 所有 UI 全部由 renderer (src/components/clients/UpdateModal.vue) 实现
 *   - 主进程仅负责：检测 / 下载 / 进度推送 / 安装；UI 状态机 100% 在 renderer
 *   - 这样 UI 可以跟 ihraisaas 设计 1:1 对齐（圆角卡片、三阶段切换、品牌色等）
 *
 * 设计要点：
 *   - autoDownload=false：检测到更新后不自动下载，等用户在 UpdateModal 点"立即更新"
 *   - autoInstallOnAppQuit=true：用户即便选"稍后"，也会在下次退出时安装
 *   - dev 模式也启用（用户要求方便调试）：electron-updater 在 dev 下默认读 dev-app-update.yml，
 *     如果里面 url 不可用 checkForUpdates 会失败 console.warn 但不影响主流程；
 *     要在 dev 测真实更新流程，把 dev-app-update.yml 的 url 改成本地或 qa2 publish 地址即可
 *   - lastUpdateInfo 缓存：renderer 可能晚于首次 update-available 事件 mount，
 *     提供 `autoUpdater:getStatus` IPC 让其首屏 hydrate 出"立即更新"提示
 *   - IPC：renderer 主动触发检查（autoUpdater:check） / 主动下载（autoUpdater:download）
 *         / 退出安装（autoUpdater:quitAndInstall）/ 拉一次状态（autoUpdater:getStatus）
 *
 * 排错：
 *   - 看 console 日志：`🔄 [AppUpdate]` 前缀
 *   - 服务器 latest.yml 必须跟实际安装包同步（用 publish:cos:qa2 / publish:cos 脚本上传）
 *   - 改 publish.url 后必须重新打包（写进 app.asar 的 app-update.yml）
 */

import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { app, ipcMain, shell, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

let initialized = false

/**
 * UpdateModal 在 renderer 任何时刻 mount 都能 getStatus 拉到当前状态
 * 字段语义：
 *   - phase='idle'：还没 check 过 / 上一次 check 无更新
 *   - phase='available'：检测到新版本但还没开始下载
 *   - phase='downloading'：用户已点"立即更新"，正在下载
 *   - phase='downloaded'：下载完成，等用户确认重启安装
 *   - phase='error'：上一次操作失败（error 字段拿到 message）
 *   - phase='unsignedFallback'：自动安装失败（典型场景：nosign 测试包 / 证书过期 / Windows
 *     SmartScreen 拦截）→ 提示用户在系统浏览器中下载安装包手动安装。
 *     downloadUrl 字段会指向完整下载 URL，renderer 调 openDownloadInBrowser 让 shell 拉起。
 */
interface UpdateStatus {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsignedFallback'
  currentVersion: string
  newVersion: string | null
  releaseDate?: string | null
  releaseNotes?: string | null
  progress: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  } | null
  error: string | null
  /** 当前可用更新的完整下载 URL（拼好 base + filename）—— 给签名失败 fallback 用 */
  downloadUrl: string | null
}

const lastStatus: UpdateStatus = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  newVersion: null,
  releaseDate: null,
  releaseNotes: null,
  progress: null,
  error: null,
  downloadUrl: null
}

/**
 * 读 app-update.yml（生产）/ dev-app-update.yml（dev）拿 publish.url
 *
 * 用于在签名失败时拼完整下载 URL（base + files[0].url）让用户在浏览器下载手动安装。
 * 不引入 js-yaml 依赖，用简单正则提取 url 字段（足够稳定，yml 结构就这样）。
 */
function readPublishBaseUrl(): string | null {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'app-update.yml'))
  } else {
    // dev: electron-vite 跑的目录结构里 dev-app-update.yml 在 electron/
    candidates.push(join(app.getAppPath(), 'dev-app-update.yml'))
    candidates.push(join(process.cwd(), 'electron/dev-app-update.yml'))
  }
  for (const p of candidates) {
    try {
      const content = readFileSync(p, 'utf-8')
      const m = content.match(/^\s*url\s*:\s*['"]?([^'"\n\r]+)/m)
      if (m?.[1]) {
        let u = m[1].trim()
        if (!u.endsWith('/')) u += '/'
        return u
      }
    } catch (_e) {
      /* 文件不存在 / 读不到，下个候选 */
    }
  }
  return null
}

/**
 * 判断 error.message 是不是签名校验失败（nosign 包 / 证书坏 / Win SmartScreen 等场景）。
 * electron-updater 各平台错误文案不一样，这里覆盖主要 case：
 *
 *   macOS：'Code signature at URL ... did not pass validation: 代码未能满足指定的代码要求'
 *   Windows：'New version X.X.X is not signed by the application owner: publisherNames: ...'
 *           （也可能是 'SignatureNotValid' / 'PublisherDoesNotMatch'）
 *   通用：含 'signature' / 'signed' / 'publisher' 关键字
 */
function isSignatureError(msg: string): boolean {
  const m = String(msg || '').toLowerCase()
  return (
    // macOS 标志性文案
    m.includes('code signature') ||
    m.includes('did not pass validation') ||
    // Windows electron-updater 标志性文案（含完整 raw info + cert chain）
    m.includes('publishernames') ||
    m.includes('is not signed by the application owner') ||
    m.includes('signaturenotvalid') ||
    m.includes('publisherdoesnotmatch') ||
    // 通用兜底
    m.includes('not signed') ||
    (m.includes('signature') && (m.includes('invalid') || m.includes('fail')))
  )
}

/**
 * 把 UpdateInfo 里的相对 url 拼成完整下载 URL
 * 优先级：
 *   1. files[0].url 已经是绝对 URL → 直接用
 *   2. 拼 publishBaseUrl + files[0].url
 */
function buildFullDownloadUrl(info: UpdateInfo): string | null {
  const file = info?.files?.[0] || (info?.path ? { url: info.path } : null)
  const relUrl = file?.url
  if (!relUrl) return null
  if (/^https?:\/\//i.test(relUrl)) return relUrl
  const base = readPublishBaseUrl()
  if (!base) return null
  try {
    return new URL(relUrl, base).toString()
  } catch (_e) {
    return base + relUrl
  }
}

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
 * 安全把 update 事件推给渲染层（UpdateModal.vue 监听）。
 *
 * ⚠️ 不用 `_mainWindow.webContents.send` 单点推送，因为：
 *   - dev 模式 hot reload 后，`_mainWindow` 引用可能 stale（旧 webContents 已被替换）
 *   - 此时 `isDestroyed()` 仍返回 false，但 send 是 silent no-op，**没人收得到**
 * 改用 `BrowserWindow.getAllWindows()` broadcast：i快招主进程同时只有一个 BrowserWindow
 *   （招聘 tab 走的是 WebContentsView，不在 getAllWindows 里），所以广播 = 推送主窗口。
 *
 * renderer 可以 ipcRenderer.on('autoUpdater:progress', (_, info) => { ... })
 * 也可以走 preload bridge：window.api.appUpdater.on('progress', cb)
 */
function sendToRenderer(channel: string, payload: unknown): void {
  const wins = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && !w.webContents.isDestroyed()
  )
  if (wins.length === 0) {
    warn(`send ${channel}: 没有活跃 BrowserWindow，丢弃`)
    return
  }
  for (const w of wins) {
    try {
      w.webContents.send(channel, payload)
    } catch (e) {
      warn(`send ${channel} 失败:`, (e as Error)?.message || e)
    }
  }
}

/**
 * 初始化自动更新（幂等，重复调用安全）。
 *
 * 调用时机：app.whenReady → createMainWindow 之后，把 mainWindow 传进来。
 *
 * @param _mainWindow 兼容老调用方传参；本模块内部用 BrowserWindow.getAllWindows() broadcast，
 *   不再依赖单一 window 引用（解决 dev hot reload _mainWindow 引用 stale → send silent fail）
 */
export function setupAutoUpdater(_mainWindow: BrowserWindow | null): void {
  if (initialized) {
    log('已初始化，跳过重复 setup')
    return
  }

  // dev 模式也开（用户要求）：electron-updater 默认读 dev-app-update.yml，
  // 如果 dev-app-update.yml 的 url 不可用，checkForUpdates 会失败 console.warn 但不影响主流程。
  // 真要在 dev 模式测试自动更新，把 dev-app-update.yml 的 url 改成本地或 qa2 publish 地址即可。
  initialized = true

  // ★ 用户体验调优：
  //   autoDownload=false → 检测到更新后**不自动下载**，等 renderer UpdateModal 用户点"立即更新"才下载
  //   autoInstallOnAppQuit=true → 即使用户选"稍后"，下次退出 app 时仍会安装（不丢更新)
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // ★ dev 模式强制启用：electron-updater 内部默认有保护，dev 下 app 未打包就直接跳过
  //   checkForUpdates（日志："Skip checkForUpdates because application is not packed
  //   and dev update config is not forced"）。
  //   设 forceDevUpdateConfig=true 让它读 dev-app-update.yml 真正发请求，方便联调。
  //   生产环境这个标志没副作用（app 已打包走 app-update.yml）。
  autoUpdater.forceDevUpdateConfig = true

  // ===== 事件回调（仅 IPC，全部 UI 交给 renderer UpdateModal.vue）=====

  autoUpdater.on('error', (err) => {
    const msg = err?.message || String(err)
    warn('error:', msg)
    lastStatus.error = msg

    // ★ 签名校验失败 fallback：典型场景是 nosign 测试包 / 证书过期 / 平台拦截。
    //   不让用户卡在"下载完成但无法安装"，提供"浏览器手动下载"路径让用户继续推进。
    //   renderer UpdateModal 会切到 'unsigned-fallback' stage 显示对应 UI。
    if (isSignatureError(msg) && lastStatus.downloadUrl) {
      lastStatus.phase = 'unsignedFallback'
      log('签名校验失败，转 fallback 流 → 提示用户在浏览器下载手动安装：', lastStatus.downloadUrl)
      sendToRenderer('autoUpdater:unsigned-fallback', {
        message: msg,
        downloadUrl: lastStatus.downloadUrl,
        version: lastStatus.newVersion
      })
      return
    }

    lastStatus.phase = 'error'
    sendToRenderer('autoUpdater:error', { message: msg })
  })

  autoUpdater.on('checking-for-update', () => {
    log('正在检查更新...')
    lastStatus.phase = 'checking'
    lastStatus.error = null
    sendToRenderer('autoUpdater:checking', null)
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log('当前已是最新版本：', info?.version)
    lastStatus.phase = 'idle'
    lastStatus.newVersion = null
    sendToRenderer('autoUpdater:not-available', { version: info?.version })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log('检测到新版本：', info?.version, 'releaseDate=', info?.releaseDate)
    lastStatus.phase = 'available'
    lastStatus.newVersion = info?.version || null
    lastStatus.releaseDate = info?.releaseDate || null
    lastStatus.releaseNotes = (info?.releaseNotes as string) || null
    lastStatus.progress = null
    lastStatus.error = null
    // ★ 拼完整下载 URL，存到 lastStatus 供 fallback 流（签名失败时）+ renderer 状态查询用
    lastStatus.downloadUrl = buildFullDownloadUrl(info)
    log('下载 URL（备用）:', lastStatus.downloadUrl)
    sendToRenderer('autoUpdater:available', {
      version: info?.version,
      releaseDate: info?.releaseDate,
      releaseNotes: info?.releaseNotes,
      downloadUrl: lastStatus.downloadUrl
    })
    // ★ 不再 dialog.showMessageBox：等 renderer UpdateModal.vue 自己根据
    //   `available` 事件 / `getStatus` 拉取来决定何时显示弹框（点击 LeftMenu 「立即更新」
    //   或主进程"首次发现"也可以让 renderer 自动弹一次 —— 都在 renderer 控制）。
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const pct = progress.percent?.toFixed(1) ?? '?'
    const transMb = ((progress.transferred ?? 0) / 1024 / 1024).toFixed(1)
    const totalMb = ((progress.total ?? 0) / 1024 / 1024).toFixed(1)
    const speedKbs = ((progress.bytesPerSecond ?? 0) / 1024).toFixed(1)
    log(`下载进度 ${pct}% (${transMb}/${totalMb} MB) ${speedKbs} KB/s`)
    lastStatus.phase = 'downloading'
    lastStatus.progress = {
      percent: progress.percent ?? 0,
      transferred: progress.transferred ?? 0,
      total: progress.total ?? 0,
      bytesPerSecond: progress.bytesPerSecond ?? 0
    }
    sendToRenderer('autoUpdater:progress', lastStatus.progress)
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log('下载完成：', info?.version, '— 等 renderer 触发 quitAndInstall')
    lastStatus.phase = 'downloaded'
    lastStatus.newVersion = info?.version || lastStatus.newVersion
    sendToRenderer('autoUpdater:downloaded', { version: info?.version })
    // ★ 不再 dialog.showMessageBox：renderer UpdateModal 在 completed 阶段自动延时
    //   调 window.api.appUpdater.quitAndInstall()
    //   若用户关闭 modal 不点确认 → autoInstallOnAppQuit=true 兜底，下次退出仍会装。
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
        // checkForUpdates 内部会同步派发 update-available / update-not-available 事件，
        // 等 promise resolve 时 lastStatus.phase 已是最新。
        await autoUpdater.checkForUpdates()
        const available =
          lastStatus.phase === 'available' ||
          lastStatus.phase === 'downloading' ||
          lastStatus.phase === 'downloaded'
        return {
          ok: true,
          version: lastStatus.newVersion ?? undefined,
          currentVersion: lastStatus.currentVersion,
          available
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

    ipcMain.handle(
      'autoUpdater:quitAndInstall',
      async (): Promise<{ ok: boolean; devMode?: boolean; message?: string }> => {
        log('IPC autoUpdater:quitAndInstall 触发')
        // ⚠️ dev 模式下 electron-updater 的 quitAndInstall 不会真正退出 / 安装：
        //   - 没有 packaged installer 路径
        //   - 内部会 silent skip，导致 renderer UpdateModal 卡在 completed
        // fallback：直接 app.quit() 让你看到 dev 关闭效果。生产包走正常 quitAndInstall。
        if (!app.isPackaged) {
          warn(
            'dev 模式：quitAndInstall 不会真正安装（没有 packaged installer）。仅 app.quit() 模拟关闭效果。'
          )
          // setImmediate 让 ipcMain.handle 先 return（renderer 收到 ok 后再 quit）
          setImmediate(() => {
            log('dev 模式：调用 app.quit()')
            app.quit()
          })
          return {
            ok: true,
            devMode: true,
            message: 'dev 模式仅 app.quit()，不会执行安装。请在 production 包测试真实更新流程。'
          }
        }
        // 生产包：正常 quit + install + auto run new version
        //   isSilent=false：Windows nsis 显示安装界面；macOS 不影响
        //   isForceRunAfter=true：安装完自动启动新版本
        autoUpdater.quitAndInstall(false, true)
        return { ok: true }
      }
    )

    /**
     * 一次性拉当前状态（renderer UpdateModal mount 时调）
     * 解决 renderer 晚于首次 `update-available` 事件 mount 错过事件的问题。
     */
    ipcMain.handle('autoUpdater:getStatus', async (): Promise<UpdateStatus> => {
      return { ...lastStatus }
    })

    /**
     * fallback 流：在系统浏览器打开下载 URL，让用户手动下载安装包。
     *
     * 触发场景（renderer 调）：
     *   - phase='unsignedFallback' 时 UpdateModal 显示"在浏览器下载"按钮
     *   - 任何 phase 用户主动想用浏览器下载也可调（设置页/手动入口）
     *
     * 返回：{ ok: boolean, url?: string, message?: string }
     */
    ipcMain.handle(
      'autoUpdater:openDownloadInBrowser',
      async (): Promise<{ ok: boolean; url?: string; message?: string }> => {
        const url = lastStatus.downloadUrl
        if (!url) {
          warn('openDownloadInBrowser: 没有可用的 downloadUrl（可能还没检测到更新）')
          return { ok: false, message: '没有可用的下载链接，请先检查更新' }
        }
        try {
          await shell.openExternal(url)
          log('已在系统浏览器中打开下载链接：', url)
          return { ok: true, url }
        } catch (e) {
          warn('openDownloadInBrowser 失败：', (e as Error)?.message || e)
          return { ok: false, message: (e as Error)?.message || String(e), url }
        }
      }
    )

    /**
     * ★ 仅获取客户端版本号（不发网络请求，立刻返回）。
     *
     * 设计意图：让 renderer 启动时立刻拿到客户端版本号显示在 UI 上，
     * 不需要等 checkUpdate 网络请求回来。前端调用方代码读着自然：
     *   const ver = await window.api.appUpdater.getCurrentVersion()
     */
    ipcMain.handle('autoUpdater:getCurrentVersion', (): string => {
      return app.getVersion()
    })

    /**
     * ★ 主动检查更新（发网络请求拉 latest.yml 对比版本）。
     *
     * 比 `autoUpdater:check` 语义更清晰：明确告诉调用方"是否有新版本可用"。
     * 用法：
     *   const r = await window.api.appUpdater.checkUpdate()
     *   if (r.hasUpdate) {
     *     // 显示"立即更新"按钮，弹 UpdateModal
     *   } else {
     *     // 显示"最新版本"
     *   }
     *
     * 内部依赖 checkForUpdates → 等事件 emit 完成 → 用 lastStatus 组装语义化结果，
     * 所以 hasUpdate 准确（不会把 "服务器最新版本 == 本地版本" 误判为有更新）。
     */
    ipcMain.handle(
      'autoUpdater:checkUpdate',
      async (): Promise<{
        hasUpdate: boolean
        currentVersion: string
        newVersion?: string
        releaseDate?: string
        releaseNotes?: string
        error?: string
      }> => {
        log('IPC autoUpdater:checkUpdate 触发')
        try {
          await autoUpdater.checkForUpdates()
          const hasUpdate =
            lastStatus.phase === 'available' ||
            lastStatus.phase === 'downloading' ||
            lastStatus.phase === 'downloaded'
          return {
            hasUpdate,
            currentVersion: lastStatus.currentVersion,
            newVersion: lastStatus.newVersion ?? undefined,
            releaseDate: lastStatus.releaseDate ?? undefined,
            releaseNotes: (lastStatus.releaseNotes as string) ?? undefined
          }
        } catch (e) {
          const msg = (e as Error)?.message || String(e)
          warn('checkUpdate 失败:', msg)
          return {
            hasUpdate: false,
            currentVersion: lastStatus.currentVersion,
            error: msg
          }
        }
      }
    )
  } catch (e) {
    warn('registerIpcHandlers 失败（可能重复注册）：', (e as Error)?.message || e)
  }
}
