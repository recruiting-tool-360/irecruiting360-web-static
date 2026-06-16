---
name: boss-recommend-humanize
description: >-
  Humanized browsing loop on BOSS Zhipin "推荐牛人" tab: scroll, hover and
  dwell on each card, then scroll the container to bottom to trigger BOSS's
  natural next-page request, listen for `/wapi/zpjob/rec/geek/list` response,
  accumulate new candidates, and loop until target count reached. **Never
  calls `fetch()` directly** — only DOM actions + `page.on('response')`.
  Use when the user asks for BOSS / 直聘 拟人浏览 / 模拟浏览 / 拟人操作 /
  滚动加载到下一页 / 触发推荐分页, or any task that talks about "看 N 个牛人"
  on the BOSS recommend page.
disable-model-invocation: true
---

# BOSS 推荐牛人 - 拟人浏览 + 滚动加载

## 这个 skill 干什么

在**已经打开的** BOSS 宿主 chat 推荐 tab（`/web/chat/recommend?jobid=...`）上：

1. 找推荐 iframe：`page.frameLocator('iframe[src*="/web/frame/recommend"]')`
2. 在 iframe 里找 `li.card-item .card-inner[data-geekid]` 卡片
3. 对每一张未访问过的：scrollIntoView → hover → 微移鼠标 → **点击卡片**
4. 点击后 iframe 通过 `postMessage` 通知宿主 → **宿主页**渲染候选人详情弹框
5. 在宿主页层面探测弹框（多个选择器 fallback）
6. `sleep(jitter(popupDwellMs))` 随机停留 2-6s（模拟阅读）
7. 关闭弹框：关闭按钮 → ESC → 点遮罩 三级兜底
8. 处理完当前可见卡片后，若还没拿够：
   - 在 iframe 内滚动 `.recommend-list-wrap` 到底部
   - 监听 `/wapi/zpjob/rec/geek/list` 响应（page 级监听跨 frame 有效）
   - 解析 `zpData.geekList`，去重后累计到 `accumulated`
9. 退出条件：`processed >= targetCount` / `pagesLoaded >= maxPages` /
   `zpData.hasMore === false` / 两次滚动都没新卡片

## 真实页面架构（一定要先理解再读脚本）

```
宿主页 https://www.zhipin.com/web/chat/recommend?jobid=<id>
   └── iframe https://www.zhipin.com/web/frame/recommend/?jobid=<id>&...
         ul.card-list
           li.card-item × N
             .card-inner[data-geekid]    ← 点击热区

   点击 .card-inner → iframe.window.parent.postMessage(...)
                  → 宿主页渲染候选人详情弹框（DOM 在宿主 body 下，不在 iframe 内）
```

**绝对不要直接打开 iframe 的 URL**（`/web/frame/recommend/...`）。常人访问推荐页都是
先到 `chat/recommend`，直接进 frame 是脚本式的明显异常路径，被风控秒抓。

## 为什么默认要 click（之前的版本说不点是错的）

之前文档说"点卡片是路由跳转"是基于错误的页面架构假设。**真实行为**：

- 点 `.card-inner` 不会让 iframe 路由跳转
- iframe 内部 postMessage 给宿主，**宿主弹框**
- iframe 列表保持原样

所以**拟人就应该真点**：用户看推荐列表的真实动作就是"点一个看一眼，关掉，看下一个"。
默认 `click=true`。如果需要纯 hover 不点（dev 调试 / 灰度），传 `click: false`。

## 为什么不直接 fetch

业务侧明确要求：**不到万不得已不要 page.evaluate(fetch(...))**。

- 直接 fetch 缺少 BOSS 页面正常发请求时的 Referer / sec-fetch-* / nonce 顺序，
  容易被反爬系统识别
- BOSS 推荐页本身就是滚动触发自动加载，**用就行** —— 滚到底 +
  `page.waitForResponse` 是最不可疑的姿势
- 仅当响应监听总是失败 + DOM 也没动静时，由调用方决定要不要降级

## 输入 ctx

```js
ctx = {
  jobId: '<encryptJobId>',     // 必需（校验 + 日志）
  targetCount: 20,             // 必需：目标"看过"的卡片数

  dwellMs: [800, 2400],        // 不点卡片时 / 点失败时的卡片 hover 停留范围（ms）
  pauseMs: [200, 600],         // 卡片间停顿范围
  popupDwellMs: [2000, 6000],  // 弹框打开后停留范围（模拟阅读）
  maxPages: 10,                // 最多触发几次分页加载（安全阀）
  pageWaitMs: 8000,            // 滚到底后等下一页响应的超时
  popupWaitMs: 4000,           // 点击后等候选人详情弹框出现的超时

  click: true,                 // 是否真点卡片，默认 true（推荐：拟人就该点）

  iframePattern: '/web/frame/recommend',     // iframe 的 src 匹配子串
  scrollContainer: '.recommend-list-wrap',   // iframe 内的滚动容器

  // 可选：覆盖默认的弹框选择器列表（按顺序 fallback）
  popupSelectors: ['.candidate-detail-dialog', '.geek-detail-dialog', ...],

  // 可选：覆盖默认的关闭按钮选择器列表
  closeSelectors: ['.close', '.icon-close', ...]
};
```

## 输出（script `return`）

```js
{
  processed: 20,               // 真正 hover+dwell 过的卡片数
  pagesLoaded: 2,              // 触发了多少次自然分页响应
  accumulated: [               // 监听到的"新增"牛人（首屏由 boss-recommend-list 单独拿）
    { encryptGeekId, name, ageDesc, expectPositionName, ... },
    ...
  ],
  finalDomCount: 60,           // 最后 DOM 里 li.card-item 的数量
  reachedTarget: true,
  stoppedReason: 'target' | 'no_more' | 'max_pages' | 'no_progress' | 'timeout',
}
```

## 错误码（throw `err.code`）

| code                | 触发条件                                  |
|--------------------|-----------------------------------------|
| `NOT_ON_BOSS_DOMAIN` | tab 不在 `*.zhipin.com`                 |
| `BAD_REQUEST`       | ctx.jobId 缺失                          |
| `NO_IFRAME`         | 宿主页 10s 内没找到匹配的 iframe         |
| `NO_CARDS`          | iframe 里 5s 内 DOM 没有任何卡片          |

## 业务侧怎么调（**优先这个，不要自己拼 runScript**）

文件：`src/util/automation/bossRecommend.js`

### 推荐用法 - `runBossRecommend`（一站式）

```js
import { runBossRecommend } from "src/util/automation/bossRecommend";

const res = await runBossRecommend({
  encryptJobId: "61e0cd1cbd6016d90nZ80tq5FVVV",
  targetCount: 20,                          // 用户填的"简历数"
  humanizeOpts: {                           // 可选覆盖
    dwellMs: [1000, 2800],
    pauseMs: [300, 800],
    maxPages: 6
  },
  onProgress(stage, payload) {
    // 'opened' { tabId, url }
    // 'firstPage' { geekList, totalSize, hasMore, source }
    // 'humanized' { processed, pagesLoaded, accumulated, reachedTarget, stoppedReason }
  }
});
// res.geekList 是首屏 + 分页累计的去重合并结果
```

`runBossRecommend` 内部依次：

1. `openBossRecommend(jobId)` → `window.api.automation.openOrActivate('boss', recommendUrl)`
2. `fetchBossRecommendList({...})` → 在 tab 里跑 `bossRecommendList` skill 拿首屏
3. 如果 `firstPage.geekList.length >= targetCount` → 直接返回（不做拟人）
4. 否则 `humanizeBossRecommend({tabId, jobId, targetCount, ...})` → 跑本 skill

### 单独用 `humanizeBossRecommend`（已经知道 tabId）

```js
import { humanizeBossRecommend } from "src/util/automation/bossRecommend";

const res = await humanizeBossRecommend({
  tabId,                       // 必需
  jobId: encryptJobId,
  targetCount: 20,
  dwellMs: [800, 2400],
  pauseMs: [200, 600],
  maxPages: 10,
  click: false
});
```

### 不要直接 runOnTab

业务侧没必要 import `bossRecommendHumanize` 的 scriptCode 自己拼 ctx —
`humanizeBossRecommend` 已经处理了超时估算 / 错误归一化 / logs 收集。

## 关键 DOM 选择器（参考 `docs/boss地址资料.md`"推荐页主结构"）

| 用途 | 容器 | 选择器 |
| - | - | - |
| 推荐 iframe | 宿主页 page | `iframe[src*="/web/frame/recommend"]` |
| 滚动容器 | iframe | `.recommend-list-wrap` |
| 单张卡片 | iframe | `li.card-item` |
| 卡片点击 / hover 热区 | iframe | `li.card-item .card-inner` |
| 牛人 ID | iframe | `li.card-item .card-inner[data-geekid]` |
| 顶部引导卡（要跳过）| iframe | `.list-top-card-wrap` |
| 候选人详情弹框 | **宿主页**（不在 iframe 内）| `.candidate-detail-dialog` 等多个 fallback |

⚠️ **不要使用 `data-v-*` Vue scoped hash**，会随构建变化。
⚠️ Playwright 区分 `frameLocator()`（虚拟）vs `frame.locator()` —— 卡片操作两种都行，
   `.evaluate(...)` 只能在 `frameLocator(...).locator(...).evaluate(...)` 上跑（脚本已经这么写了）。

## 反爬 / 反检测注意点（默认已经做了）

1. `scrollIntoViewIfNeeded` 而不是 `scrollTo(absoluteY)` —— 由浏览器决定怎么滚，更自然
2. 滚动用 `behavior: 'smooth'` —— 不是瞬间跳
3. `hover` + `mouse.move` 微移 1-3 次，offset ±4px —— 真实用户不会停在像素中心
4. `sleep(jitter(min, max))` —— 所有等待都带随机范围，不要固定数值
5. 不发跨页面 fetch（`page.evaluate(fetch)` 是大忌）—— 只触发 DOM，让 BOSS 自然请求
6. `Promise.all([waitForResponse, scroll])` —— 滚动和响应监听**配对**，避免 race condition
7. `page.on('response')` 订阅而非反复 `waitForResponse` —— 减少噪音

## Template scriptCode

`src/playwright/bossRecommendHumanize.js` 里 `export const scriptCode` 已经是
可直接传给 `runScript` 的字符串。直接 import 这个值，**不要让用户复制粘贴一遍**：

```js
import { scriptCode, buildCtx, meta } from 'src/playwright/bossRecommendHumanize';
```

调用方一般直接走 `humanizeBossRecommend` / `runBossRecommend` 封装，不需要碰这个常量。

## 字段速查（accumulated 数组元素）

来自 BOSS `/wapi/zpjob/rec/geek/list` 响应 `zpData.geekList[i]`，参考
`docs/boss地址资料.md`"推荐页主结构"小节后的字段表。常见字段：

| 字段                           | 含义                |
|-------------------------------|--------------------|
| `encryptGeekId` / `geekId`     | 牛人 ID（主键）       |
| `name` / `geekName`            | 姓名                |
| `genderText` / `gender`        | 性别                |
| `ageDesc` / `age`              | 年龄                |
| `expectPositionName`           | 期望职位             |
| `expectSalaryDesc`             | 期望薪资             |
| `educationName` / `degree`     | 学历                |
| `workYearDesc` / `workYears`   | 工作年限             |
| `locationName` / `city`        | 城市                |
| `companyName` / `company`      | 当前公司             |
| `activeTimeDesc`               | 活跃时间             |
| `skillNames` / `skillRequire`  | 技能 / 关键词         |

## 相关文档

- `src/playwright/bossRecommendHumanize.js` —— 本 skill 的 scriptCode
- `src/playwright/bossRecommendList.js` —— 首屏列表抓取（互补 skill）
- `src/util/automation/bossRecommend.js` —— `runBossRecommend` / `humanizeBossRecommend`
- `src/store/modules/BossRecommendData.js` —— 推荐列表 Vuex 模块（按 jobId 缓存）
- `src/components/clients/RecommendList.vue` —— 推荐 tab 的 UI 组件
- `docs/boss地址资料.md` —— 推荐页 DOM 结构、滚动加载机制、为什么不点卡片
- `docs/automation-protocol.md` §4.7.1/§4.7.2 —— Mode A（pair）vs Mode B（subscribe）网络监听
- `.cursor/skills/boss-recommend-list/SKILL.md` —— 首屏抓取（不要重复实现）
- `.cursor/skills/boss-recommend-filter/SKILL.md` —— 带筛选浮层的列表抓取（不同场景）
- `.cursor/skills/boss-job-list/SKILL.md` —— 隐藏窗口抓我的职位（不同场景）

## 不要做的事

- ❌ 不要在脚本里 `page.goto(...)` —— tab 已由调用方 `openOrActivate` 打开
- ❌ 不要 `page.evaluate(fetch(...))` —— 反爬大忌；让 BOSS 自然请求
- ❌ 不要默认 `click: true` —— 大概率路由跳转，破坏列表
- ❌ 不要硬编码 `data-v-*` 选择器 —— Vue scoped hash 随构建变
- ❌ 不要"无限循环"—— 一定要带 `maxPages` 兜底 + `no_progress` 退出
- ❌ 不要把首屏数据也塞到 accumulated —— 首屏由 `bossRecommendList` 提供，业务侧合并
