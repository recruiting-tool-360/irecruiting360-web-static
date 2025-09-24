import { BrowserWindow, WebContentsView } from 'electron'

function getRandomColor(): string {
  const r = Math.floor(Math.random() * 256) // 0-255
  const g = Math.floor(Math.random() * 256)
  const b = Math.floor(Math.random() * 256)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

class ViewManager {
  private views = new Map<string, WebContentsView>()
  private parent: BrowserWindow | undefined = undefined
  private activeView?: string

  setWindow(window: BrowserWindow): void {
    this.parent = window
  }

  create(name: string, url: string): WebContentsView {
    if (this.views.has(name)) return this.views.get(name)!

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    view.setBorderRadius(10)
    view.webContents.loadURL(url)
    // const [w, h] = this.parent.getSize()
    const w = 80
    const h = 80
    view.setBounds({ x: this.views.size * 40, y: 0, width: w, height: h })
    view.setOpacity?.(0)
    this.parent?.contentView.addChildView(view, this.views.size + 1)
    view.webContents.executeJavaScript(`
      document.body.style.border = '2px solid ${getRandomColor()}';
      document.body.style.boxSizing = 'border-box';
      document.body.style.borderRadius = '10px';
      document.body.style.overflow = 'hidden'
    `)
    this.views.set(name, view)
    return view
  }

  async show(name: string): Promise<void> {
    if (this.activeView === name) return
    const nextView = this.views.get(name)
    if (!nextView) return

    const prevView = this.activeView ? this.views.get(this.activeView) : undefined
    this.activeView = name

    // 淡入淡出 + 缩放动画
    // const [w, h] = this.parent.getSize()
    const w = 80
    const h = 80
    const duration = 300
    const steps = Math.ceil(duration / 16)

    let step = 0
    const interval = setInterval(() => {
      step++
      const t = step / steps
      const progress = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // easeInOut

      if (prevView) prevView.setOpacity?.(1 - progress)
      nextView.setOpacity?.(progress)

      // 缩放 0.95 -> 1
      const scale = 0.95 + 0.05 * progress
      const width = w * scale
      const height = h * scale
      const x = (w - width) / 2
      const y = (h - height) / 2
      nextView.setBounds({ x, y, width, height })

      if (step >= steps) {
        clearInterval(interval)
        if (prevView) prevView.setOpacity?.(0)
        nextView.setBounds({ x: 0, y: 0, width: w, height: h })
        nextView.setOpacity?.(1)
      }
    }, 16)
  }

  destroy(name: string): void {
    const view = this.views.get(name)
    if (view) {
      this.parent?.contentView.removeChildView(view)
      this.views.delete(name)
      if (this.activeView === name) this.activeView = undefined
    }
  }

  destroyAll(): void {
    for (const view of this.views.values()) {
      this.parent?.contentView.removeChildView(view)
    }
    this.views.clear()
    this.activeView = undefined
  }
}

export const viewManager = new ViewManager()
