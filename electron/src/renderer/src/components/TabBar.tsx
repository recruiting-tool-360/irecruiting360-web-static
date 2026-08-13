/**
 * 标签栏（Chrome 同款单行）
 *
 * 决策映射：
 *   A.a Chrome 同款单行布局      → 顶部 40px 高的 .titlebar，标签嵌入其中
 *   B   不带地址栏 / 前进后退    → 不渲染导航控件
 *   C   i快招/BOSS 主签固定不可关 → pinned 固定；closable=false 不渲染 X
 *   D   仅主页写死 "i快招" + 应用 logo → home role 显示 HOME_DISPLAY
 *   E.b 紧挨当前 tab 右侧打开    → 主进程已实现，本组件无需特殊处理
 *   F.a M2 内做拖拽重排          → HTML5 DnD 直接重排
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { TabState } from '../../../preload/index.d'

const HOME_DISPLAY = 'i快招'

type Props = {
  platform: NodeJS.Platform
}

export function TabBar({ platform }: Props): React.JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const dragOverFrame = useRef<number | null>(null)

  // 订阅主进程标签状态广播
  useEffect(() => {
    let mounted = true
    void window.api.tabs.list().then((s) => {
      if (mounted) setTabs(s)
    })
    const off = window.api.tabs.onState((state) => {
      if (mounted) setTabs(state)
    })
    return () => {
      mounted = false
      off()
    }
  }, [])

  const orderedIds = useMemo(() => tabs.map((t) => t.id), [tabs])
  // 拆分：pinned（home）固定不滚，scrollable（招聘站点）才进可滚容器
  const pinnedTabs = useMemo(() => tabs.filter((t) => t.pinned), [tabs])
  const scrollTabs = useMemo(() => tabs.filter((t) => !t.pinned), [tabs])

  const handleClick = (id: string): void => {
    void window.api.tabs.activate(id)
  }

  const handleClose = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    void window.api.tabs.close(id)
  }

  // ---- 拖拽重排（HTML5 DnD） ----

  const handleDragStart = (id: string, e: React.DragEvent<HTMLDivElement>): void => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    // 透明拖拽预览（避免系统默认的元素截图占位太大）
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch {
      /* noop */
    }
  }

  const handleDragOver = (id: string, e: React.DragEvent<HTMLDivElement>): void => {
    if (!dragId || dragId === id) return
    // home tab 不接受 drop（因为它必须保持首位）
    const target = tabs.find((t) => t.id === id)
    if (target?.pinned) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverFrame.current) cancelAnimationFrame(dragOverFrame.current)
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const before = e.clientX < rect.left + rect.width / 2
    dragOverFrame.current = requestAnimationFrame(() => {
      setDropTarget({ id, before })
    })
  }

  const handleDragEnd = (): void => {
    setDragId(null)
    setDropTarget(null)
    if (dragOverFrame.current) cancelAnimationFrame(dragOverFrame.current)
    dragOverFrame.current = null
  }

  const handleDrop = (id: string, e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    if (!dragId || dragId === id) {
      handleDragEnd()
      return
    }
    const target = tabs.find((t) => t.id === id)
    if (target?.pinned) {
      handleDragEnd()
      return
    }
    const before = dropTarget?.id === id ? dropTarget.before : false
    const next = orderedIds.filter((x) => x !== dragId)
    const idx = next.indexOf(id)
    if (idx < 0) {
      handleDragEnd()
      return
    }
    next.splice(before ? idx : idx + 1, 0, dragId)
    void window.api.tabs.reorder(next)
    handleDragEnd()
  }

  const renderFavicon = (tab: TabState): React.JSX.Element => {
    if (tab.loading) return <span className="tab-favicon loading" aria-hidden />
    const channel = tab.channel ?? 'unknown'
    const knownChannels = ['home', 'boss', 'zhilian', 'liepin', 'job51', 'ihr-manage']
    const cls = knownChannels.includes(channel) ? channel : 'unknown'
    const letter = displayInitial(tab, channel)
    return (
      <span className={`tab-favicon ${cls}`} aria-hidden>
        {letter}
      </span>
    )
  }

  const renderTab = (tab: TabState): React.JSX.Element => {
    const isDragging = dragId === tab.id
    const dropClass =
      dropTarget?.id === tab.id ? (dropTarget.before ? 'drop-before' : 'drop-after') : ''
    const cls = [
      'tab',
      tab.active ? 'active' : '',
      tab.pinned ? 'pinned' : '',
      isDragging ? 'dragging' : '',
      dropClass
    ]
      .filter(Boolean)
      .join(' ')

    const title = tab.role === 'home' ? HOME_DISPLAY : tab.title || tab.url || '新标签'

    return (
      <div
        key={tab.id}
        role="tab"
        aria-selected={tab.active}
        className={cls}
        draggable={!tab.pinned}
        onClick={() => handleClick(tab.id)}
        onDragStart={(e) => handleDragStart(tab.id, e)}
        onDragOver={(e) => handleDragOver(tab.id, e)}
        onDragEnd={handleDragEnd}
        onDrop={(e) => handleDrop(tab.id, e)}
        title={title}
      >
        {renderFavicon(tab)}
        <span className="tab-title">{title}</span>
        {/* X 关闭按钮：永久不可关或业务侧动态 locked 时不显示 */}
        {tab.closable && !tab.locked ? (
          <button
            type="button"
            className="tab-close"
            onClick={(e) => handleClose(tab.id, e)}
            aria-label="关闭标签"
            title="关闭标签"
          >
            ×
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`titlebar platform-${platform}`}>
      {platform === 'darwin' ? <div className="titlebar-left-spacer" /> : null}

      {/* 固定区：home / pinned tab —— 不参与水平滚动，标签再多也始终可见 */}
      {pinnedTabs.length > 0 ? (
        <div className="tab-bar-pinned" role="tablist" aria-label="固定标签">
          {pinnedTabs.map(renderTab)}
        </div>
      ) : null}

      {/* 滚动区：招聘站点 tab —— overflow-x: auto，溢出可滚 */}
      <div className="tab-bar" role="tablist" aria-label="标签">
        {scrollTabs.map(renderTab)}
      </div>

      {platform !== 'darwin' ? <div className="titlebar-right-spacer" /> : null}
    </div>
  )
}

function displayInitial(tab: TabState, channel: string): string {
  if (channel === 'home') return 'IK'
  if (channel === 'boss') return 'B'
  if (channel === 'zhilian') return 'Z'
  if (channel === 'liepin') return 'L'
  if (channel === 'job51') return '5'
  if (channel === 'ihr-manage') return 'i'
  const t = (tab.title || tab.url || '').trim()
  return t ? t.charAt(0).toUpperCase() : '?'
}
