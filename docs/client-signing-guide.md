# i 快招 客户端代码签名 + 公证完整教程

> 目标：让 Electron 客户端在 macOS / Windows / Linux 三平台用户机器上**无安全警告**地安装运行。
>
> 适用对象：负责申请证书、配置 CI、出包的开发或运维。
>
> 关联文档：[`docs/electron-handover-plan.md`](./electron-handover-plan.md) M5.6

---

## 目录

- [1. TL;DR：成本、周期、推荐路径](#1-tldr成本周期推荐路径)
- [2. macOS：Apple Developer ID + Notarization](#2-macosapple-developer-id--notarization)
- [3. Windows：代码签名证书](#3-windows代码签名证书)
- [4. Linux：基本上不需要签名](#4-linux基本上不需要签名)
- [5. electron-builder 集成配置](#5-electron-builder-集成配置)
- [6. CI 自动化](#6-ci-自动化)
- [7. 验证签名 / 公证是否生效](#7-验证签名--公证是否生效)
- [8. 常见问题](#8-常见问题)

---

## 1. TL;DR：成本、周期、推荐路径

| 平台 | 必须？ | 类型 | 年费（人民币） | 申请周期 | 说明 |
| --- | --- | --- | --- | --- | --- |
| **macOS** | ✅ 强制 | Apple Developer Program (个人 / 公司) | ~¥688 / 年 ($99) | 1-3 周（公司账号要 D-U-N-S 编号，个人账号 1 天搞定）| 不签 + 不公证 = macOS Gatekeeper 直接拦截，用户必须右键打开还会弹"无法验证开发者"|
| **Windows** | 🟡 强烈建议 | OV (Organization Validation) 代码签名证书 | ~¥1500-3500 / 年 | 1-2 周 | 不签 = SmartScreen 弹"未知发布者警告"；OV 签名后**仍需要积累信誉**（前期照样弹），但可点击"仍要运行" |
| **Windows (推荐)** | 🟡 进阶 | EV (Extended Validation) 代码签名证书 | ~¥2500-5000 / 年（含 USB token）| 2-3 周 | SmartScreen **立即信任**，无警告。但要硬件 USB token 不便 CI（用 Azure Key Vault 等托管方案可解）|
| **Linux** | ❌ 一般不需要 | - | - | - | AppImage 可选 GPG 签名 + 上传 zsync 用，桌面端用户极少校验 |

### 推荐落地路径

**最小可发版（MVP）**：

1. **macOS**：买 Apple Developer Program 个人账号（如果公司没法立刻申请 D-U-N-S）→ 1 天拿证 → 直接走 notarytool 公证
2. **Windows**：买 OV 证书（DigiCert / Sectigo / GlobalSign / SSL.com 任选，实测最快的是国内 CA 比如 GDCA / 沃通，3-5 天能下证）→ 自己接受前期 SmartScreen 警告
3. **Linux**：直接出 AppImage 不签

**正式发版（半年内）**：

1. macOS 改用公司账号（D-U-N-S 申请期间 MVP 用个人账号顶上）
2. Windows 升 EV 证书 + 配 Azure Key Vault 走 CI
3. Linux 加 GPG 签名（可选）

---

## 2. macOS：Apple Developer ID + Notarization

### 2.1 流程总览

```
申请 Apple Developer 账号 ($99/年)
    ↓
Developer Portal 创建证书:
    ① Developer ID Application (.app 签名)
    ② Developer ID Installer (.pkg 安装包签名，.dmg 不需要)
    ↓
导出 .p12 文件 + 记 Team ID
    ↓
electron-builder 用 .p12 签 .app
    ↓
notarytool 上传到 Apple 公证 (~5-15 分钟)
    ↓
stapler 把公证票据装订到 .dmg
    ↓
用户拿到 .dmg 双击即可，无任何警告
```

### 2.2 注册 Apple Developer 账号

1. 访问 https://developer.apple.com/programs/enroll/
2. 选择类型：
   - **Individual / Sole Proprietor**（个人 / 个体工商户）：用 Apple ID 直接申请，1 天内开通
   - **Organization**（公司）：需要 **D-U-N-S 编号**（邓白氏编号），个人申请下来 1-2 周
3. 缴费 $99/年（支持信用卡）
4. 完成后登录 https://developer.apple.com/account/

> 💡 D-U-N-S 编号免费申请：https://developer.apple.com/support/D-U-N-S/，但邓白氏后台找你公司的速度看天意。**强烈建议同时启动公司流程，先用个人账号顶 MVP**。

### 2.3 创建签名证书

进入 https://developer.apple.com/account/resources/certificates/list

1. 点 `+` → 选 **`Developer ID Application`**（这是 macOS 应用签名用的，不是 Mac App Store）
2. **生成 CSR**（Certificate Signing Request）：
   - 打开 macOS"钥匙串访问"（Keychain Access）
   - 菜单 `Certificate Assistant` → `Request a Certificate From a Certificate Authority…`
   - 邮箱填 Apple ID，CN 填名字，**勾选 `Saved to disk`**
   - 保存为 `CertificateSigningRequest.certSigningRequest`
3. 上传 CSR 文件到 Apple 网站，立即下载到 `developerID_application.cer`
4. 双击 `.cer` 安装到钥匙串
5. **导出 .p12**（CI 用）：
   - 钥匙串里找到刚导入的"Developer ID Application: <你的名字 / 公司>"
   - 右键 → `Export...` → 格式选 `.p12`
   - 设一个强密码（CI 里要用）

### 2.4 创建 App-specific password（公证用）

1. 登录 https://appleid.apple.com → `Sign-In and Security` → `App-Specific Passwords`
2. 点 `+` → 起名 `notarytool` → 生成一个 16 位密码（如 `abcd-efgh-ijkl-mnop`）
3. **立刻保存**，关掉就再也看不到了

### 2.5 找 Team ID

https://developer.apple.com/account → 右上角 `Membership details` 里看 Team ID（10 位字符，如 `7XXXXXXXXX`）

### 2.6 本地公证一次跑通

```bash
# 在 macOS 上
xcrun notarytool store-credentials "ikuaizhao-notary" \
  --apple-id "your-apple-id@example.com" \
  --team-id "7XXXXXXXXX" \
  --password "abcd-efgh-ijkl-mnop"

# 然后打包 + 公证（electron-builder 会自动调）
yarn build:mac
```

如果手动公证：

```bash
# 1. 上传 .dmg
xcrun notarytool submit ./release/i快招-1.0.0-arm64.dmg \
  --keychain-profile "ikuaizhao-notary" \
  --wait

# 输出 Status: Accepted 即成功

# 2. 装订公证票据
xcrun stapler staple ./release/i快招-1.0.0-arm64.dmg
```

---

## 3. Windows：代码签名证书

### 3.1 OV vs EV 证书选型

| 维度 | OV | EV |
| --- | --- | --- |
| 价格（年） | ¥1500-3500 | ¥2500-5000 |
| SmartScreen 信任 | ❌ 前期会弹"未知发布者"，需用户量积累信誉（数周-数月）| ✅ **首次安装就信任**，无警告 |
| 颁发方式 | 文件 | 必须 USB token（部分 CA 支持云 HSM） |
| CI 友好 | ✅ 容易（PFX 文件） | ❌ 需要 Azure Key Vault / DigiCert KeyLocker 等托管方案 |
| 验证企业身份 | 营业执照 + 电话验证 | 营业执照 + 邓白氏 + 电话验证 + 视频面试 |
| 周期 | 1-2 周 | 2-3 周 |

**MVP 推荐 OV**，等 1.0 GA 再升 EV。

### 3.2 选 CA

| CA | OV 价格 | EV 价格 | 备注 |
| --- | --- | --- | --- |
| **GDCA / 数安时代**（国内） | ~¥1500/年 | ~¥3500/年 | 推荐，中文沟通 + 加急 3 天下证 |
| **沃通 WoSign**（国内） | ~¥1800/年 | ~¥3800/年 | 备选 |
| **DigiCert** | ~$300/年 | ~$500/年 | 国际大牌，CI 集成方案最完善 |
| **Sectigo (Comodo)** | ~$200/年 | ~$400/年 | 性价比高 |
| **SSL.com** | ~$200/年 | ~$300/年 | EV 支持云端签名（不用 USB） |

**推荐 SSL.com 的 EV** 如果预算够：他们提供 eSigner 云签名服务，CI 集成最方便。否则**国内 CA + OV**简单粗暴上线。

### 3.3 申请流程（以 GDCA OV 为例）

1. 联系 GDCA 销售（或通过代理商如锐成、JoySSL），说明用途："Authenticode 代码签名证书"
2. 提供资料：
   - 营业执照副本（盖章扫描件）
   - 法人身份证扫描件
   - 申请人邮箱（用于接收证书）
   - 公司电话（CA 会回拨核实）
3. 提交后 1-3 个工作日下证书，邮件发送 `.pfx` 文件 + 安装密码
4. 拿到 `.pfx` + 密码后立即在本地导入到 Windows 证书管理器（`certmgr.msc`）

### 3.4 本地签名一次跑通

```powershell
# 用 signtool（Windows SDK 自带）
signtool sign /f ikuaizhao.pfx /p "<pfx 密码>" /tr http://timestamp.digicert.com /td sha256 /fd sha256 /v "i快招-Setup-1.0.0.exe"

# 验证
signtool verify /pa /v "i快招-Setup-1.0.0.exe"
```

### 3.5 EV 证书云签名（推荐：Azure Key Vault）

如果买了 EV 证书（带 USB token），CI 怎么签？方案：

1. 把证书私钥**导入 Azure Key Vault**（HSM 模式，CA 通常会提供导入服务）
2. CI 用 Azure CLI + `azuresigntool` 远程签名

```yaml
# GitHub Actions 示例
- name: Sign Windows app
  run: |
    npm install -g @vscode/azure-sign-tool
    azuresigntool sign \
      -kvu "https://<keyvault-name>.vault.azure.net" \
      -kvi "${{ secrets.AZURE_KEY_VAULT_CLIENT_ID }}" \
      -kvs "${{ secrets.AZURE_KEY_VAULT_CLIENT_SECRET }}" \
      -kvc "${{ secrets.AZURE_KEY_VAULT_CERT_NAME }}" \
      -kvt "${{ secrets.AZURE_KEY_VAULT_TENANT_ID }}" \
      -tr "http://timestamp.digicert.com" \
      -td sha256 \
      "release/i快招-Setup-1.0.0.exe"
```

---

## 4. Linux：基本上不需要签名

AppImage 默认不签名，运行时用户右键 → `Properties` → `Permissions` → 勾选 `Allow executing file as program` 就能跑。

如果想做 GPG 签名（高级用法，让安装器验证 update）：

```bash
# 生成 GPG 密钥
gpg --full-generate-key

# 让 electron-builder 在打包时自动签名
export GPG_PASSPHRASE="..."
yarn build:linux
```

---

## 5. electron-builder 集成配置

### 5.1 `electron/electron-builder.yml`

```yaml
appId: com.ihire365.ikuaizhao
productName: i快招
directories:
  output: release/${version}

files:
  - out/**
  - resources/**

# macOS 配置
mac:
  category: public.app-category.business
  icon: resources/icons/icon.icns
  hardenedRuntime: true              # 公证必需
  gatekeeperAssess: false             # 跳过 Gatekeeper 预校验（在公证后会自动通过）
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:                           # 自动公证（electron-builder 24.x+）
    teamId: 7XXXXXXXXX
  target:
    - target: dmg
      arch: [arm64, x64]

dmg:
  sign: false  # .dmg 自身不需要签名，公证 .app 即可

# Windows 配置
win:
  icon: resources/icons/icon.ico
  target:
    - target: nsis
      arch: [x64]
  publisherName: <公司全称（必须与证书一致）>
  signtoolOptions:
    sign: ./scripts/sign-windows.js   # 自定义签名脚本（CI 用 Azure Key Vault 时）

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  shortcutName: i快招
  installerIcon: resources/icons/icon.ico
  uninstallerIcon: resources/icons/icon.ico

# Linux 配置
linux:
  icon: resources/icons/
  category: Office
  target:
    - target: AppImage
      arch: [x64]

# 自定义协议（关键！deep link 唤起依赖）
protocols:
  - name: i快招
    schemes:
      - ikuaizhao
```

### 5.2 `electron/build/entitlements.mac.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
</dict>
</plist>
```

### 5.3 macOS 签名所需环境变量

```bash
# .env.production 或 CI secret
APPLE_ID=your-apple-id@example.com
APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop
APPLE_TEAM_ID=7XXXXXXXXX
CSC_LINK=/path/to/developerID_application.p12   # 或 base64 编码的 p12 内容
CSC_KEY_PASSWORD=<p12 密码>
```

electron-builder 24.x+ 会自动识别这些变量，跑 `yarn build:mac` 就会自动签名 + 公证。

---

## 6. CI 自动化

### 6.1 GitHub Actions（推荐起步）

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release-mac:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: yarn install --frozen-lockfile
        working-directory: electron
      - name: Build & Sign & Notarize
        working-directory: electron
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}            # base64 编码的 p12
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
        run: yarn build:mac
      - uses: actions/upload-artifact@v4
        with:
          name: mac-release
          path: electron/release/

  release-win:
    runs-on: windows-2022
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: yarn install --frozen-lockfile
        working-directory: electron
      - name: Build & Sign
        working-directory: electron
        env:
          CSC_LINK: ${{ secrets.WIN_CSC_LINK }}            # base64 编码的 pfx
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
        run: yarn build:win
      - uses: actions/upload-artifact@v4
        with:
          name: win-release
          path: electron/release/

  release-linux:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: yarn install --frozen-lockfile
        working-directory: electron
      - run: yarn build:linux
        working-directory: electron
      - uses: actions/upload-artifact@v4
        with:
          name: linux-release
          path: electron/release/

  publish:
    needs: [release-mac, release-win, release-linux]
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/download-artifact@v4
      - name: Upload to OSS / CDN
        run: |
          # 同步到 <download-host>/client/${version}/
          aliyun oss cp ./mac-release oss://<bucket>/client/${version}/ --recursive
          aliyun oss cp ./win-release oss://<bucket>/client/${version}/ --recursive
          aliyun oss cp ./linux-release oss://<bucket>/client/${version}/ --recursive
          # 更新 manifest.json
          ./scripts/update-manifest.sh ${version}
```

### 6.2 把证书 base64 编码到 GitHub Secrets

```bash
# macOS p12
base64 -i developerID_application.p12 | pbcopy   # macOS
# 粘贴到 secrets.MAC_CSC_LINK

# Windows pfx
certutil -encode ikuaizhao.pfx ikuaizhao.pfx.b64
# 把内容贴到 secrets.WIN_CSC_LINK
```

---

## 7. 验证签名 / 公证是否生效

### 7.1 macOS

```bash
# 检查签名
codesign -dv --verbose=4 /Applications/i快招.app

# 期望输出包含：
# Authority=Developer ID Application: <你的公司> (7XXXXXXXXX)
# Authority=Developer ID Certification Authority
# Authority=Apple Root CA

# 检查公证状态
spctl -a -vv -t install /path/to/i快招-1.0.0-arm64.dmg
# 期望：accepted, source=Notarized Developer ID

# 终极测试：在干净的 macOS 上双击 .dmg
# 没有 "无法验证开发者" 弹窗 = 成功
```

### 7.2 Windows

```powershell
# 检查签名
signtool verify /pa /v "i快招-Setup-1.0.0.exe"

# 期望输出：
# Successfully verified: i快招-Setup-1.0.0.exe

# 终极测试：在干净的 Windows 上双击安装包
# OV 前期：弹 SmartScreen 警告，但有"仍要运行"按钮（点 More info → Run anyway）
# EV：直接进安装界面，无警告
```

### 7.3 Linux

```bash
# AppImage 没签名也能跑
chmod +x i快招-1.0.0.AppImage
./i快招-1.0.0.AppImage
```

---

## 8. 常见问题

### Q1: 公证一直 `In Progress`，10 分钟后还没好

正常情况 5-15 分钟，偶尔会到 30 分钟。如果超过 1 小时：

```bash
xcrun notarytool history --keychain-profile "ikuaizhao-notary"
xcrun notarytool log <submission-id> --keychain-profile "ikuaizhao-notary"
```

看 log 文件，最常见错误：
- `The signature does not include a secure timestamp` → 没用 `--timestamp` 参数签名
- `The binary uses an SDK older than the 10.9 SDK` → Electron 版本太老

### Q2: macOS Apple Silicon + Intel 双架构怎么打？

```yaml
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
```

会出两个 dmg：`i快招-1.0.0-arm64.dmg` + `i快招-1.0.0-x64.dmg`。

或者出 universal binary（一个包通吃，体积更大）：

```yaml
mac:
  target:
    - target: dmg
      arch: universal
```

### Q3: Windows OV 证书签了之后还是弹"未知发布者"怎么办？

**这是正常现象**。OV 证书需要"信誉积累"——同一个证书签的安装包要被全球若干用户安装、不被举报，过几周到几个月 SmartScreen 才会信任。

短期方案：

1. 用户教程里教用户点 `More info` → `Run anyway`
2. 把安装包提交给 [Microsoft SmartScreen 信誉申诉](https://www.microsoft.com/en-us/wdsi/filesubmission)（个人提交速度快）
3. 等不及就升 EV 证书

### Q4: 没有 macOS 怎么打 macOS 包？

技术上可以在 Linux/Windows CI 跑 `electron-builder`，但**不能本地签名 + 公证**（需要钥匙串 + notarytool）。所以：

- macOS 出包**必须**用 macOS runner（GitHub Actions `macos-14`，免费 CI 一个月有 2000 分钟）
- 或者租云端 Mac mini（如 macincloud.com，~$30/月）

### Q5: 我能不能跳过公证 / 签名先发出来？

**macOS**：技术上可以打出未签名 .dmg，但用户首次打开时 macOS Gatekeeper 直接拒绝运行（不仅是警告），用户必须右键 `Open` 或者命令行 `xattr -d com.apple.quarantine` 才能跑——这个体验比"插件安装难度"还高，不推荐。

**Windows**：未签名版本能跑，但 SmartScreen 弹的是红色"Windows protected your PC"，用户要点两次才能 Run。可作为内测使用。

**Linux**：完全无所谓，AppImage 永远不签都没问题。

### Q6: 证书泄漏了怎么办？

立即联系 CA 吊销（Revoke），重新申请。已签发的安装包会保留有效（除非吊销时间戳），但攻击者拿你的证书再签东西就不行了。

**预防**：

- 证书 .p12/.pfx 永远不进 git，只放 GitHub Secrets / Vault
- EV 证书的 USB token 不要插在公共电脑上
- 启用 GitHub Actions 的 `environment` protection rules，发版前要人工 approve
