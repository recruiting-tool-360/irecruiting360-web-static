import { app, shell, BrowserWindow, ipcMain, WebContentsView, session } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import icon128 from '../../resources/icons/128x128.png?asset'
import iconIco from '../../resources/icons/128x128.png?asset'
import { viewManager } from './ViewManager'

const contentView: {
  contentView: WebContentsView | undefined
  mainWindow?: BrowserWindow
} = {
  contentView: undefined
}

function createWindow(): void {
  // Create the browser window.
  const initSize = {
    width: 900,
    height: 670
  }
  if (contentView.mainWindow) {
    return
  }

  const mainWindow = new BrowserWindow({
    ...initSize,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    icon:
      process.platform !== 'darwin' && process.platform !== 'linux'
        ? path.join(__dirname, process.platform === 'win32' ? iconIco : icon128)
        : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  contentView.mainWindow = mainWindow

  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon128)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  viewManager.setWindow(mainWindow)

  const persistSession = session.fromPartition('persist:mySiteSession')
  // cache contentView
  if (!contentView.contentView) {
    contentView.contentView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: true,
        session: persistSession
      }
    })
    contentView.contentView.setBounds({ x: 0, y: 0, ...initSize })
    contentView.contentView?.webContents.loadURL('https://login.ihire365.com')
    contentView.contentView?.webContents.setWindowOpenHandler((details) => {
      console.log('网页尝试打开新窗口 URL:', details.url)
      viewManager.create(details.url, details.url)
      // 返回 action: 'deny' 阻止创建新窗口
      return { action: 'deny' }
    })
  } else {
    contentView.contentView && mainWindow.contentView.addChildView(contentView.contentView, 1)
    mainWindow.loadURL('data:text/html,<html><body></body></html>')
  }

  const updateLoadingBounds = (): boolean => {
    const [width, height] = mainWindow.getSize()
    const rect = { x: 0, y: 0, width, height }
    contentView.contentView?.setBounds(rect)
    return true
  }

  // 初始设置
  updateLoadingBounds()

  // 监听窗口大小变化
  mainWindow.on('resize', updateLoadingBounds)

  contentView.contentView.webContents.once('did-finish-load', () => {
    if (!contentView.contentView) {
      return
    }
    setTimeout(() => {
      contentView.contentView && mainWindow.contentView.addChildView(contentView.contentView, 1)
      mainWindow.loadURL('data:text/html,<html><body></body></html>')
      contentView.contentView?.webContents.openDevTools({ mode: 'detach' }) // 'right', 'bottom', 'undocked', 'detach'
    }, 2000)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow?.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow?.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    console.log('created', window.webContents.getTitle())
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
