/**
 * i快招 客户端壳层根组件
 *
 * 职责：自绘标题栏 + 标签栏（Chrome 风格）。
 * 真实业务页面（主页 H5、招聘站点）跑在主进程的 WebContentsView 里，
 * 由 TabManager 通过 setBounds 在标签栏下方的"内容区"叠加显示，与本组件零重叠。
 */

import React from 'react'
import { TabBar } from './components/TabBar'

function detectPlatform(): NodeJS.Platform {
  const native = window.__IKUAIZHAO_NATIVE__
  if (native?.platform) return native.platform
  // 兜底：UA 推断（contextIsolation=true / nodeIntegration=false 拿不到 process）
  const ua = navigator.userAgent
  if (/Mac OS X/i.test(ua)) return 'darwin'
  if (/Windows/i.test(ua)) return 'win32'
  return 'linux'
}

function App(): React.JSX.Element {
  const platform = detectPlatform()
  return (
    <div className="shell">
      <TabBar platform={platform} />
      {/* 标签栏下方留给 WebContentsView 占位；壳层这里只是空白背景 */}
      <div className="shell-empty" />
    </div>
  )
}

export default App
