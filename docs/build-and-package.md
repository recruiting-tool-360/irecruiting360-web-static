# i 快招客户端打包实战指南

> 目标：让你能立刻打出可分发的安装包（dev / release 两档），不用先纠结证书和公证。
>
> 配套：[`docs/client-signing-guide.md`](./client-signing-guide.md) 详细签名教程

---

## TL;DR — 快速打包命令

```bash
cd electron

# ① 最快验证打包链路（不打 dmg/exe，只输出 .app/.exe 目录，~30s）
yarn build:mac:dir       # 输出到 dist/mac-arm64/i快招.app
yarn build:win:dir       # 输出到 dist/win-unpacked/

# ② 打 dev 安装包（不签名 / adhoc，本地能跑，分发会有警告）
yarn build:mac:dev       # 输出 dist/i快招-{ver}.dmg     （macOS）
yarn build:win:dev       # 输出 dist/i快招-{ver}-setup.exe（Windows）

# ③ 打 release 正式包（要先配证书 / 公证 env）
yarn build:mac:release
yarn build:win:release
```

---

## 1. 三档打包模式对比

| 命令 | 输出 | 签名状态 | 用途 | 用户体验 |
|---|---|---|---|---|
| `build:mac:dir` / `build:win:dir` | `.app` / 目录 | adhoc / 无 | 本地最快冒烟 | 双击直接跑 |
| `build:mac:dev` / `build:win:dev` | `.dmg` / `.exe` | adhoc / 无 | 内部测试分发 | macOS"无法验证"警告（右键打开）/ Win SmartScreen 警告 |
| `build:mac:release` / `build:win:release` | `.dmg` / `.exe` | 正式 + 公证 / 正式 | 生产发版 | 无任何警告 |

---

## 2. 第一次打包（无证书）

### macOS

```bash
cd electron
yarn build:mac:dev
# → 终端输出 dist/i快招-1.0.0.dmg
```

**双击 .dmg 安装后，首次打开会弹：**

> "i快招"无法打开，因为 Apple 无法检查其是否包含恶意软件

**绕过方法**（仅首次需要）：
1. 用户右键点 .app（或 LaunchPad 里图标）→ "打开"
2. 弹窗仍提示，点 "打开"按钮
3. 之后该用户机器双击就直接跑了

⚠️ **Apple Silicon (M1/M2/M3) 注意**：
- adhoc 签名（`identity=null`）会自动用 `-` ad-hoc 签名
- 完全不签名的 .app 在 ARM mac 上**直接 `zsh: killed`**，必须 adhoc
- 我们 `build:mac:dev` 已默认走 adhoc，不需额外配置

### Windows

```bash
cd electron
yarn build:win:dev
# → 终端输出 dist/i快招-1.0.0-setup.exe
```

**首次双击安装会弹 SmartScreen：**

> Windows 已保护你的电脑

**绕过方法**：
1. 点弹窗里的 "更多信息"
2. 点 "仍要运行"
3. 安装完成后，开始菜单 / 桌面快捷方式正常使用

⚠️ Windows 用户教育成本比 macOS 高，**建议先签 OV 证书**再大规模分发（详见 §4）。

---

## 3. 验证打包结果

### macOS

```bash
# 查看签名信息
codesign -dv --verbose=4 dist/mac-arm64/i快招.app

# adhoc 签名应该看到：
#   Signature=adhoc
#   Identifier=com.ihire365.ikuaizhao
#   ...

# 跑一下打包出来的 app
open dist/mac-arm64/i快招.app
# 或 dmg
open dist/i快招-*.dmg
```

测试要点：
- [x] 主窗口正常打开，显示标签栏
- [x] 标签栏 mac 红绿灯 + i快招标签 显示正常
- [x] 浏览器访问 `https://login.ihire365.com/client-launcher?mock=1` → 系统弹"是否打开 i快招" → 客户端拉起 + 主页 tab 打开 SSO
- [x] 关闭客户端后再触发 deep link → 应能再次唤起（验证单实例锁）
- [x] cookie 持久化：登录 BOSS 后退出再开，应免登

### Windows

```powershell
# 查看签名信息
signtool verify /pa /v dist\win-unpacked\i快招.exe

# dev 模式应该显示 "No signature found"（正常）
# release 模式应该显示证书信息
```

测试要点：
- [x] `dist/i快招-*-setup.exe` 双击安装后，桌面有"i快招"快捷方式
- [x] `ikuaizhao://` 协议唤起：打开 cmd 跑 `start ikuaizhao://test`，应能拉起客户端
- [x] 卸载后注册表 `HKEY_CLASSES_ROOT\ikuaizhao` 应被清理

---

## 4. 后续接证书 — release 打包

### macOS（强烈建议）

**准备**：Apple Developer Program 账号 + Developer ID Application 证书

```bash
# 1. 在 Mac keychain 安装 .p12 证书（双击 .p12 输入密码即可），
#    或者通过环境变量指定（CI 用）：
export CSC_LINK="/path/to/DeveloperID.p12"
export CSC_KEY_PASSWORD="p12 密码"

# 2. 公证用的 Apple ID 信息
export APPLE_ID="dev@ihire365.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # 在 appleid.apple.com 生成
export APPLE_TEAM_ID="ABCD1234EF"                          # Apple Developer 后台找

# 3. 出包（约 5-10 分钟，公证需要 Apple 服务器审核）
yarn build:mac:release

# 4. 验证公证 stapler 已贴到 .dmg
spctl -a -v dist/i快招-*.dmg
# 应输出: dist/...dmg: accepted
#         source=Notarized Developer ID
```

详见 [`docs/client-signing-guide.md`](./client-signing-guide.md#2-macos-apple-developer-id--notarization) §2

### Windows（推荐）

**准备**：OV 或 EV 代码签名证书

```bash
# 1. 准备证书
export WIN_CSC_LINK="/path/to/cert.pfx"
export WIN_CSC_KEY_PASSWORD="证书密码"

# 2. 在 electron-builder.yml 里取消注释 win.signtoolOptions 块：
#    signtoolOptions:
#      sign: true
#      signingHashAlgorithms: ['sha256']
#      timeStampServer: 'http://timestamp.sectigo.com'

# 3. 出包
yarn build:win:release

# 4. 验证签名
signtool verify /pa /v dist/i快招-*-setup.exe
```

详见 [`docs/client-signing-guide.md`](./client-signing-guide.md#3-windows代码签名证书) §3

---

## 5. 常见问题

### Q1：mac 打包报错 `Cannot find Developer ID identity`

**原因**：`CSC_IDENTITY_AUTO_DISCOVERY=true`（默认）从 keychain 找 Developer ID 证书，但没装。

**解决**：
- 不打正式包：用 `yarn build:mac:dev`（强制 `identity=null`）
- 打正式包：把证书 `.p12` 双击导入 keychain，或设 `CSC_LINK` env

### Q2：mac 打出的 .app 双击 `zsh: killed`

**原因**：Apple Silicon 强制要求至少 adhoc 签名，完全不签的 .app 会被内核 kill。

**解决**：跑 `yarn build:mac:dev` 而不是手动调 `--config.mac.identity=null` 时漏了。

### Q3：Windows 打包报 `code signing tool not found`

**原因**：electron-builder 找 signtool.exe 但没装 Windows SDK，或者找的是有签名 cmd 但没证书。

**解决**：
- 不打正式包：用 `yarn build:win:dev`（明确 `signtoolOptions=null`）
- 打正式包：装 Windows 10/11 SDK + 准备好 .pfx

### Q4：公证步骤卡住超时

**原因**：APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD 错，或 Apple 公证服务繁忙。

**解决**：
- 在 [appleid.apple.com](https://appleid.apple.com) 重新生成 App-specific password
- 用 `xcrun notarytool history --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID --password $APPLE_APP_SPECIFIC_PASSWORD` 查公证历史

### Q5：打包很慢

```bash
# electron 二进制下载用国内镜像（已配在 yml 里）
mirror: https://npmmirror.com/mirrors/electron/

# 强制重新装 native deps（如果换了 electron 大版本要跑）
rm -rf node_modules/.cache
yarn postinstall
```

---

## 6. CI/CD 集成简短示例

GitHub Actions：

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*']

jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd electron && yarn install
      - name: Build (macOS)
        if: matrix.os == 'macos-latest'
        env:
          CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: cd electron && yarn build:mac:release
      - name: Build (Windows)
        if: matrix.os == 'windows-latest'
        env:
          WIN_CSC_LINK: ${{ secrets.WIN_CERT_PFX_BASE64 }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
        run: cd electron && yarn build:win:release
      - uses: actions/upload-artifact@v4
        with:
          name: ikuaizhao-${{ matrix.os }}
          path: electron/dist/*.${{ matrix.os == 'macos-latest' && 'dmg' || 'exe' }}
```

---

## 7. 文档变更记录

| 日期 | 作者 | 变更 |
|---|---|---|
| 2026-05-09 | lewin | 初稿：dev/release 两档打包流程 + 三档命令 |
