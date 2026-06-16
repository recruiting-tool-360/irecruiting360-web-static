# 客户端自动更新设计（i快招 Electron）

> 状态：设计稿，未落地。等运维分配下载站目录后按本文档实现。
> 实施方：客户端工程师 + 运维 + 后端（少量）。
>
> 设计取舍参考 [现状插件版本检查机制](#附录-a现状插件版本检查机制) 一节。

---

## 1. 目标

为 `electron/` 客户端引入自动更新能力，要求：

- 启动后**静默**检查更新，零打扰。
- 后台**自动下载**新版本安装包，不阻塞用户使用。
- 下载完成后用户**下次启动应用时自动应用**升级；也允许立即重启升级。
- 强制更新策略：低于"最低支持版本"时**强制弹窗**，否则只提示一次。
- 跨平台：macOS（dmg / zip）+ Windows（NSIS）。
- 与浏览器插件并存，不污染插件升级流程。

---

## 2. 技术选型：electron-updater + generic provider

依赖 `electron-updater@^6`（已在 `electron/package.json` 的 `dependencies` 中），生产 provider 选 `generic`（静态文件 + HTTPS），运维只需要给一个**可写入静态文件**的目录即可，无需后端业务接口。

### 2.1 下载站目录结构（由运维分配）

期望部署在自有 CDN/OSS 上，路径示例：

```
https://download.ihire365.com/ikuaizhao/
  ├── latest.yml                          ← Windows 通道 manifest（electron-builder 自动生成）
  ├── latest-mac.yml                      ← macOS 通道 manifest（electron-builder 自动生成）
  │
  ├── i快招-1.0.1-setup.exe               ← Win 合并包（推荐，自动识别 x64/arm64）
  ├── i快招-1.0.1-x64-setup.exe
  ├── i快招-1.0.1-arm64-setup.exe
  ├── i快招-1.0.1-setup.exe.blockmap      ← 差分更新元数据
  │
  ├── i快招-1.0.1.dmg                      ← macOS x64
  ├── i快招-1.0.1-arm64.dmg               ← macOS arm64
  ├── i快招-1.0.1-mac.zip                  ← macOS x64 zip（给 electron-updater 增量更新用）
  ├── i快招-1.0.1-arm64-mac.zip
  │
  └── client-policy.json                  ← 自研：版本灰度 / 强制升级策略（详见 3.3）
```

> **重要**：`latest.yml` 和 `latest-mac.yml` 是 `electron-builder` 打包时**自动生成**的，里面包含
> 版本号、文件名、SHA512。运维只需要在每次发版时把整批文件**原样上传**到下载站根目录即可。
> 文件名和路径不能改，否则 `electron-updater` 找不到。

### 2.2 运维要求

| 项 | 要求 |
|----|------|
| 协议 | HTTPS（electron-updater 不支持 HTTP） |
| 证书 | 公网受信证书（不能自签） |
| 缓存 | `*.yml` **必须 no-cache**，`*.exe / *.dmg / *.zip / *.blockmap` 可长期缓存 |
| Range 请求 | 必须支持（差分更新依赖） |
| 跨域 | 不需要 CORS（electron-updater 走 net 模块，不受同源策略限制） |
| 目录索引 | 不需要开放 |
| 写入方式 | 运维准备一个上传脚本/工作流，开发者 `npm run build:win:release` / `build:mac:release` 后把 `electron/dist/` 下指定文件批量上传 |

### 2.3 域名候选

建议**复用插件的下载站域名**，路径区分：

```
https://download.ihire365.com/plugin/...      # 现有插件
https://download.ihire365.com/ikuaizhao/...   # 新增客户端
```

如果运维倾向于独立子域，也可以是 `https://client-dl.ihire365.com/`，二选一。

---

## 3. 客户端架构

### 3.1 模块划分

```
electron/
  src/main/
    updater.ts                  ← 新增。autoUpdater 封装 + 状态机 + IPC handler
    index.ts                    ← 改：app.whenReady 后初始化 updater
  src/preload/
    index.ts                    ← 改：通过 contextBridge 暴露 window.api.updater
    index.d.ts                  ← 改：UpdaterBridge 类型
  electron-builder.yml          ← 改：publish.url 指向真实下载站
```

H5 侧（`irecruiting360-web-static/src/`）：

```
src/util/
  clientUpdate.js               ← 新增。客户端模式下替代 pluginVersion.js 的版本检查
src/components/clients/
  ClientUpdateDialog.vue        ← 新增。带下载进度条的更新弹窗（参考 ForceUpdateDialog 样式）
src/pages/search/
  AISearch.vue                  ← 改：初始化时根据 isElectronClient() 走 client 更新 / 插件更新
```

### 3.2 主进程：`updater.ts` 状态机

```
            ┌──────────┐
            │  IDLE    │
            └────┬─────┘
                 │ checkForUpdates()
                 ▼
         ┌────────────────┐
         │  CHECKING      │
         └──┬───────────┬─┘
            │           │
   no-update│           │update-available
            ▼           ▼
         ┌──────┐  ┌──────────────┐
         │ IDLE │  │ DOWNLOADING  │ ──┐ 进度事件 update:progress
         └──────┘  └──────┬───────┘   │
                          │           │ download-progress
                          ▼           │
                  ┌──────────────────┘
                  │
                  ▼
            ┌────────────────┐
            │  DOWNLOADED    │ ──→ 通知 H5 显示"重启升级"按钮
            └────────┬───────┘
                     │ quitAndInstall()  或  应用退出时自动 install
                     ▼
                  应用退出 + 安装新版
```

### 3.3 强制升级策略：`client-policy.json`

运维 / 后端在下载站根目录维护一个独立 JSON 文件（**与 `latest.yml` 分开**，
不要污染 electron-builder 的自动生成产物）：

```json
{
  "latestVersion": "1.0.3",
  "minSupportedVersion": "1.0.1",
  "rolloutPercentage": 100,
  "releaseDate": "2026-05-12T10:00:00+08:00",
  "releaseNotes": "- 修复 BOSS 渠道登录失效\n- 新增智联自动采集",
  "downloadPageUrl": "https://download.ihire365.com/ikuaizhao/"
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `latestVersion` | 当前最新版本（仅用于 H5 展示，真实升级判定由 electron-updater 通过 `latest.yml` 完成） |
| `minSupportedVersion` | 最低支持版本。当前客户端版本 `<` 这个值时进入**强制升级**：弹窗不可关闭，新版下载完成后立即重启应用，不允许"稍后" |
| `rolloutPercentage` | 灰度比例 0–100，按客户端机器 ID hash 分桶，默认 100 |
| `releaseDate` | 仅展示 |
| `releaseNotes` | Markdown 文本，弹窗里展示 |
| `downloadPageUrl` | 万一 electron-updater 下载失败的兜底跳转链接 |

> **policy 文件设计原因**：electron-updater 的 `latest.yml` 只描述"有新版本"，不区分
> "强制 vs 提示"，也不能灰度。所以保留这一个独立 JSON，由 H5 决定 UI 行为。

### 3.4 接口设计：window.api.updater

由 preload 暴露，渲染端调用：

```ts
window.api.updater = {
  // 主动检查更新（默认启动 30s 后自动调一次，之后每 4h 自动调）
  check: () => Promise<{
    status: 'no-update' | 'available'
    currentVersion: string
    latestVersion?: string
    isForce?: boolean       // 由 client-policy.json.minSupportedVersion 决定
    releaseNotes?: string
  }>

  // 立即开始下载（available 状态时调用）
  download: () => Promise<void>

  // 安装并重启（downloaded 状态时调用）
  quitAndInstall: () => void

  // 兜底：跳到下载页让用户手动下载
  openDownloadPage: () => Promise<void>

  // 订阅状态事件
  onState: (cb: (event: UpdaterState) => void) => () => void
}

type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; isForce: boolean; releaseNotes?: string }
  | { phase: 'no-update'; currentVersion: string }
  | { phase: 'downloading'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string; code?: string }
```

### 3.5 IPC 协议

| 通道 | 方向 | 用途 |
|------|------|------|
| `updater:check` | renderer → main | 触发 `autoUpdater.checkForUpdates()` + 拉 client-policy.json |
| `updater:download` | renderer → main | `autoUpdater.downloadUpdate()` |
| `updater:install` | renderer → main | `autoUpdater.quitAndInstall(false, true)` |
| `updater:open-download-page` | renderer → main | `shell.openExternal(downloadPageUrl)` |
| `updater:state` | main → renderer（broadcast） | 推送 `UpdaterState` 到所有 BrowserWindow |

---

## 4. H5 改造

### 4.1 复用现有插件检查框架

参考 `src/pluginSrc/util/pluginVersion.js` 的 `needForceUpdate` 设计，新增对偶模块：

```js
// src/util/clientUpdate.js
import { isElectronClient } from 'src/util/openChannelLoginUrl'

// 客户端版本检查：仅在 Electron 环境下生效
export const needClientUpdate = async () => {
  if (!isElectronClient()) return { flag: false }

  const result = await window.api.updater.check()
  return {
    flag: result.status === 'available' && result.isForce, // 是否强制
    available: result.status === 'available',              // 是否有可用更新
    localVersion: result.currentVersion,
    remoteVersion: result.latestVersion,
    releaseNotes: result.releaseNotes
  }
}
```

### 4.2 AISearch.vue 初始化分支

```js
// 原代码：
let pluginUpdateSwitch = await needForceUpdate()

// 改造后：
let updateSwitch
if (isElectronClient()) {
  updateSwitch = await needClientUpdate()
} else {
  updateSwitch = await needForceUpdate()
}

currentVersion.value = updateSwitch.localVersion
latestVersion.value = updateSwitch.remoteVersion

if (updateSwitch.flag) {
  showForceUpdateDialog.value = true
  return
}
// 非强制但有可用更新 → 显示一次轻提示，记到 localStorage 不重复打扰
if (updateSwitch.available && !localStorage.getItem(`update_dismissed_${updateSwitch.remoteVersion}`)) {
  showSoftUpdateDialog.value = true
}
```

### 4.3 ClientUpdateDialog.vue UI 要求

- **复用 `ForceUpdateDialog.vue` 的视觉风格**（蓝色品牌色、圆角卡片、版本对比 chip）
- 增加**下载进度条**（订阅 `window.api.updater.onState`）
- 强制模式下：按钮文案"立即更新并重启"，无关闭按钮
- 非强制模式下：双按钮"立即更新" / "稍后提醒（24h 内不再弹）"

---

## 5. 打包流程改动

### 5.1 electron-builder.yml

```yaml
publish:
  provider: generic
  url: https://download.ihire365.com/ikuaizhao/   # ← 改这里
  channel: latest
  useMultipleRangeRequest: true
```

`channel` 可后续扩展 `beta` / `canary`，当前固定 `latest`。

### 5.2 发版脚本

`electron/package.json` 新增（运维需要的，不一定客户端工程师写）：

```bash
# 上传脚本由运维提供，下面是约定
./scripts/publish-mac.sh    # 上传 dist/*.dmg / *.zip / latest-mac.yml
./scripts/publish-win.sh    # 上传 dist/*.exe / *.blockmap / latest.yml
./scripts/publish-policy.sh # 上传 client-policy.json（独立操作，允许只改 policy 不发新版本）
```

### 5.3 版本号同步

`electron/package.json` 里 `version` 字段是**唯一**版本号源头，
不要再到处硬编码。每次发版前手动 bump 到目标版本：

```bash
cd electron && npm version 1.0.1 --no-git-tag-version
```

`electron-builder` 会自动把这个版本写进 `latest.yml`、`Info.plist`、Windows VERSIONINFO。

---

## 6. 关键时序

### 6.1 启动时自动检查

```
T+0s    app.whenReady
T+1s    创建主窗口、加载 SPA
T+30s   updater.checkForUpdates()        ← 错峰，避免和 SPA 启动抢带宽
        ├─ 拉 client-policy.json
        ├─ 拉 latest.yml（electron-updater 内置）
        └─ 灰度桶过滤
T+31s   ▼ 三选一
        ├─ no-update    → idle，4 小时后再查
        ├─ available    → 推送 update:state，H5 决定显示哪种弹窗
        └─ error        → 静默吞掉，4 小时后再查
T+31s+  available 时立即开始 downloadUpdate（不需用户确认；和原插件流程一致）
        下载完成 → 推送 downloaded 状态
        用户当次会话不重启的话，下次启动 electron-updater 自动安装
```

### 6.2 强制更新分支

```
H5 拿到 updater.check 结果 { isForce: true }
    ▼
弹 ClientUpdateDialog（persistent，不可关）
    ▼
若已 downloaded → 按钮"立即重启升级" → updater.quitAndInstall()
若还在 downloading → 按钮变 loading + 进度条；下载完后按钮变可点击
若 error          → 按钮"打开下载页" → updater.openDownloadPage()
```

### 6.3 非强制更新分支

```
弹 ClientUpdateDialog（可关闭，有"稍后"按钮）
    "稍后" → localStorage 写 update_dismissed_${version}=1
            （只针对该版本号，下个版本号会再弹一次）
    "立即更新" → 同强制分支
```

---

## 7. 边界 / 异常处理

| 场景 | 处理 |
|------|------|
| 下载站 5xx / DNS 失败 | 静默重试，3 次后放弃，4h 后再查；不打扰用户 |
| 下载到一半网络断开 | electron-updater 内置断点续传（Range 请求） |
| SHA512 校验失败 | 删除已下载文件，下次检查重新下载 |
| 用户主动退出应用 | 已下载未安装 → 在 `before-quit` 调用 `autoUpdater.quitAndInstall(true, false)` 自动安装 |
| 升级失败回滚 | NSIS / DMG 都是覆盖安装，失败后用户重启进入旧版；如多次失败应在 client-policy 临时提高 `minSupportedVersion` 把出问题的版本踢出灰度 |
| 用户禁用了自动更新（未来扩展） | client-policy.json 加 `forceAutoUpdate` 字段，false 时只做检查不下载，由用户点按钮触发 |
| 客户端时间不准 | electron-updater 用版本号比较，不依赖时间 |
| 同机器多用户（Windows） | NSIS `oneClick: true` + `perMachine: false` 安装到 `%LOCALAPPDATA%`，每用户独立 |
| macOS Gatekeeper / 公证 | 上传到下载站的 dmg / zip **必须是公证后的产物**（参考 `docs/macos-release.md`） |
| Windows SmartScreen | release 包需要代码签名（参考 `docs/windows-release.md`），否则会弹"未知发布者" |

---

## 8. 与现有代码的兼容性

### 8.1 不破坏已有插件升级流程

- `needForceUpdate()` 保留，纯浏览器 H5 仍走原逻辑
- 客户端模式下绕开整个插件升级链路（plugin-bridge IPC、`/plugin/forceUpdateConfig` 接口都不调）
- `forceUpdateVisible` / `pluginInstall` 等 Vuex state 在客户端模式下不触发

### 8.2 卸载清理

NSIS 安装包默认会清掉 `%LOCALAPPDATA%/ikuaizhao/` 和注册表。
macOS dmg 卸载靠用户拖进废纸篓，留下的只有 `~/Library/Application Support/i快招/`
和 `~/Library/Preferences/com.ihire365.ikuaizhao.plist`。

⚠️ 升级**不会**清理 userData，cookie / 登录态保留。

### 8.3 灰度发布操作流程

1. 打包发布 1.0.3 → 上传 dist 全套
2. `client-policy.json` 设置 `rolloutPercentage: 10`
3. 观察 1–2 天，没问题改为 `50` → `100`
4. 如有严重 bug，立即把 `rolloutPercentage` 改回 `0`，并 hotfix 1.0.4，
   把出问题的 1.0.3 设为 `minSupportedVersion: 1.0.4`（强制 1.0.3 用户升上来）

---

## 9. 测试清单

- [ ] dev 模式下 mock `client-policy.json` 走全流程（弹窗、进度条、quitAndInstall）
- [ ] 正常更新：1.0.0 → 1.0.1 在 Win / Mac 双平台
- [ ] 强制更新：1.0.0 → 1.0.2（minSupported=1.0.2）弹窗不可关
- [ ] 断网中途：下载到 50% 断网，恢复后续传
- [ ] 跨架构：x64 客户端能识别 latest.yml 拿对的 setup.exe
- [ ] 灰度：rolloutPercentage=0 时全员不弹；=50 时大约一半客户端能拿到
- [ ] 已下载未重启 → 用户主动退出应用 → 下次启动是新版
- [ ] policy 损坏 / 404 → 退化为"只检查 latest.yml，不强制不灰度"

---

## 10. 时间预估（仅客户端工程师工作量）

| 任务 | 预估 |
|------|------|
| `updater.ts` + IPC | 0.5 day |
| preload + 类型 | 0.5 day |
| `ClientUpdateDialog.vue` + `clientUpdate.js` | 1 day |
| 自测 Win + Mac 双平台 | 1 day |
| 文档 / 上传脚本（与运维协作） | 0.5 day |
| **合计** | **3.5 day** |

后端 / 运维新增工作：

- 运维：申请下载站目录 + 上传脚本（半天）
- 后端：无需开发新接口（policy.json 文件运维维护）

---

## 附录 A：现状插件版本检查机制

仅供参考，**客户端模式下不再走此流程**。

```
H5 (AISearch.vue onMounted) → needForceUpdate()
  ├─ a. getPluginVersion()
  │     IPC → 插件 background → chrome.runtime.getManifest().version
  │     返回 "1.0.12"
  │
  ├─ b. forceUpdateConfig()
  │     HTTP GET /plugin/forceUpdateConfig
  │     返回 { version: "v1.0.13", forceUpdate: true }
  │
  └─ c. semver.gte(local, remote) 比较
       false → 弹 ForceUpdateDialog
              → 用户点"立即更新"
                → 弹 PluginInstallDialog
                  → window.open(getDownloadUrl 拿到的 URL)
                  → 用户手动卸装插件、装新包
```

核心痛点：

- 完全依赖用户**手动**卸装 + 重装，断点多
- 强弱更新没有灰度
- 跨域 IPC 链路长，任何一环出问题（插件未启用、background service worker 被回收）都会卡死

客户端方案 C 全部解决，无需用户操作。

---

## 附录 B：参考资料

- electron-updater 文档：https://www.electron.build/auto-update
- electron-builder generic provider：https://www.electron.build/configuration/publish#genericserveroptions
- 当前插件升级实现：`src/pluginSrc/util/pluginVersion.js` + `src/components/plugins/ForceUpdateDialog.vue`
- 代码签名 / 公证：[`docs/macos-release.md`](./macos-release.md) / [`docs/windows-release.md`](./windows-release.md)
- 打包流程：[`docs/build-and-package.md`](./build-and-package.md)
