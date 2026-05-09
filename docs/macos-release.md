# macOS 发版操作清单（Apple Developer ID + 公证）

> 适用：公司已开通 Apple Developer Program (Org) 账号、用户角色为 Account Holder / Admin / App Manager（普通 Member 申请不了 Developer ID）
>
> 目标：跑 `npm run build:mac:release` 一键打出**已签名 + 已公证**的 `.dmg`，用户机器双击直接装，无任何安全警告
>
> 配套：[`docs/client-signing-guide.md`](./client-signing-guide.md) 原理介绍 / [`docs/build-and-package.md`](./build-and-package.md) 通用打包

---

## 0. TL;DR — 一次准备好之后的日常发版

```bash
# 一次配好的 5 个 env（推荐写到 ~/.zshrc 或 ~/.ikuaizhao.env）：
export CSC_LINK="/Users/zhiyuli/Documents/证书1.p12"
export CSC_KEY_PASSWORD="xxx"
export APPLE_ID="junxianalan@gmail.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxx"
export APPLE_TEAM_ID="xxx"

# 之后每次发版只要这一行：
cd electron && npm run build:mac:release

# 5-15 分钟后 dist/ 下出来 i快招-{ver}.dmg + 已 staple 公证票据
```

---

## 1. 一次性准备（首次只跑一次，之后复用）

### Step 1：确认账号角色

[https://developer.apple.com/account](https://developer.apple.com/account) → Membership

- **Account Holder** ✅ 完整流程都能自己做
- **Admin / App Manager** ⚠️ 能跑公证，但**创建 Developer ID 证书** 必须 Account Holder 来（Apple 限制）
- **Developer / Marketing** ❌ 公证也跑不了，找 Account Holder 把你升级到 App Manager

记下 **Team ID**（10 位字符串，类似 `ABCD1234EF`），后面 `APPLE_TEAM_ID` 要用。

> ⚠️ Apple Developer Portal 创建证书页面，"Developer ID Application" 选项**只对 Account Holder 可点**，
> 其他角色看到的是灰色 + 红字 "This operation can only be performed by the Account Holder."

### Step 1.5：如果你不是 Account Holder（团队协作模式）

证书的私钥保存在生成 CSR 那个人的 keychain 里，所以一定要 Account Holder 在他自己的 Mac 上完成 §1.Step 2-4，
然后把 `.p12` 文件 + 密码安全分发给你。流程如下：

```
┌──────────── Account Holder 的 Mac（一次性）────────────┐
│  1. Keychain Access → 钥匙串助理 → 从证书颁发机构请求    │
│     → 保存 .certSigningRequest                        │
│  2. Apple Developer Portal → Certificates → +         │
│     选 Developer ID Application → 上传 CSR             │
│  3. 下载 .cer → 双击导入 keychain                       │
│  4. Keychain Access → 我的证书 → 找                     │
│     "Developer ID Application: 公司名 (TeamID)"        │
│     → 右键 → 导出为 .p12 → 设强密码                     │
│  5. 把 .p12 + 密码 + Team ID 安全交付给团队成员          │
│  6. Membership → Team Members → 把成员的 Apple ID      │
│     加为 App Manager（让他能跑公证）                     │
└────────────────────────────────────────────────────────┘
                            ↓ .p12 + 密码 + Team ID
┌──────────── 团队成员（你）的 Mac（每次发版）─────────────┐
│  1. .p12 放到 ~/secure/DeveloperID.p12, chmod 600       │
│  2. appleid.apple.com 用自己 Apple ID 生成              │
│     App-Specific Password                              │
│  3. 配 5 个 env（见 §2）                                 │
│  4. npm run build:mac:release                          │
└────────────────────────────────────────────────────────┘
```

**安全注意**：

- `.p12` 不要走钉钉 / 微信明文传，推荐 1Password 团队保险箱 / 加密邮件 / 现场 AirDrop
- 密码（`CSC_KEY_PASSWORD`）单独走另一个渠道
- `.p12` 泄露：Account Holder 去 Developer Portal **revoke** 这张证书，重新走 §1.Step 2-4 申请新的
- 多人共用同一份 `.p12` OK；员工离职时建议 rotate（revoke 重发）

**env 分工对照**：

| 变量                          | 来源                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `CSC_LINK`                    | Account Holder 给的 `.p12` 文件路径                  |
| `CSC_KEY_PASSWORD`            | Account Holder 给的 `.p12` 密码                      |
| `APPLE_TEAM_ID`               | Account Holder 给的 10 位 Team ID                    |
| `APPLE_ID`                    | **你自己的** Apple ID（已被加入 team）               |
| `APPLE_APP_SPECIFIC_PASSWORD` | **你自己**在 appleid.apple.com 生成的 16 位 password |

### Step 2：在 Mac 上生成 CSR（Certificate Signing Request）

```bash
# 选 1：用 GUI（推荐，最稳）
open "/System/Applications/Utilities/Keychain Access.app"
# → 顶部菜单 钥匙串访问 → 证书助理 → 从证书颁发机构请求证书
# → 用户电子邮件：dev@ihire365.com（与你 Apple ID 一致）
# → 常用名称：i快招签名证书
# → 请求选择：保存到磁盘 ✅
# → 文件名：CertificateSigningRequest.certSigningRequest

# 选 2：CLI（一行命令）
openssl req -new -newkey rsa:2048 -nodes \
  -keyout DeveloperID.key \
  -out DeveloperID.csr \
  -subj "/emailAddress=dev@ihire365.com/CN=i快招签名证书/C=CN"
```

CSR 私钥**不能丢**：丢了 `.p12` 就找不回来，必须 revoke 证书重新走流程。

### Step 3：在 Apple Developer 后台创建 Developer ID 证书

1. [https://developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates) → 点 "+"
2. 选 **Developer ID Application**（这是 macOS 桌面应用分发用的；选 "Mac App Distribution" 就错了，那个是 App Store 用的）
3. 上传刚才的 `.certSigningRequest` 文件
4. 下载生成的 `developerID_application.cer`

### Step 4：导出 .p12

```bash
# .cer 双击导入 keychain（私钥已经在 keychain 里）
open developerID_application.cer

# 在 Keychain Access 里：
# → 左侧选 "登录" 钥匙串 → "我的证书"
# → 找到 "Developer ID Application: 公司名 (Team ID)"
# → 右键 → 导出 ...
# → 文件格式：个人信息交换 (.p12)
# → 保存路径：~/secure/DeveloperID.p12（保存到不会同步到 git 的目录）
# → 设置导出密码（⚠️ 这就是 CSC_KEY_PASSWORD，记牢）
```

验证 .p12 可用：

```bash
# 应输出 "MAC: sha256, Iteration ..."
openssl pkcs12 -in ~/secure/DeveloperID.p12 -nokeys -info -passin pass:"<你刚设的密码>"
```

### Step 5：生成 App-Specific Password（公证用）

公证（Notarization）需要用 Apple ID 登录 Apple 服务器。出于安全，**不能直接用主 Apple ID 密码**，必须用 App-Specific Password。

1. 登录 [https://appleid.apple.com/account/manage](https://appleid.apple.com/account/manage)
2. 登录与安全 → App 专用密码 → **生成 App 专用密码**
3. 起个名字：`ikuaizhao-notarize`
4. 系统返回 16 位密码（形如 `abcd-efgh-ijkl-mnop`），**关闭弹窗后再也看不到，必须立刻保存**
5. 这就是 `APPLE_APP_SPECIFIC_PASSWORD`

---

## 2. 配置环境变量

把以下 5 个变量加到 `~/.zshrc`（或新建 `~/.ikuaizhao.env` 单独管理）：

```bash
# ~/.ikuaizhao.env
export CSC_LINK="$HOME/secure/DeveloperID.p12"
export CSC_KEY_PASSWORD="你在 Step 4 设的 p12 密码"
export APPLE_ID="dev@ihire365.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCD1234EF"
```

跑发版前 source 一下：

```bash
source ~/.ikuaizhao.env
# 或在 ~/.zshrc 里写 [[ -f ~/.ikuaizhao.env ]] && source ~/.ikuaizhao.env 自动加载
```

> ⚠️ `.ikuaizhao.env` 不要 commit 到 git。`.gitignore` 已经默认忽略 `.env*`，但放在 home 目录最稳。

---

## 3. 启用公证

`electron-builder.yml` 里改一行（或者命令行 override）：

```yaml
mac:
  notarize: true # 之前默认 false
```

或者**不动 yml**，用我们已经预置的 npm script：

```bash
npm run build:mac:release
# 等价于:
# electron-vite build && electron-builder --mac --config.mac.notarize=true
```

---

## 4. 跑一次完整发版

```bash
cd electron
source ~/.ikuaizhao.env
npm run build:mac:release
```

期间终端会输出：

```
• packaging       platform=darwin arch=arm64
• signing         file=dist/mac-arm64/i快招.app identityName=Developer ID Application: ...
• building        target=DMG
• signing         file=dist/i快招-1.0.0.dmg identityName=Developer ID Application: ...
• notarizing      file=dist/i快招-1.0.0.dmg appleId=dev@ihire365.com
  ...wait 5-15 minutes...
• notarization successful
• stapling        file=dist/i快招-1.0.0.dmg
```

最终产物在 `electron/dist/`：

| 文件                       | 说明                                              |
| -------------------------- | ------------------------------------------------- |
| `i快招-1.0.0.dmg`          | 给用户分发的安装包（已签名 + 已公证 + 已 staple） |
| `i快招-1.0.0.dmg.blockmap` | electron-updater 增量更新用                       |
| `latest-mac.yml`           | 自动更新 manifest                                 |

---

## 5. 验证签名 + 公证

```bash
DMG=dist/i快招-1.0.0.dmg
APP="dist/mac-arm64/i快招.app"

# A. 验证 .app 签名（应输出 Developer ID Application 的证书链）
codesign -dvvv "$APP" 2>&1 | grep -E "Authority|Identifier|TeamIdentifier"
# Authority=Developer ID Application: 公司名 (ABCD1234EF)
# Authority=Developer ID Certification Authority
# Authority=Apple Root CA
# Identifier=com.ihire365.ikuaizhao
# TeamIdentifier=ABCD1234EF

# B. 验证 .app 公证票据已 staple
xcrun stapler validate "$APP"
# Processing: ...
# The validate action worked!

# C. 验证 .dmg 公证票据已 staple
xcrun stapler validate "$DMG"
# The validate action worked!

# D. 模拟用户首次打开（spctl 是 macOS Gatekeeper 的命令行接口）
spctl -a -v "$APP"
# expected: source=Notarized Developer ID
spctl -a -v -t open --context context:primary-signature "$DMG"
# expected: source=Notarized Developer ID
```

四条都过 → **可以放心分发给任何 macOS 用户，双击不会有任何警告**。

---

## 6. 发版后给用户的安装指引

把 `i快招-1.0.0.dmg` 上传到下载站（D9：`https://download.ihire365.com/client/`）。

用户操作：

1. 浏览器下载 dmg
2. 双击 dmg 打开
3. 把 "i 快招" 拖到 Applications 文件夹
4. LaunchPad / Applications 里双击启动 → **无任何安全警告**

> 如果用户首次打开仍然弹"无法验证开发者"，多半是公证未完成或 stapler 没生效。回到 §5 排查。

---

## 7. 公证失败的常见原因

### 7.1 `Could not find APPLE_API_KEY_ID / APPLE_ID` 错误

`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 三个 env 没设全。`source ~/.ikuaizhao.env` 后再跑。

### 7.2 公证 stuck > 30 分钟

Apple 服务器排队，可能首次发版会慢。手动查状态：

```bash
xcrun notarytool history \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD"
# 看最近一条 status，可能是 In Progress / Accepted / Invalid
```

如果是 `Invalid`，用 `xcrun notarytool log <submission-id>` 看具体原因。

### 7.3 `The binary is not signed with a valid Developer ID certificate`

p12 装进 keychain 但权限不对，或者 entitlements.mac.plist 缺关键 entitlement。

```bash
# 检查 keychain 里 identity 是否可用
security find-identity -v -p codesigning
# 期望看到: Developer ID Application: 公司名 (TeamID)
```

如果输出有 `(unsupported)` 或 `(CSSMERR_TP_CERT_EXPIRED)`，证书过期或损坏，重新 Step 3-4。

### 7.4 `The signature does not include a secure timestamp`

`hardenedRuntime: true` 是公证强制要求，我们 yml 已经配好。如果还报这错，检查是不是 `mac.entitlements` 路径不对。

---

## 8. 后续：自动更新 / CI

发版稳定后下一步：

1. **自动更新**（`electron-updater`）：把 `latest-mac.yml` + `dmg` + `blockmap` 三件套上传到 [`docs/build-and-package.md`](./build-and-package.md) §6 提到的 publish.url 即可
2. **CI 自动化**：把 5 个 env 配成 GitHub Actions secrets（`MAC_CERT_P12_BASE64` 用 `base64 -i DeveloperID.p12` 转成字符串），见 [`docs/build-and-package.md`](./build-and-package.md) §6

---

## 9. 文档变更记录

| 日期       | 作者  | 变更                                         |
| ---------- | ----- | -------------------------------------------- |
| 2026-05-09 | lewin | 初稿：公司账号 Developer ID + 公证一站式实战 |
