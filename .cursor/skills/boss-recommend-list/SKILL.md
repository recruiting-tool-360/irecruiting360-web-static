---
name: boss-recommend-list
description: >-
  Fetch BOSS Zhipin "推荐牛人" list silently in an already-open BOSS recommend
  tab by `page.evaluate(fetch())`-ing `/wapi/zpjob/rec/geek/list` for a given
  `encryptJobId`. Unlike `boss-recommend-filter`, this skill **does not open
  the filter popup** — it just pulls the default unfiltered list (or with
  pre-computed numeric filter params) for the recommend tab in results view.
  Use when the user asks for BOSS / 直聘 推荐牛人 列表 / 推荐数据 / recommend
  list / fetch recommend candidates, or wants to show recommend results in
  a separate tab without filter UI.
disable-model-invocation: true
---

# BOSS 推荐牛人 - 列表抓取（无筛选浮层）

## What this skill produces

A **single `scriptCode` string** (the `async function _run(...)` body) that's
fed to `window.api.automation.runScript({ tabId, scriptCode, ctx })`. The
runtime contract is identical to other Playwright skills in this repo
(see `docs/automation-protocol.md` and `boss-recommend-filter/SKILL.md`).

The script:
1. Verifies current tab host endsWith `zhipin.com` (else throws `NOT_ON_BOSS_DOMAIN`)
2. Builds query string with default numeric filters (all 0 = 不限) + caller-provided overrides
3. `page.evaluate(fetch(...))` calls `https://www.zhipin.com/wapi/zpjob/rec/geek/list?...`
4. Parses `body.code` / `body.zpData.geekList`
5. Returns `{ jobId, page, totalSize, hasMore, apiUrl, geekList, geekCount, raw }`

**No DOM interactions**, no `.filter-wrap` click, no `.filter-panel` wait — this
is the fastest, lowest-risk way to read recommend list data. Use this when:
- 你要在自己的 UI 里直接展示推荐列表（results 视图的"推荐牛人"tab）
- 用户已经在筛选条件全 0 / 用 Vue 端控件来定义筛选条件，不需要操作 BOSS 自己的浮层
- 反爬考虑：少一次 click，更不容易被识别

如果你需要"模拟人类点筛选浮层 → 选选项 → 点确定 → 等数据"那种场景，用
`boss-recommend-filter` skill 而不是这个。

## When to use

User says any of:

- "BOSS 推荐牛人列表 / 推荐数据 / 推荐结果"
- "拉推荐 / fetch recommend / get recommend list"
- "在推荐 tab 显示 BOSS 推荐"
- "boss-recommend-list / boss.recommendList"
- "启动聚合搜索 → 推荐牛人"（业务高层入口）

## Input shape (`ctx`)

```js
ctx = {
  jobId: '61e0cd1cbd6016d90nZ80tq5FVVV',   // BOSS encryptJobId（必需）
  page: 1,                                  // 默认 1
  // 可选：数字 ID 形式的额外筛选
  filterParams: {
    experience: 0, degree: 0, intention: 0, salary: 0,
    age: '16,-1', activation: 0, school: 0, gender: 0,
  },
  timeoutMs: 8000,
}
```

`filterParams` 走 BOSS 接口的 query 字段名（不是 SKILL.md 里中文 label）：
| 中文标签   | query 字段名 | 备注                           |
|-----------|-------------|-------------------------------|
| 经验要求   | experience  | 数字 ID，0 = 不限              |
| 学历要求   | degree      | 数字 ID                        |
| 求职意向   | intention   | 数字 ID                        |
| 薪资待遇   | salary      | 数字 ID                        |
| 年龄      | age         | 字符串如 '16,-1'（默认不限）   |
| 活跃度    | activation  | 0 = 不限                       |
| 是否应届   | school      | 0/1                            |
| 性别      | gender      | 0/1/2                          |

中文 label → 数字 ID 的映射在前端 Vue 控件那边维护（参考 ihraisaas 的下拉值，或后端 init 接口
返回的字典）。本 skill 拿到的就是数字 ID，**不再做翻译**。

## Output shape (script `return`)

```js
return {
  jobId: '...',
  page: 1,
  totalSize: 240,
  hasMore: true,
  apiUrl: 'https://www.zhipin.com/wapi/zpjob/rec/geek/list?...',
  geekList: [
    { encryptGeekId, name, genderText, ageDesc, expectPositionName, expectSalaryDesc, ... }
  ],
  geekCount: 20,
  raw: { ... }     // 整个 zpData，便于后续扩展
};
```

## Error codes (thrown `err.code`)

| code                | 触发条件                                   |
|--------------------|-------------------------------------------|
| `NOT_ON_BOSS_DOMAIN` | tab.url 不是 `*.zhipin.com`               |
| `BAD_REQUEST`       | ctx.jobId 缺失                            |
| `HTTP_NOT_OK`       | fetch 返回非 2xx                          |
| `EMPTY_DATA`        | body 为空 / 解析失败                      |
| `API_ERROR`         | body.code !== 0 且不是登录类错误          |
| `LOGIN_EXPIRED`     | body.message 包含"未登录/登录/login"      |
| `TIMEOUT`           | AbortController 触发                      |

业务侧拿到 `LOGIN_EXPIRED` 时应引导用户在 BOSS tab 完成登录后重试。

## Frontend wrapper（**业务侧直接调这个**）

文件：`src/util/automation/bossRecommend.js`

```js
import { fetchBossRecommendList } from "src/util/automation/bossRecommend";

const res = await fetchBossRecommendList({
  encryptJobId: "61e0cd1cbd6016d90nZ80tq5FVVV",
  page: 1,
  timeoutMs: 8000,
  navWaitMs: 1500           // 打开 tab 后等 1.5s 再 fetch（cookie / SSR 就位）
});

if (!res.ok) {
  if (res.errorCode === "LOGIN_EXPIRED") { /* 引导登录 */ }
  return;
}
const { jobId, geekList, totalSize, hasMore } = res.data;
```

`fetchBossRecommendList` 内部做了两件事：

1. `openBossRecommend(encryptJobId)` 调 `window.api.automation.openOrActivate`
   打开/激活 BOSS 推荐 tab（URL 是 `web/frame/recommend/?jobid=...&status=0&filterParams=&source=0`）
2. 等 1.5s 让 cookie / SSR 就位
3. `runOnTab(tabId, bossRecommendListScript, ctx)` 在该 tab 里执行本 skill 的 scriptCode

业务侧**几乎不会**直接调 `runOnTab` + scriptCode —— 用 `fetchBossRecommendList` 即可。
直接 runScript 仅用于：
- 已经知道 tabId（如同一会话内多次拉同一个 jobId 的不同 page）
- 调试 / 手动注入

## Template scriptCode

文件：`src/playwright/bossRecommendList.js` 里 `export const scriptCode`。已经是
可直接传给 `runScript({ scriptCode, ... })` 的字符串 —— 当用户问"给我生成 scriptCode"时，
**直接 import 这个值返还**，不要重写一遍。

```js
// scriptCode 由 src/playwright/bossRecommendList.js 导出，约 100 行；核心逻辑见上方"What this skill produces"
```

## 字段速查（`zpData.geekList[i]` 常用字段）

来自实际 BOSS 接口抓包（参考 `docs/boss地址资料.md`）：

| 字段                              | 含义                              |
|----------------------------------|----------------------------------|
| `encryptGeekId` / `geekId`         | 候选人 ID（详情页主键）             |
| `name` / `geekName`                | 姓名                              |
| `genderText` / `gender`            | 性别                              |
| `ageDesc` / `age`                  | 年龄                              |
| `expectPositionName` / `position`  | 期望职位                          |
| `expectSalaryDesc`                 | 期望薪资                          |
| `educationName` / `degree`         | 学历                              |
| `workYearDesc` / `workYears`       | 工作年限                          |
| `locationName` / `city`            | 城市                              |
| `companyName` / `company`          | 当前公司                          |
| `activeTimeDesc` / `activationDesc`| 活跃时间                          |
| `skillNames` / `skillRequire`      | 技能 / 关键词                     |
| `labels`                           | BOSS 标签数组                     |
| `avatar` / `avatarUrl`             | 头像                              |

实际字段会随 BOSS 改版漂移，组件层（`src/components/clients/RecommendList.vue`）已经做了
多字段兜底，新加字段时优先在那边补 fallback，不需要改 scriptCode。

## 用户产出格式（agent 直接照抄即可）

如果用户问"给我 scriptCode"：

```js
import { scriptCode as bossRecommendListScript } from 'src/playwright/bossRecommendList';
// 然后直接 runScript({ tabId, scriptCode: bossRecommendListScript, ctx: { jobId, page, ... } })
```

如果用户问"业务侧怎么调"：

```js
import { fetchBossRecommendList } from 'src/util/automation/bossRecommend';
const res = await fetchBossRecommendList({ encryptJobId, page });
```

不要让用户复制粘贴 scriptCode 全文到 IPC handler 里 —— `runScript` 协议已经接受字符串，
直接 import 已经生成好的常量更准、更不易抄错。

## 相关文档

- `src/playwright/bossRecommendList.js` —— scriptCode + buildCtx + meta
- `src/util/automation/bossRecommend.js` —— `fetchBossRecommendList` / `openBossRecommend`
- `src/store/modules/BossRecommendData.js` —— 按 jobId 缓存的 Vuex 模块（持久化）
- `src/components/clients/RecommendList.vue` —— 推荐 tab 的 UI 组件
- `docs/boss地址资料.md` 第 286-380 行 —— 原始抓包 URL + DOM 结构
- `.cursor/skills/boss-recommend-filter/SKILL.md` —— 互补 skill（带筛选浮层）
- `.cursor/skills/boss-job-list/SKILL.md` —— 抓我的职位列表（隐藏窗口路径）

## 不要做的事

- ❌ 不要在脚本里 `page.goto(...)` —— 推荐 tab 已经由 `openBossRecommend` 打开，
  goto 会覆盖用户的 tab 历史
- ❌ 不要在脚本里点 `.filter-wrap` —— 那是 `boss-recommend-filter` 的职责
- ❌ 不要在 scriptCode 里硬编码字段中文 label → 数字 ID 的字典 —— 业务调
  `fetchBossRecommendList({ filterParams: { experience: 12, ... }})` 时已经是数字
- ❌ 不要直接给 `RecommendList.vue` 写"刷新"按钮的 fetch 逻辑 —— 已经有
  `IndexPage.retryFetchRecommend()` + `lastRecommendArgs`，组件只 emit 事件
