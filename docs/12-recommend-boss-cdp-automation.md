# 推荐牛人（BOSS RECOMMEND）任务化 + CDP 拟人自动化 — 实施计划

> 状态：草案 v1（2026-05-20）
> 关联：
>
> - `docs/10-frontend-task-sse-integration.md` — 任务 SSE 整体设计
> - `docs/11-task-channel-execute-and-detail.md` — `/results` + `/detail` 接口契约
> - `docs/boss地址资料.md` — BOSS 抓数据 + 风控基线
> - `docs/boss推荐任务完整流程.md` — 产品期望 5 步流程

---

## 0. 一句话目标

**用 Electron 原生 `webContents.debugger` 替代 Playwright，把"推荐牛人"做成可控、可观测、抗风控的任务渠道**：在不开 `--remote-debugging-port` 的前提下，完成「打开推荐页 → 模拟人为滚动加载到 `targetCount` 条 → 模拟点击卡片 / 关闭详情弹框 → 把结果写到 `taskChannel` → SSE 全程对齐 UI 状态」。

---

## 1. 为什么不能再用 Playwright（背景 / 风控边界）

| 信号                                   | 来源                             | 风险                                           |
| -------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `--remote-debugging-port=N` 启动参数   | Playwright `connectOverCDP` 必需 | BOSS 直接判定异常，账号封禁（2026-05-18 实测） |
| 大量 `mouse.move / click / page.click` | Playwright Page API              | 节奏特征、缺失 `isTrusted`                     |
| `navigator.webdriver === true`         | Chromium 标准位                  | 老问题，已被各反爬库覆盖                       |
| `window.__playwright` / `window.__pw`  | Playwright 注入                  | hostile API surface                            |

**新基线**（已在生产生效）：

- **`webContents.debugger.attach('1.3')` + `Network.enable`** 做被动抓包（`electron/src/main/siteNetworkCapture.ts`），**零启动参数、零注入**。
- **`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`** 模拟输入，**`isTrusted=true`**（`electron/src/main/cdpInputDispatcher.ts`，目前只有 click，本计划要扩展）。
- 严格**节奏随机化** + 长 dwell（已在 `bossRecommend.runBossRecommend` 5–15s dwell）。

---

## 2. 现状缺口（一张图）

```
当前已经有：
┌──────────────────────────────────────────┐
│  打开 BOSS tab（TabManager.openOrActivate） │
│  debugger.attach + Network.enable        │
│  siteNetwork.waitForResponse 抓首屏       │
│  clickOnTab（单点击）                       │
│  Vuex BossRecommendData（首屏数据）          │
│  RecommendList.vue（UI 展示）               │
│  TaskStore RECOMMEND channel create       │
└──────────────────────────────────────────┘

仍缺失（本计划要补）：
A. CDP Input 扩展：scroll / hover / key（ESC）
B. 分页：滚到底 → waitForResponse 循环 → 累计到 targetCount
C. 拟人交互：点开卡片 dwell → 关闭弹框（ESC / 关闭按钮）
D. searchTaskConfig 解析（encryptJobId / targetCount）注入到 executor
E. 结果落库到 taskChannel/{tcId}/results
F. TaskStatusCard 推荐 6 步真实绑定
G. 中断 / 风控降级（hard stop + 安全退出）
```

---

## 3. 整体架构

### 3.1 信号流

```
[SearchTasks store.create RECOMMEND channel]
        │
        ▼
[runTask] 解析 searchTaskConfig
  └─ relatedPositionValue → encryptJobId
  └─ maxResumeCount       → targetCount
        │
        ▼
[runBossRecommend(jobId, targetCount, ...)]
  step1. openBossRecommend → 拿 tabId
  step2. siteNetwork.clearCache('boss')
  step3. dwell 5–15s（人为打开页面的"看一眼"时间）
  step4. fetchFirstPage（waitForResponse 抓首屏）
  step5. while accumulated.length < targetCount && hasMore：
           a) cdp.scroll(iframe.recommend-list-wrap, distance, jitter)
           b) waitForResponse 等下一页 /wapi/zpjob/rec/geek/list
           c) merge geekList, push patch 到 BossRecommendData
           d) 随机间隔 2–5s
           e) 偶发：随机点开一张卡 → 1–3s dwell → ESC 关闭弹框
  step6. postBatchResultsToTaskChannel(finished=true) → 写 taskChannel
        │
        ▼
[runTask 末尾] await aiAnalyzingActive=false → commandResult(SUCCESS)
```

### 3.2 模块职责

| 模块                                         | 职责                                                                       | 类型                         |
| -------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| `electron/src/main/cdpInputDispatcher.ts`    | 模拟人为输入：click / scroll / key / evalOnTab                             | main（已有，需扩展）         |
| `electron/src/main/siteNetworkCapture.ts`    | 被动监听网络 + `waitForResponse`                                           | main（已有，无需改动）       |
| **`src/util/automation/humanize.js`**        | **独立、与业务解耦的拟人化操作脚本**（滚动、来回看、点开关闭）所有场景共用 | renderer（**新增核心模块**） |
| `src/util/automation/bossRecommend.js`       | BOSS 推荐主流程：抓取首屏 + 调 humanize + 滚到底加载更多                   | renderer（重构）             |
| `src/store/modules/SearchTasks.js` `runTask` | 拼 jobId/targetCount + 调 executor + 写 taskChannel                        | store                        |
| `src/store/modules/BossRecommendData.js`     | UI 数据源 + 跟 taskChannel 双写桥接                                        | store                        |
| `src/components/clients/TaskStatusCard.vue`  | 推荐 6 步实时绑定                                                          | UI                           |

**关键设计**：把"拟人化操作"做成**独立模块** `humanize.js`，跟 BOSS 业务完全解耦。调用方传入**通用参数**（滚动容器 selector、候选人提取器函数、关闭弹框 selector），脚本本身不知道是 BOSS 还是其他平台。这样：

- 未来智联 / 前程无忧的推荐如果有类似场景，可以直接复用
- 搜索（SEARCH）渠道想加一点拟人停顿也能用同一个脚本
- 单元测试不依赖 BOSS DOM

---

## 4. CDP Input 能力扩展（main 进程）

在 `electron/src/main/cdpInputDispatcher.ts` 加 3 个 API。**全部走 `webContents.debugger.sendCommand`，不开 `remote-debugging-port`，保持 `isTrusted=true`**。

### 4.1 `dispatchScroll(wc, opts)`

通过 `Input.dispatchMouseEvent` 触发 `mouseWheel` 事件（CDP 内置类型）实现可控滚动：

```ts
type ScrollOpts = {
  selector?: string; // 滚动容器 selector（默认 viewport center）
  deltaY: number; // 单次滚动距离（正向下，px）
  jitterY?: number; // ±jitter 像素扰动
  steps?: number; // 拆成 N 次小滚动（更像人手）
  intervalMs?: number; // 步与步之间 ms（带 ±20% jitter）
  expectedFrame?: "main" | "iframe-same-origin";
};
```

实现要点：

- 先用 `Runtime.evaluate` 把 selector 的中心点坐标算出来（含 iframe offset）
- 循环 `steps` 次，每次发 `Input.dispatchMouseEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: stepDelta })`
- 步之间 `sleep(intervalMs * (1 ± jitter))`
- 返回 `{ ok, scrolledY }` 让上层判断是否到底

### 4.2 `dispatchKey(wc, opts)`

```ts
type KeyOpts = {
  key: "Escape" | "Enter" | "ArrowDown" | "Tab" | string;
  modifiers?: number; // CDP modifier 位掩码
  pressHoldMs?: number; // press → hold → release
};
```

用 `Input.dispatchKeyEvent({ type: 'keyDown'|'keyUp', key, ... })`。

### 4.3 `evalOnTab(wc, opts)` — 探针脚本

拟人逻辑需要查询 DOM 状态（候选人 offset / 容器 scrollTop / 是否到底 / 风控信号）。新增 `evalOnTab` 走 `Runtime.evaluate`：

```ts
type EvalOpts = {
  script: string;          // 表达式，必须能 return 一个可序列化对象
  awaitPromise?: boolean;  // 是否 await 内部 Promise（默认 false）
  timeoutMs?: number;
};

evalOnTab(wc, opts): Promise<{ ok, result?, error? }>;
```

实现要点：

- 默认在主 frame 跑；如果 script 用了 `iframe.contentDocument`，自动跨 frame
- 返回值用 `returnByValue: true` 强制序列化（避免拿到 RemoteObject handle）
- script 内任何同步抛错都包到 `{ ok: false, error }`，**不抛到 main 进程**

### 4.4 `dispatchMouseMove(wc, opts)`（可选 P2）

```ts
type MoveOpts = {
  selector?: string;
  toX?: number;
  toY?: number;
  pathPoints?: number; // 中间点数，模拟手抖
  speedPxPerMs?: number; // 速度（带 jitter）
};
```

实现：贝塞尔曲线插值多点 → 多次 `mouseMoved` 事件。**P2 优先级**，P1 先不做（推荐流程主要是 scroll + click + ESC）。

### 4.5 Preload 暴露

`electron/src/preload/index.ts` 的 `window.api.automation` 加：

```ts
scrollOnTab(opts: ScrollOpts & { tabId: number }): Promise<{ ok, scrolledY?, error? }>;
keyOnTab(opts: KeyOpts & { tabId: number }):       Promise<{ ok, error? }>;
evalOnTab(opts: EvalOpts & { tabId: number }):     Promise<{ ok, result?, error? }>;
moveOnTab(opts: MoveOpts & { tabId: number }):     Promise<{ ok, error? }>; // P2
```

跟现有 `clickOnTab` 同样的 IPC 风格。

### 4.6 安全限制（必须）

- 每个 API 默认带 **最大频率限制**（`scroll` ≤ 4Hz，`click/key` ≤ 1Hz/selector），超过的调用直接 reject —— 防止上层逻辑 bug 触发风控
- 所有 API 共用一个**单例锁**，确保同一 tab 不会并发发送 `Input.*`（避免事件顺序错位）
- 调试 log：`[cdpInput] dispatch <type> tabId=X selector=Y t=<elapsed>ms`

---

## 5. 主循环：抓取 + 拟人混合（renderer）

### 5.1 总体时序

```
[启动]
  ↓
[抓首屏] /wapi/zpjob/rec/geek/list → batch1（默认 15 条）
  ↓
  onBatch(batch1, acc) → BossRecommendData / UI
  ↓
[拟人化操作]   ← 在 batch1 这批候选人里浏览
  ↓
  acc.length >= targetCount？
  ├── 是 → break, finished=true
  └── 否 → 继续
      ↓
      [慢速滚到底]   ← 拆 4-8 段小步，每段间隔
       触发 BOSS 自动加载下一页
       ↓
      [siteNetwork.waitForResponse] 等 batch2
       ↓
       acc += batch2，onBatch(batch2, acc) → store + UI
       ↓
      [拟人化操作]   ← 在新的 acc 里浏览
       ↓ ...
       直到 targetCount 或 hasMore=false 或风控
```

**关键设计点**：

- **抓到一批立即推 store / UI**，用户看到的卡片是逐批增长的（不会等所有批次完成才出）
- **拟人化操作在拿到数据之后才执行**（"刚打开页面看到的"，浏览行为合理）
- **加载更多 = 慢速分段滚到底**：不能 `scrollTo(scrollHeight)`，BOSS 后台会看到 deltaY 异常大
- **拟人 + 加载交替循环**：浏览 → 滚到底加载 → 浏览 → 滚到底加载...

### 5.2 主入口 `fetchBossRecommendListAccumulated(args)`

业务侧（`src/util/automation/bossRecommend.js`）的循环——**通过 import 调用独立的 humanize 模块**。

```js
// src/util/automation/bossRecommend.js
import { humanizeBrowse, slowScrollToBottom } from "./humanize";

// BOSS 业务自己的循环兜底参数（跟 humanize 解耦）
const BOSS_RECOMMEND_CONFIG = {
  LOAD_MORE_WAIT_TIMEOUT_MS: 10 * 1000,
  MAX_TOTAL_LOAD_MORE_ROUNDS: 20,
  MAX_TOTAL_DURATION_MS: 8 * 60 * 1000
};

const BOSS_SELECTORS = {
  // 跨 iframe 滚动容器
  scrollSelector: "iframe.recommend-iframe >>> .recommend-list-wrap",
  // 关闭弹框（宿主页 modal，**不带 >>>**）
  closeSelector: [".modal-close", ".geek-card-modal .close-btn", ".dialog-wrap .close"]
};

/**
 * 持续抓 BOSS 推荐列表直到累计够 targetCount 或 hasMore=false 或超时。
 * 在每次拿到新一批后调 humanizeBrowse 做拟人化操作。
 *
 * @param {object} args
 * @param {number}   args.tabId
 * @param {string}   args.encryptJobId
 * @param {number}   args.targetCount   目标条数（searchTaskConfig.maxResumeCount）
 * @param {Function} args.onBatch       (freshBatch, accumulated) => void
 * @param {Function} [args.shouldAbort] () => boolean 外部取消信号
 * @returns {Promise<{ ok, geekList, totalSeen, loadMoreRounds, riskHit?, error? }>}
 */
export async function fetchBossRecommendListAccumulated(args) {
  // 0. 抓首屏（已有 fetchBossRecommendList）
  const sinceTs0 = Date.now();
  const firstR = await fetchBossRecommendList({
    encryptJobId: args.encryptJobId,
    sinceTs: sinceTs0
  });
  if (!firstR.ok) return { ok: false, error: firstR.error };
  let acc = firstR.geekList || [];
  args.onBatch(acc.slice(), acc);

  let loadMoreRounds = 0;
  const startTs = Date.now();
  const seenIdSet = new Set(acc.map((g) => g.geekCard?.geekId || g.id));

  while (
    acc.length < args.targetCount &&
    loadMoreRounds < BOSS_RECOMMEND_CONFIG.MAX_TOTAL_LOAD_MORE_ROUNDS &&
    Date.now() - startTs < BOSS_RECOMMEND_CONFIG.MAX_TOTAL_DURATION_MS
  ) {
    if (args.shouldAbort?.()) return { ok: false, error: "CANCELLED", geekList: acc };

    // 1. 拟人化浏览（独立模块）：把 BOSS 候选人映射成通用 targets
    await humanizeBrowse({
      tabId: args.tabId,
      targets: acc.map((g) => ({
        id: g.geekCard?.geekId || g.id,
        selector: g.geekCard?.securityId
          ? `iframe.recommend-iframe >>> [data-securityid="${g.geekCard.securityId}"]`
          : `iframe.recommend-iframe >>> [data-geekid="${g.geekCard?.geekId || g.id}"]`
      })),
      scrollSelector: BOSS_SELECTORS.scrollSelector,
      closeSelector: BOSS_SELECTORS.closeSelector,
      shouldAbort: args.shouldAbort,
      onEvent: (e, d) => console.log("[bossRecommend.humanize]", e, d)
    });
    if (args.shouldAbort?.()) return { ok: false, error: "CANCELLED", geekList: acc };

    // 2. 风控信号检测（拟人后窗口最容易暴露异常）
    const risk = await detectRiskControl(args.tabId);
    if (risk.hit) {
      return { ok: false, error: "BOSS_RISK_CONTROL", riskHit: risk.reason, geekList: acc };
    }

    // 3. 慢速滚到底触发加载更多（独立模块）
    const sinceTs = Date.now();
    const scrollR = await slowScrollToBottom({
      tabId: args.tabId,
      scrollSelector: BOSS_SELECTORS.scrollSelector
    });
    if (!scrollR.ok) break;

    // 4. 等下一页接口
    const r = await api.siteNetwork.waitForResponse({
      siteKey: "boss",
      urlPattern: "/wapi/zpjob/rec/geek/list",
      sinceTs,
      timeoutMs: BOSS_RECOMMEND_CONFIG.LOAD_MORE_WAIT_TIMEOUT_MS
    });
    if (!r.ok) {
      if (r.code === "TIMEOUT") break; // 到底了，无更多数据
      return { ok: false, error: r.message, geekList: acc };
    }

    // 5. 解析 + 按 geekId 去重 + 合并 + 推回调
    const batch = parseGeekList(r.data);
    const fresh = batch.filter((g) => {
      const id = g.geekCard?.geekId || g.id;
      if (!id || seenIdSet.has(id)) return false;
      seenIdSet.add(id);
      return true;
    });
    if (fresh.length === 0) break; // 列表不再变化

    acc = [...acc, ...fresh];
    args.onBatch(fresh, acc);
    loadMoreRounds++;
  }

  return { ok: true, geekList: acc, totalSeen: acc.length, loadMoreRounds, riskHit: false };
}
```

**关键点**：`humanizeBrowse` 跟 BOSS 业务完全解耦——只接受 `targets` 数组 + `scrollSelector` + `closeSelector`。所有 BOSS 字段（`geekCard.securityId` / `geekCard.geekId`）在业务侧拼成 selector 后传入，模块本身不知道是 BOSS。

### 5.3 跨 iframe selector 协议

BOSS 推荐页 = 宿主 + 嵌套 iframe，滚动容器在 iframe 内部。

约定 selector 语法 `iframe.X >>> .Y`：

- `iframe.recommend-iframe` — 主 frame 内 iframe selector
- `>>>` — 跨 iframe 分隔符
- `.recommend-list-wrap` — iframe `contentDocument` 内 selector

`cdpInputDispatcher` 内部 `resolveSelectorPoint(wc, selector)` 工具：

1. 拆分 `>>>` 得到 outer + inner
2. 主 frame `Runtime.evaluate` 拿 iframe element 的 `getBoundingClientRect()` offset
3. iframe `Runtime.evaluate`（用 `Page.getFrameTree` 找到 iframe 的 `executionContextId`）拿 inner 元素的局部坐标
4. **合并坐标** = iframe offset + inner 局部坐标
5. 返回 `{ x, y, width, height, ok }`

scroll / click / key 都用这个工具拿点位。

### 5.4 风控信号识别

`detectRiskControl(tabId)` 用 `executeJavaScript` 探针检测：

```js
async function detectRiskControl(tabId) {
  const probe = await api.automation.evalOnTab({
    tabId,
    script: `(() => {
      const reasons = [];
      // 1. 滑块 / 验证码
      if (document.querySelector('.boss-verify-popup, .nc-container, .geetest_holder')) reasons.push('verify_popup');
      // 2. 异常提示文案
      const txt = document.body?.innerText || '';
      if (/异常访问|安全验证|请稍后再试|访问受限/.test(txt)) reasons.push('abnormal_text');
      // 3. URL 跳转
      if (/safe\\.zhipin\\.com|passport\\.zhipin\\.com\\/security/.test(location.href)) reasons.push('redirect');
      return reasons;
    })()`
  });
  const reasons = probe?.result || [];
  return { hit: reasons.length > 0, reason: reasons.join(",") };
}
```

降级行为：保留已抓的 `acc`，外层调 `postBatchResultsToTaskChannel(finished=true, acc)`，channel 标 `FAILED` + `error.code = 'BOSS_RISK_CONTROL'`。

---

## 6. 拟人化操作脚本（独立模块，业务无关）

> 文件：`src/util/automation/humanize.js`
> 单一职责：**给定一个 tabId + 一组"目标项"，模拟人在该 tab 里浏览这些项**。
> 业务无关：BOSS 推荐用、智联推荐用、未来任何"翻列表 + 看一眼 + 点击"场景都能用。

### 6.1 模块对外契约

```js
/**
 * @typedef {object} HumanizeTarget
 * @property {string} id            必填，唯一标识（用于日志 / 跨调用去重）
 * @property {string} [selector]    DOM selector（用来 scroll/click），如果不传 anchorIndex 模式仍能跑
 */

/**
 * @typedef {object} HumanizeOptions
 * @property {number}            tabId             目标 tab
 * @property {HumanizeTarget[]}  targets           "目标项"列表（候选人 / 搜索结果 / 任意 DOM 项）
 * @property {string}            scrollSelector    滚动容器 selector（可带 >>> 跨 iframe）
 * @property {(t: HumanizeTarget) => string} [itemSelectorOf]   从 target 拿 click selector，不传则用 t.selector
 * @property {string|string[]}   [closeSelector]   关闭弹框的 selector（点开后用），fallback ESC
 * @property {Partial<typeof HUMANIZE_CONFIG>} [overrides]      覆盖默认参数
 * @property {() => boolean}     [shouldAbort]     外部取消信号
 * @property {(evt: string, data?: any) => void} [onEvent]      事件回调（log/progress）
 */

/**
 * 在 tab 里"装作"浏览 targets 这批项。
 * 操作：随机滚到某项 → hover dwell → 来回看附近几项 → 可能点开+关闭
 *
 * @param {HumanizeOptions} opts
 * @returns {Promise<{ ok, browsedPasses, clicksDone, error? }>}
 */
export async function humanizeBrowse(opts) { ... }
```

**调用方零业务知识**：

```js
// BOSS 推荐里这样用
await humanizeBrowse({
  tabId,
  targets: geekList.map((g) => ({
    id: g.geekCard?.geekId || g.id,
    selector: `iframe.recommend-iframe >>> [data-geekid="${g.geekCard?.geekId}"]`
  })),
  scrollSelector: "iframe.recommend-iframe >>> .recommend-list-wrap",
  closeSelector: [".modal-close", ".geek-card-modal .close-btn", ".dialog-wrap .close"],
  shouldAbort: () => store.state.SearchTasks.tasksById[taskId]?.taskStatus === "STOPPED",
  onEvent: (e, d) => console.log("[boss-recommend]", e, d)
});

// 智联推荐里这样用（虚构例子）
await humanizeBrowse({
  tabId,
  targets: candidateList.map((c) => ({ id: c.id, selector: `[data-cv-id="${c.id}"]` })),
  scrollSelector: ".cv-list-container",
  closeSelector: ".cv-detail-close",
  onEvent: (e, d) => console.log("[zhilian]", e, d)
});
```

### 6.2 顶部参数常量 `HUMANIZE_CONFIG`

所有可调节奏放模块顶部，方便调试时改。**导出**让其他模块也能拿到默认值。

```js
/**
 * 拟人化操作的全部参数。
 *
 * 命名规则：
 *   - { min, max }    随机区间，每次调用都 randInt/randFloat
 *   - 单值数字          固定常量（一般是兜底上限 / 全局超时）
 *   - 0~1 浮点         概率（Math.random() < ?）
 *
 * 调参原则：在风控边界内尽量"慢且杂"。线上跑不稳就先调大间隔，别调小。
 *
 * 覆盖方式：humanizeBrowse({ overrides: { CLICK_CANDIDATE_PROBABILITY: 0 } })
 *           会跟默认 deep merge（浅一层即可，配置不嵌套）。
 */
export const HUMANIZE_CONFIG = {
  // ===== 浏览节奏（humanizeBrowse 用） =====
  /** 单批浏览次数（一次浏览 = 滚到某项 + 来回看 + 可能点击） */
  BROWSE_PASSES_PER_BATCH: { min: 2, max: 5 },

  /** 滚动目标位置（相对当前 targets 列表的 0~1 比例） */
  SCROLL_TARGET_INDEX_OFFSET: { min: 0.2, max: 0.85 },

  /** 一次滚动拆成几小步（步数越多越像人） */
  SCROLL_STEPS_PER_HOP: { min: 3, max: 6 },
  /** 每小步之间间隔 ms */
  SCROLL_STEP_INTERVAL_MS: { min: 60, max: 140 },
  /** 每小步滚动距离 px */
  SCROLL_STEP_DELTA_PX: { min: 120, max: 220 },

  /** 滚到目标后停留时间（"hover 看一眼"） */
  HOVER_AT_INDEX_DWELL_MS: { min: 400, max: 1200 },

  /** 来回小幅滚动次数（前后看几个项） */
  BACK_AND_FORTH_HOPS: { min: 1, max: 3 },
  /** 来回滚的方向偏置（0.5 五五开；>0.5 偏向上滚） */
  BACK_HOP_UP_BIAS: 0.55,

  // ===== 点击（humanizeBrowse 用） =====
  /** 单批最多点几次（兜底） */
  CLICK_COUNT_PER_BATCH: { min: 1, max: 2 },
  /** 每次浏览触发点击的概率（0=不点；1=必点） */
  CLICK_PROBABILITY: 0.4,
  /** 点开后停留时间（"看一眼详情"） */
  DETAIL_DWELL_MS: { min: 1500, max: 4000 },
  /** 关闭后再停留（"想了一下"） */
  AFTER_CLOSE_DWELL_MS: { min: 300, max: 900 },
  /** 点击目标选取：偏向当前 anchor 附近（±N 个项范围） */
  CLICK_TARGET_NEARBY_RANGE: 3,

  // ===== 慢速滚到底（slowScrollToBottom 用，独立 API） =====
  /** 拆成 N 段 */
  SCROLL_TO_BOTTOM_STEPS: { min: 4, max: 8 },
  /** 每段之间间隔 ms */
  SCROLL_TO_BOTTOM_STEP_INTERVAL_MS: { min: 200, max: 500 },
  /** 每段滚动距离 px */
  SCROLL_TO_BOTTOM_STEP_DELTA_PX: { min: 200, max: 400 },
  /** 判定到底的余量 px（scrollTop+clientHeight >= scrollHeight - SLACK） */
  AT_BOTTOM_SLACK_PX: 30,

  // ===== 全局兜底 =====
  /** 单次 humanizeBrowse 最大时长（防 BROWSE_PASSES 算出来太大死循环） */
  MAX_BROWSE_DURATION_MS: 30 * 1000
};

/** 业务侧（如 bossRecommend.js）自己的循环兜底参数，跟 humanize 解耦 */
// export const BOSS_RECOMMEND_CONFIG = {
//   LOAD_MORE_WAIT_TIMEOUT_MS: 10 * 1000,
//   MAX_TOTAL_LOAD_MORE_ROUNDS: 20,
//   MAX_TOTAL_DURATION_MS: 8 * 60 * 1000
// };

// 工具
function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function randFloat(min, max) {
  return min + Math.random() * (max - min);
}
function randRange(cfg) {
  return cfg && typeof cfg.min === "number" ? randInt(cfg.min, cfg.max) : 0;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
```

### 6.3 `humanizeBrowse(opts)` — 主入口（导出）

```js
/**
 * 拟人化浏览：滚到某个 target → 来回看 → 可能点击。
 * 每批数据进来后调一次。**完全业务无关**——只认 targets / selectors。
 *
 * @param {HumanizeOptions} opts 见 §6.1 契约
 * @returns {Promise<{ ok, browsedPasses, clicksDone, error? }>}
 */
export async function humanizeBrowse(opts) {
  const {
    tabId,
    targets,
    scrollSelector,
    itemSelectorOf = (t) => t.selector,
    closeSelector,
    overrides = {},
    shouldAbort,
    onEvent
  } = opts;
  const cfg = { ...HUMANIZE_CONFIG, ...overrides };
  const log = (e, d) => onEvent?.(e, d);

  if (!targets || targets.length === 0) return { ok: true, browsedPasses: 0, clicksDone: 0 };
  if (!scrollSelector)
    return { ok: false, error: "NO_SCROLL_SELECTOR", browsedPasses: 0, clicksDone: 0 };

  const browsePasses = randRange(cfg.BROWSE_PASSES_PER_BATCH);
  const maxClicks = randRange(cfg.CLICK_COUNT_PER_BATCH);
  const browseStartTs = Date.now();
  let clicksDone = 0;
  let browsedPasses = 0;

  log("browse_start", { passes: browsePasses, maxClicks, targets: targets.length });

  for (let pass = 0; pass < browsePasses; pass++) {
    if (shouldAbort?.()) {
      log("browse_aborted", { pass });
      return { ok: true, browsedPasses, clicksDone, error: "ABORTED" };
    }
    if (Date.now() - browseStartTs > cfg.MAX_BROWSE_DURATION_MS) {
      log("browse_timeout_per_batch", { pass });
      break;
    }

    // (a) 滚到某个 target
    const ratio = randFloat(cfg.SCROLL_TARGET_INDEX_OFFSET.min, cfg.SCROLL_TARGET_INDEX_OFFSET.max);
    const anchorIndex = Math.min(targets.length - 1, Math.floor(targets.length * ratio));
    const target = targets[anchorIndex];
    const ok = await _scrollToTarget({
      tabId,
      scrollSelector,
      target,
      itemSelectorOf,
      cfg,
      log
    });
    if (!ok) {
      log("scroll_to_target_failed", { pass, anchorIndex });
      continue;
    }

    // (b) hover dwell
    await sleep(randRange(cfg.HOVER_AT_INDEX_DWELL_MS));

    // (c) 来回小幅滚动（前后看几个 target）
    const hops = randRange(cfg.BACK_AND_FORTH_HOPS);
    for (let h = 0; h < hops; h++) {
      const dir = Math.random() < cfg.BACK_HOP_UP_BIAS ? -1 : 1;
      await _smallScrollHop({ tabId, scrollSelector, direction: dir, cfg });
      await sleep(randRange(cfg.HOVER_AT_INDEX_DWELL_MS));
    }

    // (d) 随机点击 target
    if (clicksDone < maxClicks && Math.random() < cfg.CLICK_PROBABILITY) {
      const clicked = await _clickAndClose({
        tabId,
        targets,
        anchorIndex,
        itemSelectorOf,
        closeSelector,
        cfg,
        log
      });
      if (clicked) {
        clicksDone++;
        log("clicked_target", { pass, clicksDone });
      }
    }

    browsedPasses++;
  }

  log("browse_done", { browsedPasses, clicksDone });
  return { ok: true, browsedPasses, clicksDone };
}
```

### 6.4 `_scrollToTarget` — 滚到指定 target（模块内部）

```js
/**
 * 计算目标元素相对滚动容器的 offset，拆步滚过去。
 *
 * 关键：用 evalOnTab 探针拿坐标，**不依赖业务字段**——只用调用方传的 selector。
 */
async function _scrollToTarget({ tabId, scrollSelector, target, itemSelectorOf, cfg, log }) {
  const itemSelector = itemSelectorOf(target);
  if (!itemSelector) return false;

  // 1. 探针：算目标元素 offset
  const probeRes = await api.automation.evalOnTab({
    tabId,
    // selector 可能带 `>>>` 跨 iframe，evalOnTab 用 resolveSelectorPoint 解析
    // 这里探针脚本只需要拿到 element 和 container 的 boundingRect 算 offset
    script: _buildScrollProbeScript(scrollSelector, itemSelector)
  });
  const p = probeRes?.result;
  if (!p?.ok) {
    log("scroll_probe_failed", { reason: p?.reason });
    return false;
  }

  // 2. 目标 scrollTop：让 target 出现在容器中央
  const targetScrollTop = p.itemOffsetInContainer - p.clientHeight / 2;
  const totalDelta = targetScrollTop - p.scrollTop;
  if (Math.abs(totalDelta) < 30) return true; // 已在视区附近

  // 3. 拆步滚（每步加 ±10% jitter）
  const steps = randRange(cfg.SCROLL_STEPS_PER_HOP);
  for (let i = 0; i < steps; i++) {
    const stepDelta = (totalDelta / steps) * (0.9 + Math.random() * 0.2);
    await api.automation.scrollOnTab({
      tabId,
      selector: scrollSelector,
      deltaY: stepDelta,
      steps: 1
    });
    await sleep(randRange(cfg.SCROLL_STEP_INTERVAL_MS));
  }
  return true;
}

/**
 * 拼探针脚本：兼容 `iframe.X >>> .Y` selector。
 * 注意：这是字符串拼接 → 一定要转义 quotes，避免 injection。
 */
function _buildScrollProbeScript(scrollSelector, itemSelector) {
  // 简化版伪代码——实际实现要做 `>>>` 拆分并跨 iframe 查询
  const escS = scrollSelector.replace(/"/g, '\\"');
  const escI = itemSelector.replace(/"/g, '\\"');
  return `(() => {
    // resolveByCompoundSelector 是 evalOnTab 内置的（main 进程注入），支持 >>>
    const container = window.__cdpResolveElement("${escS}");
    const item      = window.__cdpResolveElement("${escI}");
    if (!container || !item) return { ok: false, reason: 'not_found' };
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      ok: true,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
      itemOffsetInContainer: container.scrollTop + (itemRect.top - containerRect.top)
    };
  })()`;
}
```

> **依赖**：`evalOnTab` 主进程实现里要给 page 注入 `window.__cdpResolveElement(selector)` 这个 helper（支持 `>>>` 跨 iframe）。

### 6.5 `_smallScrollHop` — 来回小幅滚动（模块内部）

```js
async function _smallScrollHop({ tabId, scrollSelector, direction, cfg }) {
  const delta = randRange(cfg.SCROLL_STEP_DELTA_PX) * direction;
  await api.automation.scrollOnTab({
    tabId,
    selector: scrollSelector,
    deltaY: delta,
    steps: randRange(cfg.SCROLL_STEPS_PER_HOP),
    intervalMs: randRange(cfg.SCROLL_STEP_INTERVAL_MS),
    jitterY: 20
  });
}
```

### 6.6 `_clickAndClose` — 点开 → dwell → 关闭（模块内部）

```js
async function _clickAndClose({
  tabId,
  targets,
  anchorIndex,
  itemSelectorOf,
  closeSelector,
  cfg,
  log
}) {
  // 在 anchor ± CLICK_TARGET_NEARBY_RANGE 范围内随机挑一个（"刚看到的就点"）
  const range = cfg.CLICK_TARGET_NEARBY_RANGE;
  const lo = Math.max(0, anchorIndex - range);
  const hi = Math.min(targets.length - 1, anchorIndex + range);
  const idx = randInt(lo, hi);
  const target = targets[idx];
  const itemSelector = itemSelectorOf(target);
  if (!itemSelector) return false;

  // 1. 点击 target
  const r = await api.automation.clickOnTab({
    tabId,
    selector: itemSelector,
    requireVisible: true
  });
  if (!r?.ok) {
    log("click_fail", { idx, reason: r?.error });
    return false;
  }

  // 2. dwell（"看一眼详情"）
  await sleep(randRange(cfg.DETAIL_DWELL_MS));

  // 3. 关闭弹框：先尝试 closeSelector（数组按顺序），fallback ESC
  const selectors = Array.isArray(closeSelector)
    ? closeSelector
    : closeSelector
    ? [closeSelector]
    : [];
  let closed = false;
  for (const sel of selectors) {
    const cr = await api.automation.clickOnTab({ tabId, selector: sel, requireVisible: true });
    if (cr?.ok) {
      closed = true;
      break;
    }
  }
  if (!closed) {
    await api.automation.keyOnTab({ tabId, key: "Escape" });
  }

  // 4. 关闭后再停留
  await sleep(randRange(cfg.AFTER_CLOSE_DWELL_MS));
  return true;
}
```

### 6.7 `slowScrollToBottom(opts)` — 慢速分段滚到底（导出）

跟 `humanizeBrowse` 是同一个模块的另一个对外 API（业务侧"加载更多"会调）。

```js
/**
 * 慢速分段滚到底。业务侧用来触发 BOSS / 智联等"列表自动加载下一页"。
 *
 * @param {object} opts
 * @param {number} opts.tabId
 * @param {string} opts.scrollSelector  滚动容器（带 >>> 跨 iframe）
 * @param {Partial<typeof HUMANIZE_CONFIG>} [opts.overrides]
 * @returns {Promise<{ ok, atBottom, stepsExecuted }>}
 */
export async function slowScrollToBottom(opts) {
  const cfg = { ...HUMANIZE_CONFIG, ...(opts.overrides || {}) };
  const totalSteps = randRange(cfg.SCROLL_TO_BOTTOM_STEPS);

  for (let i = 0; i < totalSteps; i++) {
    await api.automation.scrollOnTab({
      tabId: opts.tabId,
      selector: opts.scrollSelector,
      deltaY: randRange(cfg.SCROLL_TO_BOTTOM_STEP_DELTA_PX),
      steps: 2,
      intervalMs: 60,
      jitterY: 30
    });
    await sleep(randRange(cfg.SCROLL_TO_BOTTOM_STEP_INTERVAL_MS));

    // 中途用 evalOnTab 探针判定 atBottom
    const probe = await api.automation.evalOnTab({
      tabId: opts.tabId,
      script: `(() => {
        const c = window.__cdpResolveElement(${JSON.stringify(opts.scrollSelector)});
        if (!c) return { atBottom: false };
        return {
          atBottom: c.scrollTop + c.clientHeight >= c.scrollHeight - ${cfg.AT_BOTTOM_SLACK_PX}
        };
      })()`
    });
    if (probe?.result?.atBottom) {
      return { ok: true, atBottom: true, stepsExecuted: i + 1 };
    }
  }
  return { ok: true, atBottom: false, stepsExecuted: totalSteps };
}
```

### 6.8 模块对外 export 总览

```js
// src/util/automation/humanize.js
export const HUMANIZE_CONFIG = { ... };
export async function humanizeBrowse(opts) { ... }
export async function slowScrollToBottom(opts) { ... }
// 模块内部辅助函数（_scrollToTarget / _smallScrollHop / _clickAndClose / _buildScrollProbeScript）不导出
```

### 6.7 节奏对照表（默认参数下的行为）

| 阶段                                     | 时长（约）        | 动作                                |
| ---------------------------------------- | ----------------- | ----------------------------------- |
| 抓首屏                                   | 5–10s（含 dwell） | open + dwell + waitForResponse      |
| 拟人浏览 1 批（默认 3 次浏览，1 次点击） | 8–20s             | 3× (滚到候选人 + 来回看 + 偶发点击) |
| 慢速滚到底                               | 1.5–4s            | 6 段 × 300ms                        |
| 等下一页                                 | 0.5–2s            | siteNetwork.waitForResponse         |
| **单轮总计**                             | **~15–35s**       | 抓 + 浏览 + 加载                    |

**抓 30 条简历**（每批 15）≈ 2 轮 × 平均 25s = **~50s**。
**抓 100 条简历**（每批 15）≈ 7 轮 × 平均 25s = **~3 分钟**。

### 6.8 调参建议

| 想要的效果         | 调哪个                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| 更像人（慢一点）   | `BROWSE_PASSES_PER_BATCH.max ↑`、`HOVER_AT_INDEX_DWELL_MS.max ↑`、`SCROLL_STEP_INTERVAL_MS ↑`  |
| 加快任务           | `BROWSE_PASSES_PER_BATCH.min ↓`、`CLICK_CANDIDATE_PROBABILITY ↓`、`LOAD_MORE_STEPS.min ↓`      |
| 抗风控（被识别后） | `SCROLL_STEPS_PER_HOP.min ↑ ≥ 5`、`SCROLL_STEP_DELTA_PX.max ↓ ≤ 150`、`AFTER_CLOSE_DWELL_MS ↑` |
| 完全不点 / 必点    | `CLICK_CANDIDATE_PROBABILITY = 0` / `1`                                                        |

**调参铁律**：

- 任何范围的 `min` 不要低于一个生理合理下限（如 hover 不低于 200ms，否则比人手速度还快）
- 不要把 `max` 调得过大：用户等不了
- **严禁** 在脚本里硬编码任何时间值，全部走 `randRange()`

---

## 7. 任务系统集成

### 7.1 解析 `searchTaskConfig`

`runTask` / `searchTaskActionRunner` 必须从 `channel.searchTaskConfig` 拿 `encryptJobId` 和 `targetCount`。

`searchTaskConfig` 创建时是 JSON 字符串（`IndexPage.dispatchTaskStore`），形如：

```json
{
  "relatedPositionValue": "<encryptJobId>",
  "maxResumeCount": 30
}
```

在 `SearchTasks.runTask` 增加 helper：

```js
function parseChannelConfig(ch) {
  if (!ch?.searchTaskConfig) return {};
  if (typeof ch.searchTaskConfig === "object") return ch.searchTaskConfig;
  try {
    return JSON.parse(ch.searchTaskConfig) || {};
  } catch {
    return {};
  }
}
```

然后调 executor 时：

```js
const recommendCh = task.channels.find(c => c.businessChannel === 'RECOMMEND' && c.channelSubType === 'BOSS');
const cfg = parseChannelConfig(recommendCh);
const matchedBossJobId = cfg.relatedPositionValue || null;
const targetCount = Number(cfg.maxResumeCount) || 10;

await aggregateSearchExecutor({
  chatId: task.chatId,
  selectedModules: { search: 任务里有 SEARCH, recommend: !!recommendCh },
  matchedBossJobId,
  resumeCount: targetCount,
});
```

### 7.2 `runBossRecommend` 改造

`src/util/automation/bossRecommend.js` 把 `humanizeBossRecommend`（Playwright）替换成 `fetchBossRecommendListAccumulated`（CDP 版）：

```js
export async function runBossRecommend({ encryptJobId, targetCount, ... }) {
  // 1. 打开 + dwell
  const { tabId } = await openBossRecommend(encryptJobId, ...);
  await sleep(randomBetween(5000, 15000));

  // 2. 累计抓取
  const result = await fetchBossRecommendListAccumulated({
    tabId, encryptJobId, targetCount,
    onBatch: (fresh, acc) => {
      // 实时往 BossRecommendData store 推
      store.commit('setBossRecommendList', {
        jobId: encryptJobId,
        geekList: acc,
        totalSize: acc.length,
        hasMore: true   // 中途
      });
    }
  });

  // 3. 写 taskChannel（finished=true）
  await postRecommendBatchToTaskChannel({
    chatId, channelDesc: 'boss直聘',
    resumeList: result.geekList,
    searchConditionId, filterByRead: false,
    finished: true,
    businessChannel: 'RECOMMEND'    // 新增字段，跟 SEARCH 区分
  });

  return result;
}
```

### 7.3 `taskResumeBridge` 适配 RECOMMEND

`postBatchResultsToTaskChannel` 当前 hardcode `channel.businessChannel`（从 store 反查），但 store 里同一 channelSubType 可能同时有 SEARCH 和 RECOMMEND 两条 channel。需要：

```js
// taskResumeBridge.js
export async function postBatchResultsToTaskChannel(args) {
  // ...
  const channel = store.getters["SearchTasks/getActiveTaskChannelByDescAndBusiness"](
    chatId,
    channelDesc,
    args.businessChannel || "SEARCH"
  );
  // ...
}
```

新增 getter `getActiveTaskChannelByDescAndBusiness`：在 `DESC_TO_SUBTYPE` 基础上加 `businessChannel` 过滤。

### 7.4 `runTask` 末尾对 RECOMMEND channel 的处理

当前 `runTask` 末尾对每个 channel 统一调 `commandResult(SUCCESS)`。需要：

- ✅ commandResult：跟 SEARCH 一样
- ✅ patchChannel COMPLETED：跟 SEARCH 一样
- ✅ totalResultsCount 统计：从 BossRecommendData 拿，不要从 channelConf['ALL'].data
- ❌ /detail 调用：RECOMMEND **不调 /detail**（推荐数据是 ResumeBlind 投影，不带详情；如果未来要 AI 评分，需要后端 detail 接口接受 ResumeBlind 数据）

实际改造：

```js
for (const ch of task.channels) {
  let channelCount = 0;
  if (ch.businessChannel === "RECOMMEND" && ch.channelSubType === "BOSS") {
    const jobId = parseChannelConfig(ch).relatedPositionValue;
    channelCount = rootState?.BossRecommendData?.bucketByJob?.[jobId]?.geekList?.length || 0;
  } else if (ch.businessChannel === "SEARCH") {
    const channelDesc = channelConfMap[ch.channelSubType]?.desc;
    channelCount = channelDesc
      ? allChannelData.filter((item) => item?.channel === channelDesc).length
      : 0;
  }
  // ... commandResult + patchChannel COMPLETED
}
```

---

## 8. UI：`TaskStatusCard` 推荐 6 步

`TaskStatusCard.vue` 当前推荐 6 步硬编码，状态只看 channel `taskChannelStatus`。要让 6 步跟真实进度对齐，需要：

### 8.1 进度信号

`runBossRecommend` 在每个关键阶段往 store 推一个 step：

```js
// SearchTasks store 加 state.taskProgressByChannel: { [tcId]: { step: 1..6, total: 6, message } }
commit("SearchTasks/setChannelProgress", {
  taskChannelId,
  step: 2,
  message: "已打开 BOSS 推荐页，正在 dwell..."
});
```

6 步映射：

| Step | 触发点                            | message 模板                 |
| ---- | --------------------------------- | ---------------------------- |
| 1    | `openBossRecommend` 前            | 正在打开 BOSS 推荐页...      |
| 2    | open 完成，开始 dwell             | 已打开页面，模拟 N 秒浏览... |
| 3    | dwell 完成，开始首屏              | 正在抓取首屏推荐列表...      |
| 4    | 进入累计循环                      | 已抓 X/Y 条，继续滚动加载... |
| 5    | 达到 targetCount 或 hasMore=false | 推荐数据已收齐 X 条          |
| 6    | postBatchResultsToTaskChannel ok  | 已写入任务结果集             |

### 8.2 UI 绑定

`TaskStatusCard` 改成 reactive 拿 `state.taskProgressByChannel[taskChannelId]`：

```vue
<template>
  <div v-for="(step, i) in recommendSteps" :key="i" :class="stepClass(step)">
    <span>{{ step.title }}</span>
    <span>{{ step.message }}</span>
  </div>
</template>
```

---

## 9. 中断 / 风控 / 任务暂停

### 9.1 用户主动停止

`SearchTasks.cancelTask(taskId)`（已有）需要让 runBossRecommend 能响应取消信号：

```js
// 在 fetchBossRecommendListAccumulated 循环里
const isCancelled = () => store.state.SearchTasks.tasksById[taskId]?.taskStatus === 'STOPPED';
while (...) {
  if (isCancelled()) {
    return { ok: false, error: 'CANCELLED' };
  }
  // ...
}
```

### 9.2 BOSS 风控触发

见 §5.3。检测信号 → break → finished=true (acc so far) → channel 标 FAILED + error code。

### 9.3 任务超时

外层 `maxDurationMs = 5 * 60 * 1000` 兜底。

### 9.4 浏览器层异常

- tab 被用户手动关闭：`webContents.on('destroyed')` → 触发 cancelTask
- 网络断开：waitForResponse 持续 TIMEOUT → 走风控降级路径

---

## 10. 实施 Roadmap

按 PR 拆，每个 PR 都能独立验证。

### PR 1 — CDP Input 扩展（main 进程）

- [ ] `cdpInputDispatcher.ts` 加 `dispatchScroll` / `dispatchKey` / `evalOnTab`
- [ ] `resolveSelectorPoint(wc, selector)` 工具支持 `>>>` 跨 iframe 语法
- [ ] preload 暴露 `automation.scrollOnTab` / `keyOnTab` / `evalOnTab`
- [ ] `index.d.ts` 类型补全
- [ ] 频率限制 + 单例锁
- [ ] 验收：在 devtools console 跑 `window.api.automation.scrollOnTab({ tabId, selector: 'iframe.recommend-iframe >>> .recommend-list-wrap', deltaY: 800 })` 能看到列表滚动；`evalOnTab` 能拿到 iframe 内 DOM 状态

### PR 2 — **独立拟人化模块** `src/util/automation/humanize.js`（renderer）

业务无关、可被任何场景复用的拟人化操作脚本。

- [ ] 新建 `src/util/automation/humanize.js`
- [ ] 导出 `HUMANIZE_CONFIG`（顶部参数常量）
- [ ] 导出 `humanizeBrowse(opts)` 主入口（参数见 §6.1 契约）
- [ ] 导出 `slowScrollToBottom(opts)`
- [ ] 模块内部辅助：`_scrollToTarget` / `_smallScrollHop` / `_clickAndClose` / `_buildScrollProbeScript`
- [ ] 工具：`randInt` / `randFloat` / `randRange` / `sleep`
- [ ] **不写 BOSS 业务知识**：所有 selector / 候选人字段都由调用方传入
- [ ] 单元测试：mock `window.api.automation`，验证节奏 / 概率 / abort 信号都生效
- [ ] 验收：可以独立用 mock targets 在任意页面跑通流程

### PR 3 — BOSS 接入：`fetchBossRecommendListAccumulated`（renderer）

把 BOSS 推荐业务包装在独立模块外面，调 humanize 完成拟人操作。

- [ ] `bossRecommend.js` 内新增 `fetchBossRecommendListAccumulated`
- [ ] 业务侧 `BOSS_RECOMMEND_CONFIG`（`LOAD_MORE_WAIT_TIMEOUT_MS` / `MAX_TOTAL_LOAD_MORE_ROUNDS` / `MAX_TOTAL_DURATION_MS`）
- [ ] `BOSS_SELECTORS`（`scrollSelector` / `closeSelector`）
- [ ] 累计去重、`onBatch` 回调、hitLimit 信号
- [ ] **调 `humanizeBrowse` + `slowScrollToBottom`**：把候选人映射成通用 `targets`，selector 拼好后传入
- [ ] 风控信号检测（`detectRiskControl` DOM 探针）
- [ ] 验收：手动跑能抓到 30 条以上，Network 看到多次 `/wapi/zpjob/rec/geek/list`，console 能看到 humanize 模块发出的 `browse_start` / `clicked_target` 事件

### PR 4 — `runBossRecommend` 替换旧 Playwright humanize（renderer）

- [ ] `runBossRecommend` 改用 `fetchBossRecommendListAccumulated`
- [ ] 旧 `bossRecommendHumanize.js` 标为 deprecated（暂不删，保留作为参考）
- [ ] `IndexPage.runRealAggregateSearch` 去掉 `stopAfter: 'firstPage'`，按 `resumeCount` 抓
- [ ] 验收：手动启动一次搜索 + 推荐，看到推荐 tab 累计到 `resumeCount`

### PR 5 — 任务集成（store + runTask）

- [ ] `SearchTasks.runTask` 解析 `searchTaskConfig.relatedPositionValue` + `maxResumeCount`
- [ ] `aggregateSearchExecutor` 调用时正确传 `matchedBossJobId` / `resumeCount`
- [ ] `getActiveTaskChannelByDescAndBusiness` getter
- [ ] `taskResumeBridge.postBatchResultsToTaskChannel` 接受 `businessChannel` 参数
- [ ] `runTask` 末尾对 RECOMMEND channel 单独统计 totalResultsCount
- [ ] 验收：从聊天框启动一次「只勾推荐」任务，Network 看到 `/results?finished=true&businessChannel=RECOMMEND`

### PR 6 — TaskStatusCard 真实绑定

- [ ] `SearchTasks` store 加 `taskProgressByChannel` + `setChannelProgress` mutation
- [ ] `runBossRecommend` 6 个关键点 commit step 信号
- [ ] `TaskStatusCard.vue` 推荐 tab 绑定 reactive step
- [ ] 验收：跑一次推荐任务，卡片 6 步从灰到蓝到绿依次走完

### PR 7 — 中断 / 风控（防御性）

- [ ] cancelTask 信号传到 `fetchBossRecommendListAccumulated`
- [ ] BOSS 风控 DOM 探针 + 连续 timeout 降级
- [ ] webContents.destroyed 监听 → cancel
- [ ] 验收：跑到一半手动关 BOSS tab，任务能正确收敛到 STOPPED；mock 风控页面能正确降级到 FAILED

### PR 8 — Playwright 旧代码清理（可选）

- [ ] 把 `src/playwright/bossRecommendList.js` / `bossRecommendHumanize.js` 标为 archived 或移到 `docs/legacy/`
- [ ] `automation-protocol.md` 加 deprecation warning，指向本文档

---

## 11. 测试与验收

### 11.1 烟测脚本（main 流程）

```text
1. 启动客户端 → 登录 BOSS → 在前端项目里选一个有 encryptJobId 的职位
2. 在 ChatCard 勾选"启用 BOSS 推荐"，启动聚合搜索
3. 观察：
   - 推荐 tab 出现 + 加载中
   - BOSS 浏览器 tab 自动打开
   - 浏览器里看到列表在滚动（人为视觉）
   - Network: 多次 /wapi/zpjob/rec/geek/list，每次 ~5s 间隔
   - DevTools console: [bossRecommend] 步骤日志、cdpInput 调度日志
4. 任务卡片 6 步依次完成
5. 推荐 tab 展示 N 条候选人卡片
6. Network: POST /search/taskChannel/X/results finished=true businessChannel=RECOMMEND
7. Network: POST /search/taskChannel/X/commandResult status=SUCCESS
8. 整套跑完无 console error
```

### 11.2 风控烟测

- mock 一个返回 401 的接口 → 验证降级走 FAILED
- 手动跳到 `safe.zhipin.com` → 验证停止 + warning notify

### 11.3 长跑稳定性

- 连续跑 5 次推荐任务（不同职位）
- 观察：BOSS 账号未被风控 / 滑块、推荐数据无异常

---

## 12. 风险与对策

| 风险                                           | 概率 | 影响                | 对策                                                                          |
| ---------------------------------------------- | ---- | ------------------- | ----------------------------------------------------------------------------- |
| BOSS 改 DOM selector（`.recommend-list-wrap`） | 中   | 滚动失效            | 加 selector 兜底列表 + 每次启动前 sanity check                                |
| BOSS 加更严格 mouseWheel 检测                  | 低   | 滚动被识破          | 已用 `Input.dispatchMouseEvent`（isTrusted=true）；P2 加 hover + 鼠标轨迹模糊 |
| 接口路径改名                                   | 低   | siteNetwork 抓不到  | `urlPattern` 用 substring + 兜底 / fuzzy match                                |
| 并发任务（用户同时启动多个推荐）               | 中   | tab 抢占 / 数据混淆 | `SearchTasks.runningTaskId` 已是单例，串行执行                                |
| iframe selector resolve 失败                   | 中   | scroll 不生效       | `resolveSelectorPoint` 失败时 fallback 到 viewport 中心点滚动                 |

---

## 13. 不在本计划范围

- BOSS **筛选**功能（`BOSS_RECOMMEND_FILTER_V1` 中的筛选 UI 点击）—— 留给后续 PR，思路类似但需要扩展 click 到 select / checkbox
- 推荐数据的**已读 / 收藏**操作 —— 业务层有自己的 markRead 接口，不在自动化范围
- 推荐数据的 **AI 评分**（/detail + queryTaskScoreList）—— 取决于后端是否接受 ResumeBlind 数据
- 智联 / 前程无忧的"推荐"渠道 —— 平台都没有类似机制

---

## 14. 一句话总结

**核心三件事**：①CDP Input 加 scroll/key → ②renderer 改造拟人累计循环 → ③runTask 解析配置 + 写 taskChannel。
**约束铁律**：不开 `--remote-debugging-port`、不调 Playwright runScript、所有 Input 都走 `webContents.debugger.sendCommand`、所有节奏都用 `randomBetween`。
