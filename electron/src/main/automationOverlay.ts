/**
 * 自动化遮罩（Automation Overlay）
 *
 * 在 BOSS / 智联 / 51job 等招聘站 tab 上叠加一个**半透明锁屏 view**，告诉用户：
 *   "AI 聚合搜索客户端正在执行中，请耐心等待，请勿同步操作 XXX 账号"
 *
 * 实现要点（为啥不直接在 H5 SPA 里画蒙层）：
 *   - 招聘站 tab 是 Electron 原生 WebContentsView，**不在 i 快招 SPA 的 DOM 树里**，
 *     SPA 的 z-index 蒙层根本盖不到它
 *   - 不能在 BOSS 页面里 executeJavaScript 注入 DOM 蒙层 —— BOSS 反爬会立刻识别
 *     "三方工具修改页面"，触发账号封禁（详见 docs/boss地址资料.md 反爬警告区）
 *
 * 正确做法：
 *   - 创建一个独立的 `WebContentsView`（叫 overlayView），加载一段本地 inline HTML
 *     （data:text/html;base64,...，零外部依赖）
 *   - 把它 addChildView 到 mainWindow.contentView，**在所有 tab view 之上**
 *   - setBounds 跟当前 active tab 完全对齐（标签栏下面整片）
 *   - HTML 用半透明白底 + backdrop-blur + 居中卡片，对齐 ihraisaas 的 PlatformSimulation 设计
 *   - 隐藏时仅 setBounds(0,0,0,0)；不 destroy，复用提速
 *
 * 安全：overlay view 完全空白，不挂任何 IPC bridge，sandbox=true，
 * 即便 BOSS 想通过 window.opener 之类找它也找不到。
 */

import { BrowserWindow, WebContentsView } from 'electron'

/** 跟 TabManager.CHROME_HEIGHT 保持一致（壳层 = 标题栏 + 标签栏） */
const CHROME_HEIGHT = 40

export interface OverlayPayload {
  /** 主标题（默认 "AI 聚合搜索进行中"） */
  title?: string
  /** 副标题（默认通用文案，建议传入"操作 BOSS直聘 / 智联招聘"等 channel 名 highlight） */
  message?: string
  /** 渠道名（影响主题色 + 子句高亮） */
  channelName?: string
  /**
   * 只覆盖哪些 channel 的 tab。默认 ['boss', 'zhilian', 'job51', 'liepin']。
   * - active tab 的 channel 在列表里 → 显示蒙层
   * - 否则（如 active 是 home / ihr-manage） → 蒙层隐藏，用户能正常操作主页
   *
   * 设计意图：聚合搜索时只锁住"招聘站 tab"防止用户手动操作触发风控，
   * 主页 tab 是 i 快招自己的 SPA，用户在那里看搜索进度 / 操作 UI 不应被打扰。
   */
  coverChannels?: string[]
}

function getChannelTheme(channelName?: string): { color: string; chip: string } {
  const c = (channelName || '').toLowerCase()
  if (c.includes('boss')) return { color: '#00D7C6', chip: '#E6FAF8' }
  if (c.includes('智联')) return { color: '#2D5AF2', chip: '#E8EEFF' }
  if (c.includes('前程') || c.includes('51')) return { color: '#FF6600', chip: '#FFEFE0' }
  if (c.includes('猎聘')) return { color: '#FFB400', chip: '#FFF7E0' }
  return { color: '#10b981', chip: '#ECFDF5' }
}

/** 渲染蒙层 HTML（return data URL） */
function buildOverlayDataUrl(payload: OverlayPayload): string {
  const { color, chip } = getChannelTheme(payload.channelName)
  const channelName = payload.channelName || ''
  const title = payload.title || 'AI 聚合搜索进行中'
  // ihraisaas/PlatformSimulation.tsx L329-331 副文同款，channel 高亮
  const message =
    payload.message ||
    `AI 聚合搜索客户端正在执行中，请耐心等待，请勿同步操作 <span class="channel">${channelName || '招聘'}</span> 账号`

  // 不依赖任何外部 CSS / JS / 字体；纯 inline 跑得动
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
    /* 半透明白底 + backdrop-blur：底下的 BOSS tab 内容会被柔化，但仍能看见。
       对齐 ihraisaas PlatformSimulation L300 className 设计。 */
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    /* 整个 body 接管点击，让 BOSS view 完全不能被用户碰到 */
    pointer-events: auto;
    cursor: not-allowed;
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 96px;
  }
  .card {
    background: #fff;
    padding: 24px 32px;
    border-radius: 24px;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.12);
    border: 1px solid #f5f5f5;
    display: flex;
    align-items: center;
    gap: 24px;
    width: min(640px, calc(100% - 32px));
    animation: pop .35s cubic-bezier(.22,.61,.36,1);
  }
  @keyframes pop {
    0%   { opacity: 0; transform: translateY(-32px) scale(.95); }
    100% { opacity: 1; transform: translateY(0)    scale(1); }
  }
  .icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    flex-shrink: 0;
    background: ${chip};
    box-shadow: 0 12px 24px -6px ${color}40;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .icon::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.2);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 0.8; }
  }
  .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 4px solid #f5f5f5;
    border-top-color: ${color};
    animation: spin 1.1s linear infinite;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }
  .spinner::after {
    content: '';
    width: 8px;
    height: 8px;
    background: ${color};
    border-radius: 50%;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .body { flex: 1; }
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .title {
    font-size: 18px;
    font-weight: 900;
    color: #1f2937;
    letter-spacing: -0.01em;
  }
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 999px;
    background: #fafafa;
    border: 1px solid #f5f5f5;
    font-size: 11px;
    font-weight: 900;
    color: #6b7280;
    letter-spacing: -0.01em;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    animation: pulse 1.8s ease-in-out infinite;
    box-shadow: 0 0 0 0 #10b98180;
  }
  .message {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 700;
    color: ${color};
    opacity: 0.9;
    line-height: 1.5;
  }
  .message .channel {
    font-weight: 900;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 2px;
  }

  .footer {
    position: fixed;
    bottom: 48px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 24px;
    background: rgba(38, 38, 38, 0.05);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 900;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    animation: pop .5s cubic-bezier(.22,.61,.36,1) .15s both;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon"><div class="spinner"></div></div>
    <div class="body">
      <div class="title-row">
        <span class="title">${escapeHtml(title)}</span>
        <span class="status-chip">
          <span class="status-dot"></span>
          <span>正在搜索: ${escapeHtml(channelName || '招聘渠道')}</span>
        </span>
      </div>
      <p class="message">${message}</p>
    </div>
  </div>
  <div class="footer">CLIENT SIMULATION MODE • READ-ONLY INTERACTION</div>
</body>
</html>`
  // base64 编码避免中文 / 特殊字符在 URL 里的转义问题
  const b64 = Buffer.from(html, 'utf8').toString('base64')
  return `data:text/html;charset=UTF-8;base64,${b64}`
}

/** 防 XSS：title / channelName 这种用户可控字段做基础转义 */
function escapeHtml(s: string): string {
  return String(s).replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;'
  )
}

let overlayView: WebContentsView | null = null
/** "业务期望显示" —— showOverlay 被调过；hideOverlay / 流程结束才置 false */
let overlayWanted = false
/** "view 当前是否真的挂在 contentView 里" —— overlayWanted=true 但 active channel 不匹配时为 false */
let overlayAttached = false
let mainWinRef: BrowserWindow | null = null
let coverChannels: string[] = []
let currentActiveChannel: string | null = null
const DEFAULT_COVER_CHANNELS = ['boss', 'zhilian', 'job51', 'liepin']

/** 在主进程启动时调一次（TabManager.setMainWindow 之后） */
export function setOverlayMainWindow(win: BrowserWindow): void {
  mainWinRef = win
  win.on('resize', () => updateOverlayBounds())
  win.on('enter-full-screen', () => updateOverlayBounds())
  win.on('leave-full-screen', () => updateOverlayBounds())
}

/**
 * TabManager 在 activate(id) 时调用，让蒙层重新评估"该不该显示"。
 *
 * 流程：
 *   1. 业务侧 showOverlay({ coverChannels:['boss'] }) → overlayWanted=true, coverChannels=['boss']
 *   2. 此时 currentActiveChannel='home' → overlay 隐藏（不挂 view）
 *   3. 用户切到 BOSS tab → TabManager.activate → setActiveChannel('boss')
 *      → overlay 真正 addChildView + setBounds 显示，盖住 BOSS view
 *   4. 用户切回 home → setActiveChannel('home') → overlay removeChildView
 *   5. 业务侧流程结束调 hideOverlay → overlayWanted=false，强制隐藏
 */
export function setActiveChannel(channelKey: string | null): void {
  const prev = currentActiveChannel
  currentActiveChannel = channelKey ? channelKey.toLowerCase() : null
  // 排查"切回 home 蒙层没消失"用：能在 stdout 直接看到每次 active 切换 + 计算结果
  console.log(
    `[automationOverlay] setActiveChannel: ${prev || '-'} → ${currentActiveChannel || '-'} (wanted=${overlayWanted}, attached=${overlayAttached}, cover=[${coverChannels.join(',')}])`
  )
  applyOverlayVisibility()
}

function ensureOverlayView(): WebContentsView {
  if (overlayView && !overlayView.webContents.isDestroyed()) return overlayView
  overlayView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 不挂任何 preload；蒙层是纯展示页，无业务能力
      transparent: true
    } as Electron.WebPreferences
  })
  // 透明背景（兼容 macOS / Windows，部分 Electron 版本上 transparent webPreferences 不够）
  // setBackgroundColor 在 WebContentsView 实例上而不是 webContents 上
  try {
    ;(overlayView as unknown as { setBackgroundColor?: (c: string) => void }).setBackgroundColor?.(
      '#00000000'
    )
  } catch {
    /* ignore */
  }
  return overlayView
}

/** 把 overlay 摆到 active tab 内容区域同一位置（标签栏下面整片） */
function updateOverlayBounds(): void {
  if (!overlayView || !mainWinRef || !overlayAttached) return
  const bounds = mainWinRef.getContentBounds()
  overlayView.setBounds({
    x: 0,
    y: CHROME_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - CHROME_HEIGHT)
  })
}

/**
 * 根据 overlayWanted + currentActiveChannel + coverChannels 重新评估蒙层显隐。
 * 任何一边变了（业务侧 show/hide、TabManager 切 active）都要调一次。
 */
function applyOverlayVisibility(): void {
  if (!mainWinRef) return
  const shouldShow =
    overlayWanted &&
    !!currentActiveChannel &&
    coverChannels.includes(currentActiveChannel)
  if (shouldShow && !overlayAttached) {
    const view = ensureOverlayView()
    try {
      mainWinRef.contentView.addChildView(view)
      overlayAttached = true
      updateOverlayBounds()
      console.log(
        `[automationOverlay] attached (activeChannel=${currentActiveChannel}, cover=[${coverChannels.join(',')}])`
      )
    } catch (e) {
      console.warn(`[automationOverlay] addChildView err: ${(e as Error).message}`)
    }
  } else if (!shouldShow && overlayAttached) {
    if (overlayView) {
      overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      try {
        mainWinRef.contentView.removeChildView(overlayView)
      } catch (e) {
        console.warn(`[automationOverlay] removeChildView err: ${(e as Error).message}`)
      }
    }
    overlayAttached = false
    console.log(
      `[automationOverlay] detached (activeChannel=${currentActiveChannel}, wanted=${overlayWanted})`
    )
  }
}

/**
 * 业务侧"我开始一个会锁住招聘站 tab 的流程了，请挂蒙层"。
 *
 * 实际**显示**与否还要看 `currentActiveChannel ∈ coverChannels`：
 *   - active 是招聘站 tab → 立刻挂上覆盖 view
 *   - active 是主页 / 其它 tab → 先不显示，等用户切到招聘站 tab 时才覆盖
 *
 * 这样的好处：用户在主页操作 i 快招 SPA 时不会被打扰，但只要他切到 BOSS tab
 * 想去手动操作就立刻看到 "Read-Only" 蒙层，被阻止。
 */
export function showOverlay(payload: OverlayPayload = {}): void {
  if (!mainWinRef) {
    console.warn('[automationOverlay] showOverlay called before setOverlayMainWindow')
    return
  }
  overlayWanted = true
  coverChannels = (payload.coverChannels && payload.coverChannels.length > 0
    ? payload.coverChannels
    : DEFAULT_COVER_CHANNELS
  ).map((c) => c.toLowerCase())

  // 先 reload data url（payload 可能变了）—— view 复用，content 变化
  const view = ensureOverlayView()
  const url = buildOverlayDataUrl(payload)
  void view.webContents.loadURL(url)

  applyOverlayVisibility()
  console.log(
    `[automationOverlay] wanted=true channelName=${payload.channelName || '-'} cover=[${coverChannels.join(',')}] activeChannel=${currentActiveChannel || '-'} attached=${overlayAttached}`
  )
}

/**
 * 业务侧"流程结束/出错了，关蒙层"。view 不销毁，下次 showOverlay 复用。
 */
export function hideOverlay(): void {
  overlayWanted = false
  applyOverlayVisibility()
  console.log('[automationOverlay] wanted=false (hidden)')
}

/** 业务侧用：true 表示蒙层"想显示"（不代表当前一定 attach 在视图上） */
export function isOverlayVisible(): boolean {
  return overlayWanted
}
