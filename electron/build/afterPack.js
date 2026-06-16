/**
 * electron-builder afterPack hook
 *
 * macOS 专用：在 .app 打包完成后，如果 electron-builder 没成功 codesign
 * （比如 keychain 里没 Developer ID 证书，或 dev 模式跳过签名），
 * 主动用 ad-hoc identity (`-`) 给 .app 再签一次。
 *
 * 这样保证 Apple Silicon (M1/M2/M3/M4) 上打出来的 dev 包能直接双击运行
 * （不签的 .app 在 arm64 mac 上会被内核 kill: zsh: killed）。
 *
 * 检测逻辑：
 *   - 已经有真实签名（Developer ID / Apple Development）→ 跳过本钩子
 *   - 已经有 ad-hoc 签名 → 跳过
 *   - 完全没签名 → 跑 codesign --deep --force --sign -
 *
 * 不影响：
 *   - Windows / Linux 平台（直接 return）
 *   - release 模式（已有真实证书签名，自动跳过）
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] .app not found at ${appPath}, skipping ad-hoc sign`)
    return
  }

  // 检查当前签名状态：
  //   - 有真实签名（Authority=Developer ID 之类）→ 跳过本钩子（release 模式）
  //   - 仅 linker-signed adhoc（Electron 二进制自带的占位签名，Identifier=Electron）→ 必须重签
  //   - 完全未签名 → 必须签
  let realSigned = false
  let linkerSignedOnly = false
  try {
    const out = execSync(`codesign -dvvv "${appPath}" 2>&1`, { encoding: 'utf8' })

    if (out.includes('Authority=')) {
      // 有真实证书签名（Developer ID / Apple Development）
      realSigned = true
    } else if (out.includes('linker-signed')) {
      // Electron 二进制自带的占位签名，Identifier=Electron，Info.plist 未绑定
      // 这种状态下自定义协议唤起 / TCC 权限会异常，必须重签
      linkerSignedOnly = true
    }
  } catch (_e) {
    // 未签名（codesign -dv 退出码非 0），需要签
  }

  if (realSigned) {
    console.log(`[afterPack] ${appName}.app already signed with real identity, skipping`)
    return
  }

  const reason = linkerSignedOnly ? 'linker-signed adhoc placeholder' : 'unsigned'
  console.log(`[afterPack] applying ad-hoc signature (was: ${reason})`)
  try {
    execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' })

    // 验证一下重签结果
    const verify = execSync(`codesign -dv "${appPath}" 2>&1`, { encoding: 'utf8' })
    const idMatch = verify.match(/Identifier=([^\s]+)/)
    console.log(
      `[afterPack] ad-hoc sign success, new identifier: ${idMatch ? idMatch[1] : '(unknown)'}`
    )
  } catch (e) {
    console.error(`[afterPack] ad-hoc sign failed:`, e?.message ?? e)
    // 不抛错，让打包继续；用户跑起来时会看到明确的 zsh: killed
  }
}
