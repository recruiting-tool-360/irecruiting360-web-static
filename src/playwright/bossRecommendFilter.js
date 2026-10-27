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
 *     filters: [{ name: '经验要求'|'学历要求'|'求职意向'|'薪资待遇'|'活跃度'|'近期没有看过'|'是否与同事交换简历'|<别名>, value: '<选项文案>' }, ...],
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
 *   - BOSS_ENTITLEMENT_REQUIRED: BOSS 弹出购买 VIP/权益不足窗口
 *   - FILTER_OPTION_NOT_FOUND: 必须设置的筛选分组或选项不存在
 *   - TIMEOUT       : `waitForResponse` 超出 ctx.waitListMs（由 Playwright 抛 TimeoutError）
 */

/** 触发筛选 + 等接口的脚本字符串（不要包 async function 外壳）。 */
export const scriptCode = String.raw`
const NAME_TO_MOD = {
  '经验要求': 'experience', '经验': 'experience', 'experience': 'experience',
  '学历要求': 'degree',     '学历': 'degree',     'degree': 'degree',
  '求职意向': 'intention',  '求职': 'intention',  '意向': 'intention',  'intention': 'intention',
  '薪资待遇': 'salary',     '薪资': 'salary',     '薪水': 'salary',     'salary': 'salary',
  '活跃度': 'active',       'BOSS活跃度': 'active', 'active': 'active',
  '近期没有看过': 'notViewed', '未查看简历': 'notViewed', 'notViewed': 'notViewed',
  '是否与同事交换简历': 'exchange', '同事交换简历': 'exchange', 'exchange': 'exchange',
};

const STRICT_MODS = new Set(['active', 'notViewed', 'exchange']);

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

function compactText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').trim();
}

async function findEntitlementDialog() {
  const dialogs = page.locator('.dialog-wrap.active[data-type="boss-dialog"]');
  const count = await dialogs.count();
  for (let i = 0; i < count; i++) {
    const dialog = dialogs.nth(i);
    if (!(await dialog.isVisible().catch(function () { return false; }))) continue;
    const text = compactText(await dialog.textContent().catch(function () { return ''; }));
    const hasLayout = await dialog.locator(
      '.business-block-dialog, .vip2-layout, .payment-layout-v2, .rights-table-vip'
    ).count();
    const isEntitlementDialog =
      hasLayout > 0 &&
      (text.indexOf('购买VIP') !== -1 ||
        text.indexOf('VIP专属权益') !== -1 ||
        text.indexOf('权益不足') !== -1 ||
        text.indexOf('高级筛选') !== -1);
    if (isEntitlementDialog) return text.slice(0, 300);
  }
  return '';
}

async function throwIfEntitlementDialog() {
  const dialogText = await findEntitlementDialog();
  if (!dialogText) return;
  const err = new Error('BOSS直聘筛选权益不足，任务已停止');
  err.code = 'BOSS_ENTITLEMENT_REQUIRED';
  err.dialogText = dialogText;
  throw err;
}

async function findFilterGroup(panel, groupName) {
  const items = panel.locator('.filter-item');
  const count = await items.count();
  const expected = compactText(groupName);
  for (let i = 0; i < count; i++) {
    const filterItem = items.nth(i);
    const text = compactText(await filterItem.textContent().catch(function () { return ''; }));
    if (text.indexOf(expected) !== -1) return filterItem;
  }

  // 兼容 BOSS 灰度页面没有包裹层的结构。
  const names = panel.locator('.name');
  const nameCount = await names.count();
  for (let i = 0; i < nameCount; i++) {
    const name = names.nth(i);
    const text = compactText(await name.textContent().catch(function () { return ''; }));
    if (text.indexOf(expected) !== -1) return name.locator('..');
  }
  return null;
}

async function findExactOption(group, optionText) {
  const options = group.locator('.option');
  const count = await options.count();
  const expected = compactText(optionText);
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const text = compactText(await option.textContent().catch(function () { return ''; }));
    if (text === expected) return option;
  }
  return null;
}

await throwIfEntitlementDialog();

// .recommend-filter .filter-wrap 避免误点浮层内部的同名节点。
const trigger = page.locator('.recommend-filter .filter-wrap, .recommend-filter .filter-label-wrap').first();
if (!(await trigger.isVisible({ timeout: 5000 }).catch(function () { return false; }))) {
  const err = new Error('.filter-wrap trigger not visible');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
}
await trigger.click();

const panel = page.locator('.recommend-filter .filter-panel, .filter-panel').last();
await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(function () {
  const err = new Error('.filter-panel did not open');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
});
await sleep(jitter(250, 550));
await throwIfEntitlementDialog();

// 活跃度、近期没有看过、同事交换简历属于“更多选项”，默认收起。
const folded = page.locator('.filter-panel .vip-folded, .vip-folded').last();
if (await folded.count()) {
  if (await folded.isVisible().catch(function () { return false; })) {
    await folded.click();
    await sleep(jitter(250, 550));
    await throwIfEntitlementDialog();
  }
}

const picked = [];
for (const [mod, entry] of wanted) {
  const box = await findFilterGroup(panel, entry.name);
  if (!box) {
    log('group not found in popup: ' + entry.name);
    if (STRICT_MODS.has(mod)) {
      const err = new Error('BOSS 筛选分组不存在: ' + entry.name);
      err.code = 'FILTER_OPTION_NOT_FOUND';
      throw err;
    }
    skipped.push({ name: entry.name, value: entry.value, reason: 'group_not_found' });
    continue;
  }
  const opt = await findExactOption(box, entry.value);
  if (!opt) {
    log('option not found: ' + entry.name + '=' + entry.value);
    if (STRICT_MODS.has(mod)) {
      const err = new Error('BOSS 筛选选项不存在: ' + entry.name + '=' + entry.value);
      err.code = 'FILTER_OPTION_NOT_FOUND';
      throw err;
    }
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
    await throwIfEntitlementDialog();
  }
  picked.push({ name: entry.name, value: entry.value });
}

await sleep(jitter(300, 700));
await throwIfEntitlementDialog();
const submit = panel.locator('.btns .btn, button').filter({ hasText: '确定' }).first();
if (!(await submit.count())) {
  const err = new Error('BOSS 筛选确认按钮不存在');
  err.code = 'OVERLAY_BLOCKED';
  throw err;
}
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
                '经验要求', '学历要求', '求职意向', '薪资待遇', '活跃度',
                'BOSS活跃度', '近期没有看过', '未查看简历', '是否与同事交换简历', '同事交换简历',
                '经验', '学历', '求职', '意向', '薪资', '薪水',
                'experience', 'degree', 'intention', 'salary', 'active', 'notViewed', 'exchange',
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
    活跃度: ['不限', '刚刚活跃', '今日活跃', '3日内活跃', '本周活跃', '本月活跃'],
    近期没有看过: ['不限', '近14天没有'],
    是否与同事交换简历: ['不限', '近一个月没有'],
  },
};

export default { scriptCode, buildCtx, meta };
