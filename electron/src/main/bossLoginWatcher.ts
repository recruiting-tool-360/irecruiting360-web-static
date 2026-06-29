/**
 * BOSS 常驻登录态监视（main 进程）—— 纯 URL 监测，骑在 TabManager 的 BOSS 单例 tab 上。
 *
 * 设计（见 docs/boss标签管理.md）：
 *   - BOSS webContents 全局唯一（TabManager 单例 tab）。登录 / 推荐牛人 / 登录监视复用同一个。
 *   - BOSS 渠道启用时：TabManager 建隐藏单例 tab 加载「职位管理」页（/web/chat/job/list），
 *     监听它的 URL 变化判登录态：
 *       · URL 含 /web/chat → 登录有效
 *       · 不含（被站点跳到登录页 /web/user 等）→ 登录失效
 *     登录态变化推 SPA（boss:loginStatusChanged）。
 *   - 用户点 header「boss直聘」登录 / 推荐牛人任务 → TabManager 把这同一个 tab 切可见并导航，
 *     监视一直挂在这个 webContents 上（登录页 URL 含 /web/user → 失效；登录成功跳回 /web/chat → 有效）。
 *   - BOSS 渠道被禁用 → destroyBossTab() 销毁；重新启用 → 再走本启动流程。
 *
 * ⚠️ 反爬：不在页面里 fetch 接口探测登录态，只读 webContents 当前 URL（被动观察）。
 *   职位列表数据由站点页面自身请求 + siteNetworkCapture 被动抓取（已实现），不在这里主动抓。
 */

import { tabManager } from './TabManager'
import type { WebContents } from 'electron'

/** 监视用：隐藏单例 tab 隔多久 reload 一次职位管理页（让站点重新鉴权）。3 分钟，等同用户偶尔刷新。 */
const RELOAD_MS = 3 * 60 * 1000

/** 轮询读 URL 间隔（30s）：兜底捕捉站点自身跳转（不发任何请求）。 */
const POLL_MS = 30 * 1000

let pollTimer: ReturnType<typeof setInterval> | null = null
let reloadTimer: ReturnType<typeof setInterval> | null = null
let started = false

/** 当前已知登录态：null=未知，true=已登录，false=已失效 */
let loginState: boolean | null = null

let homeWcRef: WebContents | null = null

export function setHomeWebContentsForBossWatcher(wc: WebContents): void {
  homeWcRef = wc
}

function sendToHome(channel: string, payload: unknown): void {
  if (homeWcRef && !homeWcRef.isDestroyed()) {
    homeWcRef.send(channel, payload)
  }
}

/**
 * 登录态判定（按 URL path）：
 *   - 登录有效：认证后的应用页 —— path 以 `/web/` 开头（职位管理 /web/chat、推荐 /web/frame/recommend 等），
 *     且不是登录页。
 *   - 失效：BOSS 首页 `/`（被挤下线/未登录会重定向到首页）或登录页 `/web/user`。
 *
 * ⚠️ 之前只认 `/web/chat` → 推荐任务期间单例 tab 停在 `/web/frame/recommend/`（不含 /web/chat）会被
 *   误判成「已下线」，把 loginState 卡成 false；之后真被挤下线（跳首页）时因 loginState 已是 false
 *   不再 emit → 头部 boss直聘 不变红。改成「/web/ 应用页都算登录」即可避免这个误判。
 */
function isLoggedInUrl(url: string): boolean {
  if (!url || url === 'about:blank') return false
  let path = '/'
  try {
    path = new URL(url).pathname || '/'
  } catch {
    // URL 解析失败 → 退回旧口径（含 /web/chat 算登录）
    return url.indexOf('/web/chat') >= 0
  }
  if (path.startsWith('/web/user')) return false // BOSS 登录页 → 失效
  return path.startsWith('/web/') // 认证后应用页 → 有效；首页 '/' 等 → 失效
}

/** 更新登录态：有变化才推 SPA */
function setLoginState(next: boolean, reason: string): void {
  if (loginState === next) return
  loginState = next
  console.log(`[bossLoginWatcher] loginState → ${next} (${reason})`)
  sendToHome('boss:loginStatusChanged', { login: next, reason })
}

/** TabManager 推来的 BOSS 单例 URL 变化 → 判登录态 */
function onBossUrl(url: string): void {
  if (!url || url === 'about:blank') return
  const loggedIn = isLoggedInUrl(url)
  console.log(`[bossLoginWatcher] onBossUrl url=${url} loggedIn=${loggedIn}`)
  setLoginState(loggedIn, 'url')
}

/** 兜底轮询：读单例当前 URL（不发请求） */
function poll(): void {
  // ★ 整个轮询体包 try/catch：定时器回调里任何异常都会变成「主进程未捕获异常」崩溃弹框
  //   （曾出现退出/关窗后 ensureBossMonitorTab → spawnSiteTab 访问已销毁 mainWindow 抛
  //   "Object has been destroyed"）。这里兜底吞掉，绝不让定时器拖垮主进程。
  try {
    // 主窗口不在了（退出 / 关窗）→ 不再做任何 tab 操作
    if (!tabManager.isReady()) return
    const url = tabManager.getBossTabUrl()
    if (!url) {
      // 单例不在了（被销毁 / 还没建）→ 确保监视 tab 存在
      tabManager.ensureBossMonitorTab()
      return
    }
    onBossUrl(url)
  } catch (e) {
    console.warn('[bossLoginWatcher] poll error (ignored):', (e as Error)?.message || e)
  }
}

/**
 * 启动 BOSS 登录监视。**幂等 + 自愈**：无论之前 started 状态如何，都重新挂 URL 监听、
 * 确保监视单例 tab 存在、确保定时器在跑。这样 disable→enable（即使中间状态错乱）也能可靠重启。
 */
export function startBossLoginWatcher(): void {
  const wasStarted = started
  started = true
  if (!wasStarted) loginState = null // 重新启动一轮 → 允许重新推送当前登录态
  // 始终重新挂监听 + 确保 tab 存在（幂等）
  tabManager.setBossUrlListener(onBossUrl)
  tabManager.ensureBossMonitorTab()
  // 开启时立刻先按当前 URL 判一次（监视 tab 已加载过则马上出结果；刚新建则 URL 还空，
  // 等 did-stop-loading 回调里再判）
  poll()
  // 定时器没在跑才起（避免重复）
  if (!pollTimer) pollTimer = setInterval(poll, POLL_MS)
  if (!reloadTimer) reloadTimer = setInterval(() => tabManager.reloadBossMonitor(), RELOAD_MS)
  console.log(`[bossLoginWatcher] start (wasStarted=${wasStarted})`)
}

/** 停止 BOSS 登录监视并销毁单例 tab（BOSS 渠道禁用 / 退出场景）。幂等：重复调用安全。 */
export function stopBossLoginWatcher(): void {
  started = false
  loginState = null
  console.log('[bossLoginWatcher] stop')
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (reloadTimer) {
    clearInterval(reloadTimer)
    reloadTimer = null
  }
  tabManager.setBossUrlListener(null)
  tabManager.destroyBossTab()
}
