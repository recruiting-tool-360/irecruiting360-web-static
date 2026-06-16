/* eslint-env node */
/**
 * 仅 dev 用：把 node_modules/electron/dist/Electron.app 的 Info.plist 里
 * CFBundleName / CFBundleDisplayName 改成「i快招」，让 dev 模式下 macOS 顶部菜单栏、
 * 「关于/隐藏/退出」菜单项不再显示「Electron」。
 *
 * 为什么这样最稳：
 *   - macOS 顶部菜单栏的应用名取自**正在运行的 .app bundle 的 Info.plist CFBundleName**，
 *     运行时 app.setName() / 菜单模板都改不动它（系统级限制）。dev 跑的就是 Electron.app。
 *   - dev 模式下 app.getName()（决定 userData 路径）取自 electron/package.json 的 name=「electron」，
 *     **不**读 Info.plist，所以改 CFBundleName 不会让 userData 路径漂移 → cookie 不丢。
 *   - 打包后由 electron-builder 的 productName 写 Info.plist，本来就是「i快招」，无需此脚本。
 *
 * 幂等：已是目标名就跳过；非 macOS / 找不到 plist 直接静默退出（不影响 dev 启动）。
 */
const fs = require('fs')
const path = require('path')

const APP_NAME = 'i快招'

function main() {
  if (process.platform !== 'darwin') return

  // require('electron') 在普通 node 脚本里返回 electron 可执行文件的绝对路径
  let execPath
  try {
    execPath = require('electron')
  } catch {
    return
  }
  if (typeof execPath !== 'string') return

  // .../Electron.app/Contents/MacOS/Electron → .../Electron.app/Contents/Info.plist
  const contentsDir = path.dirname(path.dirname(execPath))
  const plistPath = path.join(contentsDir, 'Info.plist')
  if (!fs.existsSync(plistPath)) return

  let xml
  try {
    xml = fs.readFileSync(plistPath, 'utf8')
  } catch {
    return
  }

  const before = xml

  // 替换 <key>CFBundleName</key> 后紧跟的 <string>...</string>
  xml = replacePlistString(xml, 'CFBundleName', APP_NAME)
  // CFBundleDisplayName 可能不存在；存在则替换（部分系统弹窗用它）
  xml = replacePlistString(xml, 'CFBundleDisplayName', APP_NAME)

  if (xml !== before) {
    try {
      fs.writeFileSync(plistPath, xml, 'utf8')
      console.log(`[patch-dev-app-name] Electron.app CFBundleName → ${APP_NAME}（仅 dev 显示用）`)
    } catch (e) {
      console.warn(
        '[patch-dev-app-name] 写入 Info.plist 失败（忽略，不影响 dev 启动）:',
        e && e.message
      )
    }
  }

  // 顺带把 bundle 图标换成「快招」icns：macOS「关于」面板 / dock 的图标取自 app bundle 图标，
  // setAboutPanelOptions 的 iconPath 在 macOS 基本被忽略，所以 dev 下必须替换 Electron.app
  // 自带的 electron.icns。打包后由 electron-builder 用 icon.icns 处理，无需此步。
  patchBundleIcon(contentsDir)
}

/**
 * 把 resources/icons/icon.icns 覆盖到 Electron.app/Contents/Resources/<CFBundleIconFile>。
 * 大小一致视为已替换，跳过。
 */
function patchBundleIcon(contentsDir) {
  // 本脚本在 electron/scripts/ 下，icns 在 electron/resources/icons/icon.icns
  const srcIcns = path.join(__dirname, '..', 'resources', 'icons', 'icon.icns')
  const destIcns = path.join(contentsDir, 'Resources', 'electron.icns')
  if (!fs.existsSync(srcIcns) || !fs.existsSync(destIcns)) return
  try {
    const src = fs.statSync(srcIcns)
    const dest = fs.statSync(destIcns)
    if (src.size === dest.size) return // 已替换过
    fs.copyFileSync(srcIcns, destIcns)
    console.log('[patch-dev-app-name] Electron.app 图标 → 快招 icns（仅 dev 显示用）')
  } catch (e) {
    console.warn('[patch-dev-app-name] 替换 bundle 图标失败（忽略）:', e && e.message)
  }
}

/**
 * 把 <key>{key}</key> 之后第一个 <string>old</string> 的内容替换成 value。
 * key 不存在时原样返回。
 */
function replacePlistString(xml, key, value) {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`)
  return xml.replace(re, (_m, p1, _old, p3) => `${p1}${value}${p3}`)
}

main()
