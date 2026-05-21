/**
 * BOSS 推荐牛人 - 打开 + 可选筛选（前端封装）
 *
 * 链路：
 *   1) 拼 BOSS 推荐牛人 URL：
 *      https://www.zhipin.com/web/frame/recommend/?jobid=<encryptJobId>&status=0&filterParams=&source=0
 *      （参考 docs/boss地址资料.md line 287）
 *   2) `window.api.automation.openOrActivate({ channel: 'boss', url })` 打开 / 激活 BOSS tab
 *   3)（可选）拿到 tabId 后 `runOnTab(tabId, bossRecommendFilterScript, ctx)` 触发筛选浮层
 *      并等接口返回，拿到 `zpData / geekCount`
 *
 * 一次 "启动聚合搜索" 勾选推荐牛人时，调用 `openBossRecommendForJob` 一次即可：
 *   - 不传 filters → 仅跳转打开推荐页（默认行为）
 *   - 传 filters   → 跳转后再跑 bossRecommendFilter skill 做条件筛选 + 拿数据
 */

import { runOnTab } from "src/util/automation/runScript";
import {
  scriptCode as bossRecommendFilterScript,
  buildCtx as buildRecommendFilterCtx
} from "src/playwright/bossRecommendFilter";
// bossRecommendList.js 抓数据用的 Playwright `page.waitForResponse` 路径已被
// `window.api.siteNetwork.waitForResponse`（CDP debugger.attach）取代，
// 见 fetchBossRecommendList 函数注释。脚本本身保留作历史参考，但不再 import。
import {
  scriptCode as bossRecommendHumanizeScript,
  buildCtx as buildRecommendHumanizeCtx
} from "src/playwright/bossRecommendHumanize";
import {
  scriptCode as bossRecommendVerifyScript,
  buildCtx as buildRecommendVerifyCtx
} from "src/playwright/bossRecommendVerify";
// bossOpenFilterOnce 仅用于开发期"BOSS Playwright 冒烟测试"，**故意不在这里 import**：
// 让 Vite 生产 build 能完全 tree-shake 掉调试入口（详见 ./bossRecommendDebug.js）。

const BOSS_CHANNEL = "boss";

/**
 * 宿主 chat 页 URL —— **打开这个**，不要直接打开 iframe URL！
 * 详见 docs/boss地址资料.md "正确的入口 URL"。
 */
const RECOMMEND_HOST_BASE = "https://www.zhipin.com/web/chat/recommend";
/** 宿主页内部嵌的 iframe URL（仅用于 frameLocator 匹配，不要直接 openOrActivate） */
const RECOMMEND_IFRAME_URL_PATTERN = "/web/frame/recommend";

function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api &&
      window.api.automation &&
      typeof window.api.automation.openOrActivate === "function"
  );
}

/**
 * 拼推荐牛人**宿主 chat 页**的 URL（不是 iframe 那个）。
 * @param {string} encryptJobId BOSS encryptJobId
 * @param {{ status?: number|string, filterParams?: string, source?: number|string }} [opts]
 *   兼容旧入参（不再用，只是不报错；宿主页一般只识别 jobid，其它参数会被 iframe 自己拼）
 */
export function buildBossRecommendUrl(encryptJobId, opts = {}) {
  if (!encryptJobId) return "";
  // 宿主 chat 页一般只需要 jobid，iframe src 由宿主自己拼 status/filterParams/source
  const qs = new URLSearchParams({ jobid: String(encryptJobId) }).toString();
  return `${RECOMMEND_HOST_BASE}?${qs}`;
}

/** 暴露给脚本用：iframe URL 匹配片段（frameLocator 拿 iframe 时用） */
export const RECOMMEND_IFRAME_PATTERN = RECOMMEND_IFRAME_URL_PATTERN;

/**
 * 打开 / 激活 BOSS 推荐牛人页（一定会有可见 tab，用户能看到）。
 *
 * @param {string} encryptJobId
 * @param {{ status?: number|string, filterParams?: string, source?: number|string }} [opts]
 * @returns {Promise<{ ok: boolean, tabId?: string, url?: string, errorCode?: string, message?: string }>}
 */
export async function openBossRecommend(encryptJobId, opts = {}) {
  if (!isInElectronClient()) {
    return {
      ok: false,
      errorCode: "NOT_IN_CLIENT",
      message: "window.api.automation 不可用（非 Electron 客户端）"
    };
  }
  if (!encryptJobId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "encryptJobId required" };
  }
  const url = buildBossRecommendUrl(encryptJobId, opts);
  try {
    const res = await window.api.automation.openOrActivate({
      channel: BOSS_CHANNEL,
      url
    });
    if (!res?.tabId) {
      return {
        ok: false,
        errorCode: "TAB_NOT_FOUND",
        message: "openOrActivate did not return tabId"
      };
    }
    return { ok: true, tabId: res.tabId, url };
  } catch (e) {
    return {
      ok: false,
      errorCode: "OPEN_FAILED",
      message: e?.message || String(e)
    };
  }
}

/**
 * 打开推荐牛人页（顺带可选筛选）—— 一次性走完"启动聚合搜索 BOSS 推荐"路径。
 *
 * @param {object} args
 * @param {string} args.encryptJobId   BOSS encryptJobId
 * @param {Array<{name: string, value: string}>} [args.filters]
 *        要应用的筛选条件。空 / 不传 → 只打开页面，不触发筛选浮层
 * @param {number} [args.waitListMs=12000]
 * @param {{ status?: number|string, filterParams?: string, source?: number|string }} [args.urlOpts]
 * @param {{ timeoutMs?: number, navWaitMs?: number }} [args.opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   filterResult?: { picked, skipped, apiUrl, zpData, geekCount },
 *   errorCode?: string,
 *   message?: string
 * }>}
 */
export async function openBossRecommendForJob(args) {
  const {
    encryptJobId,
    filters,
    waitListMs = 12000,
    urlOpts,
    opts = {}
  } = args || {};

  const opened = await openBossRecommend(encryptJobId, urlOpts);
  if (!opened.ok) return opened;

  // 不带 filters → 仅完成跳转
  if (!Array.isArray(filters) || filters.length === 0) {
    return { ok: true, tabId: opened.tabId, url: opened.url };
  }

  // 等推荐页内容首次渲染完（推荐 tab 可能从 list-new 切过来，需要几百毫秒）
  // 这里给一个保守的等待时间；runScript 内部 `.filter-wrap` waitFor 5s 也会兜底
  const navWaitMs = Math.max(0, opts.navWaitMs ?? 1500);
  if (navWaitMs > 0) await new Promise((r) => setTimeout(r, navWaitMs));

  // 用 boss-recommend-filter skill 输出的脚本字符串触发筛选 + 拿接口数据
  const ctx = buildRecommendFilterCtx(filters, { waitListMs });
  const filterRes = await runOnTab(opened.tabId, bossRecommendFilterScript, ctx, {
    timeoutMs: opts.timeoutMs ?? Math.max(waitListMs + 5000, 20000),
    expectedHost: "zhipin.com"
  });

  if (!filterRes.ok) {
    return {
      ok: false,
      tabId: opened.tabId,
      url: opened.url,
      errorCode: filterRes.errorCode,
      message: filterRes.message
    };
  }
  return {
    ok: true,
    tabId: opened.tabId,
    url: opened.url,
    filterResult: filterRes.data
  };
}

/**
 * 一站式：打开 BOSS 推荐牛人 tab（若没开）→ 监听 `/wapi/zpjob/rec/geek/list` 自然请求 → 拿首屏列表
 *
 * 实现：**走主进程 siteNetworkCapture（webContents.debugger.attach）抓包**。
 *
 * 旧实现（已废弃）：Playwright `page.waitForResponse`，依赖 `--remote-debugging-port`。
 *   BOSS 通过端口探测 / Chromium debug 痕迹识别为爬虫 → 账号被封 24h
 *   （详见 docs/boss地址资料.md 顶部反爬警告）。
 *
 * 新实现优点：
 *   - Electron 内置 debugger（同进程内 CDP），不开 WebSocket 端口，BOSS 探测不到
 *   - TabManager 创建 BOSS site tab 时已经一次性 attach，本函数只负责"打开 tab + 查响应"
 *   - 不需要 sandbox / Playwright，依赖最小
 *
 * @param {object} args
 * @param {string} args.encryptJobId
 * @param {number} [args.waitMs=10000]    等首屏响应的超时
 * @param {number} [args.navWaitMs=0]     打开 tab 后再等多久才开始等响应（默认 0，
 *                                         一般 tab 还在 loading 时 BOSS 就已经在发请求了，
 *                                         siteNetworkCapture 在 attach 那一刻就在收）
 * @param {number} [args.sinceTs]         调用方传入的"基线时间戳"，只接受 receivedAt > sinceTs
 *                                         的响应。
 *                                         **不传时不设过滤**——这是关键修复（之前默认 Date.now()，
 *                                         但 BOSS 在 openBossRecommend → loadURL 之后立刻发请求，
 *                                         如果有 dwell 在外层，调用本函数时缓存里那条 HIT 的
 *                                         receivedAt 反而 < Date.now()，导致永远等不到，TIMEOUT。
 *                                         正确做法：让外层 runBossRecommend 在打开 tab 之前
 *                                         抓 sinceTs 传进来）
 * @param {{ status?: number|string, filterParams?: string, source?: number|string }} [args.urlOpts]
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   data?: { jobId, page, totalSize, hasMore, apiUrl, source, geekList, geekCount, raw },
 *   errorCode?: string,
 *   message?: string
 * }>}
 */
export async function fetchBossRecommendList(args) {
  const { encryptJobId, waitMs = 10000, navWaitMs = 0, urlOpts, sinceTs } = args || {};

  const opened = await openBossRecommend(encryptJobId, urlOpts);
  if (!opened.ok) return opened;
  if (navWaitMs > 0) await new Promise((r) => setTimeout(r, navWaitMs));

  // siteNetwork bridge 只在 Electron 客户端里存在；浏览器模式不支持 BOSS 推荐自动化
  if (!window?.api?.siteNetwork?.waitForResponse) {
    return {
      ok: false,
      tabId: opened.tabId,
      url: opened.url,
      errorCode: "NOT_IN_CLIENT",
      message:
        "window.api.siteNetwork 不可用（preload 未更新？请重启客户端 Electron 进程）"
    };
  }

  const wait = await window.api.siteNetwork.waitForResponse({
    siteKey: "boss",
    urlPattern: "/wapi/zpjob/rec/geek/list",
    timeoutMs: waitMs,
    // sinceTs 由调用方决定：runBossRecommend 在 openBossRecommend 之前抓 ts 传过来；
    // 独立调用（没传）就 fallback 到调函数那一刻——但这种情况大概率拿不到（详见 jsdoc）
    sinceTs: typeof sinceTs === "number" ? sinceTs : undefined
  });

  if (!wait.ok) {
    return {
      ok: false,
      tabId: opened.tabId,
      url: opened.url,
      errorCode: wait.code, // 'TIMEOUT' | 'NOT_ATTACHED' | 'BAD_REQUEST'
      message: wait.message
    };
  }

  // BOSS 业务包装：{ code, message, zpData }
  const body = wait.data.bodyJson;
  const apiCode = Number(body?.code);
  if (!body || (apiCode !== 0 && !Number.isNaN(apiCode))) {
    const msg = body?.message || `api code=${apiCode}`;
    const looksLikeLogin = /未登录|登录|login/i.test(String(msg));
    return {
      ok: false,
      tabId: opened.tabId,
      url: opened.url,
      errorCode: looksLikeLogin ? "LOGIN_EXPIRED" : "API_ERROR",
      message: msg
    };
  }

  const zp = body?.zpData || {};
  const geekList = Array.isArray(zp.geekList) ? zp.geekList : [];
  return {
    ok: true,
    tabId: opened.tabId,
    url: opened.url,
    data: {
      jobId: encryptJobId,
      page: Number(zp.page) || 1,
      totalSize: Number(zp.totalSize) || geekList.length,
      hasMore: !!zp.hasMore,
      apiUrl: wait.data.url,
      source: "response", // 旧版有 'dom' 兜底；新版只走响应抓取
      geekList,
      geekCount: geekList.length,
      raw: zp
    }
  };
}

/**
 * 拟人操作循环：在已经打开 + 已有首屏数据的 BOSS 推荐 tab 里
 * scroll / hover / dwell 模拟浏览，滚到底部触发自然分页，监听响应累计新增牛人。
 *
 * 一般在 `fetchBossRecommendList` 之后调用：
 *   const first = await fetchBossRecommendList({ encryptJobId });
 *   if (!first.ok) return;
 *   const more = await humanizeBossRecommend({ tabId: first.tabId, jobId: encryptJobId, targetCount });
 *
 * @param {object} args
 * @param {string} args.tabId                必需：BOSS 推荐 tab 的 id
 * @param {string} args.jobId                BOSS encryptJobId（用于校验）
 * @param {number} args.targetCount          目标"看过"的牛人数
 * @param {[number, number]} [args.dwellMs]  单卡片 dwell 时间范围，默认 [800, 2400]
 * @param {[number, number]} [args.pauseMs]  卡片间停顿范围，默认 [200, 600]
 * @param {number} [args.maxPages=10]        最多触发几页加载
 * @param {number} [args.pageWaitMs=8000]    滚动后等下一页响应的超时
 * @param {boolean} [args.click=false]       是否真点卡片（默认 false，避免路由跳转）
 * @param {number} [args.timeoutMs]          整个脚本的总超时（含 sleep 和 page 等），
 *                                            默认 = targetCount * (dwellMax+pauseMax) + 30s 兜底
 * @returns {Promise<{
 *   ok: boolean,
 *   data?: { processed, pagesLoaded, accumulated, finalDomCount, reachedTarget, stoppedReason },
 *   errorCode?: string,
 *   message?: string
 * }>}
 */
export async function humanizeBossRecommend(args) {
  const {
    tabId,
    jobId,
    targetCount = 10,
    dwellMs = [800, 2400],
    pauseMs = [200, 600],
    maxPages = 10,
    pageWaitMs = 8000,
    click = false,
    timeoutMs
  } = args || {};

  if (!tabId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "tabId required" };
  }

  const ctx = buildRecommendHumanizeCtx({
    jobId,
    targetCount,
    dwellMs,
    pauseMs,
    maxPages,
    pageWaitMs,
    click
  });

  // 估算脚本总超时：每张卡片最坏 dwellMax+pauseMax，再 + 分页等待 + buffer
  const dwellMax = Array.isArray(dwellMs) ? dwellMs[1] : 2400;
  const pauseMax = Array.isArray(pauseMs) ? pauseMs[1] : 600;
  const estimatedMs = targetCount * (dwellMax + pauseMax) + maxPages * pageWaitMs + 30000;
  const scriptTimeoutMs = Math.min(Math.max(timeoutMs || estimatedMs, 30000), 10 * 60 * 1000);

  const res = await runOnTab(tabId, bossRecommendHumanizeScript, ctx, {
    timeoutMs: scriptTimeoutMs,
    expectedHost: "zhipin.com"
  });
  if (!res.ok) {
    return {
      ok: false,
      errorCode: res.errorCode,
      message: res.message,
      logs: res.logs
    };
  }
  return { ok: true, data: res.data, logs: res.logs };
}

/**
 * 调试用：打开推荐 tab → dwell → 只跑 verify 脚本（不 fetch、不 humanize）。
 *
 * @param {object} args
 * @param {string} args.encryptJobId
 * @param {[number, number]} [args.firstDwellMs=[5000, 15000]]
 * @returns {Promise<{ ok, tabId?, url?, data?, errorCode?, message?, logs? }>}
 */
export async function verifyBossRecommend(args) {
  const { encryptJobId, firstDwellMs } = args || {};
  if (!encryptJobId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "encryptJobId required" };
  }
  // 1) 打开
  const opened = await openBossRecommend(encryptJobId);
  if (!opened.ok) return opened;
  console.log("[bossRecommend.verify] opened tabId=", opened.tabId, "url=", opened.url);

  // 2) dwell
  const range =
    Array.isArray(firstDwellMs) && firstDwellMs.length === 2 ? firstDwellMs : [5000, 15000];
  const lo = Math.min(Number(range[0]) || 5000, Number(range[1]) || 15000);
  const hi = Math.max(Number(range[0]) || 5000, Number(range[1]) || 15000);
  const ms = Math.floor(lo + Math.random() * (hi - lo));
  console.log(`[bossRecommend.verify] 拟人 dwell ${ms}ms (${lo}-${hi})`);
  await new Promise((r) => setTimeout(r, ms));

  // 3) 跑 verify 脚本
  const ctx = buildRecommendVerifyCtx({ jobId: encryptJobId });
  const res = await runOnTab(opened.tabId, bossRecommendVerifyScript, ctx, {
    timeoutMs: 20000,
    expectedHost: "zhipin.com"
  });
  console.log("[bossRecommend.verify] script result:", res);
  return {
    ok: res.ok,
    tabId: opened.tabId,
    url: opened.url,
    data: res.data,
    errorCode: res.errorCode,
    message: res.message,
    logs: res.logs
  };
}

/**
 * 完整业务入口：打开推荐 tab → 随机 dwell → 抓首屏 → 拟人浏览 + 滚动加载到目标数量。
 *
 * 推荐**业务侧**统一调这个，而不是分别调 `fetchBossRecommendList` + `humanizeBossRecommend`。
 *
 * 拟人节奏（对照 docs/automation-protocol.md §5.7 拟人原则）：
 *   1. openOrActivate 打开 tab（用户可见）
 *   2. **随机 5-15s dwell** —— 模拟"用户加载完页面，先看一眼再动手"。
 *      没有这个 dwell，自动化轨迹会出现"页面刚加载完瞬间触发 fetch + scroll + click"，
 *      跟真人节奏明显不同，是被风控盯上的高危特征。
 *   3. fetchBossRecommendList 抓首屏（仍是监听式，没有 fetch）
 *   4. humanize 循环滚动浏览到目标数量
 *
 * 暂时不做的事（按用户当前要求）：
 *   - 不调 selectPosition 浮层 —— URL 已经带 `?jobid=<id>` 直接定向，不点筛选
 *   - 不带额外 filterParams —— 用 BOSS 默认推荐
 *
 * @param {object} args
 * @param {string} args.encryptJobId
 * @param {number} args.targetCount
 * @param {(stage, payload) => void} [args.onProgress]
 *   阶段回调：
 *     - ('opened',     { tabId, url })
 *     - ('dwell',      { ms })                                ← 新增：dwell 起止
 *     - ('firstPage',  { geekList, totalSize, hasMore, source })
 *     - ('humanized',  { processed, pagesLoaded, accumulated, reachedTarget, stoppedReason })
 * @param {[number, number]} [args.firstDwellMs]  打开后 dwell 范围 [min, max]，默认 [5000, 15000]
 * @param {object} [args.humanizeOpts]   传给 humanize 的额外参数（dwellMs/pauseMs/maxPages/...）
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   firstPage?: object,
 *   humanize?: object,
 *   geekList: Array,           // 首页 + humanize accumulated 的去重合并
 *   errorCode?: string,
 *   message?: string
 * }>}
 */
export async function runBossRecommend(args) {
  const {
    encryptJobId,
    targetCount = 10,
    onProgress,
    humanizeOpts = {},
    firstDwellMs,
    /**
     * 调试用：在某一阶段提前退出
     *   - 'open'      → 只打开 tab + dwell，不跑任何脚本
     *   - 'verify'    → 打开 tab + dwell + 跑 verify 脚本（验证职位选中 + 列表可见）
     *   - 'firstPage' → 上面所有 + fetch 首屏（不 humanize）
     *   - undefined / 其它 → 完整流程
     */
    stopAfter
  } = args || {};

  // 1) 打开推荐 tab（幂等：已开则激活）
  const opened = await openBossRecommend(encryptJobId);
  if (!opened.ok) return opened;
  if (typeof onProgress === "function") {
    onProgress("opened", { tabId: opened.tabId, url: opened.url });
  }

  // 1.5) ★ 清缓存 + 强制 loadURL 完整 navigation（带 _t 时间戳防 HTTP 缓存）。
  //
  // 为什么不用 reload()：经实测 webContents.reload() 对 BOSS 推荐 SPA **没让它重新发**
  //   `/wapi/zpjob/rec/geek/list`（疑似 sessionStorage / 路由层缓存），dwell 12s 后
  //   `listCache(boss) size=0`。
  //   webContents.loadURL() 强制完整 navigation，URL 带个 `_t=Date.now()` 兜底防 HTTP cache，
  //   BOSS 必然完整重启 SPA → 一定会重发推荐 API → CDP capture 命中。
  //
  // sinceTs 抓在 loadUrl 之后：waitForResponse 只接受 navigation 后真正新到达的响应，
  //   避免命中上一轮缓冲里的旧数据。
  try {
    if (typeof window?.api?.siteNetwork?.clearCache === "function") {
      await window.api.siteNetwork.clearCache("boss");
    }
  } catch (e) {
    console.warn(`[bossRecommend] clearCache 失败（忽略）：`, e?.message || e);
  }
  try {
    // 带时间戳 URL 强制 BOSS 视作新页面（HTTP cache miss + SPA 路由重启）。
    // 一些参数是 BOSS 不认识的字段（_t），它会忽略，业务上 jobid 不变。
    const navUrl = `${opened.url}${opened.url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
    if (typeof window?.api?.tabs?.loadUrl === "function") {
      await window.api.tabs.loadUrl(opened.tabId, navUrl);
      console.log(`[bossRecommend] tabs.loadUrl 已触发 tab=${opened.tabId} url=${navUrl}`);
    } else if (typeof window?.api?.tabs?.reload === "function") {
      // 兜底：preload 没更新（旧客户端）→ 至少 reload 一次，比啥都不做强
      await window.api.tabs.reload(opened.tabId);
      console.log(
        `[bossRecommend] tabs.loadUrl 不可用，降级 reload tab=${opened.tabId}（请重启 Electron 客户端拿到新 preload）`
      );
    }
  } catch (e) {
    console.warn(`[bossRecommend] loadUrl/reload 失败（忽略，继续）：`, e?.message || e);
  }
  const sinceTs = Date.now();

  // 2) 拟人 dwell：打开后随机停留 5-15s 再继续，让"加载完看一眼"的节奏成立
  const dwellRange =
    Array.isArray(firstDwellMs) && firstDwellMs.length === 2
      ? [Number(firstDwellMs[0]) || 5000, Number(firstDwellMs[1]) || 15000]
      : [5000, 15000];
  const dwellLow = Math.min(dwellRange[0], dwellRange[1]);
  const dwellHigh = Math.max(dwellRange[0], dwellRange[1]);
  const dwell = Math.floor(dwellLow + Math.random() * (dwellHigh - dwellLow));
  console.log(
    `[bossRecommend] open ok, 拟人 dwell ${dwell}ms (${dwellLow}-${dwellHigh}) before next stage`
  );
  if (typeof onProgress === "function") onProgress("dwell", { ms: dwell });
  await new Promise((r) => setTimeout(r, dwell));

  // 2.5) stopAfter='open' → 提前返回
  if (stopAfter === "open") {
    console.log("[bossRecommend] stopAfter=open, return without running scripts");
    return { ok: true, tabId: opened.tabId, url: opened.url, geekList: [] };
  }

  // 2.6) stopAfter='verify' → 只跑 verify 脚本，不抓数据
  if (stopAfter === "verify") {
    const ctx = buildRecommendVerifyCtx({ jobId: encryptJobId });
    const res = await runOnTab(opened.tabId, bossRecommendVerifyScript, ctx, {
      timeoutMs: 20000,
      expectedHost: "zhipin.com"
    });
    console.log("[bossRecommend] stopAfter=verify, script result:", res);
    if (typeof onProgress === "function") onProgress("verified", res.data);
    return {
      ok: res.ok,
      tabId: opened.tabId,
      url: opened.url,
      verify: res.data,
      geekList: [],
      errorCode: res.errorCode,
      message: res.message
    };
  }

  // 3) 抓首屏（不再额外等导航：上面 dwell 已经包含足够的"页面加载稳定"时间）
  // 把 runBossRecommend 入口拿到的 sinceTs 传给 fetchBossRecommendList，
  // 确保它能扫到 dwell 期间已经发生的"BOSS 自动发 /rec/geek/list"那条 HIT
  //
  // ★ 调试 helper：fetch 之前 dump 缓存内容，TIMEOUT 时能直接看到 BOSS 实际发了哪些请求。
  //   如果缓存里完全没有 /rec/geek/list，说明 reload 没让 BOSS 重发；
  //   如果有但 receivedAt < sinceTs（reload 之前的旧数据，clearCache 漏了），说明清缓存时机错了。
  try {
    if (typeof window?.api?.siteNetwork?.listCache === "function") {
      const cache = await window.api.siteNetwork.listCache("boss");
      const arr = Array.isArray(cache) ? cache : cache?.entries || [];
      console.log(
        `[bossRecommend] fetch 前 siteNetwork.listCache(boss) size=${arr.length}`,
        arr.map((c) => ({
          url: c.url,
          status: c.status,
          receivedAt: c.receivedAt,
          deltaSinceTs: typeof sinceTs === "number" ? c.receivedAt - sinceTs : null
        }))
      );
    }
  } catch (e) {
    console.warn(`[bossRecommend] listCache 失败（忽略）：`, e?.message || e);
  }

  const first = await fetchBossRecommendList({ encryptJobId, navWaitMs: 0, sinceTs });
  if (!first.ok) return first;
  if (typeof onProgress === "function") {
    onProgress("firstPage", first.data);
  }

  // 3.5) stopAfter='firstPage' → 不跑 humanize
  if (stopAfter === "firstPage") {
    console.log("[bossRecommend] stopAfter=firstPage, skip humanize");
    const list = (first.data && first.data.geekList) || [];
    return {
      ok: true,
      tabId: first.tabId,
      url: first.url,
      firstPage: first.data,
      humanize: null,
      geekList: list
    };
  }

  const firstList = (first.data && first.data.geekList) || [];
  const seen = new Set();
  const merged = [];
  for (const g of firstList) {
    const id = String(g.encryptGeekId || g.geekId || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(g);
  }

  // 如果首页已经够了，跳过 humanize
  if (merged.length >= targetCount) {
    return {
      ok: true,
      tabId: first.tabId,
      url: first.url,
      firstPage: first.data,
      humanize: null,
      geekList: merged.slice(0, targetCount)
    };
  }

  const humanize = await humanizeBossRecommend({
    tabId: first.tabId,
    jobId: encryptJobId,
    targetCount,
    ...humanizeOpts
  });
  if (typeof onProgress === "function") onProgress("humanized", humanize.data);

  if (humanize.ok && humanize.data && Array.isArray(humanize.data.accumulated)) {
    for (const g of humanize.data.accumulated) {
      const id = String(g.encryptGeekId || g.geekId || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(g);
    }
  }

  return {
    ok: true,
    tabId: first.tabId,
    url: first.url,
    firstPage: first.data,
    humanize: humanize.ok ? humanize.data : null,
    humanizeError: humanize.ok ? null : { code: humanize.errorCode, message: humanize.message },
    geekList: merged
  };
}

export default {
  buildBossRecommendUrl,
  openBossRecommend,
  openBossRecommendForJob,
  fetchBossRecommendList,
  humanizeBossRecommend,
  verifyBossRecommend,
  runBossRecommend
};
