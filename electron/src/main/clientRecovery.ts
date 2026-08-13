/**
 * i快招主页启动健康检测与本地数据自愈。
 *
 * 背景：Chromium 在关机 / 异常退出后，HTTP Cache、Code Cache、Service Worker Cache，
 * 甚至 persist:ihr360-main 分区本身都可能损坏。表现为主窗口能创建，但主页长期白屏；
 * 卸载重装默认不会删除 userData，所以问题会一直保留。
 *
 * 恢复分两级：
 *   1. 自动清理可再生缓存并 reload，保留 Cookie / Local Storage / IndexedDB；
 *   2. 仍未就绪时由用户确认，给 ihr360-main 分区做时间戳备份并重启重建。
 *
 * BOSS 等招聘渠道使用独立 partition，第二级恢复不会动它们的 Cookie；
 * launcher-data.json 也位于 userData 根目录，不在 ihr360-main 分区内。
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type MessageBoxOptions,
  type WebContents
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const HOME_PARTITION_DIR_NAME = 'ihr360-main'
const PENDING_FILE_NAME = 'client-recovery-pending.json'
const LAST_RESULT_FILE_NAME = 'client-recovery-last.json'
const HOME_READY_TIMEOUT_MS = 30_000

interface PendingRecovery {
  requestedAt: number
  reason: string
}

interface RecoveryResult {
  attemptedAt: number
  ok: boolean
  reason: string
  sourcePath: string
  backupPath?: string
  error?: string
}

let mainWindowRef: BrowserWindow | null = null
let homeWcRef: WebContents | null = null
let readyTimer: ReturnType<typeof setTimeout> | null = null
let safeRecoveryAttempted = false
let recoveryInProgress = false
let promptShown = false
let ipcRegistered = false
let homeReady = false
let appQuitting = false

function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name)
}

function homePartitionPath(): string {
  // persist:<name> 在 Electron 中固定落到 userData/Partitions/<name>。
  return path.join(app.getPath('userData'), 'Partitions', HOME_PARTITION_DIR_NAME)
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

function clearReadyTimer(): void {
  if (!readyTimer) return
  clearTimeout(readyTimer)
  readyTimer = null
}

function armReadyTimer(reason: string): void {
  clearReadyTimer()
  readyTimer = setTimeout(() => {
    readyTimer = null
    void handleHomeStartupFailure(`READY_TIMEOUT:${reason}`)
  }, HOME_READY_TIMEOUT_MS)
}

function isCurrentHomeSender(sender: WebContents): boolean {
  return !!homeWcRef && !homeWcRef.isDestroyed() && sender.id === homeWcRef.id
}

function markHomeReady(source: 'renderer-ipc' | 'dom-probe'): void {
  clearReadyTimer()
  recoveryInProgress = false
  safeRecoveryAttempted = false
  promptShown = false
  homeReady = true
  console.log(`[clientRecovery] home renderer ready (${source})`)
}

/**
 * 兼容桌面包先发布、线上 SPA 尚未带 ready IPC 的短暂版本差：
 * did-finish-load 后主动确认 Quasar 根节点已有真实内容。空白 #q-app 不算成功。
 */
async function probeRenderedHomeDom(wc: WebContents): Promise<void> {
  try {
    const rendered = (await wc.executeJavaScript(
      `(function () {
        var root = document.querySelector('#q-app');
        if (!root || root.childElementCount === 0) return false;
        var rect = root.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })()`,
      true
    )) as boolean
    if (rendered && homeWcRef === wc && !wc.isDestroyed()) markHomeReady('dom-probe')
  } catch (error) {
    console.warn(
      '[clientRecovery] home DOM probe failed:',
      error instanceof Error ? error.message : error
    )
  }
}

async function clearRegenerableHomeData(wc: WebContents): Promise<void> {
  const ses = wc.session
  const results = await Promise.allSettled([
    ses.clearCache(),
    ses.clearCodeCaches({}),
    ses.clearStorageData({
      // 明确保留 cookies / localstorage / indexdb，避免自动恢复让用户退出登录或丢业务缓存。
      storages: ['shadercache', 'serviceworkers', 'cachestorage']
    })
  ])
  const failed = results.filter((item) => item.status === 'rejected')
  if (failed.length > 0) {
    console.warn(`[clientRecovery] safe cache clear partially failed (${failed.length}/3)`)
  }
}

async function promptForPartitionRecovery(reason: string): Promise<void> {
  if (promptShown) return
  promptShown = true
  clearReadyTimer()

  const win = mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : undefined
  const options: MessageBoxOptions = {
    type: 'warning',
    title: '修复 i快招',
    message: '客户端页面启动异常',
    detail:
      '已尝试清理安全缓存，但页面仍未正常启动。是否备份并重建 i快招主页数据？\n\n' +
      '该操作会重置客户端主页的本地状态，但会保留 BOSS 等招聘渠道的登录信息。',
    buttons: ['修复并重启', '暂不处理'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }
  const result = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)

  if (result.response !== 0) {
    console.warn(`[clientRecovery] user postponed partition recovery, reason=${reason}`)
    return
  }

  const pending: PendingRecovery = { requestedAt: Date.now(), reason }
  try {
    writeJson(userDataFile(PENDING_FILE_NAME), pending)
  } catch (error) {
    promptShown = false
    const message = error instanceof Error ? error.message : String(error)
    console.error('[clientRecovery] write pending marker failed:', message)
    const errorOptions: MessageBoxOptions = {
      type: 'error',
      title: '修复失败',
      message: '无法准备客户端修复',
      detail: `请完全退出客户端后重试。\n\n${message}`,
      buttons: ['知道了']
    }
    if (win) await dialog.showMessageBox(win, errorOptions)
    else await dialog.showMessageBox(errorOptions)
    return
  }

  console.warn(`[clientRecovery] relaunch requested for home partition recovery: ${reason}`)
  app.relaunch()
  app.exit(0)
}

async function handleHomeStartupFailure(reason: string): Promise<void> {
  if (appQuitting || recoveryInProgress) return
  const wc = homeWcRef
  if (!wc || wc.isDestroyed()) return
  homeReady = false

  if (safeRecoveryAttempted) {
    await promptForPartitionRecovery(reason)
    return
  }

  safeRecoveryAttempted = true
  recoveryInProgress = true
  clearReadyTimer()
  console.warn(`[clientRecovery] home not ready, clearing regenerable caches: ${reason}`)
  try {
    await clearRegenerableHomeData(wc)
  } catch (error) {
    console.warn(
      '[clientRecovery] safe recovery failed (will still reload):',
      error instanceof Error ? error.message : error
    )
  } finally {
    recoveryInProgress = false
  }

  if (wc.isDestroyed()) return
  // 缓存清理期间页面可能已经自行恢复并完成 Vue 挂载，此时不再打断用户强制 reload。
  if (homeReady) return
  armReadyTimer('after-safe-cache-recovery')
  try {
    wc.reloadIgnoringCache()
  } catch (error) {
    console.warn(
      '[clientRecovery] reloadIgnoringCache failed:',
      error instanceof Error ? error.message : error
    )
    await promptForPartitionRecovery(`RELOAD_FAILED:${reason}`)
  }
}

/**
 * 必须在任何 session.fromPartition('persist:ihr360-main') 之前调用。
 * 用户确认修复后的下一次冷启动会把原分区重命名备份，让 Electron 自动生成新分区。
 */
export function applyPendingHomePartitionRecovery(): RecoveryResult | null {
  const pendingFile = userDataFile(PENDING_FILE_NAME)
  if (!fs.existsSync(pendingFile)) return null

  let pending: PendingRecovery = { requestedAt: Date.now(), reason: 'UNKNOWN' }
  try {
    pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8')) as PendingRecovery
  } catch (error) {
    console.warn(
      '[clientRecovery] pending marker parse failed:',
      error instanceof Error ? error.message : error
    )
  }

  const sourcePath = homePartitionPath()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${sourcePath}.backup-${timestamp}`
  const result: RecoveryResult = {
    attemptedAt: Date.now(),
    ok: false,
    reason: pending.reason || 'UNKNOWN',
    sourcePath
  }

  try {
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, backupPath)
      result.backupPath = backupPath
      console.warn(`[clientRecovery] home partition backed up: ${sourcePath} -> ${backupPath}`)
    } else {
      console.warn(
        `[clientRecovery] home partition missing; Electron will create it: ${sourcePath}`
      )
    }
    result.ok = true
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    console.error('[clientRecovery] home partition backup failed:', result.error)
  } finally {
    try {
      if (fs.existsSync(pendingFile)) fs.unlinkSync(pendingFile)
    } catch (error) {
      console.warn(
        '[clientRecovery] remove pending marker failed:',
        error instanceof Error ? error.message : error
      )
    }
    try {
      writeJson(userDataFile(LAST_RESULT_FILE_NAME), result)
    } catch (error) {
      console.warn(
        '[clientRecovery] write result failed:',
        error instanceof Error ? error.message : error
      )
    }
  }

  return result
}

/** 注册一次主页就绪 IPC；只接受当前 home WebContents 发来的信号。 */
export function registerClientRecoveryIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  app.on('before-quit', () => {
    appQuitting = true
    disposeClientRecoveryMonitor()
  })
  ipcMain.on('clientRecovery:homeReady', (event) => {
    if (!isCurrentHomeSender(event.sender)) return
    markHomeReady('renderer-ipc')
  })
}

/** 创建主页 WebContentsView 后调用，开始本次启动健康监测。 */
export function monitorHomeWebContents(win: BrowserWindow, wc: WebContents): void {
  appQuitting = false
  mainWindowRef = win
  homeWcRef = wc
  safeRecoveryAttempted = false
  recoveryInProgress = false
  promptShown = false
  homeReady = false
  armReadyTimer('initial-load')

  wc.on('render-process-gone', (_event, details) => {
    console.error(
      `[clientRecovery] home render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    )
    void handleHomeStartupFailure(`RENDER_PROCESS_GONE:${details.reason}`)
  })
  wc.on('unresponsive', () => {
    console.error('[clientRecovery] home renderer unresponsive')
    void handleHomeStartupFailure('UNRESPONSIVE')
  })
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = ERR_ABORTED，常见于正常重定向/新导航
    console.warn(
      `[clientRecovery] home did-fail-load code=${code} description=${description} url=${url}`
    )
    // 网络暂时不可用也会走 did-fail-load；保留 30s 观察窗口，避免立刻把网络问题当数据损坏。
  })
  wc.on('did-finish-load', () => {
    // 给异步路由组件一个短暂挂载时间；新版 SPA 通常会更早通过 IPC 报 ready。
    setTimeout(() => {
      if (!homeReady && homeWcRef === wc && !wc.isDestroyed()) void probeRenderedHomeDom(wc)
    }, 1500)
  })
}

export function disposeClientRecoveryMonitor(): void {
  clearReadyTimer()
  mainWindowRef = null
  homeWcRef = null
  recoveryInProgress = false
  homeReady = false
}
