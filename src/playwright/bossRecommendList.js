/**
 * BOSS 推荐牛人列表 - Playwright scriptCode（runScript 通用路径）
 *
 * 设计原则（业务侧明确要求）：
 *   **不要直接 page.evaluate(fetch(...))** —— 老逻辑那样会发出未经页面绑定的请求，
 *   极易被 BOSS 风控识别（缺 Referer / 缺 sec-fetch-* / nonce 时序异常）。
 *   推荐路径是：**触发 DOM 行为 → 监听 BOSS 自己发出的 `/wapi/zpjob/rec/geek/list` 响应**。
 *
 * 适用场景：
 *   - 用户从 i 快招点击"启动聚合搜索 → 推荐牛人" → IndexPage 已经通过
 *     `openOrActivate({channel:'boss', url:'.../recommend/?jobid=...'})` 打开了 BOSS 推荐 tab
 *   - 此时本脚本在该 tab 内执行，**等页面自己第一次 fetch /rec/geek/list 完成**
 *     （或者超时后 fallback 到 DOM 读已经渲染好的卡片 id 集合）
 *   - 拿到首屏数据后立刻返回，**滚动加载下一页交给 bossRecommendHumanize 处理**
 *
 * 入参 ctx：
 *   {
 *     jobId: string,            // BOSS encryptJobId（必需，用于校验 URL）
 *     waitMs?: number,          // 等首屏响应 / DOM 卡片的总超时，默认 10000
 *   }
 *
 * 返回（scriptCode return）：
 *   {
 *     jobId, page, totalSize, hasMore,
 *     apiUrl: '...',            // 实际命中的 URL
 *     source: 'response'|'dom', // 数据来源：监听到的响应 / 从 DOM 兜底读取
 *     geekList: [...],          // 牛人列表（response 来源时是 zpData.geekList；dom 时是简略对象）
 *     geekCount: <number>,
 *     raw: <zpData>|null
 *   }
 *
 * 错误码（throw 时 err.code）：
 *   NOT_ON_BOSS_DOMAIN | BAD_REQUEST | TIMEOUT | LOGIN_EXPIRED | API_ERROR
 */

export const scriptCode = String.raw`
let host = '';
try { host = new URL(page.url()).hostname; } catch (_e) { host = ''; }
if (!host.endsWith('zhipin.com')) {
  const err = new Error('current tab is not on zhipin.com (got ' + host + ')');
  err.code = 'NOT_ON_BOSS_DOMAIN';
  throw err;
}

const c = ctx || {};
const jobId = c.jobId == null ? '' : String(c.jobId);
if (!jobId) {
  const err = new Error('ctx.jobId required');
  err.code = 'BAD_REQUEST';
  throw err;
}
const waitMs = c.waitMs == null ? 10000 : Number(c.waitMs);
const iframePattern = c.iframePattern || '/web/frame/recommend';

// 监听 BOSS 自然发出的 /wapi/zpjob/rec/geek/list 响应。
// 重要：iframe 内发出的请求在 page 级 waitForResponse 一样能捕获（CDP 是跨 frame 的）。
let captured = null;
let captureErr = null;
try {
  const resp = await page.waitForResponse(
    function (r) {
      return r.url().indexOf('/wapi/zpjob/rec/geek/list') !== -1 && r.status() === 200;
    },
    { timeout: waitMs }
  );
  let body = null;
  try { body = await resp.json(); } catch (_e) { body = null; }
  if (body) {
    const apiCode = Number(body.code);
    if (apiCode !== 0) {
      const msg = body.message || 'api error';
      const looksLikeLogin = /未登录|登录|login/i.test(String(msg));
      const err = new Error('api code=' + apiCode + ', ' + msg);
      err.code = looksLikeLogin ? 'LOGIN_EXPIRED' : 'API_ERROR';
      throw err;
    }
    captured = { url: resp.url(), zpData: body.zpData || null };
  }
} catch (e) {
  if (e && (e.code === 'LOGIN_EXPIRED' || e.code === 'API_ERROR')) throw e;
  captureErr = e && e.message ? e.message : String(e);
  log('waitForResponse timed out (' + (captureErr || 'no message') + '), fallback to iframe DOM scan');
}

if (captured && captured.zpData) {
  const zp = captured.zpData;
  const geekList = Array.isArray(zp.geekList) ? zp.geekList : [];
  log('boss recommend list ok jobId=' + jobId + ' source=response count=' + geekList.length);
  return {
    jobId: jobId,
    page: Number(zp.page) || 1,
    totalSize: Number(zp.totalSize) || geekList.length,
    hasMore: !!zp.hasMore,
    apiUrl: captured.url,
    source: 'response',
    geekList: geekList,
    geekCount: geekList.length,
    raw: zp
  };
}

// 兜底：从 iframe 内的 DOM 读已经渲染好的卡片 id
const frameSel = 'iframe[src*="' + iframePattern + '"]';
const frame = page.frameLocator(frameSel);
const cards = frame.locator('li.card-item .card-inner[data-geekid]');
const cardCount = await cards.count().catch(function () { return 0; });
if (cardCount === 0) {
  const err = new Error('no recommend cards found (iframe missing or empty) after ' + waitMs + 'ms');
  err.code = 'TIMEOUT';
  throw err;
}
const minimal = [];
const sampleCount = Math.min(cardCount, 200);
for (let i = 0; i < sampleCount; i++) {
  const el = cards.nth(i);
  const id = await el.getAttribute('data-geekid').catch(function () { return null; });
  if (id) minimal.push({ encryptGeekId: id, geekId: id });
}
log('boss recommend list dom-fallback jobId=' + jobId + ' count=' + minimal.length);
return {
  jobId: jobId,
  page: 1,
  totalSize: cardCount,
  hasMore: true,
  apiUrl: '',
  source: 'dom',
  geekList: minimal,
  geekCount: minimal.length,
  raw: null
};
`;

/** ctx 包装 */
export function buildCtx(params) {
  const p = params || {};
  return {
    jobId: p.jobId == null ? '' : String(p.jobId),
    waitMs: p.waitMs == null ? 10000 : Number(p.waitMs),
    iframePattern: p.iframePattern || '/web/frame/recommend'
  };
}

export const meta = {
  name: 'boss.recommendList',
  channel: 'boss',
  pageUrlPattern: 'https://www.zhipin.com/web/chat/recommend',
  apiUrl: 'https://www.zhipin.com/wapi/zpjob/rec/geek/list',
  description:
    '在 BOSS 宿主 chat 推荐 tab 里监听 /wapi/zpjob/rec/geek/list 响应抓首屏列表（不直接 fetch）。' +
    '响应超时则降级到 iframe[src*="/web/frame/recommend"] 里扫 DOM 卡片。',
  ctxSchema: {
    type: 'object',
    required: ['jobId'],
    properties: {
      jobId: { type: 'string', description: 'BOSS encryptJobId' },
      waitMs: { type: 'number', default: 10000 },
      iframePattern: { type: 'string', default: '/web/frame/recommend' }
    }
  },
  errorCodes: [
    'NOT_ON_BOSS_DOMAIN',
    'BAD_REQUEST',
    'TIMEOUT',
    'LOGIN_EXPIRED',
    'API_ERROR'
  ]
};

export default { scriptCode, buildCtx, meta };
