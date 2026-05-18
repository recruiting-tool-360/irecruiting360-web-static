/**
 * BOSS 推荐 - 选中职位验证脚本（最小可用，调试用）
 *
 * 不点筛选浮层、不抓接口、不滚动 — 只做 sanity check：
 *   1. 确认 page URL 在 zhipin.com
 *   2. 找到 iframe[src*="/web/frame/recommend"]
 *   3. 从 iframe src 或 page URL 解析出 jobid，跟 ctx.jobId 对比
 *   4. 扫描 iframe 内 li.card-item 卡片数量 + 前几张的 data-geekid
 *   5. 返回上述信息
 *
 * 用途：先一步步调通"打开 BOSS chat/recommend?jobid=<id> + 渲染列表"这个最小路径，
 *      不卡死在后续的 fetch / humanize 上。
 *
 * 入参 ctx:
 *   {
 *     jobId: string,            // 期望的 encryptJobId（从 URL 反解后对比）
 *     iframePattern?: string    // 默认 '/web/frame/recommend'
 *     waitForCardMs?: number    // 等首屏卡片可见超时，默认 8000
 *   }
 *
 * 返回:
 *   {
 *     pageUrl:        '<宿主 chat 页 URL>',
 *     iframeUrl:      '<iframe src>',
 *     jobIdFromUrl:   '<从 iframe src 反解出的 jobid>',
 *     jobIdMatch:     boolean,            // jobIdFromUrl === ctx.jobId
 *     cardCount:      <number>,
 *     sampleGeekIds:  [<id>, <id>, ...]   // 前 3 张卡片的 data-geekid
 *   }
 *
 * 错误码（err.code）:
 *   NOT_ON_BOSS_DOMAIN | NO_IFRAME | NO_CARDS
 */

export const scriptCode = String.raw`
const c = ctx || {};
const expectedJobId = c.jobId == null ? '' : String(c.jobId);
const iframePattern = c.iframePattern || '/web/frame/recommend';
const waitForCardMs = c.waitForCardMs == null ? 8000 : Number(c.waitForCardMs);

// 1) 等 page.url() 稳定（可能初次 page.url() 为空 / about:blank，BOSS 可能正在导航或被反爬替换）
let pageUrlAtStart = '';
try { pageUrlAtStart = page.url(); } catch (_e) { pageUrlAtStart = ''; }
log('[verify] page.url() at start="' + pageUrlAtStart + '"');

if (!pageUrlAtStart || pageUrlAtStart === 'about:blank') {
  log('[verify] page url empty/blank, wait domcontentloaded up to 5s...');
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    log('[verify] domcontentloaded ok');
  } catch (_e) {
    log('[verify] waitForLoadState failed: ' + (_e && _e.message ? _e.message : 'timeout'));
  }
}

// 重新读 + dump 所有 frame
let pageUrl = '';
try { pageUrl = page.url(); } catch (_e) { pageUrl = ''; }
log('[verify] page.url() after wait="' + pageUrl + '"');
try {
  const allFrames = page.frames();
  for (let i = 0; i < allFrames.length; i++) {
    try {
      log('[verify] frame[' + i + '] name="' + (allFrames[i].name() || '') + '" url="' + allFrames[i].url() + '"');
    } catch (_e2) { /* ignore detached frame */ }
  }
} catch (_e) { /* noop */ }

// 校验域名
let host = '';
try { host = new URL(pageUrl).hostname; } catch (_e) { host = ''; }
if (!host.endsWith('zhipin.com')) {
  const err = new Error(
    'current tab is not on zhipin.com (host="' + host + '" url="' + pageUrl + '" startUrl="' + pageUrlAtStart + '"). ' +
    '可能 BOSS 触发反爬把页面替换 / 重定向；或者 page.url() 还没就位。'
  );
  err.code = 'NOT_ON_BOSS_DOMAIN';
  throw err;
}

// 1) 找 iframe
const iframeSel = 'iframe[src*="' + iframePattern + '"]';
const iframeHandle = await page.locator(iframeSel).first();
const visible = await iframeHandle.isVisible({ timeout: 8000 }).catch(function () { return false; });
if (!visible) {
  // 即使不可见也再 attached 检查一次（有些站点用 display:contents）
  const attached = await iframeHandle.count();
  if (attached === 0) {
    const err = new Error('recommend iframe not found in DOM: ' + iframeSel);
    err.code = 'NO_IFRAME';
    throw err;
  }
  log('[verify] iframe found but not visible, continuing anyway');
}

// 拿 iframe src
let iframeUrl = '';
try {
  iframeUrl = (await iframeHandle.getAttribute('src')) || '';
} catch (_e) { iframeUrl = ''; }
log('[verify] iframe src=' + iframeUrl);

// 反解 jobid（URL 里可能是 jobid 或 jobId）
let jobIdFromUrl = '';
try {
  const u = new URL(iframeUrl, page.url());
  jobIdFromUrl = u.searchParams.get('jobid') || u.searchParams.get('jobId') || '';
} catch (_e) { jobIdFromUrl = ''; }
log('[verify] jobIdFromUrl=' + jobIdFromUrl + ' expectedJobId=' + expectedJobId);

const jobIdMatch = !!expectedJobId && jobIdFromUrl === expectedJobId;

// 2) 进 iframe 查卡片
const frame = page.frameLocator(iframeSel);
await frame.locator('li.card-item').first().waitFor({ state: 'visible', timeout: waitForCardMs }).catch(function () {
  // 没卡片就直接抛
  const err = new Error('no card-item visible in iframe after ' + waitForCardMs + 'ms');
  err.code = 'NO_CARDS';
  throw err;
});
const cards = frame.locator('li.card-item .card-inner[data-geekid]');
const cardCount = await cards.count().catch(function () { return 0; });
log('[verify] iframe card count=' + cardCount);

const sampleGeekIds = [];
const sampleN = Math.min(cardCount, 3);
for (let i = 0; i < sampleN; i++) {
  const id = await cards.nth(i).getAttribute('data-geekid').catch(function () { return null; });
  if (id) sampleGeekIds.push(id);
}
log('[verify] sample geek ids=' + sampleGeekIds.join(', '));

return {
  pageUrl: page.url(),
  iframeUrl: iframeUrl,
  jobIdFromUrl: jobIdFromUrl,
  jobIdMatch: jobIdMatch,
  cardCount: cardCount,
  sampleGeekIds: sampleGeekIds
};
`;

export function buildCtx(params) {
  const p = params || {};
  return {
    jobId: p.jobId == null ? "" : String(p.jobId),
    iframePattern: p.iframePattern || "/web/frame/recommend",
    waitForCardMs: p.waitForCardMs == null ? 8000 : Number(p.waitForCardMs)
  };
}

export const meta = {
  name: "boss.recommendVerify",
  channel: "boss",
  pageUrlPattern: "https://www.zhipin.com/web/chat/recommend",
  description:
    "BOSS 推荐 tab 选中职位验证：只做 sanity check（iframe 存在 / 选中职位匹配 / 列表渲染了几张卡），不交互、不滚动、不 fetch。用于一步步调通自动化链路。",
  ctxSchema: {
    type: "object",
    required: ["jobId"],
    properties: {
      jobId: { type: "string" },
      iframePattern: { type: "string", default: "/web/frame/recommend" },
      waitForCardMs: { type: "number", default: 8000 }
    }
  },
  errorCodes: ["NOT_ON_BOSS_DOMAIN", "NO_IFRAME", "NO_CARDS"]
};

export default { scriptCode, buildCtx, meta };
