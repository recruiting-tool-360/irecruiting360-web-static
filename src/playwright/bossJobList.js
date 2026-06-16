/**
 * BOSS 我的职位列表 - Playwright scriptCode（runScript 通用路径）
 *
 * 跟 src/util/automation/bossJobList.js（captureViaNewTab 路径）相比：
 *   - 此版本走 docs/automation-protocol.md §4.5 统一 runScript 入口
 *   - scriptCode 是 async function body 字符串，在 main 进程 vm 沙箱里跑，
 *     注入真 Playwright Page；这条路径适合**已经打开 BOSS tab 的场景**
 *
 * 入参 ctx：
 *   {
 *     position?: number, type?: number, searchStr?: string,
 *     comId?: string, tagIdStr?: string, page?: number,
 *     jobStatus?: 0 | 3 | null,  // 0 招聘中 / 3 已关闭 / null 不过滤
 *     timeoutMs?: number          // 单次 fetch 超时
 *   }
 *
 * 返回（scriptCode return）：
 *   {
 *     page, pageSize, totalSize, hasMore,
 *     data: [...zpData.data],
 *     filtered: number
 *   }
 *
 * 抛错（err.code）：
 *   NOT_ON_BOSS_DOMAIN | HTTP_NOT_OK | API_ERROR | LOGIN_EXPIRED | EMPTY_DATA | TIMEOUT
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
const params = {
  position: c.position == null ? 0 : c.position,
  type: c.type == null ? 0 : c.type,
  searchStr: c.searchStr == null ? '' : String(c.searchStr),
  comId: c.comId == null ? '' : String(c.comId),
  tagIdStr: c.tagIdStr == null ? '' : String(c.tagIdStr),
  page: c.page == null ? 1 : Number(c.page)
};
const timeoutMs = c.timeoutMs == null ? 8000 : Number(c.timeoutMs);
const statusFilter = c.jobStatus == null ? null : Number(c.jobStatus);

// 在页面上下文里同源 fetch（cookie / referer 自动带）
const fetched = await page.evaluate(async function (args) {
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, args.timeoutMs);
  try {
    const qs = new URLSearchParams({
      position: String(args.params.position),
      type: String(args.params.type),
      searchStr: args.params.searchStr,
      comId: args.params.comId,
      tagIdStr: args.params.tagIdStr,
      page: String(args.params.page),
      _: String(Date.now())
    }).toString();
    const url = 'https://www.zhipin.com/wapi/zpjob/job/data/list?' + qs;
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest'
      },
      signal: ac.signal
    });
    let body = null;
    try { body = await resp.json(); } catch (_e) { body = null; }
    return { ok: resp.ok, status: resp.status, url: resp.url, body: body };
  } finally {
    clearTimeout(t);
  }
}, { params: params, timeoutMs: timeoutMs });

if (!fetched.ok) {
  const err = new Error('http ' + fetched.status);
  err.code = 'HTTP_NOT_OK';
  throw err;
}
if (!fetched.body) {
  const err = new Error('empty body');
  err.code = 'EMPTY_DATA';
  throw err;
}
const apiCode = Number(fetched.body.code);
if (apiCode !== 0) {
  const msg = fetched.body.message || 'api error';
  const looksLikeLogin = /未登录|登录|login/i.test(String(msg));
  const err = new Error('api code=' + apiCode + ', ' + msg);
  err.code = looksLikeLogin ? 'LOGIN_EXPIRED' : 'API_ERROR';
  throw err;
}

const zp = fetched.body.zpData || {};
const rows = Array.isArray(zp.data) ? zp.data : [];
let kept = rows;
let filteredOut = 0;
if (statusFilter != null) {
  kept = [];
  for (const r of rows) {
    if (Number(r.jobStatus) === statusFilter) kept.push(r);
    else filteredOut += 1;
  }
}

log('fetched rows=' + rows.length + ' kept=' + kept.length);

return {
  page: Number(zp.page) || params.page,
  pageSize: Number(zp.pageSize) || 0,
  totalSize: Number(zp.totalSize) || 0,
  hasMore: !!zp.hasMore,
  data: kept,
  filtered: filteredOut
};
`;

export function buildCtx(params) {
  const p = params || {};
  return {
    position: p.position == null ? 0 : p.position,
    type: p.type == null ? 0 : p.type,
    searchStr: p.searchStr == null ? '' : String(p.searchStr),
    comId: p.comId == null ? '' : String(p.comId),
    tagIdStr: p.tagIdStr == null ? '' : String(p.tagIdStr),
    page: p.page == null ? 1 : Number(p.page),
    jobStatus: p.jobStatus == null ? null : Number(p.jobStatus),
    timeoutMs: p.timeoutMs == null ? 8000 : Number(p.timeoutMs)
  };
}

export const meta = {
  name: 'boss.jobList',
  channel: 'boss',
  pageUrlPattern: 'https://www.zhipin.com/',
  apiUrl: 'https://www.zhipin.com/wapi/zpjob/job/data/list',
  description: '在已打开的 BOSS tab 内同源 fetch 拉取"我的职位"列表（runScript 通用路径）',
  ctxSchema: {
    type: 'object',
    properties: {
      position: { type: 'number', default: 0 },
      type: { type: 'number', default: 0 },
      searchStr: { type: 'string' },
      comId: { type: 'string' },
      tagIdStr: { type: 'string' },
      page: { type: 'number', default: 1 },
      jobStatus: { type: ['number', 'null'], enum: [0, 3, null], default: null },
      timeoutMs: { type: 'number', default: 8000 }
    }
  },
  errorCodes: ['NOT_ON_BOSS_DOMAIN', 'HTTP_NOT_OK', 'API_ERROR', 'LOGIN_EXPIRED', 'EMPTY_DATA', 'TIMEOUT']
};

export default { scriptCode, buildCtx, meta };
