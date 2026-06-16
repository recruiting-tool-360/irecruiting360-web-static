---
name: boss-job-list
description: >-
  Fetch BOSS Zhipin recruiter "我的职位" list silently in an invisible
  Electron BrowserWindow (show:false). The hidden window loads
  `/web/frame/job/list-new`, CDP listens for `/wapi/zpjob/job/data/list`
  response, captures the body, then auto-destroys the window. **User sees
  nothing** — no tab, no dock entry, no flash, no navigation in user's
  BOSS tab. Use when the user asks for a BOSS / 直聘 / zhipin 职位列表 /
  job list / 我的职位 fetch / 获取职位数据 in the i 快招 client, or
  mentions "隐藏窗口抓接口 / 静默抓取 / 不打扰用户".
disable-model-invocation: true
---

# BOSS 职位列表 - 隐藏窗口静默抓取

## What this skill produces

A small piece of frontend JS that calls into the Electron main process to
spin up an **invisible** `BrowserWindow`, load the BOSS list page, capture
the list API response via CDP, then destroy the window — completely
unobservable to the user.

**This skill does NOT generate a Playwright `scriptCode` string.** That
mechanism (`window.api.automation.runScript`) runs scripts inside an
_existing_ tab's `WebContentsView`, which would disrupt whatever the user
is doing in their BOSS tab. The hidden window approach below is independent
of the tab system.

## Architecture

```
H5 (Vue)                  Electron main                Hidden BrowserWindow
────────                  ─────────────                ────────────────────
fetchBossJobList(params)
   │
   ▼
window.api.automation
   .captureFromHiddenView ──ipc──►  captureFromHiddenView()
       (pageUrl, partition,             │
        capture.urlIncludes)            │  new BrowserWindow({ show:false,
                                        │     webPreferences: { session:
                                        │       session.fromPartition(
                                        │         'persist:ihr360-boss') } })
                                        │
                                        │  webContents.debugger.attach('1.3')
                                        │  → 'Network.enable'
                                        │  → loadURL(list-new)
                                        │       ▲
                                        │       │  page sends
                                        │       │   GET /wapi/zpjob/job/data/list
                                        │       │   (cookies auto, same UA)
                                        │       ▼
                                        │  CDP: Network.responseReceived
                                        │  CDP: Network.loadingFinished
                                        │  CDP: Network.getResponseBody
                                        │       │
                                        │       ▼
                                        │  destroy window + detach debugger
                                        │
                                        ◄──result──{ bodyJson, status, ... }
   ◄──result─── { ok, zpData, ... }
```

Why the captured response cannot be obtained with `session.webRequest`:
`onCompleted` exposes URL / status / headers but **not the body**. CDP's
`Network.getResponseBody` is the only first-party way to read body from main.

## When to use

User says any of:

- "BOSS 我的职位列表 / 获取 BOSS 职位 / 拉职位 / 我发布的职位"
- "调用 `/wapi/zpjob/job/data/list`"
- "用隐藏窗口抓 / 静默抓 / 不打扰用户 / 用户看不见地拉数据"
- "boss-job-list"

## Available primitives

### Main-process building block (already wired)

- File: `electron/src/main/hiddenViewRunner.ts`
- Exposed IPC: `automation:captureFromHiddenView`
- Exposed in preload as `window.api.automation.captureFromHiddenView(req)`

Request shape (`HiddenCaptureRequest`):

```ts
{
  pageUrl: string,                  // 'https://www.zhipin.com/web/frame/job/list-new'
  partition: string,                // 'persist:ihr360-boss' (与 BOSS tab 共用 cookie)
  capture: {
    urlIncludes?: string,           // 'wapi/zpjob/job/data/list' (常用)
    urlPattern?: string,            // 或者正则字符串
    method?: string,                // 默认任意；可锁 'GET'
    matchFirst?: boolean,           // 默认 true：抓到第一条匹配就完成
  },
  timeoutMs?: number,               // 默认 15000
  userAgent?: string,               // 默认与 TabManager 桌面 Chrome UA 一致
  extraHeaders?: Record<string, string>,
}
```

Result shape (`HiddenCaptureResult`):

```ts
{
  ok: boolean,
  data?: {
    url: string,
    method: string,
    status: number,
    bodyJson: unknown | null,       // 已尝试 JSON.parse
    bodyText: string | null,        // 解码后文本
    bodyBytes: number,
    responseHeaders: Record<string, string>,
    durationMs: number,
  },
  error?: {
    code: 'TIMEOUT' | 'PAGE_LOAD_FAILED' | 'CDP_ATTACH_FAILED' |
          'CDP_ERROR' | 'GET_BODY_FAILED' | 'BAD_REQUEST' | 'CANCELLED',
    message: string,
  },
  logs?: string[],
}
```

### Frontend wrapper (already wired)

- File: `src/util/automation/bossJobList.js`
- Function: `fetchBossJobList(params) → Promise<FetchBossJobListResult>`
- Adds BOSS-specific normalization: maps API `code !== 0` to `errorCode`
  (`LOGIN_EXPIRED` when message matches 登录/未登录/login, else `API_ERROR`).

## 你 (agent) 的产出

When asked to "use boss-job-list", emit a **short JS snippet** that calls
`fetchBossJobList`. Do NOT emit Playwright script strings; do NOT call the
raw `captureFromHiddenView` IPC unless the user specifically requests it.

Default snippet:

```js
import { fetchBossJobList } from "src/util/automation/bossJobList";

const res = await fetchBossJobList({
  page: 1,
  searchStr: "", // 可选关键词
  // position / type / comId / tagIdStr 一般无需传，0/空即可
  timeoutMs: 15000
});

if (!res.ok) {
  if (res.errorCode === "LOGIN_EXPIRED") {
    // 引导用户在 BOSS tab 重新登录
  } else if (res.errorCode === "TIMEOUT") {
    // 隐藏窗口超时；可重试或检查网络
  } else {
    console.warn("fetchBossJobList failed:", res.errorCode, res.message);
  }
  return;
}

const { totalSize, hasMore, data: jobs } = res.zpData;
// jobs[i].encryptJobId / jobName / jobStatus / salaryDesc / ...
```

If the user wants raw control (e.g. capture another BOSS endpoint), use:

```js
const r = await window.api.automation.captureFromHiddenView({
  pageUrl: "https://www.zhipin.com/web/frame/job/list-new",
  partition: "persist:ihr360-boss",
  capture: { urlIncludes: "/wapi/zpjob/job/data/list", method: "GET" },
  timeoutMs: 15000
});
```

## Field reference (`zpData.data[i]`)

From `docs/boss地址资料.md` lines 18-101 — keep field names as-is, don't rename.

| 字段                                            | 含义                          |
| ----------------------------------------------- | ----------------------------- |
| `encryptJobId` / `encryptId`                    | 加密职位 ID（推荐主键）       |
| `jobName` / `positionName`                      | 职位名                        |
| `jobStatus`                                     | `0` 招聘中 / `3` 已关闭       |
| `jobAuditStatus`                                | `1`/`3` 等审核状态            |
| `city` / `locationName` / `addressShowText`     | 城市 / 地址                   |
| `experienceName`                                | 经验文案 ("5-10 年" 等)       |
| `degreeName`                                    | 学历文案                      |
| `jobTypeName`                                   | "全职" / "实习"               |
| `salaryDesc`                                    | "15-25K" / "150-200 元/天" 等 |
| `lowSalary` / `highSalary` / `salaryMonth`      | 薪资数值                      |
| `viewCount` / `concatCount` / `interestCount`   | 浏览/沟通/感兴趣              |
| `addTime` / `addTimeDesc`                       | 发布时间                      |
| `brandName` / `brandLogo` / `comId` / `brandId` | 公司                          |
| `skillRequire`                                  | 技能要求逗号分隔              |

## Why it's user-invisible (design notes)

- `show: false` → 窗口完全不渲染、不进任务栏 / dock
- `skipTaskbar: true` → 兜底，Win/Linux 上某些 driver 仍会闪
- 不通过 TabManager → TabBar 看不到、`tabs:list` 不返回它
- 不复用用户当前 BOSS tab → 用户正在浏览的页面不会被打断 / 跳转
- `persist:ihr360-boss` partition → cookie 与用户的 BOSS tab 完全共享，
  用户已登录则隐藏窗口自动已登录，反之亦然
- 桌面 Chrome UA → 与主 tab 一致，反爬无差异
- `backgroundThrottling: false` → 防止隐藏窗口的 timer / lazy XHR 被 Chromium 节流误吃

## Limitations & 兜底

- **单次抓取**：当前 `matchFirst: true`，每次只抓一条匹配响应。
  翻页 / fetchAll 需要前端循环调用 `fetchBossJobList({ page: N })`；
  每次都会重新开/销毁一个隐藏窗口，开销 200-500ms / 次。
- **依赖页面自然发起**：如果 BOSS 改了页面或接口路径，要相应改 `capture.urlIncludes`。
- **登录态**：用户没在 BOSS 登录时，list-new 页面会重定向到登录页，
  接口不发起 → 超时（`code: 'TIMEOUT'`）。前端可在 errorCode='TIMEOUT' 时引导用户登录 BOSS。
- **不要在浏览器/web 版调用**：H5 端 `window.api.automation` 不存在；
  调 `isInElectronClient()` 提前判断，或直接处理 `errorCode='NOT_IN_CLIENT'`。

## Related

- `electron/src/main/hiddenViewRunner.ts` — main 实现（不需要改这里就能加新接口）
- `electron/src/preload/index.ts` — `window.api.automation` 注入
- `electron/src/preload/index.d.ts` — `HiddenCaptureRequest` / `HiddenCaptureResult` 类型
- `src/util/automation/bossJobList.js` — 前端封装 + BOSS 业务错误码映射
- `docs/boss地址资料.md` 第 1-285 行 — 原始抓包 URL + zpData 字段
- `docs/automation-protocol.md` — automation 总体架构（注：本 skill 不走 runScript 沙箱路径）

## 不要做的事

- ❌ 不要为这个任务生成 Playwright `scriptCode` 字符串（会污染用户当前 BOSS tab）
- ❌ 不要给主进程加业务字段映射（main 只负责"开窗 + 抓 body + 销毁"，业务字段映射在前端）
- ❌ 不要把 partition 写死成 `'boss'` —— main 端需要完整 partition 名 `'persist:ihr360-boss'`
- ❌ 不要在 timeoutMs 设置过小（< 5s）—— BOSS 页面 SSR + 首屏接口至少要 2-4s
