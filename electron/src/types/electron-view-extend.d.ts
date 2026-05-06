import 'electron'

declare module 'electron' {
  interface WebContentsView {
    setOpacity(opacity: number): void
    setBackgroundColor(color: string): void
  }
}
