---
name: boss-recommend-filter
description: >-
  Generate Playwright script strings that open BOSS Zhipin "推荐牛人" filter
  popup and pick filter options (经验要求 / 学历要求 / 求职意向 / 薪资待遇) the way a
  human would: click the `.filter-wrap` trigger, wait for `.filter-panel`,
  click matching `.option` items by visible text, then submit via the "确定"
  button and wait for `/wapi/zpjob/rec/geek/list`. Use when the user asks for
  a BOSS / 直聘 / zhipin 推荐牛人 筛选 / filter automation script, or any task
  that ends in "生成 Playwright 脚本字符串" for BOSS recommend-filter popup.
disable-model-invocation: true
---

# BOSS 推荐牛人 - 筛选浮层 Playwright 脚本生成

## What this skill produces

A **single `scriptCode` string** (the `async function _run(...)` body) that
can be passed straight into `window.api.automation.runScript({tabId, scriptCode, ctx})`
as defined in `docs/automation-protocol.md`.

Runtime contract (do NOT re-declare these; they are injected by the runner):

- `page` — real `playwright-core` `Page`
- `ctx` — JSON passed from caller (filter intent)
- `log(msg)`, `sleep(ms)`, `jitter(a, b)`, `AbortSignal`

The script **must not** use `require`, `process`, `setTimeout`, `Buffer`, `globalThis`,
top-level `async function` wrapping, or any browser globals. Just write the body
of an async function and `return` a value.

## When to use

The user says any of:
- "BOSS 推荐牛人 筛选 / 筛选浮层"
- "经验 / 学历 / 求职意向 / 薪资 选 X，生成 Playwright 脚本"
- "点开 `.filter-wrap`，选 ..., 点确定"
- "boss 筛选 skill / boss-recommend-filter"

## Input shape (`ctx`)

Filter intent comes in as an **array of `{ name, value }` objects** on
`ctx.filters`. This is the canonical shape:

```js
ctx = {
  filters: [
    { name: '经验要求', value: '25年毕业' },
    { name: '学历要求', value: '本科' },
    { name: '求职意向', value: '离职-随时到岗' },
    { name: '薪资待遇', value: '10-20K' },
  ],
  waitListMs: 12000,              // optional, max ms to wait for list api
};
```

`name` 必须命中下表（左列首选，右列别名也接受，统一映射到中间的修饰类）：

| name (规范) | check-box 修饰类 | 接受的别名               |
|------------|------------------|------------------------|
| 经验要求    | `.experience`    | 经验 / experience       |
| 学历要求    | `.degree`        | 学历 / degree           |
| 求职意向    | `.intention`     | 求职 / 意向 / intention |
| 薪资待遇    | `.salary`        | 薪资 / 薪水 / salary    |

Rules:
- Skip an entry whose `value` is empty / null / `'不限'`.
- `value` **must** match a `.option` 文案 **verbatim** (case-sensitive, see 选项字典).
- All four groups are **single-select**; later entries don't stack on earlier ones.
- Duplicate `name` entries → **last one wins**, and `log()` a warning.
- Unknown `name` → `log()` warning and put it in `skipped`; don't throw.

## Output shape (the script's `return`)

```js
return {
  picked: [                                          // what was actually clicked
    { name: '经验要求', value: '25年毕业' },
    { name: '学历要求', value: '本科' },
  ],
  skipped: [                                         // entries the script could not apply
    { name: '...', value: '...', reason: 'unknown_name | option_not_found | already_active' },
  ],
  apiUrl: '...',                                     // matched list api url
  zpData: <decoded api body>.zpData,                 // raw list payload
  geekCount: <number>,                               // zpData.geekList.length
};
```

If the filter popup never opened, throw with `code = 'OVERLAY_BLOCKED'`. If
the list api never came back within `ctx.waitListMs`, throw with
`code = 'TIMEOUT'`. (Throw plain `Error` and set `err.code`; the runner maps
it through.)

## Default DOM (from `docs/boss地址资料.md` lines 290-379)

Use this structure unless the user pastes an updated HTML snippet later in the
chat — see "重新解析 HTML" at the bottom.

```
.filter-wrap                                  ← trigger (top-level)
.filter-panel                                 ← popup root
  .top
    .filters-wrap
      .filter-item                            ← one per filter group
        .filter-wrap                          ← inner wrap (NOT the trigger)
          .name                               ← group label ("经验要求" ...)
          .check-box.experience | .degree | .intention | .salary
            .default.option                   ← "不限"
            .options
              .option                         ← clickable choices, `.active` = selected
  .btns
    .btn                                      ← "确定" submit
```

Notes:
- The trigger and the inner per-group wrap **share** the `.filter-wrap` class.
  Always scope selectors with `.filter-panel ...` after the popup opens, so they
  don't collide with the page-level trigger.
- Each `.check-box` has a semantic sibling class — `experience` / `degree` /
  `intention` / `salary` — use it instead of `:nth-child` for robustness.

## 选项字典 (canonical text — must match exactly)

```yaml
experience:  [不限, 在校/应届, 25年毕业, 26年毕业, 26年后毕业, 1年以内, 1-3年, 3-5年, 5-10年, 10年以上]
degree:      [不限, 初中及以下, 中专/中技, 高中, 大专, 本科, 硕士, 博士]
intention:   [不限, 离职-随时到岗, 在职-暂不考虑, 在职-考虑机会, 在职-月内到岗]
salary:      [不限, 3K以下, 3-5K, 5-10K, 10-20K, 20-50K, 50K以上]
```

If the user gives a fuzzy phrase, map it before generating the script:
- `'三到五年'` → `'3-5年'`
- `'本科及以上'` → pick the lowest acceptable rung, default `'本科'`, and `log()`
  a warning that BOSS filter is single-select so "及以上" cannot be expressed.
- `'随时到岗'` → `'离职-随时到岗'`
- `'十到二十K'` / `'10k-20k'` → `'10-20K'`
- Anything that doesn't map → **do not silently drop**. Either ask the user
  or include a `log('unknown experience: …')` and skip that group.

## Result API to wait for

Trigger: clicking `.filter-panel .btns .btn:has-text("确定")` fires
`GET https://www.zhipin.com/wapi/zpjob/rec/geek/list?...&experience=…&degree=…&intention=…&salary=…`

Pair the click with `page.waitForResponse` so the action and response are
correlated (Mode A in `automation-protocol.md` §4.7.1).

## Script generation rules (apply every time)

1. **Open popup**: click `.filter-wrap` (the page-level one — `.first()` is safe
   because the inner ones are not in the DOM yet) and wait for `.filter-panel`
   to be visible.
2. **Normalize `ctx.filters` first**: build a `Map<modifier, {name, value}>` via
   `NAME_TO_MOD`. Skip entries whose `value` is empty / `'不限'`. On unknown
   `name`, `log()` and push to `skipped`. On duplicate `name`, last-one-wins.
3. **Idempotent click**: before clicking an option, check it isn't already
   `.active` — if it is, push to `skipped` with `reason: 'already_active'` and
   don't click again.
4. **Human jitter**: between clicks, `await sleep(jitter(180, 480))`. After
   popup open, `await sleep(jitter(250, 550))`. Before "确定", `await sleep(jitter(300, 700))`.
5. **Submit + wait list api in `Promise.all`**:
   ```js
   const [resp] = await Promise.all([
     page.waitForResponse(r =>
       r.url().includes('/wapi/zpjob/rec/geek/list') && r.status() === 200,
       { timeout: ctx.waitListMs ?? 12000 }),
     page.locator('.filter-panel .btns .btn').filter({ hasText: '确定' }).click(),
   ]);
   ```
6. **Decode and return** `zpData` plus `geekCount`. Never `console.log` (use `log()`).
7. **Cancellation**: pure `await page.…` calls already honor `AbortSignal` via
   the runner. Don't add manual signal-checking unless you have a non-page
   `await` (e.g. a custom `setInterval` — which you shouldn't have here).
8. **No selectors with `data-v-*`** — those Vue scoped hashes change between
   builds. Only use semantic class names from the dictionary above.

## 模板脚本 (canonical output — copy and adapt `ctx` usage)

The string below is exactly the `scriptCode` to emit. It already handles all
four groups and the runtime contract. **Use this as the base** and only edit
when the user requests a structural change.

```js
// === scriptCode body — do NOT wrap in async function() {...} ===

// name (规范名 | 别名) → check-box 修饰类
const NAME_TO_MOD = {
  '经验要求': 'experience', '经验': 'experience', 'experience': 'experience',
  '学历要求': 'degree',     '学历': 'degree',     'degree': 'degree',
  '求职意向': 'intention',  '求职': 'intention',  '意向': 'intention',  'intention': 'intention',
  '薪资待遇': 'salary',     '薪资': 'salary',     '薪水': 'salary',     'salary': 'salary',
};

const filters = Array.isArray(ctx?.filters) ? ctx.filters : [];

// last-one-wins by modifier, plus capture unknown names
const wanted = new Map();    // mod -> { name, value }
const skipped = [];
for (const f of filters) {
  if (!f || typeof f !== 'object') continue;
  const rawName = String(f.name ?? '').trim();
  const value = String(f.value ?? '').trim();
  if (!value || value === '不限') continue;
  const mod = NAME_TO_MOD[rawName];
  if (!mod) {
    log('unknown filter name: ' + rawName);
    skipped.push({ name: rawName, value, reason: 'unknown_name' });
    continue;
  }
  if (wanted.has(mod)) {
    log('duplicate filter for ' + rawName + ', last one wins: ' + value);
  }
  wanted.set(mod, { name: rawName, value });
}

// 1) open the filter popup
const trigger = page.locator('.filter-wrap').first();
if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) {
  const err = new Error('.filter-wrap trigger not visible');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
}
await trigger.click();
const panel = page.locator('.filter-panel');
await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
  const err = new Error('.filter-panel did not open');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
});
await sleep(jitter(250, 550));

// 2) pick each group
const picked = [];
for (const [mod, entry] of wanted) {
  const box = panel.locator('.check-box.' + mod);
  if (!(await box.count())) {
    log('group not found in popup: ' + entry.name);
    skipped.push({ name: entry.name, value: entry.value, reason: 'group_not_found' });
    continue;
  }
  const opt = box.locator('.option').filter({ hasText: entry.value }).first();
  if (!(await opt.count())) {
    log('option not found: ' + entry.name + '=' + entry.value);
    skipped.push({ name: entry.name, value: entry.value, reason: 'option_not_found' });
    continue;
  }
  const cls = (await opt.getAttribute('class')) || '';
  if (cls.includes('active')) {
    skipped.push({ name: entry.name, value: entry.value, reason: 'already_active' });
  } else {
    await opt.scrollIntoViewIfNeeded().catch(() => {});
    await opt.click();
    await sleep(jitter(180, 480));
  }
  picked.push({ name: entry.name, value: entry.value });
}

// 3) submit + wait for the list api
await sleep(jitter(300, 700));
const submit = panel.locator('.btns .btn').filter({ hasText: '确定' }).first();
const [resp] = await Promise.all([
  page.waitForResponse(
    (r) => r.url().includes('/wapi/zpjob/rec/geek/list') && r.status() === 200,
    { timeout: ctx?.waitListMs ?? 12000 }
  ),
  submit.click(),
]);

const body = await resp.json().catch(() => ({}));
const zpData = body?.zpData || null;
return {
  picked,
  skipped,
  apiUrl: resp.url(),
  zpData,
  geekCount: Array.isArray(zpData?.geekList) ? zpData.geekList.length : 0,
};
```

## 你 (agent) 的产出格式

When generating, **return only**:

1. A short `ctx` literal showing what the user wants (so they can sanity-check).
2. The `scriptCode` as a fenced ```js block, ready to be fed to `runScript`.

Do **not** wrap the body in `async function`, **do not** include imports, and
**do not** print the runner / IPC wrapper.

Example response shape:

````
ctx:
```json
{
  "filters": [
    { "name": "经验要求", "value": "25年毕业" },
    { "name": "学历要求", "value": "本科" },
    { "name": "薪资待遇", "value": "10-20K" }
  ]
}
```

scriptCode:
```js
/* ... body from 模板脚本, copied verbatim — it already reads ctx.filters ... */
```
````

The template body is **input-agnostic** — it iterates `ctx.filters` dynamically.
You almost never need to trim it; just emit it as-is and let the runtime decide
which groups to click based on the array the caller passes.

## 重新解析 HTML (when the user pastes new markup)

If the user provides a fresh HTML snippet — for instance after a BOSS page
revision — re-derive the selectors from it instead of trusting the default:

1. Find the trigger element class (default `.filter-wrap`).
2. Find the popup root class (default `.filter-panel`).
3. For each `.filter-item`, read the `.name` text and the modifier class on
   `.check-box` (e.g. `.experience` / `.degree` / ...). Build a fresh
   selector dictionary.
4. Enumerate each `.option` text into the new 选项字典.
5. Find the submit button (default `.btns .btn:has-text("确定")`).
6. Regenerate the template above with the new class names. Keep all the
   timing / jitter / `waitForResponse` logic intact.

If the new markup is missing the semantic modifier on `.check-box`, fall back
to ordering — e.g. `panel.locator('.filter-item').nth(0).locator('.option')` —
and tell the user the script is now positionally bound to the markup order.

## 反爬注意 (defaults already baked in)

- All clicks go through `page.locator(...).click()` (not raw `mouse.click`) so
  Playwright auto-scrolls and stability-checks before firing.
- Jitter ranges are intentionally short (≤ 700 ms total per group) — BOSS's
  filter panel is fast; longer waits look more suspicious, not less.
- Idempotent `active` check prevents double-clicking (which would deselect on
  some BOSS builds).
- No `evaluate` / no DOM injection — keeps the fingerprint clean.

## Related docs (one level deep, follow on demand)

- `docs/automation-protocol.md` — full runner contract, sandbox limits,
  Playwright API list, error code conventions.
- `docs/boss地址资料.md` (lines 286-379) — original captured DOM and the
  paired `/wapi/zpjob/rec/geek/list` request URL with query parameters.

## 端到端入口：打开推荐页 + 自动筛选

业务侧（"启动聚合搜索"按钮等场景）通常不会直接 `runScript` 这段 scriptCode —
而是先确保 BOSS 推荐 tab 已打开到正确的 `?jobid=<encryptJobId>` URL，再让本 skill
在已经打开的 tab 上跑筛选。

✅ 已封装好的前端函数（**业务侧直接调这个**）：

```js
import { openBossRecommendForJob } from "src/util/automation/bossRecommend";

const res = await openBossRecommendForJob({
  encryptJobId: "61e0cd1cbd6016d90nZ80tq5FVVV",   // 来自 zpData.data[i].encryptJobId（boss-job-list）
  filters: [                                       // 可选 — 不传只跳转打开页
    { name: "经验要求", value: "25年毕业" },
    { name: "学历要求", value: "本科" },
    { name: "薪资待遇", value: "10-20K" },
  ],
  waitListMs: 12000
});
// res.ok && res.filterResult => { picked, skipped, apiUrl, zpData, geekCount }
```

内部就两步：

1. `window.api.automation.openOrActivate({ channel: 'boss', url: <buildBossRecommendUrl()> })`
   → 拼出 `https://www.zhipin.com/web/frame/recommend/?jobid=...&status=0&filterParams=&source=0`，
   在客户端打开 / 激活 BOSS tab
2. （`filters` 非空时）`runOnTab(tabId, bossRecommendFilterScript, ctx)` → 本 skill 输出的脚本字符串

只想跳转、不要筛选时，用 `openBossRecommend(encryptJobId)`（不传 filters 即可）。

### 为什么不在本 skill 的 scriptCode 里直接 `page.goto`

- 沙箱里的 `page` 是 playwright-core 通过 CDP 接管的 Electron tab：`page.goto`
  会强行覆盖用户当前 tab 的导航历史，体验差且容易踩反爬。
- 客户端有 `TabManager`，专门管"按渠道打开/激活 tab"，复用它确保用户能看到。
- skill 自身只关心"已经在推荐页"之后的事——筛选 + 等接口数据，**单一职责**。
