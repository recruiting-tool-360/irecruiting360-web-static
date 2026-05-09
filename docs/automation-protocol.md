# 招聘站自动化操作协议（AI Agent ↔ H5 ↔ Electron）

> 状态：设计中 · 落地前需先评审 §6 接口规范、§9 安全模型 与 AI 服务端团队对齐
>
> 适用：i 快招 Electron 客户端在 BOSS / 智联 / 猎聘 / 51Job 等招聘站 tab 内的自动化操作（推荐列表采集、模拟人类行为浏览、捕获接口数据等）
>
> 关联：[`docs/plugin-bridge.md`](./plugin-bridge.md)（已有的客户端原生招聘桥）/ [`docs/client-launcher-flow.md`](./client-launcher-flow.md)（启动数据透传）

---

## 1. 背景

### 1.1 业务场景

AI Agent 服务端要让客户端在招聘网站 tab 上"模拟人类操作"：

- 滚动浏览推荐列表
- 点击牛人卡片，停留几秒看简历
- 捕获接口返回的职位/简历数据
- 翻页 / 切换 tab / 切换职位筛选

每一步操作都要**像真人**（避免被 BOSS 等反爬识别），所以脚本要"慢"、"有节奏"、"有抖动"。

### 1.2 三个角色

| 角色 | 职责 | 升级频率 |
|---|---|---|
| **AI Agent 服务端** | 决策"下一步该干啥"（调哪个工具、传什么参数）；维护任务上下文 | 高（模型、提示、策略迭代） |
| **i 快招 H5（前端）** | 把每个业务工具写成一段 Playwright-style **脚本字符串**（带 schema），运行时打包成 `runScript` 调用送给 Electron；选择器/接口路径/节奏控制全在脚本字符串里 | 中（招聘站改版时跟进） |
| **i 快招 Electron 客户端** | 提供**脚本沙箱**（vm.runInNewContext）+ **真正的 Playwright Page 对象**（通过 `playwright-core.chromium.connectOverCDP` 连到自身 Chromium） | 极低（playwright-core 跟随业务需求按需升；前端业务变更与 Electron 解耦） |

### 1.3 设计目标

> **招聘站改版 / AI 策略迭代 / 工具新增**：只升级 H5（甚至 hot-reload），客户端零改动。

为达成这个目标，**Electron 必须做"脚本沙箱 + Playwright 接管"**——集成 `playwright-core`，通过 CDP 连接到自身 Chromium，把真正的 Playwright Page 对象透传给沙箱里的脚本。绝不内置具体业务逻辑（不写"打开 BOSS 推荐"这种业务函数）。

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│  AI Agent 服务端                                                      │
│  ─────────                                                            │
│  • 任务编排器：根据用户意图生成 Task Plan                              │
│  • 决策模型：每一步选下一个工具（function calling 风格）                │
│  • 上下文记忆：跨步骤数据（已浏览的简历 ID、当前游标 ...）              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ WebSocket / SSE / HTTP long-poll
                             │ (鉴权 + 心跳 + 顺序保证，复用现有 chat 通道)
                             ↕
┌──────────────────────────────────────────────────────────────────────┐
│  i 快招主页 H5（Vue）                                                  │
│  ─────────                                                            │
│  • automation/runner.js：收 AI ToolCall → 查 ALL_TOOLS 拿脚本字符串 │
│  • automation/scripts/{boss,zhilian,liepin,job51}/*.js：           │
│       每个文件 export 一段 Playwright-style 脚本字符串 + schema    │
│  • 选择器 / 接口路径 / 节奏控制 / 抖动逻辑 全部在脚本字符串里        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ window.api.automation.runScript({tabId, scriptCode, ctx, timeoutMs})
                             ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Electron 主进程（脚本沙箱 + 真 Playwright）                         │
│  ─────────                                                            │
│  • app.commandLine.appendSwitch('remote-debugging-port', '0')        │
│  • automation/runner.ts：vm 严格沙箱，注入 page/ctx/log/sleep/jitter │
│  • playwright-core 通过 chromium.connectOverCDP('http://127.0.0.1:N')│
│       接管自身 Chromium，每个 WebContentsView 自动是一个 page         │
│  • TabManager（已有）：tabId ↔ page 映射                              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ Chromium DevTools Protocol / executeJavaScript
                             ↕
┌──────────────────────────────────────────────────────────────────────┐
│  招聘站 tab（WebContentsView，独立 partition）                        │
│  • BOSS / 智联 / 猎聘 / 51Job …                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 任务 / 工具 / 步骤模型

### 3.1 概念定义

| 概念 | 说明 | 谁负责 |
|---|---|---|
| **Task** | 一次完整的自动化目标（如"采集 BOSS 推荐 50 个简历"） | AI 服务端发起 |
| **Step / ToolCall** | 一次工具调用（= 跑一段脚本，可能是单动作也可能是组合流程） | AI 服务端决策，前端执行 |
| **Tool** | 业务工具的定义（带 schema），AI 用 function calling 调用 | 前端定义 |
| **Atom** | Electron 暴露的最小动作（如 `cdp.click`、`network.captureNext`） | Electron 提供 |

### 3.2 串行模型

```
Task 1 ──── Step 1.1 ──→ Step 1.2 ──→ Step 1.3 ──→ ... ──→ done
                                                              ↓
Task 2 ──── Step 2.1 ──→ ...
```

- **同一时间最多一个 Task 在跑**（避免不同任务在招聘站 tab 上互相打断）
- **同一 Task 内部，Step 严格串行**：上一步返回结果后 AI 才决定下一步
- 任务可被用户手动取消（前端 UI 上有"停止"按钮 → IPC `automation.cancel`）

### 3.3 任务生命周期

```
┌─────┐  AI accept   ┌──────────┐  step 1 done   ┌──────────┐
│ NEW │ ───────────→ │ RUNNING  │ ─────────────→ │ RUNNING  │ ──→ ... ──→ DONE
└─────┘              └──────────┘                └──────────┘                ↑
                          │ user cancel / error / timeout                    │
                          ↓                                                  │
                     ┌──────────┐                                            │
                     │ ABORTED  │                                            │
                     └──────────┘                                            │
                                                                             │
                                              所有 Step 成功 ↑               │
                                              收到 AI 的 finish 信号 ───────┘
```

### 3.4 断线重连 / 任务恢复

WebSocket 不稳是常态（用户切网络 / 关电脑屏 / 服务端重启），任务必须能断线后恢复，不能从头重跑。

#### 重连机制

```
H5 端:
  WebSocket 断开 → 指数退避重连 (1s, 2s, 4s, 8s, 30s 上限)
  重连成功 → 立即上行 task.status?

服务端:
  收到 task.status? → 查任务存储:
    - 任务存在且 RUNNING → 回 task.resume {taskId, lastStepId, lastResult}
    - 任务已 DONE/ABORTED → 回 task.finished
    - 没找到 → 回 task.unknown（H5 清本地状态）
```

#### 任务幂等性

每个 ToolCall 必须带唯一 `stepId`，H5 处理 ToolCall 时记录 `processedStepIds`：

```js
// runner.js
const processedSteps = new Map();  // stepId → result

async function handleToolCall(call) {
  // 已处理过 → 直接回放
  if (processedSteps.has(call.stepId)) {
    return processedSteps.get(call.stepId);
  }
  const result = await dispatch(call);
  processedSteps.set(call.stepId, result);
  return result;
}
```

> processedSteps 在 task.start 时清空、task.finish/abort 时清空、断线重连时**保留**（让 AI 重发上一步时不会真跑两遍）。

#### "中间步骤" 的脏状态怎么办？

如果断线发生在脚本执行中（H5 → Electron runScript 已发出，未收到结果），Playwright Page 可能停在浮层半开/弹窗未关的状态。重连后：

- AI 重发 ToolCall（同 stepId）→ H5 没记录 processedSteps（因为没收到完整 result）→ 真的重跑一次
- 重跑前先调一个**"复位"工具**`page.cleanup()`：脚本里写好的"清掉所有浮层 / 弹窗 / 选中态" cleanup script
- 各 channel 自己定义 cleanup（`scripts/boss/cleanup.js`）

#### 客户端重启的恢复

- 用户关闭客户端 / 系统崩溃 → Electron 进程死了 → 任务**直接 ABORTED**
- 重启客户端后 H5 上行 `task.status?`，服务端回 `task.unknown` → AI 端决定重启任务还是丢弃

> MVP 阶段不必做客户端崩溃恢复（依赖太强）。WebSocket 断线重连是必须做的。

---

## 4. Electron 端：真正的 Playwright 沙箱（不会随业务变更升级）

### 4.1 核心理念

**Electron 内集成 `playwright-core`，通过 CDP 连接到自己的 Chromium，让前端脚本拿到 100% 地道的 Playwright Page 对象**：

- 前端发整段脚本字符串给 Electron（业务工具的 `script` 字段）
- Electron 在 vm 沙箱里执行，注入**真正的** Playwright `Page` 对象
- 脚本里所有 API 调用（`page.locator(...)` / `page.waitForResponse(...)` / `page.evaluate(...)` / `page.mouse.click(...)` ...）都是 Playwright 原生实现
- Playwright 通过 CDP 操作 Electron 的 WebContentsView，跟 Playwright 操作独立 Chromium 完全等价
- 业务变更只发版前端 H5，Electron 一年都不用升级
- Electron 这边唯一可能升级的事：playwright-core 版本号（语义化升级，向后兼容）

#### 4.1.1 Electron 端的职责边界（架构约束 — 必读）

**铁则**：**Electron 主进程绝不做任何业务判断**，业务逻辑全部在前端 H5 / 沙箱脚本内。

| 类别 | Electron 主进程 ✅ 做 | Electron 主进程 ❌ 不做 |
|---|---|---|
| **环境** | 启动 CDP 端口 / 通过 playwright-core 接管 Chromium | — |
| **执行** | 在 vm 沙箱里跑前端发的脚本字符串 / 注入 page/ctx/log/sleep/jitter/AbortSignal | 不解析脚本里的业务含义、不做"是否合法"业务判断 |
| **资源管理** | tabId ↔ Page 映射 / 取消信号广播 / sandbox 资源回收 / listener 兜底清理（§4.12.1）| 不管业务工具叫什么、不知道前端有几个工具 |
| **网络** | 仅 webRequest 拦截器装载（已有 `recruitBridge`，跟自动化无关）| 不知道 `/recommend/v2` 是 BOSS 推荐接口、不做接口数据解析 |
| **业务知识** | — | ❌ **不知道**什么是 BOSS / 智联 / preflight / 弹框 / 登录态 / 推荐列表 / 反爬<br>❌ **不维护**工具列表、白名单业务字段、selector、URL 模式<br>❌ **不实现** dispatch 顺序 / 频率限制 / 重试 / preflight 调度 |

**全部业务逻辑在前端**：

| 业务逻辑 | 实现位置 |
|---|---|
| 工具列表 / 白名单 / 调度 | `src/automation/runner.js`（H5）|
| 工具脚本（含 selector / URL / 节奏） | `src/automation/scripts/{boss,zhilian,...}/*.js`（H5 字符串） |
| preflight（页面就绪 / 弹框关闭） | `src/automation/scripts/{channel}/_preflight.js`（H5 字符串） |
| 频率限制 / 漏桶 / 时段感知 | `src/automation/utils/rateLimiter.js`（H5）|
| 错误恢复 / 重试策略 | `src/automation/runner.js` + AI 服务端决策（**不在** Electron）|
| 任务进度 / UI / 取消按钮 | H5 Vue 组件 |

**好处**：
- 招聘站改版 / AI 策略迭代 / 工具新增：发版 H5 即生效，**Electron 一年都不用动**
- 想把这套自动化迁到别的容器（比如 Headless Chromium / Selenium）：脚本字符串和 runner 直接复用，零改动
- 安全审计简单：Electron 端只审计"沙箱够不够严"，业务行为审计在 H5 PR review

> ⚠️ 看到 PR 里 `electron/src/main/` 增加任何 BOSS / 智联 / 工具名 / selector / 业务错误码 → **直接拒掉**，让作者搬到 H5。

### 4.2 为什么用真正的 Playwright（而非自己实现 Playwright-style API）

| 维度 | 自己实现 (~30 个 API) | 真正集成 playwright-core |
|---|---|---|
| **API 完整度** | 子集（80% 业务够用，剩下 20% 等扩展） | 100%（locator / route / dialog / frames / video / a11y / ...）|
| **业务改 selector** | 都是改字符串 ✓ | 都是改字符串 ✓ |
| **业务用新 API** | 要等 Electron 升级实现 | 直接用 ✓ |
| **学习成本** | "Playwright-style"（似是而非） | 标准 Playwright（业界资料丰富） |
| **依赖体积** | 0 | playwright-core ~30 MB（纯 JS，**不含** Chromium 二进制） |
| **维护成本** | 我们自己维护 PageProxy 实现（hard） | 跟 playwright 升级即可 |
| **能否复用业务脚本** | 仅本项目 | 任何 Playwright 环境都能跑（Headless Chromium / CI / ...） |

依赖体积差 30 MB 但收益巨大，**强烈推荐真正集成**。

### 4.3 工作原理（CDP 连接）

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron 主进程                                                  │
│                                                                    │
│  app.commandLine.appendSwitch('remote-debugging-port', '0')       │
│  // '0' 表示随机端口，Electron 启动后通过 process.debugPort 取    │
│                                                                    │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐  │
│  │  automation/runner.ts    │    │  Chromium (内嵌)             │  │
│  │  ─────                   │    │  - HTTP/WS 监听 127.0.0.1:N  │  │
│  │  ① 取 debugPort = N      │    │  - /json/version            │  │
│  │  ② chromium.connectOverCDP│    │  - /devtools/browser/<id>   │  │
│  │     ('http://127.0.0.1:N')│◄───┤  - 每个 WebContentsView     │  │
│  │  ③ 拿 Browser/Context/Page│    │    自动注册为 CDP target    │  │
│  │  ④ vm.runInContext(...)  │    │                             │  │
│  │     注入 page 给沙箱      │    │                             │  │
│  └─────────────────────────┘    └──────────────────────────────┘  │
│                                                                    │
│  ┌──────────── WebContentsView (招聘站 tab) ─────────────────┐    │
│  │  https://www.zhipin.com/web/geek/recommend                │    │
│  │  ↑↑↑ 用户已登录的招聘站，cookie/localStorage 持久在 partition │    │
│  └────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.4 启动配置（一次性改动）

```ts
// electron/src/main/index.ts —— 必须在 app.ready 之前
//
// '0' = 随机端口，避免端口冲突；Electron 启动后用 process.debugPort 拿到实际端口
// 仅监听 127.0.0.1（Chromium 默认行为，外网访问不到）
app.commandLine.appendSwitch('remote-debugging-port', '0');
```

启动后：

```ts
// app.whenReady() 之后
import { chromium, Browser, Page } from 'playwright-core';

let cachedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser?.isConnected()) return cachedBrowser;
  const port = process.debugPort;  // Electron 启动后从这里取实际端口
  cachedBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  return cachedBrowser;
}

async function getPageForTab(tabId: string): Promise<Page> {
  const browser = await getBrowser();
  // Electron 所有 WebContentsView 都在同一个 BrowserContext 下
  const context = browser.contexts()[0];
  const pages = context.pages();
  // 通过 tabId → webContents.id → URL 匹配 page
  const wc = tabManager.getWebContents(tabId);
  return pages.find(p => p.url() === wc.getURL())
      ?? throw new Error(`page for tabId=${tabId} not found in CDP`);
}
```

> 关键：Playwright 的 `connectOverCDP` 是**只读连接**（不会新启 Chromium），多次连接同一进程互不干扰。`browser.close()` 在此模式下等于 disconnect，不会杀 Electron。

### 4.5 唯一对外 IPC 接口

```ts
window.api.automation.runScript({
  tabId: string,            // 在哪个 tab 上跑（TabManager 管理）
  scriptCode: string,       // 前端构造的 Playwright 脚本字符串
  ctx?: object,             // 透传给脚本的上下文参数（job index / dwellMs / ...）
  timeoutMs?: number,       // 整段脚本超时（默认 60s）
}): Promise<AutomationResult>
```

返回：

```ts
interface AutomationResult<T = unknown> {
  ok: boolean
  data?: T            // 脚本 return 出来的值
  error?: { code, message, stack? }
  elapsedMs: number
  logs?: string[]     // 脚本里 log() 调用的输出
}
```

### 4.6 脚本运行环境（沙箱）

脚本字符串等价于一个 async 函数体，运行时被注入这些全局对象：

```js
// 前端发过来的 scriptCode 内可以直接用这些
async function _run({ page, ctx, log, sleep, jitter, AbortSignal }) {
  // page         - playwright-core 的真 Page 对象（Electron WebContentsView 的代理）
  // ctx          - 前端在 runScript 时传入的 ctx 参数
  // log          - 调试输出（结果通过 AutomationResult.logs 回传）
  // sleep(ms)    - 延时（带 abort 支持）
  // jitter(a, b) - 返回 [a, b) 的随机数
  // AbortSignal  - 用户调 cancelAll 时被 trigger，所有 page 调用会感知

  // 业务逻辑都在这里
}
```

Electron 主进程实现：

```ts
// electron/src/main/automation/runner.ts (核心约 80 行)
import vm from 'node:vm';
import { chromium } from 'playwright-core';

ipcMain.handle('automation.runScript', async (_e, { tabId, scriptCode, ctx, timeoutMs = 60000 }) => {
  const page = await getPageForTab(tabId);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('TIMEOUT')), timeoutMs);
  
  try {
    // 严格沙箱：无 process / require / Buffer / global
    const sandbox = vm.createContext(Object.create(null));
    const fn = vm.runInContext(
      `(async ({ page, ctx, log, sleep, jitter, AbortSignal }) => { ${scriptCode} })`,
      sandbox,
      { timeout: 5000, displayErrors: true }
    );
    
    const start = Date.now();
    const data = await fn({
      page,
      ctx,
      log: (msg) => logs.push(String(msg)),
      sleep: (ms) => new Promise((r, _rej) => {
        const t = setTimeout(r, ms);
        ac.signal.addEventListener('abort', () => { clearTimeout(t); _rej(ac.signal.reason); });
      }),
      jitter: (a, b) => a + Math.random() * (b - a),
      AbortSignal: ac.signal,
    });
    
    return { ok: true, data, elapsedMs: Date.now() - start, logs };
  } catch (err) {
    return { ok: false, error: { code: err.name === 'AbortError' ? 'CANCELLED' : 'SCRIPT_ERROR', message: err.message }, elapsedMs: Date.now() - start, logs };
  } finally {
    clearTimeout(timer);
  }
});
```

### 4.7 沙箱里能用的 Playwright API（全集）

**就是 Playwright 官方 Page 类的全部 API**：[https://playwright.dev/docs/api/class-page](https://playwright.dev/docs/api/class-page)

主要类别：

- **导航**：`page.goto / waitForLoadState / waitForURL / reload / goBack / goForward`
- **等待**：`page.waitForSelector / waitForFunction / waitForTimeout / waitForRequest / waitForResponse / waitForEvent`
- **Locator**：`page.locator(selector).{nth, first, filter, click, fill, type, press, hover, dblclick, dragTo, scrollIntoViewIfNeeded, innerText, getAttribute, boundingBox, isVisible, count, ...}`
- **鼠标键盘**：`page.mouse.{click, move, wheel, down, up, dblclick}` / `page.keyboard.{press, type, down, up, insertText}`
- **JS 注入**：`page.evaluate(fn, ...args)` / `page.evaluateHandle` / `page.exposeFunction`
- **网络**：`page.waitForResponse(urlOrPredicate)` / `page.waitForRequest` / `page.route(urlPattern, handler)`（拦截/改写请求）/ `page.on('response', cb)`（订阅）
- **多 frame**：`page.frame(name)` / `page.frames()` / `frameLocator`
- **截图/PDF**：`page.screenshot({ fullPage, clip, mask })` / `page.pdf()`
- **Context/Cookies**：`page.context().{cookies, addCookies, clearCookies, setExtraHTTPHeaders, route, ...}`
- **对话框**：`page.on('dialog', dialog => dialog.accept())`
- **下载**：`page.on('download', dl => dl.saveAs(...))`

> **不需要我们自己实现任何 API**，业务侧脚本想用啥 Playwright 提供啥。

#### 4.7.1 网络拦截：单次同步等 vs 持续订阅 — **怎么选**

接口拦截有两种模式，**90% 业务场景用模式 A**（单次同步等），少数场景用模式 B（持续订阅）。

##### 模式 A：`page.waitForResponse(predicate)` — 默认推荐

```js
// 触发动作 + 等响应（动作和响应配对，明确边界）
const [resp] = await Promise.all([
  page.waitForResponse(r => r.url().includes('/recommend/v2'), { timeout: 10000 }),
  page.mouse.wheel(0, 1500),    // ← 这个动作触发上面那个接口
]);
const data = await resp.json();
return { items: data.zpData?.jobList || [] };
```

特点：
- 注册 → 等下一次匹配 → 拿到就 resolve → **自动 unlisten**
- 适合"**我主动做某事，等它的响应**"
- AI 能明确拿到"这一步的产出"

**场景**：
- 滚动加载下一页 → 等列表接口
- 点击牛人卡片 → 等简历详情接口
- 切换筛选器 → 等列表刷新
- 翻页 → 等下一页接口

##### 模式 B：`page.on('response', cb)` — 持续订阅

```js
const collected = [];
const handler = async (resp) => {
  if (!resp.url().includes('/recommend/v2')) return;
  try { collected.push(await resp.json()); } catch {}
};

try {
  page.on('response', handler);
  await sleep(ctx.durationMs);    // 一段时间内被动收集
  return { batches: collected };
} finally {
  // ⚠️ 必须 off！否则 listener 留在 page 上影响后续脚本 + 内存泄漏
  page.off('response', handler);
}
```

特点：
- 注册后**一直生效**直到手动 off
- 适合"**用户在自由浏览，我后台默默记录**"
- 拿不到"明确边界"，一段时间内触发几次就收几次

**场景**：
- "采集模式"：用户随便浏览 N 秒/分钟，自动记录所有列表数据（见 §5.3 `boss.passiveCollect`）
- "全程监听"：在多步操作期间持续记录所有简历详情请求，最后统一返回
- "侧通道捕获"：主流程在做 X，同时偷偷记录用户做 Y 时触发的接口

##### 关键契约：模式 B 的 listener **必须** off

`page.on('response', cb)` 注册的 listener 会**一直挂在 page 上**，直到：
- 主动 `page.off('response', cb)`（推荐）
- page 被关闭（unload）

如果脚本结束时**没 off**，listener 会留在 page 上：
- 后续脚本里**还会触发**这个 cb（cb 闭包还活着，可能造成奇怪行为）
- listener 累积，内存泄漏

**强制规范**：

```js
// ✅ 正确写法：try/finally 保证 cleanup
const handler = async resp => { /* ... */ };
try {
  page.on('response', handler);
  // ...业务逻辑...
  return result;
} finally {
  page.off('response', handler);  // ← 必须
}
```

```js
// ❌ 错误写法：忘记 off
page.on('response', resp => { /* ... */ });   // 没保存引用，永远 off 不掉
return collected;   // listener 永远留在 page 上 → 内存泄漏 + 行为污染
```

> Electron 主进程的 runner 在脚本超时 / 取消 / 异常时也会**强制清理 page 上所有 listener**（兜底保护，见 §4.12.1）。但脚本作者不应依赖这个兜底，**自己 off 才是最佳实践**。

##### 决策树

```
               ┌─ 是 → 用模式 A (waitForResponse + Promise.all)
   "我主动做一个动作触发接口" ─┤
               └─ 否 → 是否需要拿到所有触发？
                          ├─ 是 → 用模式 B (page.on + try/finally off)
                          └─ 否（只关心当前一次）→ 还是模式 A
```

> AI 主动决策架构里大多用模式 A。模式 B 在"采集观察"场景才用，但**完全支持**且性能优异（Playwright 原生 API）。

### 4.8 多 tab 协调

```js
// 脚本里切 tab 的几种方式
const browser = page.context().browser();
const allPages = page.context().pages();

// 找智联 tab（如果用户已经开了）
const zhilianPage = allPages.find(p => p.url().includes('zhaopin.com'));
if (zhilianPage) {
  await zhilianPage.goto('https://www.zhaopin.com/...');
}

// 或者前端在 runScript 之前先 openOrActivate('zhilian') 拿 tabId，再单独 runScript
```

也支持脚本里用 Electron 的 IPC 切 tab（preload 桥延伸到沙箱）：

```js
await tabs.activate({ channel: 'boss' });  // 通过沙箱注入的 tabs API
```

> ⚠️ `tabs` 是个**有限的辅助对象**，不是完整 IPC，仅注入 activate / openOrActivate / list 几个方法。

### 4.9 前端脚本：100% 地道的 Playwright

```js
// src/automation/scripts/boss/viewResume.js
export const viewResume = {
  description: '点击 BOSS 推荐列表第 N 个牛人卡片，弹窗内停留 N 毫秒后关闭',
  parameters: { /* JSON Schema */ },
  script: `
    const card = page.locator('.recommend-card').nth(ctx.index);
    await card.scrollIntoViewIfNeeded();
    await sleep(jitter(200, 600));
    
    const [resp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/geek/detail'), { timeout: 8000 }),
      card.click(),
    ]);
    const resume = await resp.json();
    
    await sleep(ctx.dwellMs + jitter(-300, 500));
    await page.keyboard.press('Escape');
    
    return { resume: resume.zpData };
  `,
};
```

把 `script` 字段直接复制到 Playwright VS Code 插件里跑，**完全可调试**——这是真 Playwright 的最大好处。

### 4.10 升级策略

| 升级类型 | 触发 | Electron 升级？ |
|---|---|---|
| 业务改 selector / URL pattern / ctx | 招聘站改版 | ❌ 改前端 H5 字符串 |
| 业务用新 Playwright API（如 `page.route` 拦改请求） | AI 想加新策略 | ❌ Playwright 已有，前端直接用 |
| Playwright 修了 bug | 上游版本 | 升级 `playwright-core` 版本号，重发 Electron |
| Electron Chromium 主版本更新 | 安全补丁 | 同上，跟 Playwright 兼容矩阵确认即可 |

### 4.11 脚本数据序列化规则

`runScript` 的返回值要走 IPC 跨进程，受**结构化克隆算法**（structured clone）限制：

| 类型 | 是否支持 |
|---|---|
| `string` / `number` / `boolean` / `null` / `undefined` | ✅ |
| 普通对象 / 数组 | ✅（递归 deep copy） |
| `Date` / `RegExp` / `Map` / `Set` / `ArrayBuffer` / `Uint8Array` | ✅ |
| `Blob` / `File` | ⚠️（Electron IPC 自动转 Buffer，可用） |
| `function` / `class` 实例 / `Symbol` | ❌ 抛错 `DataCloneError` |
| **Playwright 对象**（`Locator` / `Response` / `Page`） | ❌ 不可直接 return |

> 脚本里要 return `Locator` 数据时要先 await 取出值：

```js
// ❌ 错误 — Locator 是个 lazy 对象，不能 return
return page.locator('.item');

// ✅ 正确 — 先取出文本/属性
return await page.locator('.item').nth(0).innerText();

// ❌ 错误 — Response 对象不可序列化
return await page.waitForResponse(...);

// ✅ 正确 — 先 await 拿到 body
const resp = await page.waitForResponse(...);
return { status: resp.status(), data: await resp.json() };
```

Electron 主进程在脚本结束后会用 `JSON.stringify`/`structuredClone` 校验返回值，若包含不可序列化值则抛 `error.code = 'RESULT_NOT_SERIALIZABLE'`。

### 4.12 取消时的 cleanup 协议

当 AI / 用户调 `automation.cancelAll()` 中止任务，**正在执行的脚本会被注入 `AbortError`**。脚本作者应在关键步骤外面包 `try/finally` 确保 UI 不留半开状态：

```js
script: `
  // 打开筛选器后必须关闭，避免遗留浮层挡住后续操作
  const popup = page.locator('.filter-dropdown');
  await trigger.click();
  try {
    // ...业务步骤...
    await page.waitForResponse(...);
    return result;
  } finally {
    // 无论成功 / 失败 / 取消，都尝试关闭浮层
    if (await popup.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
`
```

主进程实现：`runScript` 拿到 `AbortSignal.signal` 后传给 Playwright，Playwright 的 `waitForResponse` / `waitForSelector` 等方法会感知 abort 立即抛错。`finally` 块仍能跑 cleanup（受**有限超时**保护，默认 cleanup 时间 3 秒，超过就强行结束）。

#### 4.12.1 主进程兜底：脚本结束时强制清理 listener

> 这是**通用资源回收**（跟 §4.1.1 的"职责边界"一致：主进程做资源管理，不做业务判断），不涉及业务知识。

`page.on('response', cb)` / `page.on('request', cb)` / `page.on('console', cb)` 等订阅式监听器，如果脚本作者忘了 off，会**留在 page 上影响后续脚本**。主进程统一做兜底保护（diff listener count 后强制 off），不关心业务方为什么 on / 监听了什么 URL：

```ts
// electron/src/main/automation/runner.ts
ipcMain.handle('automation.runScript', async (_e, opts) => {
  const page = await getPageForTab(opts.tabId);
  
  // 记录脚本开始时 page 上的 listener 数量
  const eventsTracked = ['response', 'request', 'requestfailed', 'console', 'dialog'];
  const before = Object.fromEntries(
    eventsTracked.map(ev => [ev, page.listenerCount(ev)])
  );
  
  try {
    return await runUserScript(page, opts);
  } finally {
    // 脚本结束（包括异常 / 取消）后,移除所有"新增"的 listener
    for (const ev of eventsTracked) {
      const after = page.listenerCount(ev);
      const added = after - (before[ev] ?? 0);
      if (added > 0) {
        // 移除新加的 listener（保留 Electron 自己注册的旧 listener）
        const listeners = page.listeners(ev).slice(-added);
        for (const l of listeners) page.off(ev, l);
        console.warn(`[automation] script leaked ${added} ${ev} listeners, force removed`);
      }
    }
  }
});
```

> 这是**兜底保护**，脚本作者**不应**依赖。每次发现脚本泄漏 listener，runner 会打 `WARN` 日志，CI / 监控里能立刻发现问题脚本，及时修复。

### 4.13 partition 与 Playwright BrowserContext 的关系

#### 我们当前的 partition 设计（已有）

```ts
// TabManager.ts
export const SITE_PARTITION = {
  boss:    'persist:ihr360-boss',     // BOSS 招聘 cookie
  zhilian: 'persist:ihr360-zhilian',  // 智联 cookie
  liepin:  'persist:ihr360-liepin',
  job51:   'persist:ihr360-job51',
}
```

每个招聘站的 WebContentsView 用各自 partition，cookie/localStorage 互不干扰。

#### Playwright `connectOverCDP` 看到什么？

⚠️ **关键事实**：Electron 的 `session.fromPartition('persist:xxx')` 在 Chromium 内部对应不同的 `BrowserContext`。`chromium.connectOverCDP` 会把它们**合并**成 Playwright 视角下的多个 context：

```js
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const contexts = browser.contexts();
// contexts.length 通常 >= 4（每个 partition 一个，加上默认 main partition）
```

获取目标 page 时要遍历所有 context：

```ts
async function getPageForTab(tabId: string): Promise<Page> {
  const browser = await getBrowser();
  const tabUrl = tabManager.getUrl(tabId);
  for (const ctx of browser.contexts()) {
    const found = ctx.pages().find(p => p.url() === tabUrl);
    if (found) return found;
  }
  throw new Error(`page not found for tabId=${tabId}`);
}
```

#### `page.context().cookies()` 行为

脚本里 `page.context().cookies()` 取的是**当前 page 所属的 BrowserContext** 的 cookie，正好等于该 partition 的 cookie。这跟我们已有的 `recruitBridge.getCapturedCookies` 行为一致（都是 partition 级），完美兼容。

#### Routes / 拦截规则跨 page 不共享

⚠️ 注意：`page.route(pattern, handler)` 只对当前 page 生效，不会影响同 partition 下其他 page。如果业务要拦改请求（比如改 Origin），要在每个 page 单独注册。

### 4.14 playwright-core 与 Electron Chromium 兼容性矩阵

| Electron 版本 | Chromium 版本 | 推荐 playwright-core |
|---|---|---|
| Electron 30 | Chromium 124 | playwright 1.43+ |
| Electron 32 | Chromium 128 | playwright 1.45+ |
| Electron 34 | Chromium 130 | playwright 1.47+ |
| **Electron 38**（我们当前）| **Chromium 138** | **playwright 1.50+** |

**版本对齐原则**：

- Playwright 主要靠 CDP，CDP 协议在 Chromium 几个版本间向后兼容
- 通常 Playwright 比 Chromium 落后 1-2 个大版本是 OK 的
- Playwright 比 Chromium **新很多** 也通常 OK（Playwright 会向下兼容 CDP）
- 真正不兼容的场景：Chromium 移除了某个 CDP 命令、Playwright 强依赖该命令——极少发生

**升级 Electron 主版本时的检查清单**：

1. 看 [Playwright 兼容矩阵](https://playwright.dev/docs/release-notes) 确认 playwright-core 是否覆盖目标 Chromium 版本
2. 跑一次 `connectOverCDP` 烟测（hello world：`page.goto('https://example.com'); await page.title()`）
3. 跑一次端到端 demo 验证业务脚本仍能 work

> Electron 38（Chromium 138）我们已经用着，第一次集成时建议直接装 `playwright-core@latest`（应该 1.50+ 自动兼容）。后续升级 Electron 前先在 Playwright issues 搜下兼容性反馈。

---

## 5. 前端业务工具集（招聘站改版只改这层）

### 5.1 设计：每个工具 = 一段 Playwright 风格脚本字符串

```
src/automation/
  ├─ runner.js              # 接 AI ToolCall → 拼出 scriptCode → window.api.automation.runScript
  ├─ types.d.ts             # ToolCall / ToolResult 类型
  ├─ scripts/
  │   ├─ boss/
  │   │   ├─ openRecommend.js     # 每个文件 export 一段脚本 + schema
  │   │   ├─ scroll.js
  │   │   ├─ captureRecommendList.js
  │   │   ├─ viewResume.js
  │   │   └─ selectPosition.js
  │   ├─ zhilian/
  │   ├─ liepin/
  │   └─ job51/
  └─ utils/
      ├─ buildScript.js     # 把 schema + 脚本主体序列化成 scriptCode 字符串
      └─ logger.js
```

### 5.2 工具定义形态

每个工具是一个对象，含：
- `description` / `parameters` —— 给 AI function calling
- `script` —— **字符串**，最终会被发到 Electron 沙箱执行
- `buildCtx?` —— 可选，把 AI 给的 args 转换成脚本运行时的 ctx

```js
// src/automation/scripts/boss/viewResume.js
export const viewResume = {
  description: '点击 BOSS 推荐列表第 N 个牛人卡片，弹窗内停留 N 毫秒后关闭，返回简历详情',
  parameters: {
    type: 'object',
    properties: {
      index: { type: 'number', description: '0-based 索引' },
      dwellMs: { type: 'number', default: 4000 },
    },
    required: ['index'],
  },
  // ↓↓↓ 这一段是发给 Electron 沙箱执行的 Playwright-style 脚本 ↓↓↓
  script: `
    const card = page.locator('.recommend-card').nth(ctx.index);
    if ((await card.count()) === 0) {
      throw new Error('未找到第 ' + ctx.index + ' 个牛人卡片，可能列表未加载完');
    }
    await card.scrollIntoViewIfNeeded();
    await sleep(jitter(200, 600));   // 看一下再点

    // 同步等接口 + 点击
    const [resp] = await Promise.all([
      page.waitForResponse(url => url.includes('/geek/detail'), { timeout: 8000 }),
      card.click(),
    ]);
    const resume = await resp.json();

    // 在弹窗里"停留阅读"，含抖动
    await sleep(ctx.dwellMs + jitter(-300, 500));

    // 关闭弹窗
    await page.keyboard.press('Escape');
    await sleep(jitter(300, 700));

    return { resume: resume.zpData };
  `,
};
```

### 5.3 几个典型工具脚本

#### 打开推荐 tab

```js
// src/automation/scripts/boss/openRecommend.js
export const openRecommend = {
  description: '打开 BOSS 推荐 tab 并等待加载完成',
  parameters: { type: 'object', properties: {} },
  script: `
    if (!page.url().includes('zhipin.com/web/geek/recommend')) {
      await page.goto('https://www.zhipin.com/web/geek/recommend', { waitUntil: 'load' });
    }
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    return { url: page.url(), title: await page.title() };
  `,
};
```

#### 平滑滚动

```js
// src/automation/scripts/boss/scroll.js
export const scroll = {
  description: '在 BOSS 推荐页面分段平滑滚动 deltaY 像素',
  parameters: {
    type: 'object',
    properties: {
      deltaY: { type: 'number' },
      segments: { type: 'number', default: 6 },
    },
    required: ['deltaY'],
  },
  script: `
    const total = ctx.deltaY;
    const seg = ctx.segments || 6;
    const step = total / seg;
    for (let i = 0; i < seg; i++) {
      await page.mouse.wheel(0, step + jitter(-10, 10));
      await sleep(jitter(80, 200));
    }
    await sleep(jitter(300, 800));
    return { ok: true, scrolledY: total };
  `,
};
```

#### 截取列表接口（被动等：用于初次进入页面）

```js
// src/automation/scripts/boss/captureRecommendList.js
export const captureRecommendList = {
  description: '被动等下一次 BOSS 推荐列表接口返回（如初次进入页面时的首屏请求）',
  parameters: {
    type: 'object',
    properties: { timeoutMs: { type: 'number', default: 10000 } },
  },
  script: `
    const resp = await page.waitForResponse(
      url => url.includes('/recommend/v2'),  // BOSS 改版改这一行
      { timeout: ctx.timeoutMs || 10000 }
    );
    const data = await resp.json();
    return {
      items: data.zpData?.jobList || [],
      meta: { hasNext: data.zpData?.hasMore, page: data.zpData?.curPage },
    };
  `,
};
```

#### 加载下一页（主动触发 + 等响应，配对模式）

> 这是 **§4.7.1 模式 A** 的典型用法：滚动到底部触发加载，同时等接口响应，二者用 `Promise.all` 配对，确保拿到**这次操作触发的接口数据**。

```js
// src/automation/scripts/boss/loadMore.js
export const loadMore = {
  description: '滚到底部触发 BOSS 推荐列表加载下一页，返回新一页的简历数据',
  parameters: {
    type: 'object',
    properties: {
      timeoutMs: { type: 'number', default: 10000 },
    },
  },
  script: `
    // 关键：把"滚动触发"和"等响应"配对（Promise.all）
    // 这样确保拿到的是这次滚动引发的接口响应，不会拿到之前缓存的旧请求
    const [resp] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/recommend/v2'),
        { timeout: ctx.timeoutMs || 10000 }
      ),
      // 滚到底部：分段平滑 + 抖动
      (async () => {
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 600 + jitter(-50, 50));
          await sleep(jitter(80, 200));
        }
      })(),
    ]);
    
    const data = await resp.json();
    
    // 检测登录失效（见 §9.7）
    if (data.code === 1010 || resp.status() === 401) {
      const err = new Error('BOSS 登录已失效');
      err.code = 'LOGIN_EXPIRED';
      throw err;
    }
    
    // 检测风控（见 §9.6）
    if (data.code === 412 || data.code === 'BOT_DETECTED') {
      const err = new Error('BOSS 风控触发');
      err.code = 'RATE_LIMITED';
      throw err;
    }
    
    return {
      items: data.zpData?.jobList || [],
      meta: {
        hasNext: data.zpData?.hasMore,
        currentPage: data.zpData?.curPage,
        total: data.zpData?.totalCount,
      },
    };
  `,
};
```

AI 调用流程示例：

```python
# AI 决策伪码
while True:
    page = await tool.call('boss.loadMore')
    if not page['items']:
        break
    for i, item in enumerate(page['items']):
        await tool.call('boss.viewResume', { 'index': i, 'dwellMs': random.uniform(3000, 6000) })
    if not page['meta']['hasNext']:
        break
```

#### 选职位筛选器

BOSS 推荐页的筛选器是个下拉浮层，包括"打开下拉 → 等列表加载 → 选中目标项 → 等接口刷新 → 关闭浮层"几个步骤。完整脚本：

```js
// src/automation/scripts/boss/selectPosition.js
export const selectPosition = {
  description: '在 BOSS 推荐页左上角职位筛选器选中指定职位 (按 positionId 或职位名匹配)',
  parameters: {
    type: 'object',
    properties: {
      positionId: { type: 'string', description: '职位 ID（jobId），优先用这个匹配' },
      positionName: { type: 'string', description: '职位名称，positionId 不存在时按文本匹配（支持模糊）' },
    },
    anyOf: [{ required: ['positionId'] }, { required: ['positionName'] }],
  },
  script: `
    // 1) 点开筛选器下拉浮层（注意 BOSS 改版时这里的 selector 要跟着改）
    const trigger = page.locator('.job-filter-trigger, [data-test="position-filter"]').first();
    await trigger.waitFor({ state: 'visible', timeout: 5000 });
    await trigger.click();
    await sleep(jitter(300, 600));   // 等下拉浮层动画完成

    // 2) 等下拉浮层里的职位列表渲染好
    const popup = page.locator('.position-list-popup, .filter-dropdown[data-open="true"]');
    await popup.waitFor({ state: 'visible', timeout: 5000 });

    // 3) 找目标项
    let target;
    if (ctx.positionId) {
      // 优先按 data-position-id 精确匹配
      target = popup.locator(\`[data-position-id="\${ctx.positionId}"]\`).first();
    } else {
      // 退回按文本模糊匹配
      target = popup.locator('.item, [role="option"]').filter({ hasText: ctx.positionName }).first();
    }

    if ((await target.count()) === 0) {
      // 关掉下拉再抛错（避免遗留浮层）
      await page.keyboard.press('Escape');
      throw new Error(\`筛选器里找不到职位: \${ctx.positionId || ctx.positionName}\`);
    }

    // 4) 滚到可视范围（列表很长时下面的项要滚下去）
    await target.scrollIntoViewIfNeeded();
    await sleep(jitter(150, 350));

    // 5) 同步等列表接口刷新 + 点击目标
    const [resp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/recommend/v2'), { timeout: 10000 }),
      target.click(),
    ]);

    // 6) 等浮层关闭（有些站点点完不会自动关，需要主动 Escape）
    if ((await popup.count()) > 0 && (await popup.isVisible())) {
      await page.keyboard.press('Escape');
    }
    await sleep(jitter(300, 600));

    // 7) 回传新列表数据
    const data = await resp.json();
    return {
      selected: { positionId: ctx.positionId, positionName: ctx.positionName },
      itemCount: (data.zpData?.jobList || []).length,
      firstItems: (data.zpData?.jobList || []).slice(0, 5).map(j => ({
        jobId: j.jobId,
        title: j.jobName,
        company: j.brandName,
      })),
    };
  `,
};
```

> 关键点：用 `anyOf` 让 AI 至少给一个匹配字段；选不到先关闭浮层再抛错（避免半开浮层挡住后续步骤）；选完用 `Escape` 兜底关浮层。

#### 采集模式（被动持续监听 — 模式 B 完整示例）

> 这是 **§4.7.1 模式 B** 的典型用法：在一段时间内**持续监听**所有匹配的接口请求，由 `try/finally` 保证 listener 必然 off。
> 适用场景：用户在自由浏览（自己滚动 / 切筛选 / 翻页），AI 不主动操作，只在后台"偷听"接口数据。

```js
// src/automation/scripts/boss/passiveCollect.js
export const passiveCollect = {
  description: '在 BOSS 推荐页持续监听 N 秒（用户/系统驱动），收集所有触发的列表/详情接口数据',
  parameters: {
    type: 'object',
    properties: {
      durationMs: {
        type: 'number',
        description: '监听总时长（毫秒）',
        default: 30000,
      },
      capture: {
        type: 'array',
        description: '要捕获的接口类型',
        items: { type: 'string', enum: ['list', 'detail'] },
        default: ['list', 'detail'],
      },
      maxItems: {
        type: 'number',
        description: '安全上限：累计捕获多少条后立即返回（避免内存爆）',
        default: 200,
      },
    },
  },
  script: `
    const wantList = (ctx.capture || ['list', 'detail']).includes('list');
    const wantDetail = (ctx.capture || ['list', 'detail']).includes('detail');
    const maxItems = ctx.maxItems || 200;

    const lists = [];      // 列表接口结果
    const details = [];    // 详情接口结果
    let earlyResolve;
    const earlyDone = new Promise(r => { earlyResolve = r; });

    const onResponse = async (resp) => {
      try {
        const url = resp.url();
        // 列表接口
        if (wantList && url.includes('/recommend/v2')) {
          const data = await resp.json();
          lists.push({
            page: data.zpData?.curPage,
            count: (data.zpData?.jobList || []).length,
            items: data.zpData?.jobList || [],
            ts: Date.now(),
          });
        }
        // 详情接口
        if (wantDetail && url.includes('/geek/detail')) {
          const data = await resp.json();
          details.push({
            geekId: data.zpData?.geekCard?.geekId,
            data: data.zpData,
            ts: Date.now(),
          });
        }
      } catch (e) {
        log('parse error: ' + e.message);
      }

      // 达到上限提前结束
      if (lists.length + details.length >= maxItems) {
        log('reached maxItems, ending early');
        earlyResolve();
      }
    };

    try {
      page.on('response', onResponse);

      // 等待结束：① 时间到 ② 提前达上限
      await Promise.race([
        sleep(ctx.durationMs || 30000),
        earlyDone,
      ]);

      return {
        lists,
        details,
        summary: {
          listCount: lists.length,
          detailCount: details.length,
          totalItems: lists.reduce((acc, l) => acc + l.count, 0),
          listenedMs: ctx.durationMs || 30000,
        },
      };
    } finally {
      // ⚠️ 关键：必须 off
      page.off('response', onResponse);
    }
  `,
};
```

**调用方式**：

```python
# AI 调用伪码 — "用户随便浏览 5 分钟，AI 偷偷采集"
result = await tool.call('boss.passiveCollect', {
    'durationMs': 5 * 60 * 1000,   # 5 分钟
    'capture': ['list', 'detail'],
    'maxItems': 200,
})
print(f"捕获 {result['summary']['totalItems']} 个职位，{result['summary']['detailCount']} 份简历详情")
```

**和模式 A 配合使用**也可以——比如"AI 引导滚动 + 后台收集详情"：

```js
// 混合模式：AI 主动滚 + 后台 listener 顺便捕获详情接口（用户偶尔点开看简历也会被收集）
script: `
  const details = [];
  const onResp = async r => {
    if (r.url().includes('/geek/detail')) {
      try { details.push(await r.json()); } catch {}
    }
  };
  
  try {
    page.on('response', onResp);  // 模式 B：背景收集详情
    
    for (let i = 0; i < ctx.scrollRounds; i++) {
      // 模式 A：主动等列表接口
      const [resp] = await Promise.all([
        page.waitForResponse(r => r.url().includes('/recommend/v2'), { timeout: 10000 }),
        page.mouse.wheel(0, 1500),
      ]);
      log('list page captured');
      await sleep(jitter(2000, 4000));
    }
    
    return { detailsCollected: details.length, details };
  } finally {
    page.off('response', onResp);
  }
`
```

> ⚠️ 模式 B 的 listener 在**整个脚本生命周期内有效**，即使 `await page.waitForResponse(...)` 期间也会被同时触发 —— 所以会"双份记录"匹配的响应。如果不想重复，自己在 cb 里加去重逻辑（用 `resp.url() + ts` 做 dedup key）。

#### 浏览简历的"完整流程"（打开 → 滚动 → 抓 → 看 → 关）—— 这种"组合脚本"也只是一段更长的字符串

```js
// src/automation/scripts/boss/visitOneResume.js
export const visitOneResume = {
  description: '高层组合：打开推荐 → 抓列表 → 浏览第 N 个简历，一气呵成',
  parameters: {
    type: 'object',
    properties: {
      index: { type: 'number' },
      dwellMs: { type: 'number', default: 5000 },
    },
    required: ['index'],
  },
  script: `
    // 子工具直接拼脚本（避免再走一轮 IPC）
    if (!page.url().includes('/web/geek/recommend')) {
      await page.goto('https://www.zhipin.com/web/geek/recommend');
      await page.waitForLoadState('networkidle');
    }

    // 第一次进来需要捕获列表接口
    const listResp = await page.waitForResponse(url => url.includes('/recommend/v2'), { timeout: 15000 });
    const list = await listResp.json();

    // 浏览第 ctx.index 个
    const card = page.locator('.recommend-card').nth(ctx.index);
    await card.scrollIntoViewIfNeeded();
    await sleep(jitter(300, 700));

    const [detail] = await Promise.all([
      page.waitForResponse(url => url.includes('/geek/detail'), { timeout: 8000 }),
      card.click(),
    ]);
    const resume = await detail.json();
    await sleep(ctx.dwellMs + jitter(-300, 500));
    await page.keyboard.press('Escape');

    return {
      list: list.zpData?.jobList?.length || 0,
      resume: resume.zpData,
    };
  `,
};
```

### 5.4 runner：把工具调用转成 Electron runScript

```js
// src/automation/runner.js
import * as boss from './scripts/boss';
import * as zhilian from './scripts/zhilian';
// ...

export const ALL_TOOLS = {
  'boss.openRecommend': boss.openRecommend,
  'boss.scroll': boss.scroll,
  'boss.captureRecommendList': boss.captureRecommendList,
  'boss.viewResume': boss.viewResume,
  'boss.selectPosition': boss.selectPosition,
  'boss.visitOneResume': boss.visitOneResume,
  // ...
};

/**
 * 给 AI 服务端上报工具目录（function calling schema）
 */
export function getToolCatalog() {
  return Object.entries(ALL_TOOLS).map(([name, def]) => ({
    name,
    description: def.description,
    parameters: def.parameters,
  }));
}

/**
 * 收到 AI 的 ToolCall 后调度
 * 1. 找到对应工具
 * 2. 决定 tabId（每个 channel 维护一个）
 * 3. 跑 channel preflight 检查（页面就绪 / 登录 / 关闭弹框，详见 §5.8）
 * 4. preflight 通过 → 调 Electron runScript 跑真实工具
 * 5. preflight 不通过 → 直接返错给 AI，不跑真实工具
 */
export async function dispatch(call) {
  const tool = ALL_TOOLS[call.name];
  if (!tool) {
    return { ok: false, error: { code: 'TOOL_NOT_ALLOWED', message: `unknown tool: ${call.name}` } };
  }

  // 工具名格式 'boss.xxx' / 'zhilian.xxx' / 'visit'
  const channel = call.name.split('.')[0];
  const tabId = await getOrOpenTab(channel);

  // ⚠️ 关键：跑前置就绪检查（除了 preflight 工具自己 + 通用工具）
  if (!tool.skipPreflight && PREFLIGHT_TOOLS[channel]) {
    const ready = await runPreflight(channel, tabId, call.name);
    if (!ready.ok) return ready;   // 直接返错给 AI（NOT_ON_TARGET_PAGE / LOGIN_EXPIRED / OVERLAY_BLOCKED）
  }

  const start = Date.now();
  const result = await window.api.automation.runScript({
    tabId,
    scriptCode: tool.script,
    ctx: call.args || {},
    timeoutMs: tool.timeoutMs ?? 60000,
  });

  return {
    ok: result.ok,
    result: result.data,
    error: result.error,
    elapsedMs: Date.now() - start,
    logs: result.logs,
  };
}

const PREFLIGHT_TOOLS = {
  boss: '_preflight.boss',
  zhilian: '_preflight.zhilian',
  liepin: '_preflight.liepin',
  job51: '_preflight.job51',
};

async function runPreflight(channel, tabId, originalToolName) {
  const preflightName = PREFLIGHT_TOOLS[channel];
  const preflight = ALL_TOOLS[preflightName];
  if (!preflight) return { ok: true };
  
  const result = await window.api.automation.runScript({
    tabId,
    scriptCode: preflight.script,
    ctx: { invokedBy: originalToolName },
    timeoutMs: 15000,
  });
  
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      elapsedMs: 0,
      logs: result.logs,
    };
  }
  return { ok: true };
}

async function getOrOpenTab(channel) {
  if (channel === 'boss' || channel === 'zhilian' || channel === 'liepin' || channel === 'job51') {
    const t = await window.api.automation.openOrActivate({ channel });
    return t.tabId;
  }
  // 'visit' / 'wait' 等通用工具默认在主页 tab 跑
  return 'home';
}
```

> preflight 工具用 `_` 前缀（约定俗成的"内部工具"），**不通过 `getToolCatalog()` 上报给 AI**。AI 只看到业务工具，preflight 自动跑在每个工具调用前，AI 无感。

### 5.5 前端"业务工具升级"的实际操作

| 场景 | 改什么 | Electron 升级？ |
|---|---|---|
| BOSS 改了卡片选择器 | `boss/viewResume.js` 里的 `.recommend-card` → 新选择器 | ❌ 不用 |
| BOSS 改了接口路径 | `boss/captureRecommendList.js` 里 url 匹配规则 | ❌ 不用 |
| AI 想要新工具"批量打招呼" | 新建 `boss/sayHi.js`，发版 H5 | ❌ 不用 |
| AI 想要"在 N 秒内浏览随机几个简历" | 新建 `boss/randomBrowse.js`，发版 H5 | ❌ 不用 |
| 反爬升级 → 需要鼠标 drag-drop | Playwright 已有 `locator.dragTo` ✓ | ❌ 不用，前端直接调 |
| Playwright 升级了支持新 API（如 `page.aria` 树） | 升级 Electron 内 `playwright-core` 版本号 | ✅ 一次 |

### 5.6 dev 期独立调试一个脚本

不接 AI 服务端的情况下，前端自己能跑/调任意脚本。客户端有一个**调试页**（仅 dev 模式可访问）：

```
URL: http://localhost:8080/dev/automation
            （生产环境 Vue Router 自动隐藏此路由）
```

页面 UI（伪代码）：

```
┌─────────────────────────────────────────────────────────────┐
│ 招聘自动化脚本调试器                                          │
├─────────────────────────────────────────────────────────────┤
│ Channel: [BOSS  ▼]    Tab: [#1 BOSS 推荐 ▼]   ⓘ 已激活      │
├─────────────────────────────────────────────────────────────┤
│ Tool: [boss.viewResume          ▼]                          │
│                                                              │
│ Schema (auto):                                               │
│   index:    [3       ]  (number, required)                  │
│   dwellMs:  [4000    ]  (number, default 4000)              │
│                                                              │
│ Script (CodeMirror, 实时编辑覆盖):                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ const card = page.locator('.recommend-card').nth(...)  │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ [ ▶ 跑一次 ]   [ ⏹ 取消 ]   [ 🔍 page.screenshot ]            │
├─────────────────────────────────────────────────────────────┤
│ Logs (实时)：                                                │
│   [12:34:56] page.locator(.recommend-card).nth(3).click() │
│   [12:34:57] waitForResponse: matched /geek/detail        │
│   [12:35:02] sleep done                                    │
│ Result:                                                      │
│   { resume: { ... } }                                       │
│ Elapsed: 5.42s                                              │
└─────────────────────────────────────────────────────────────┘
```

实现要点：

```js
// src/pages/dev/AutomationDebugger.vue
import { ALL_TOOLS } from 'src/automation/runner';

// 选中工具 → schema 自动渲染表单 → 用户填 ctx
// "跑一次" → 直接调 window.api.automation.runScript
async function runOnce() {
  const tabId = (await window.api.automation.getActiveTab()).tabId;
  const result = await window.api.automation.runScript({
    tabId,
    scriptCode: editorCode.value,        // 用户改过的 script 优先于工具默认
    ctx: formCtx.value,
    timeoutMs: 60000,
  });
  resultPanel.value = result;
}
```

**好处**：
- BOSS 改版时调试一个新选择器只要 30 秒（改 → 跑 → 看 result）
- 不需要 AI 服务端在线，工具开发者完全自助
- 写完调通的脚本直接 commit 到 `scripts/boss/*.js`

> ⚠️ 调试页**只在 dev 模式渲染**（`if (import.meta.env.DEV)`），打包后即使有人猜到 URL 也访问不到，避免误用。

### 5.7 录制回放（可选 / nice-to-have）

为新人快速生成业务脚本草稿：录制人类一段操作 → 生成 ToolCall 序列 → 自动转脚本草稿。

#### 录制原理

注入一段录制脚本到目标 page（用 `page.addInitScript`）：

```js
// 监听人类操作
window.__autoRecord = [];
document.addEventListener('click', e => {
  __autoRecord.push({
    type: 'click',
    selector: cssPath(e.target),
    ts: Date.now(),
  });
}, true);

// 监听 fetch / XHR
const _fetch = window.fetch;
window.fetch = async (...args) => {
  const ts = Date.now();
  const res = await _fetch(...args);
  __autoRecord.push({ type: 'response', url: args[0].toString?.() ?? args[0].url, status: res.status, ts });
  return res;
};

// 监听滚动
window.addEventListener('scroll', () => {
  __autoRecord.push({ type: 'scroll', y: window.scrollY, ts: Date.now() });
}, { passive: true });
```

#### 回放草稿生成

录制结束后 `await page.evaluate(() => __autoRecord)` 拿到事件列表，转成脚本草稿：

```js
[
  { type: 'click', selector: '.recommend-card:nth-child(4)', ts: 1000 },
  { type: 'response', url: '/geek/detail/...', status: 200, ts: 1500 },
  { type: 'scroll', y: 800, ts: 6000 },
]
↓
script: `
  await page.locator('.recommend-card:nth-child(4)').click();
  const resp = await page.waitForResponse(r => r.url().includes('/geek/detail'));
  await sleep(jitter(4500, 5500));
  await page.mouse.wheel(0, 800);
`
```

> 录制工具是**辅助生成草稿**，最终脚本仍要人工 review + 用 locator 替换 nth-child 这种脆弱选择器。MVP 不必做，迭代两轮后再加。

### 5.8 前置就绪检查（preflight）

**核心问题**：每个业务工具脚本运行时，要确认页面真的"准备好了"，否则会出严重 bug：

- 用户没登录还在登录页 → 工具操作的全是登录页 DOM
- 在错误的页面（比如停在简历详情页）→ 找不到推荐列表卡片
- 全局弹框遮住页面 → 工具去点击/滚动被遮挡的 DOM
  - **反爬强信号**：弹框可见时还能滚动 / 点击下层 DOM = 真人不会这么干，BOSS 立刻识别
- 页面在 loading skeleton 状态 → 选择器全部 null

#### 5.8.1 设计原理

每次 AI 调一个业务工具前，runner 自动跑该 channel 的 `_preflight` 工具。preflight 通过才执行真实工具：

```
AI: tool.call('boss.viewResume', { index: 3 })
       ↓
runner.dispatch:
  ① 拿 channel = 'boss', tabId
  ② 跑 _preflight.boss
       ├─ ① URL 在 /web/geek/recommend? 不是 → 跳过去 + 等加载
       ├─ ② 检查登录态？没登录 → 抛 LOGIN_EXPIRED
       ├─ ③ 关闭所有可关闭的全局弹框（引导/提示/客服气泡/...）
       ├─ ④ 检测无法关闭的拦截弹框（验证码/风险提示）→ 抛 RATE_LIMITED
       └─ ⑤ 等关键 DOM 就绪（.recommend-card 容器存在）
  ③ preflight ok → 真的跑 boss.viewResume
  ③ preflight fail → 直接返错给 AI（不跑真实工具）
```

#### 5.8.2 BOSS preflight 完整脚本

```js
// src/automation/scripts/boss/_preflight.js
export const _preflight = {
  description: '内部使用：BOSS 推荐页前置就绪检查（不上报给 AI）',
  internal: true,                  // ← 标记内部工具，getToolCatalog 跳过
  skipPreflight: true,             // ← 自己不再跑 preflight 避免死循环
  parameters: { type: 'object', properties: {} },
  script: `
    const TARGET_URL_FRAGMENT = '/web/geek/recommend';
    const LOGIN_URL_FRAGMENTS = ['/web/user/?ka=login', '/login.html'];
    const KEY_CONTAINER = '.recommend-card, .job-list-recommend, [data-test="job-list"]';

    // ===== ① 检查 URL =====
    const url = page.url();
    if (LOGIN_URL_FRAGMENTS.some(f => url.includes(f))) {
      const err = new Error('BOSS 已退出登录，需要重新登录');
      err.code = 'LOGIN_EXPIRED';
      err.context = { url };
      throw err;
    }
    if (!url.includes(TARGET_URL_FRAGMENT)) {
      log('[preflight] not on recommend page, navigating');
      await page.goto('https://www.zhipin.com' + TARGET_URL_FRAGMENT, { waitUntil: 'domcontentloaded' });
      await sleep(jitter(800, 1500));
    }

    // ===== ② 关闭可关闭的全局弹框 =====
    // 关闭顺序很重要：从最外层（mask）到内部（按钮）
    const dismissables = [
      // 隐私协议浮层（首次访问）
      { name: 'privacy-mask',
        find: '.privacy-mask, .agreement-mask',
        close: async (loc) => {
          const btn = page.locator('.privacy-mask .agree-btn, .agreement-mask .ok');
          if (await btn.count()) await btn.first().click();
        },
      },
      // 引导浮层（高亮某区域 + 知道了）
      { name: 'feature-guide',
        find: '.geek-guide-mask, .feature-tip-modal',
        close: async () => {
          const btn = page.locator('.guide-close, .tip-close, button:has-text("知道了")').first();
          if (await btn.count()) await btn.click();
        },
      },
      // 评价邀请
      { name: 'rating-invite',
        find: '.rating-invite-modal',
        close: async () => {
          const btn = page.locator('.rating-invite-modal .close, button:has-text("关闭")').first();
          if (await btn.count()) await btn.click();
        },
      },
      // 客服气泡（右下）
      { name: 'service-bubble',
        find: '.service-bubble, [class*="customer-bubble"]',
        close: async () => {
          const btn = page.locator('.service-bubble .close, [class*="customer-bubble"] .close').first();
          if (await btn.count()) await btn.click();
        },
      },
      // 通用兜底：常见 modal 的 X 按钮
      { name: 'generic-modal',
        find: '.ant-modal-mask, .modal-mask, .dialog-mask',
        close: async () => {
          await page.keyboard.press('Escape').catch(() => {});
        },
      },
    ];

    for (const d of dismissables) {
      const found = page.locator(d.find);
      if (await found.first().isVisible({ timeout: 300 }).catch(() => false)) {
        log('[preflight] closing: ' + d.name);
        try { await d.close(found); } catch (e) { log('  close failed: ' + e.message); }
        await sleep(jitter(200, 500));
      }
    }

    // ===== ③ 检测无法关闭的拦截弹框（必须用户介入） =====
    const blockingOverlays = [
      // 验证码
      { name: 'captcha', find: '.geek-verify-dialog, [data-test="captcha"]', code: 'RATE_LIMITED' },
      // 风险提示（"系统检测到异常" 之类）
      { name: 'risk-warning', find: '.risk-warning-modal, .anti-cheat-modal', code: 'RATE_LIMITED' },
      // 强制重新登录
      { name: 'force-login', find: '.force-login-modal', code: 'LOGIN_EXPIRED' },
    ];

    for (const o of blockingOverlays) {
      const overlay = page.locator(o.find);
      if (await overlay.first().isVisible({ timeout: 300 }).catch(() => false)) {
        const err = new Error(\`BOSS 出现拦截弹框: \${o.name}\`);
        err.code = o.code;
        err.context = { overlayType: o.name };
        throw err;
      }
    }

    // ===== ④ 通用遮罩检测（兜底，防止漏配置） =====
    // 任何全屏 z-index 高的 mask，且没在 dismissables 表里 → 报错
    const unknownOverlay = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div, section'));
      for (const el of els) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const z = parseInt(cs.zIndex || '0', 10);
        if (cs.position === 'fixed' && z >= 999 && r.width > 800 && r.height > 500 && cs.display !== 'none' && cs.visibility !== 'hidden') {
          return { className: el.className, z, w: r.width, h: r.height };
        }
      }
      return null;
    });
    if (unknownOverlay) {
      const err = new Error('检测到未知全屏遮罩，无法继续');
      err.code = 'OVERLAY_BLOCKED';
      err.context = unknownOverlay;
      throw err;
    }

    // ===== ⑤ 等关键 DOM 就绪 =====
    try {
      await page.locator(KEY_CONTAINER).first().waitFor({ state: 'visible', timeout: 10000 });
    } catch (e) {
      const err = new Error('推荐列表容器未渲染（可能 BOSS 改版，或网络异常）');
      err.code = 'NOT_ON_TARGET_PAGE';
      err.context = { selector: KEY_CONTAINER, url: page.url() };
      throw err;
    }

    return { ok: true, ts: Date.now() };
  `,
};
```

#### 5.8.3 注册 preflight 到 ALL_TOOLS

```js
// src/automation/runner.js (补充)
import { _preflight as bossPreflight } from './scripts/boss/_preflight';
import { _preflight as zhilianPreflight } from './scripts/zhilian/_preflight';
// ...

export const ALL_TOOLS = {
  // 业务工具
  'boss.openRecommend': boss.openRecommend,
  'boss.loadMore': boss.loadMore,
  // ...

  // ⚠️ preflight 也注册进来，但 internal: true 让 catalog 不上报
  '_preflight.boss': bossPreflight,
  '_preflight.zhilian': zhilianPreflight,
  '_preflight.liepin': liepinPreflight,
  '_preflight.job51': job51Preflight,
};

export function getToolCatalog() {
  return Object.entries(ALL_TOOLS)
    .filter(([_, def]) => !def.internal)         // ← 过滤掉 _preflight
    .map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters,
    }));
}
```

#### 5.8.4 错误处理流转

| Preflight 抛错 | AI 应做什么 |
|---|---|
| `NOT_ON_TARGET_PAGE` | 工具基本不能用了；可能是 BOSS 改版（等运维更新选择器）或网络故障（重试一次） |
| `LOGIN_EXPIRED` | 暂停任务 → 通知用户登录 → 用户登录完后 task.resume |
| `RATE_LIMITED` | 暂停任务 → 通知用户处理验证码 / 等冷却结束（见 §9.6）|
| `OVERLAY_BLOCKED` | 暂停任务 → 让用户手动处理未识别的弹框 → 顺便让运维补到 dismissables 表 |

#### 5.8.5 跳过 preflight 的工具

某些工具不需要前置检查（或自己就是 preflight）：

| 工具 | skipPreflight | 原因 |
|---|---|---|
| `_preflight.*` | ✅ | 自己就是 preflight，避免死循环 |
| `boss.openRecommend` | ✅ | 自己就是"打开页面"，preflight 会重复跳转 |
| `boss.login` | ✅（如果有的话） | 登录工具不需要在 preflight 里检测登录 |
| `visit / wait` 通用工具 | ✅ | 不绑定 channel，没意义 |

工具定义里加 `skipPreflight: true` 标记即可。

#### 5.8.6 性能影响

每次工具调用前多跑一次 preflight，平均增加 200-500ms（如果不需要关闭弹框只是检查）。可接受：
- AI 主动决策频率本来就有节流（见 §9.5），不会高频调用
- 真有"高频低成本"工具（如纯查询型）可以加 `skipPreflight: true` 但要明确风险

> 优化空间：**前端 H5** 的 runner.js 可以加 preflight 结果缓存（同 channel 同 tab，5-10 秒内不重跑）。**主进程不做缓存**——主进程不知道"preflight"是个业务概念，也不该知道。MVP 不做缓存，简单稳定优先。

### 6.1 通道选择

| 选项 | 优 | 劣 |
|---|---|---|
| **WebSocket**（推荐） | 全双工、低延迟、原生支持顺序 | 需要服务端维护连接 |
| SSE + HTTP POST | 简单 | 单向推送，前端→服务端要另一个 endpoint |
| Long-poll | 兼容性好 | 延迟高、连接频繁切换 |

> 假设复用现有 chat WebSocket 通道（沿用 `createChat` / chat history 的 WS）。

### 6.2 消息格式（JSON-RPC 风格）

#### 6.2.1 服务端 → H5（命令）

**新建任务**：

```json
{
  "v": 1,
  "type": "task.start",
  "taskId": "task-20260509-001",
  "payload": {
    "intent": "采集 BOSS 推荐 50 个简历",
    "metadata": {
      "createdBy": "user-123",
      "modelVersion": "agent-v0.3"
    }
  }
}
```

**调用工具**：

```json
{
  "v": 1,
  "type": "tool.call",
  "taskId": "task-20260509-001",
  "stepId": "step-1",
  "tool": "boss.captureRecommendList",
  "args": { "timeoutMs": 10000 }
}
```

**取消任务**：

```json
{ "v": 1, "type": "task.cancel", "taskId": "task-20260509-001" }
```

**结束任务**：

```json
{ "v": 1, "type": "task.finish", "taskId": "task-20260509-001", "summary": { "collected": 50 } }
```

#### 6.2.2 H5 → 服务端（事件）

**任务接受**：

```json
{ "v": 1, "type": "task.accepted", "taskId": "task-20260509-001" }
```

**工具结果**：

```json
{
  "v": 1,
  "type": "tool.result",
  "taskId": "task-20260509-001",
  "stepId": "step-1",
  "ok": true,
  "result": { "items": [/* ... */], "meta": {} },
  "elapsedMs": 1240
}
```

或失败：

```json
{
  "v": 1,
  "type": "tool.result",
  "taskId": "task-20260509-001",
  "stepId": "step-1",
  "ok": false,
  "error": { "code": "NETWORK_TIMEOUT", "message": "captureNext timed out after 10000ms" },
  "elapsedMs": 10001
}
```

**任务进度**（可选，给 UI 显示）：

```json
{
  "v": 1,
  "type": "task.progress",
  "taskId": "task-20260509-001",
  "phase": "scrolling",
  "current": 12,
  "total": 50
}
```

**工具目录上行**（连接建立后一次）：

```json
{
  "v": 1,
  "type": "tools.catalog",
  "tools": [
    { "name": "boss.openRecommend", "description": "...", "parameters": {/* JSON schema */} },
    /* ... */
  ]
}
```

### 6.3 顺序保证

- 同一个 taskId 内 stepId **必须递增**且单调
- 服务端发新 ToolCall 前必须先收到上一步的 ToolResult（或超时）
- H5 不会乱序回复（按 ToolCall 收到顺序串行处理）

---

## 7. H5 ↔ Electron IPC 协议

### 7.1 总入口

```ts
// preload 暴露 — 极简，只有 4 个方法
window.api.automation = {
  /** 在指定 tab 上跑一段 Playwright-style 脚本字符串（核心入口）*/
  runScript({ tabId, scriptCode, ctx, timeoutMs }): Promise<AutomationResult>,

  /** 打开/激活招聘站 tab（封装 TabManager）*/
  openOrActivate({ channel, url? }): Promise<{ tabId, channel, url }>,

  /** 取当前激活 tab 信息（脚本里也能用 page，但工具分发前需要这个）*/
  getActiveTab(): Promise<{ tabId, channel, url }>,

  /** 中止所有正在跑的脚本 */
  cancelAll(): Promise<void>,
}
```

### 7.2 返回值统一格式

```ts
interface AutomationResult<T = unknown> {
  ok: boolean
  data?: T
  error?: {
    code: string       // 'TIMEOUT' | 'TAB_NOT_FOUND' | 'CDP_ERROR' | ...
    message: string
    detail?: unknown
  }
  elapsedMs: number
}
```

### 7.3 取消信号

任务取消时，H5 调用：

```ts
window.api.automation.cancelAll()  // 中断所有正在执行的脚本
```

主进程实现：给沙箱的 AbortController 发 abort，所有 await 立即抛 `AbortError`；同时清掉所有 page.onResponse / page.waitForResponse 注册的 webRequest 监听。

### 7.4 订阅式网络监听

不暴露给 preload。脚本内通过 `page.onResponse(predicate, callback)` 注册（见 §4.4 网络拦截章节），脚本退出时 sandbox runtime 自动清理。

---

## 8. 错误处理 / 超时 / 重试

### 8.1 错误码标准

| Code | 含义 | 通常处理 |
|---|---|---|
| `TIMEOUT` | 脚本/page API 超时 | AI 决定重试或换策略 |
| `TAB_NOT_FOUND` | tabId 失效（用户手动关了） | AI 重新 openOrActivate |
| `SELECTOR_NOT_FOUND` | DOM 元素没找到（可能站点改版） | AI 报错，触发"工具升级"信号 |
| `NOT_ON_TARGET_PAGE` | preflight 检测页面不是目标页（关键 DOM 缺失） | AI 调"打开页面"工具，再重试 |
| `OVERLAY_BLOCKED` | 检测到未识别的全屏遮罩，无法继续 | 暂停 + 通知用户手动处理 + 运维补 dismissables 表 |
| `LOGIN_EXPIRED` | preflight / 业务脚本检测登录失效（401 / 跳登录页 / code=1010） | 暂停 → 通知用户登录 → cookie 恢复后续跑 |
| `RATE_LIMITED` | 招聘站反爬触发（验证码 / 风险提示 / 412 错误码） | 暂停几分钟 + 通知用户处理 + 冷却（§9.5）|
| `CDP_ERROR` | CDP 命令失败 | 重试一次，仍失败上报 |
| `NETWORK_INTERCEPT_FAILED` | webRequest 注册失败 | 重试 |
| `CANCELLED` | 用户/AI 取消 | 立即停止该 task 后续步骤 |
| `INVALID_ARGS` | 入参错 | AI 端 bug，上报 |
| `RESULT_NOT_SERIALIZABLE` | 工具 return 含不可序列化值 | 工具实现 bug，上报 |
| `TOOL_NOT_ALLOWED` | tool name 不在白名单 | AI 端 bug，上报 |
| `SCRIPT_ERROR` | 脚本 throw 的其他未分类错误 | AI 看 message 判断 |

### 8.2 超时

- `runScript` 顶层有 `timeoutMs`（默认 60s），整段脚本超时直接抛 `TIMEOUT`
- 脚本内部各个 page API（`waitForResponse` / `waitForSelector` / ...）有自己的 `timeout` 参数
- AI 决策的全任务超时由服务端管（如 30 分钟内必须完成）

### 8.3 重试策略

**默认：不重试**。重试由 AI 决策，因为：
- 招聘站反爬场景下盲目重试会加速封号
- AI 应该结合错误码 + 上下文决定"等等再试" vs "换策略"

但脚本内部 `page.waitForSelector` / `page.waitForResponse` 这类瞬时等待本身是 polling 实现，不算"重试"。

### 8.4 错误恢复策略（脚本作者指南）

脚本里**什么时候 try/catch 自己处理**、**什么时候直接抛错让 AI 决定**？

#### 决策规则

| 错误性质 | 推荐做法 |
|---|---|
| **DOM 元素一时未渲染**（waitForSelector 短超时） | 脚本里 `try/catch` 后做兜底（如换个 selector / 给一个 fallback selector） |
| **接口偶发延迟**（waitForResponse 12s 没回） | 脚本内不重试；直接抛 `TIMEOUT`，AI 决定 |
| **预期内的页面状态**（如"已是最后一页"） | 脚本 return `{ end: true, reason: '...' }`，**不抛错** |
| **选择器不存在**（站点改版） | 直接抛错（特殊错误码 `SELECTOR_NOT_FOUND`），AI 暂停任务等运维处理 |
| **风控 / 验证码 / 401** | 抛错（`RATE_LIMITED` / `LOGIN_EXPIRED`），见 §9.6 / §9.7 |
| **cleanup 步骤失败**（关浮层失败） | `try/catch` 吞掉，记 log；不能让 cleanup 失败把主结果带挂 |

#### 错误码命名规范

脚本抛错时**带语义错误码**，让 AI 容易决策：

```js
script: `
  // 推荐写法：带 code + message
  if ((await card.count()) === 0) {
    const err = new Error('未找到推荐卡片');
    err.code = 'SELECTOR_NOT_FOUND';
    err.context = { selector: '.recommend-card', page: page.url() };
    throw err;
  }
`
```

主进程 runner 会把 `err.code` / `err.context` 一起回 ToolResult.error，AI 就能据此选择策略。

#### 致命错误清单（AI 收到必须暂停整个 task）

| Code | 含义 |
|---|---|
| `SELECTOR_NOT_FOUND` | 站点改版，工具失效 |
| `RATE_LIMITED` | 反爬触发 |
| `LOGIN_EXPIRED` | 用户登出 |
| `RESULT_NOT_SERIALIZABLE` | 工具实现 bug |

收到这些错误码时 AI 应该立刻发 `task.cancel`，而不是继续下一步。

---

## 9. 安全模型

### 9.1 关键风险

| 风险 | 防御 |
|---|---|
| **AI 服务端被劫持** → 发恶意 ToolCall | H5 端校验 `tool name` 在编译时静态注册的白名单内，args 走 JSON schema 验证 |
| **AI 注入恶意脚本字符串** | **AI 不直接传 scriptCode**——只能调用前端预置工具名；scriptCode 由前端 H5 代码静态拼装（不是从 AI 输入拼接），AI 仅提供 ctx 参数 |
| **H5 自身被 XSS** → 调任意 `runScript` 注入恶意 JS | scriptCode 来源于前端打包后的代码（不接收外部字符串），sandbox 内无 `process` / `require` / `Buffer` / `global`；preload 不暴露任意 IPC 给沙箱 |
| **沙箱内 page.evaluate 任意 JS** → 跑出 Electron 的代码 | `page.evaluate` 跑在**页面 V8 上下文**（招聘站的 origin），不是主进程；它能干的事 = 招聘站页面里 JS 能干的事，不会越权 |
| **招聘站反爬识别** | CDP 真实输入、人类节奏、随机抖动；不暴露 `navigator.webdriver`（Electron 默认不暴露） |
| **用户隐私（简历数据外泄）** | 所有捕获的数据流转 = WebSocket 上 SSO 鉴权后通道；不写本地硬盘（除非用户主动导出） |
| **客户端 cookie 被滥用** | sandbox 不能调用 `recruitBridge.universalRequest` 或主页业务 IPC；只能用 page 在站点 tab 里发请求（受站点 CORS / cookie 同源限制） |

### 9.2 工具白名单（编译时静态注册）

工具脚本字符串**全部写在前端代码里**（`src/automation/scripts/**`），运行时 ALL_TOOLS 是个 Map：

```ts
// 编译时写死，运行时不能动态加
import { openRecommend, scroll, captureRecommendList, viewResume, ... } from './scripts/boss';

export const ALL_TOOLS = Object.freeze({
  'boss.openRecommend': openRecommend,
  'boss.scroll': scroll,
  // ...
});

// dispatch 入口
if (!ALL_TOOLS[call.name]) {
  return { ok: false, error: { code: 'TOOL_NOT_ALLOWED', message: `unknown tool: ${call.name}` } };
}
```

新增工具 → PR review → 发版 H5。AI 服务端**永远不能**直接发 scriptCode 字符串绕过这套（preload 不暴露这种入口）。

### 9.3 频率限制

H5 端在 runner.js 里维护**全局节奏**（tokens-per-minute 漏桶），即使 AI 一秒发 100 个 ToolCall，也按 1 个/秒（或更慢）实际执行。防止反爬触发。

### 9.4 招聘站反爬识别

招聘站常见检测：

| 检测点 | 我们的对策 |
|---|---|
| `navigator.webdriver` | Electron 默认 false ✓ |
| `window.chrome` | Electron 有 ✓ |
| mouse/keyboard 事件 `isTrusted` | CDP 实现 = true ✓ |
| 鼠标轨迹直线 | `page.mouse.move(x, y, { steps: N })` 多步骤 ✓ |
| 滚动 0 跳到 800 | `page.mouse.wheel` 分段平滑（见 `boss.scroll`）✓ |
| 操作间隔无随机抖动 | 脚本字符串里强制 `sleep(jitter(...))` ✓ |
| **弹框遮挡时还能滚动 / 点击下层 DOM** | **preflight 强制关闭弹框（§5.8）；未识别遮罩抛 OVERLAY_BLOCKED** ⭐ |
| 短时间内"完美" UI 序列 | rate limiter 节流（§9.5）+ 操作前停留时间 jitter |
| 同 IP 高频请求 | 频率限制 + 用户活动时段感知（§9.5）|
| 浏览器指纹（canvas / WebGL / fonts） | Electron 用真实 Chromium 引擎，指纹和真用户 Chrome 一致 ✓ |
| 长期无错误的"完美"操作 | 偶尔故意失误 / 回滚（高级抗检测，迭代后期再做）|

⚠️ "弹框遮挡时操作 DOM"是**反爬强信号**：

- 真人看到全屏弹框会先关闭再操作（任何手机/PC 用户的本能反应）
- 自动化如果忽视弹框直接 `click('.recommend-card')` / `mouse.wheel`，触发的事件流是"在被 modal 遮住的元素上发生 click" → BOSS 立刻识别为机器人
- **解决**：每个工具调用前 runner 自动跑 preflight 强制关闭弹框（§5.8）；未识别的弹框抛 `OVERLAY_BLOCKED` 暂停任务，绝不"硬干"

### 9.5 频率限制（具体数值配置）

按 channel 维度配漏桶，每个站独立。基于反爬经验给出推荐值（实际数值上线后观察封号率再调）：

```ts
// src/automation/utils/rateLimiter.js
export const RATE_LIMITS = {
  // 单位：操作 / 分钟
  boss: {
    perMinute: 30,        // ~2s/操作（含"看简历"5s 的 dwell）
    burstSize: 5,         // 漏桶突发上限
    cooldownAfterRateLimit: 5 * 60 * 1000,  // 触发反爬后冷却 5 分钟
  },
  zhilian: {
    perMinute: 20,        // 智联检测更严格
    burstSize: 3,
    cooldownAfterRateLimit: 10 * 60 * 1000,
  },
  liepin: {
    perMinute: 25,
    burstSize: 4,
    cooldownAfterRateLimit: 5 * 60 * 1000,
  },
  job51: {
    perMinute: 25,
    burstSize: 4,
    cooldownAfterRateLimit: 5 * 60 * 1000,
  },
};
```

#### runner 集成漏桶

```js
// src/automation/runner.js
async function dispatch(call) {
  const channel = call.name.split('.')[0];   // 'boss' / 'zhilian' / ...
  await rateLimiter.acquire(channel);        // 没令牌就等

  // ... 走 runScript
}
```

#### 用户活动时段扩展窗口（可选）

凌晨 2-6 点 BOSS 反爬触发率最低，可以放宽 `perMinute` 到 60；上班时段（9-12 / 14-17）BOSS 用户最多，反爬最严，收紧到 20。

```ts
function getActiveLimit(channel) {
  const hour = new Date().getHours();
  const base = RATE_LIMITS[channel];
  if (hour >= 2 && hour < 6) return { ...base, perMinute: base.perMinute * 2 };
  if (hour >= 9 && hour < 17) return { ...base, perMinute: Math.floor(base.perMinute * 0.7) };
  return base;
}
```

### 9.6 风控弹窗 / 验证码处理

招聘站会在反爬触发后弹出滑动验证码 / 短信验证 / 跳到 captcha 页。**自动化无法绕过，必须暂停任务交给用户**。

#### 检测条件（每个 channel 一段检测脚本）

```js
// src/automation/scripts/boss/detectChallenge.js
export const detectChallenge = {
  description: '检测 BOSS 是否触发风控弹窗（验证码/二次验证）',
  parameters: { type: 'object', properties: {} },
  script: `
    // 检测多个反爬触发标志
    const url = page.url();
    
    // ① URL 跳到验证页
    if (url.includes('/wapi/zppassport/verify') || url.includes('/captcha')) {
      return { challenged: true, type: 'redirect', url };
    }
    
    // ② 弹出验证码 modal
    const captchaModal = page.locator('.geek-verify-dialog, [data-test="captcha"]');
    if (await captchaModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      return { challenged: true, type: 'captcha-modal' };
    }
    
    // ③ 接口返回 412 / 反爬错误码
    // (脚本内部 page.on('response', ...) 监听一下，超出本工具范围)
    
    return { challenged: false };
  `,
};
```

#### 业务脚本中触发风控的处理

每个高频脚本（`viewResume` / `selectPosition`）在关键节点检测一次：

```js
// src/automation/scripts/boss/viewResume.js
script: `
  await card.click();
  
  // 点击后立即检测风控
  const captcha = page.locator('.geek-verify-dialog');
  if (await captcha.isVisible({ timeout: 1500 }).catch(() => false)) {
    const err = new Error('BOSS 触发验证码');
    err.code = 'RATE_LIMITED';
    err.context = { type: 'captcha-modal', tab: page.url() };
    throw err;
  }
  
  // ...继续业务...
`
```

#### AI 收到 RATE_LIMITED 后

```python
# AI 决策伪码
if result.error.code == 'RATE_LIMITED':
    await tool.call('task.pause', { 'reason': 'rate-limited', 'cooldownMs': 300000 })
    # 通过通知系统提示用户："i快招检测到 BOSS 风控，请人工通过验证码后继续"
    notify_user("BOSS 反爬触发，请在客户端内手动通过验证码")
    # 等待用户在 UI 上点"继续"
    await wait_for_user_resume()
    # 用户处理完后从断点继续
```

前端 H5 在 task.pause 时显示一个浮层："BOSS 反爬触发，请前往招聘站 tab 手动验证后点击继续"。用户在 BOSS tab 完成验证码 → 回到 i快招 → 点"继续" → H5 上行 `task.resume`。

### 9.7 登录态失效处理

用户的 BOSS / 智联登录会过期（通常 7-30 天），脚本跑到一半会突然遇到。

#### 检测条件

```js
// 通用检测：在 viewResume / captureRecommendList 等脚本里加一行
script: `
  const resp = await page.waitForResponse(...);
  const data = await resp.json();
  
  // BOSS 登录失效返回 code=1010 或跳到登录页
  if (data.code === 1010 || resp.status() === 401) {
    const err = new Error('BOSS 登录已失效');
    err.code = 'LOGIN_EXPIRED';
    err.context = { channel: 'boss', tabUrl: page.url() };
    throw err;
  }
  
  // 处理正常数据...
`
```

#### 处理流程

```
LOGIN_EXPIRED → AI 暂停任务 → 提示用户重新登录 BOSS
                                   ↓
                        用户在 i快招 → BOSS tab 完成登录
                                   ↓
                Electron recruitBridge 自动检测到 cookie 更新
                                   ↓
                        H5 自动收到 channelStatusChanged 事件
                                   ↓
                        UI 显示"BOSS 登录恢复，可继续任务"
                                   ↓
                        用户点继续 → AI 从断点续跑
```

#### 自动重登（暂不做）

未来可考虑：客户端 SSO 后台自动给 BOSS 续期 token（如果 BOSS 支持的话）。MVP 先靠用户手动登录。

---

## 10. 端到端示例：采集 BOSS 推荐 30 个简历

### 10.1 序列图

```
User    AI 服务端          H5 (runner)               Electron 沙箱         BOSS tab
 │          │                  │                          │                  │
 │ "采集"  │                  │                          │                  │
 │─────────→│                  │                          │                  │
 │          │ task.start ────→│                          │                  │
 │          │ ←──── task.accepted                         │                  │
 │          │                  │                          │                  │
 │          │ tool.call: boss.openRecommend               │                  │
 │          │ ────────────────→│ runScript({              │                  │
 │          │                  │   scriptCode: "...",     │                  │
 │          │                  │   ctx: {}                │                  │
 │          │                  │ }) ─────────────────────→│                  │
 │          │                  │                          │ vm.run + 注入 page│
 │          │                  │                          │ page.goto(...)   │
 │          │                  │                          │ ────────────────→│ 加载页面
 │          │                  │                          │ page.waitForLoadState('networkidle')
 │          │                  │                          │ return { url, title }│
 │          │                  │ ←──── ok: true, data: {} │                  │
 │          │ ←──── tool.result                           │                  │
 │          │                  │                          │                  │
 │          │ tool.call: boss.captureRecommendList        │                  │
 │          │ ────────────────→│ runScript                │                  │
 │          │                  │ ────────────────────────→│ page.waitForResponse(/recommend/v2/)
 │          │                  │                          │ ←──── XHR data   │
 │          │                  │                          │ resp.json()      │
 │          │                  │                          │ return { items, meta }│
 │          │                  │ ←──── ok: true, data: {30 items}            │
 │          │ ←──── tool.result                           │                  │
 │          │                  │                          │                  │
 │          │ 决策...           │                          │                  │
 │          │ tool.call: boss.viewResume{ index:0, dwellMs:5000 }            │
 │          │ ────────────────→│ runScript                │                  │
 │          │                  │ ────────────────────────→│ page.locator('.recommend-card').nth(0).click()
 │          │                  │                          │ + page.waitForResponse(/geek/detail/) │
 │          │                  │                          │ ←──── 简历数据    │
 │          │                  │                          │ sleep(5000+jitter)│
 │          │                  │                          │ page.keyboard.press('Escape')
 │          │                  │                          │ return { resume }│
 │          │ ←──── tool.result                           │                  │
 │          │                  │                          │                  │
 │          │ ... 循环 30 次 ...                          │                  │
 │          │                  │                          │                  │
 │          │ task.finish ────→│                          │                  │
```

### 10.2 AI 决策伪码

```python
async def collect_boss_recommendations(target_count=30):
    await tool.call('boss.openRecommend')
    collected = []
    while len(collected) < target_count:
        # 抓一页列表数据
        page_data = await tool.call('boss.captureRecommendList')
        for i, item in enumerate(page_data['items']):
            if len(collected) >= target_count:
                break
            # 点开简历看几秒再关闭
            r = await tool.call('boss.viewResume', {
                'index': i,
                'dwellMs': random.uniform(3000, 6000)
            })
            collected.append({ **r['resume'], 'jobId': item['jobId'] })
        # 滚动到下一段触发列表 loadmore
        await tool.call('boss.scroll', {
            'deltaY': 800 + random.randint(-100, 100),
            'segments': 6
        })
    await tool.call('task.finish', { 'collected': collected })
```

### 10.3 关键事实再强调

- **AI 服务端**：只发"工具名 + ctx 参数"，**不传脚本字符串**
- **前端 H5**：根据工具名查表拿到 scriptCode 字符串，连同 ctx 一起发给 Electron
- **Electron**：在沙箱里跑 scriptCode，脚本通过 `page.*` API 操作 BOSS tab
- **下次 BOSS 改版**：只改 `src/automation/scripts/boss/*.js` 里的选择器/接口路径字符串，**前端发版即生效**，Electron 不动
- **AI 想新工具**：前端加一个新 script 文件，导出注册到 ALL_TOOLS，发版 H5；AI 服务端通过启动时上报的 catalog 自动学到新工具的 schema

---

## 11. 落地路线图

| 阶段 | 工作 | 工时估算 |
|---|---|---|
| **P0** | Electron 端骨架：开 CDP 端口 + `automation/runner.ts`（vm 沙箱 + playwright-core connectOverCDP + tabId↔Page 映射 + 取消机制） | **1.5d**（不用自己实现 PageProxy，只需把 playwright Page 透传到沙箱） |
| **P1** | preload + 类型定义 + IPC 入口 (`runScript` / `openOrActivate` / `getActiveTab` / `cancelAll`) | 0.3d |
| **P2** | H5 端 runner.js + 5-6 个 BOSS 脚本 + WS 接 AI | 1-2d |
| **P3** | 端到端 demo：采集 5 个 BOSS 简历 | 0.5d |
| **P4** | 工具补全：智联 / 猎聘 / 51Job 脚本（每个站 5-6 个脚本） | 1-2d / 站 |
| **P5** | 节奏 / 反爬抖动 / 错误码 / 频率限制 / 监控 | 1d |
| **P6** | 文档 + tool catalog schema 发给 AI 团队 | 0.5d |

总计 **P0-P3 ≈ 3-4 人天**跑通最小可演示版本（采集 BOSS 5 个简历）—— 比自己实现 PageProxy 的方案省 2-3 天。

> P0 主要工作：① Electron 主进程加 `app.commandLine.appendSwitch('remote-debugging-port', '0')`；② 写 `runner.ts` 用 `chromium.connectOverCDP` 拿 Browser；③ 写 `tabId → Page` 映射；④ vm 沙箱注入；⑤ 取消信号（AbortController）。**完全不写 Playwright API 实现**。

### 11.5 任务进度 UI 设计（前端 H5）

任务跑起来时用户应该看到进度，能随时取消 / 暂停。建议加一个浮层抽屉：

```
                                          ┌──────────────────────────────┐
                                          │  自动化任务                 ⚙ │
                                          │  ─────────────────────────── │
                                          │  采集 BOSS 推荐 50 个简历     │
                                          │  ────●────────────────────── │
                                          │  已完成 12 / 50              │
                                          │                              │
                                          │  当前步骤：                  │
                                          │  ▶ boss.viewResume #12       │
                                          │     第 12 个候选人，正在停留 │
                                          │                              │
                                          │  [⏸ 暂停] [⏹ 停止] [💬 切到聊天]│
                                          ├──────────────────────────────┤
                                          │  历史步骤 (展开/收起)         │
                                          │   ✓ openRecommend  120ms     │
                                          │   ✓ captureList    1.2s      │
                                          │   ✓ viewResume #1   5.3s     │
                                          │   ✓ viewResume #2   4.8s     │
                                          │   ...                        │
                                          ├──────────────────────────────┤
                                          │  Logs (实时尾部 5 行)         │
                                          │   sleep 4.5s                 │
                                          │   waitForResponse matched    │
                                          │   ...                        │
                                          └──────────────────────────────┘
```

#### 数据来源

UI 状态完全通过监听三类消息实时更新：

| 消息源 | 用途 |
|---|---|
| AI 服务端 → H5 `task.start` | 创建任务 → UI 显示新任务 |
| AI 服务端 → H5 `tool.call` | 当前步骤更新（"正在做 xxx"） |
| H5 → AI `tool.result` | 步骤完成（更新进度条 / 历史） |
| AI 服务端 → H5 `task.progress` | 显式进度（"已采集 12/50"） |
| AI 服务端 → H5 `task.finish` / `task.cancel` | 任务结束 |

#### 用户操作

```
"暂停" → H5 上行 task.pause → AI 服务端暂停决策（不发新 ToolCall）
"继续" → H5 上行 task.resume → AI 服务端恢复
"停止" → H5 上行 task.cancel → AI 服务端发 task.cancel 给 H5 → H5 调 automation.cancelAll
```

#### 不阻塞用户操作

抽屉是浮层（不全屏），用户可以同时切到 BOSS / 智联 tab 看 AI 在干什么；可以手动介入（比如反爬触发时人工通过验证码）；可以切到聊天 tab 继续问 AI。

#### 状态持久化

抽屉的 task.id / lastStepId / processedSteps 写入 sessionStorage，刷新 H5 也能恢复。

---

## 12. 决策点（待评审）

| # | 决策 | 选项 | 推荐 |
|---|---|---|---|
| **A1** | AI ↔ H5 通道 | (a) 复用 chat WebSocket<br>(b) 单独自动化 WS 通道 | 复用 chat（少一条连接） |
| **A2** | 工具 schema 来源 | (a) 前端运行时上报<br>(b) AI 服务端硬编码 | 前端上报（动态加减不重发版） |
| **A3** | 任务并发 | (a) 同时间至多 1 任务<br>(b) 多任务但严格不交叉 tab | (a) 简单可靠 |
| **A4** | Playwright 集成方式 | (a) 自己用 CDP 实现 Playwright-style 子集<br>(b) **集成 playwright-core 真连 Electron CDP**<br>(c) playwright + 独立 Chromium | **(b)** —— 真 API、依赖只 ~30MB、跟用户已登录的招聘站 tab 共享状态 |
| **A4.1** | CDP 端口 | (a) 固定端口 9222<br>(b) `port=0` 让 Chromium 随机选 | **(b)** —— 避免端口冲突；启动后通过 `process.debugPort` 拿实际端口 |
| **A4.2** | playwright-core 升级策略 | (a) 跟随业务需求按需升<br>(b) 跟 Electron Chromium 版本对齐 | (a) 业务驱动；只要 Playwright 兼容当前 Chromium 版本即可（[兼容矩阵](https://playwright.dev/docs/release-notes)） |
| **A5** | 屏蔽频率 | (a) H5 端漏桶<br>(b) Electron 端漏桶 | H5 端（业务可调） |
| **A6** | 工具白名单维护 | (a) 编译时（src/automation/runner.js 静态注册）<br>(b) 运行时动态加载 | (a) 安全审计可控 |
| **A7** | 简历/职位数据回流 | (a) 通过 WS 流式发回 AI<br>(b) 写入主页 SPA store 后由业务 API 提交 | (a) AI 拿到原始数据决策更精准 |

---

## 13. 后续可扩展

- **多账号/多 IP**：当前单 partition 下 BOSS 可能限频，未来支持多个 partition 切换
- **视觉 AI**：`page.screenshot()` 配合 GPT-4V 让 AI 直接看页面（应对 DOM 反爬强混淆）
- **录制回放**：录制人类一段操作 → 转成 ToolCall 序列 → AI 学习
- **失败补救**：检测到风控弹窗时，AI 暂停并通知用户介入

---

## 14. 文档变更记录

| 日期 | 作者 | 变更 |
|---|---|---|
| 2026-05-09 | lewin | 初稿：三层职责划分 / atom 集 / 业务工具集 / WS 协议 / 安全模型 |
| 2026-05-09 | lewin | v2：去原子化 → 改为"Electron 提供脚本沙箱 + PageProxy(Playwright-style)，前端发整段脚本字符串执行"，彻底解耦业务变更与客户端版本 |
| 2026-05-09 | lewin | v3：去 PageProxy 自实现 → 集成 `playwright-core` + `chromium.connectOverCDP` 接管 Electron WebContentsView，沙箱注入**真正的** Playwright Page 对象。前端脚本写的是地道 Playwright，而非"Playwright-like"。P0 工作量从 3-4d 降到 1.5d |
| 2026-05-09 | lewin | v3.1：补 §4.11 数据序列化规则 / §4.12 取消 cleanup 协议 / §4.13 partition ↔ BrowserContext 关系 / §4.14 兼容性矩阵；重写 §5.3 selectPosition 脚本（更真实的下拉浮层操作流程） |
| 2026-05-09 | lewin | v3.2：补 §3.4 断线重连 / 任务恢复 ; §5.6 dev 期独立调试 ; §5.7 录制回放（可选）; §8.4 错误恢复策略 ; §9.5 频率限制具体配置 ; §9.6 风控弹窗 / 验证码处理 ; §9.7 登录态失效处理 ; §11.5 任务进度 UI 设计 |
| 2026-05-09 | lewin | v3.3：补 §4.7.1 网络拦截两种模式（waitForResponse 单次同步等 vs page.on 持续订阅）+ 何时用哪种 ; 新增 §5.3 boss.loadMore 工具脚本演示"滚动+等响应"Promise.all 配对模式 |
| 2026-05-09 | lewin | v3.4：模式 B 持续订阅作为正式能力支持 — §4.7.1 补完整契约（必须 try/finally off）+ 错误写法对比；§5.3 新增 boss.passiveCollect "采集模式" 完整工具脚本（被动监听 N 秒 + 上限保护 + 模式 A/B 混合用法示例）；§4.12.1 主进程兜底强制清理泄漏的 listener |
| 2026-05-09 | lewin | v3.5：新增 §5.8 前置就绪检查（preflight）—— runner.dispatch 自动跑 channel preflight 工具：URL 校验 / 登录检测 / 全局弹框关闭 / 关键 DOM 就绪；BOSS preflight 完整脚本含 5 大类弹框处理 + 通用未知遮罩检测；§5.4 runner 集成 preflight 流程；§8.1 错误码补 NOT_ON_TARGET_PAGE / OVERLAY_BLOCKED / LOGIN_EXPIRED / SCRIPT_ERROR；§9.4 反爬清单显式标注"弹框遮挡操作 DOM 是反爬强信号" |
| 2026-05-09 | lewin | v3.6：新增 §4.1.1 Electron 端职责边界（架构铁则）—— 明确所有业务逻辑（preflight / 工具 / selector / 频率限制 / 错误恢复）必须在前端 H5，主进程**绝不**做业务判断；强化措辞防止 PR 偷塞业务到主进程；§4.12.1 标注 listener 清理属于"通用资源回收"而非业务；§5.8.6 修正"主进程缓存"歧义为"前端 H5 缓存" |
