/**
 * BOSS 推荐牛人 - 筛选浮层 (Playwright scriptCode)
 *
 * Generated via `.cursor/skills/boss-recommend-filter/SKILL.md`.
 *
 * 这个文件导出一段 async function body 字符串 `scriptCode`，符合
 * `docs/automation-protocol.md` 中 `window.api.automation.runScript` 的约定：
 *   - 字符串会被 runner 包成 `(async ({ page, ctx, log, sleep, jitter, AbortSignal }) => { ... })`
 *   - 在 Electron 主进程的 vm 沙箱里执行
 *   - 沙箱内**不能**用 `require / process / setTimeout / Buffer / globalThis`
 *
 * 使用示例：
 *
 *   import { scriptCode as bossRecommendFilterCode, buildCtx } from 'src/playwright/bossRecommendFilter';
 *
 *   const ctx = buildCtx([
 *     { name: '经验要求', value: '25年毕业' },
 *     { name: '学历要求', value: '本科' },
 *     { name: '薪资待遇', value: '10-20K' },
 *   ]);
 *
 *   const res = await window.api.automation.runScript({
 *     tabId,                            // BOSS 那个 tab 的 id
 *     scriptCode: bossRecommendFilterCode,
 *     ctx,
 *     timeoutMs: 20000,
 *   });
 *   // res.data => { picked, skipped, apiUrl, zpData, geekCount }
 *
 * 入参 ctx 形状：
 *   {
 *     filters: [{ name: '经验要求'|'学历要求'|'求职意向'|'薪资待遇'|<别名>, value: '<选项文案>' }, ...],
 *     waitListMs?: 12000,
 *   }
 *
 * 出参（脚本 return）：
 *   {
 *     picked:  [{ name, value }, ...],
 *     skipped: [{ name, value, reason: 'unknown_name'|'group_not_found'|'option_not_found'|'already_active' }, ...],
 *     apiUrl:  '<wapi/zpjob/rec/geek/list 的完整 URL>',
 *     zpData:  <BOSS 列表接口 body.zpData>,
 *     geekCount: <number>,
 *   }
 *
 * 错误码（throw 时携带的 err.code）：
 *   - OVERLAY_BLOCKED: `.filter-wrap` 触发器不可见，或 `.filter-panel` 没打开
 *   - TIMEOUT       : `waitForResponse` 超出 ctx.waitListMs（由 Playwright 抛 TimeoutError）
 */

/** 触发筛选 + 等接口的脚本字符串（不要包 async function 外壳）。 */
export const scriptCode = String.raw`
const NAME_TO_MOD = {
  '经验要求': 'experience', '经验': 'experience', 'experience': 'experience',
  '学历要求': 'degree',     '学历': 'degree',     'degree': 'degree',
  '求职意向': 'intention',  '求职': 'intention',  '意向': 'intention',  'intention': 'intention',
  '薪资待遇': 'salary',     '薪资': 'salary',     '薪水': 'salary',     'salary': 'salary',
};

const filters = Array.isArray(ctx && ctx.filters) ? ctx.filters : [];

const wanted = new Map();
const skipped = [];
for (const f of filters) {
  if (!f || typeof f !== 'object') continue;
  const rawName = String(f.name == null ? '' : f.name).trim();
  const value = String(f.value == null ? '' : f.value).trim();
  if (!value || value === '不限') continue;
  const mod = NAME_TO_MOD[rawName];
  if (!mod) {
    log('unknown filter name: ' + rawName);
    skipped.push({ name: rawName, value: value, reason: 'unknown_name' });
    continue;
  }
  if (wanted.has(mod)) {
    log('duplicate filter for ' + rawName + ', last one wins: ' + value);
  }
  wanted.set(mod, { name: rawName, value: value });
}

const trigger = page.locator('.filter-wrap').first();
if (!(await trigger.isVisible({ timeout: 5000 }).catch(function () { return false; }))) {
  const err = new Error('.filter-wrap trigger not visible');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
}
await trigger.click();

const panel = page.locator('.filter-panel');
await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(function () {
  const err = new Error('.filter-panel did not open');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
});
await sleep(jitter(250, 550));

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
  if (cls.indexOf('active') !== -1) {
    skipped.push({ name: entry.name, value: entry.value, reason: 'already_active' });
  } else {
    await opt.scrollIntoViewIfNeeded().catch(function () {});
    await opt.click();
    await sleep(jitter(180, 480));
  }
  picked.push({ name: entry.name, value: entry.value });
}

await sleep(jitter(300, 700));
const submit = panel.locator('.btns .btn').filter({ hasText: '确定' }).first();
const waitMs = (ctx && ctx.waitListMs) || 12000;
const pair = await Promise.all([
  page.waitForResponse(
    function (r) { return r.url().indexOf('/wapi/zpjob/rec/geek/list') !== -1 && r.status() === 200; },
    { timeout: waitMs }
  ),
  submit.click(),
]);
const resp = pair[0];

let body = null;
try { body = await resp.json(); } catch (_e) { body = null; }
const zpData = (body && body.zpData) || null;

return {
  picked: picked,
  skipped: skipped,
  apiUrl: resp.url(),
  zpData: zpData,
  geekCount: zpData && Array.isArray(zpData.geekList) ? zpData.geekList.length : 0,
};
`;

/**
 * 把数组形式的筛选条件包成 runScript 期望的 ctx。
 * @param {Array<{name: string, value: string}>} filters
 * @param {{ waitListMs?: number }} [opts]
 */
export function buildCtx(filters, opts) {
  return {
    filters: Array.isArray(filters) ? filters : [],
    waitListMs: (opts && opts.waitListMs) || 12000,
  };
}

/** 工具元数据，供前端 toolCatalog / AI Agent 注册时引用。 */
export const meta = {
  name: 'boss.recommendFilter',
  channel: 'boss',
  pageUrlPattern: 'https://www.zhipin.com/web/frame/recommend/',
  apiUrl: 'https://www.zhipin.com/wapi/zpjob/rec/geek/list',
  description: '在 BOSS 推荐牛人页面打开筛选浮层，按 ctx.filters 选项后点击「确定」并等待列表接口返回。',
  ctxSchema: {
    type: 'object',
    required: ['filters'],
    properties: {
      filters: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'value'],
          properties: {
            name: {
              type: 'string',
              enum: [
                '经验要求', '学历要求', '求职意向', '薪资待遇',
                '经验', '学历', '求职', '意向', '薪资', '薪水',
                'experience', 'degree', 'intention', 'salary',
              ],
            },
            value: { type: 'string' },
          },
        },
      },
      waitListMs: { type: 'number', default: 12000 },
    },
  },
  optionDict: {
    经验要求: ['不限', '在校/应届', '25年毕业', '26年毕业', '26年后毕业', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上'],
    学历要求: ['不限', '初中及以下', '中专/中技', '高中', '大专', '本科', '硕士', '博士'],
    求职意向: ['不限', '离职-随时到岗', '在职-暂不考虑', '在职-考虑机会', '在职-月内到岗'],
    薪资待遇: ['不限', '3K以下', '3-5K', '5-10K', '10-20K', '20-50K', '50K以上'],
  },
};

export default { scriptCode, buildCtx, meta };
