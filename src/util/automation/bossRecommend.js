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

/**
 * 模块级 state：记录最近一次 runBossRecommend 锁定的 tabId。
 *
 * 为什么这么设计：runBossRecommend 内部 return 路径很多（按错误码 / 短路 / 正常完成），
 * 在每个 return 前都 setLocked(false) 太脆弱。
 * 上层调用方（IndexPage.doFetchRecommend）的 try/finally 是更可靠的解锁时机，
 * 这里导出 unlockRecommendTab() 让上层在 finally 里一次性兜底。
 *
 * 不存进 Vuex 是因为这只是「跟当前 runBossRecommend 调用绑定」的临时状态，
 * 没有跨组件/跨 chat 的语义，放模块变量足够。
 */
let __lockedRecommendTabId = null;

/**
 * 解锁最近一次 runBossRecommend 锁定的 BOSS 推荐 tab（X 按钮重新显示，用户可关）。
 *
 * 调用时机：
 *   - IndexPage.doFetchRecommend 的 try/finally 里（任务正常完成 / 报错 / 中断都会走）
 *   - SearchTasks.stopForChat（用户手动停任务时）
 *
 * 幂等：没锁过 / 已解锁都是 no-op。
 */
export async function unlockRecommendTab() {
  if (!__lockedRecommendTabId) return;
  const tabId = __lockedRecommendTabId;
  __lockedRecommendTabId = null;
  try {
    if (typeof window?.api?.tabs?.setLocked === "function") {
      await window.api.tabs.setLocked({ id: tabId, locked: false });
      console.log(`[bossRecommend] unlockRecommendTab(${tabId}) ok`);
    }
  } catch (e) {
    console.warn(`[bossRecommend] unlockRecommendTab(${tabId}) 失败（忽略）：`, e?.message || e);
  }
}
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
  const { encryptJobId, filters, waitListMs = 12000, urlOpts, opts = {} } = args || {};

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
      message: "window.api.siteNetwork 不可用（preload 未更新？请重启客户端 Electron 进程）"
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
 * 完整业务入口：打开推荐 tab → 主动 CDP 选职位 → 抓首屏 → 拟人浏览 + 滚动加载到目标数量。
 *
 * 推荐**业务侧**统一调这个，而不是分别调 `fetchBossRecommendList` + `humanizeBossRecommend`。
 *
 * 拟人节奏：
 *   1. openOrActivate 打开 tab（用户可见）
 *   2. **autoSelectJob=true（默认）**：调 selectJobInBossRecommend
 *      → 15s 初始 dwell（等 iframe + Vue + 反爬脚本稳定）
 *      → CDP click `.job-selecter-wrap` 打开下拉
 *      → 15s 浏览 dwell（拟人化）
 *      → CDP click `li.job-item[value=<encryptJobId>]` 选中目标
 *      → 1.5s settle（让 BOSS 因切职位发出的新 `/rec/geek/list` 落地）
 *      此分支 sinceTs 取 selectRes.liClickedAt（li 点击之前一刻），
 *      保证 fetchBossRecommendList 等到的是切职位后的新响应。
 *   3. **autoSelectJob=false**：退化到旧路径
 *      → clearCache + loadUrl(?_t=...) 强制 BOSS 重启 SPA 重发 API
 *      → 随机 5-15s dwell
 *      此分支 sinceTs 取 loadUrl 完成之后的 Date.now()。
 *   4. fetchBossRecommendList 抓首屏（仍是被动监听）
 *   5. **humanizeBrowseGeeks**：在首屏 geek 上随机挑 0-3 个 click（点开 → 15-60s dwell → 关闭弹框）
 *      + 4-10 个 browse（滚到目标位置 + 1.5-4.5s dwell），全程 safe scroll + 选择性 CDP click。
 *      详见 src/util/automation/bossHumanizeBrowse.js 顶部 CONFIG。
 *
 * @param {object} args
 * @param {string} args.encryptJobId
 * @param {number} args.targetCount
 * @param {(stage, payload) => void} [args.onProgress]
 *   阶段回调：
 *     - ('opened',          { tabId, url })
 *     - ('select.waiting',  { delayMs })           ← autoSelectJob=true 才有
 *     - ('select.openingDropdown',  { selector })
 *     - ('select.browsingDropdown', { dwellMs })
 *     - ('select.selectingItem',    { selector })
 *     - ('select.settling',         { delayMs })
 *     - ('select.done')
 *     - ('dwell',           { ms })                ← autoSelectJob=false 才有
 *     - ('firstPage',       { geekList, totalSize, hasMore, source })
 *     - ('humanize.plan',       { plan, clickCount, browseCount })   ← humanizeBrowseGeeks 阶段
 *     - ('humanize.itemStart',  { geekId, action, index, total })
 *     - ('humanize.itemDone',   { geekId, action, index, total })
 *     - ('humanize.itemError',  { geekId, action, error })
 *     - ('humanize.done',       { executed, errors })
 *     - ('humanized',           humanize)                            ← 完成时给一条兼容旧调用方
 * @param {[number, number]} [args.firstDwellMs]  仅 autoSelectJob=false 时生效，dwell 范围 [min, max]
 * @param {boolean} [args.autoSelectJob=true]     是否主动 CDP 点选职位（推荐路径，确保 BOSS UI 切到目标职位）
 * @param {object} [args.selectJobOpts]           透传给 selectJobInBossRecommend 的 opts
 *                                                （initialDelayMs / dropdownDwellMs / selectSettleMs 等）
 * @param {object} [args.humanizeOpts]   传给 humanizeBrowseGeeks 的额外参数：
 *                                       - config: 部分覆盖 HUMANIZE_BROWSE_CONFIG
 *                                         （CLICK_COUNT_RANGE / BROWSE_COUNT_RANGE / 各 DWELL 范围 / SELECTOR 等）
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   select?: object,           // autoSelectJob=true 才有，selectJobInBossRecommend 的返回
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
     * ★ 主动 CDP 点选职位（默认开启）。
     *   true  → 走 selectJobInBossRecommend，由 li click 触发 BOSS 切职位 + 拉新数据
     *   false → 退化到旧路径：clearCache + loadUrl + 被动 dwell + 等 BOSS 自动发 API
     *
     * 关掉只在两种情况下用：
     *   1. 上层调用方自己已经做了 select（避免重复）
     *   2. 临时 fallback 排查（怀疑 CDP 触发风控 → 改回纯被动模式）
     */
    autoSelectJob = true,
    selectJobOpts = {},
    /**
     * 调试用：在某一阶段提前退出
     *   - 'open'      → 只打开 tab + select/dwell，不跑任何抓数据脚本
     *   - 'verify'    → 打开 tab + select/dwell + 跑 verify 脚本（验证职位选中 + 列表可见）
     *   - 'firstPage' → 上面所有 + fetch 首屏（不 humanize）
     *   - undefined / 其它 → 完整流程
     */
    stopAfter
  } = args || {};

  // 1) 主动 select 分支需要在 open 之前做三件事：
  //    a. **关掉已存在的、URL 跟 target 一致的 BOSS tab** —— 强制 openBossRecommend 走
  //       新建 tab 路径，避免 openOrActivate reuse 已存在 tab 时**不触发 navigation**导致
  //       BOSS 不重发 /rec/geek/list 的 edge case（详见 alreadySelected 注释）
  //    b. clearCache('boss') —— 清旧响应防 sinceTs 过滤后还混入历史数据
  //    c. 记 openStartTs —— 给「alreadySelected」短路 case 用作 sinceTs
  //    （被动 dwell 分支不需要，它在 else 里自己 clearCache + loadUrl 强制 navigation）
  let openStartTs = 0;
  if (autoSelectJob) {
    // a. 关掉匹配 target 的旧 BOSS tab
    //
    // 判断条件：channel === 'boss' AND url 包含 `jobid=<encryptJobId>`。
    // 用 substring 匹配比精确匹配宽松，能容忍 BOSS URL 上其它 query 参数 / hash 不一致。
    // 不动其它 BOSS tab（用户可能手动开了别的职位的推荐页，不能误关）。
    try {
      if (typeof window?.api?.tabs?.list === "function") {
        const allTabs = await window.api.tabs.list();
        // ★ 用户要求：启动 BOSS 推荐任务前，**所有** BOSS 相关 tab 都关掉（不论 URL 是否匹配 target）。
        // 业务侧考虑：自动化期间多个 BOSS tab 同时存在容易让用户误以为有多个任务在跑，
        // siteNetworkCapture 也可能抓到非目标 tab 的响应（虽然有 sinceTs 兜底）。
        const matching = (Array.isArray(allTabs) ? allTabs : []).filter(
          (t) => t && t.channel === "boss"
        );
        if (matching.length > 0) {
          console.log(
            `[bossRecommend] 检测到 ${matching.length} 个已存在 BOSS tab，全部 close 后重开` +
              ` (tabIds=${matching.map((t) => t.id).join(",")})`
          );
          for (const t of matching) {
            try {
              // 先解锁（防止上次任务异常 leave 了 locked=true 的 tab，否则 close 被拒绝）
              if (t.locked && typeof window?.api?.tabs?.setLocked === "function") {
                await window.api.tabs.setLocked({ id: t.id, locked: false });
              }
              await window.api.tabs.close(t.id);
              console.log(`[bossRecommend] tabs.close(${t.id}) ok url=${t.url}`);
            } catch (e) {
              console.warn(`[bossRecommend] tabs.close(${t.id}) 失败（忽略）：`, e?.message || e);
            }
          }
        } else {
          console.log("[bossRecommend] 无 BOSS tab，无需 close");
        }
      }
    } catch (e) {
      console.warn("[bossRecommend] tabs.list 失败（忽略，继续开 tab）：", e?.message || e);
    }

    // b. 清缓存
    try {
      if (typeof window?.api?.siteNetwork?.clearCache === "function") {
        await window.api.siteNetwork.clearCache("boss");
        console.log("[bossRecommend] siteNetwork.clearCache(boss) ok（清旧响应防混淆）");
      }
    } catch (e) {
      console.warn("[bossRecommend] clearCache 失败（忽略）：", e?.message || e);
    }

    // c. 记 openStartTs（必须在 openBossRecommend 之前，确保 BOSS 自动发的首屏响应
    //    receivedAt > openStartTs，能被 waitForResponse 命中）
    openStartTs = Date.now();
    console.log(
      `[bossRecommend] openStartTs=${openStartTs}（如果 alreadySelected 就用这个等 BOSS 自动加载的首屏响应）`
    );
  }

  // 2) 打开推荐 tab（幂等：已开则激活）
  const opened = await openBossRecommend(encryptJobId);
  if (!opened.ok) return opened;
  if (typeof onProgress === "function") {
    onProgress("opened", { tabId: opened.tabId, url: opened.url });
  }

  // ★ 立刻锁住这个 BOSS tab：用户不能手动 X 关掉（防止自动化跑中被误关导致中断）。
  // 记到模块级变量，由上层（IndexPage.doFetchRecommend 的 finally / stopForChat）
  // 通过 unlockRecommendTab() 解锁，覆盖所有正常/异常退出路径。
  // 上一次任务异常 leave 的锁先解掉再设新的（理论上调用前已 close 所有 BOSS tab，但保险）
  if (__lockedRecommendTabId && __lockedRecommendTabId !== opened.tabId) {
    await unlockRecommendTab();
  }
  if (typeof window?.api?.tabs?.setLocked === "function") {
    try {
      await window.api.tabs.setLocked({ id: opened.tabId, locked: true });
      __lockedRecommendTabId = opened.tabId;
      console.log(`[bossRecommend] tabs.setLocked(${opened.tabId}, true) ok - 任务期间锁定`);
    } catch (e) {
      console.warn(`[bossRecommend] tabs.setLocked(true) 失败（忽略）：`, e?.message || e);
    }
  }

  // 2.5) 主动 select 分支 vs 旧被动 dwell 分支
  let sinceTs;
  let selectResult = null;

  if (autoSelectJob) {
    // ★ 主动 CDP 点选职位 + 「已选中目标」短路逻辑
    //
    // BOSS 推荐 tab 打开后会自动发一次 /wapi/zpjob/rec/geek/list（基于 URL 的 jobid）。
    // 我们 clearCache + 记 openStartTs 已经放到 open 之前，siteNetworkCapture 自动抓这条。
    //
    // selectJobInBossRecommend 内部判断当前选中是否 === 目标：
    //   - 一致 → alreadySelected=true，不点 li（点了 BOSS 也不重发 API，浪费）
    //     → 我们用 openStartTs 当 sinceTs，等首屏响应
    //   - 不一致 → 点目标 li 切职位 → BOSS 发新 API
    //     → 用 selectRes.liClickedAt 当 sinceTs，等切职位的响应
    const { selectJobInBossRecommend } = await import("src/util/automation/bossSelectJob");
    const selectRes = await selectJobInBossRecommend(opened.tabId, encryptJobId, {
      ...selectJobOpts,
      onProgress: (stage, payload) => {
        // 前缀化避免跟 runBossRecommend 自己的 stage 名冲突
        if (typeof onProgress === "function") onProgress(`select.${stage}`, payload);
      }
    });
    selectResult = selectRes;
    if (!selectRes.ok) {
      console.warn(
        `[bossRecommend] selectJob 失败 → 整体放弃: ${selectRes.errorCode} ${selectRes.message}`
      );
      return {
        ok: false,
        tabId: opened.tabId,
        url: opened.url,
        select: selectRes,
        errorCode: `SELECT_FAILED:${selectRes.errorCode}`,
        message: selectRes.message,
        geekList: []
      };
    }

    if (selectRes.alreadySelected) {
      // ★ 已经选中目标 → 没点 li，BOSS 没发新 API → 用 openStartTs 等"open 时自动发的"那条
      sinceTs = openStartTs;
      console.log(
        `[bossRecommend] selectJob: alreadySelected (current===target=${encryptJobId}) ` +
          `→ sinceTs=${openStartTs}（openStartTs），等 BOSS 打开时自动发的首屏响应`
      );
    } else {
      // 切换职位 → BOSS 会发新 API → 用 liClickedAt 等切职位后的响应
      sinceTs = selectRes.liClickedAt || Date.now();
      console.log(
        `[bossRecommend] selectJob ok (current=${
          selectRes.currentSelectedJobId || "?"
        } → target=${encryptJobId}) ` + `→ sinceTs=${sinceTs}（liClickedAt），等 BOSS 切职位响应`
      );
    }
  } else {
    // 旧路径：clearCache + loadUrl(_t) + 随机 dwell + 被动等
    //
    // 为什么不用 reload()：经实测 webContents.reload() 对 BOSS 推荐 SPA **没让它重新发**
    //   `/wapi/zpjob/rec/geek/list`（疑似 sessionStorage / 路由层缓存），dwell 12s 后
    //   `listCache(boss) size=0`。
    //   webContents.loadURL() 强制完整 navigation，URL 带个 `_t=Date.now()` 兜底防 HTTP cache。
    try {
      if (typeof window?.api?.siteNetwork?.clearCache === "function") {
        await window.api.siteNetwork.clearCache("boss");
      }
    } catch (e) {
      console.warn(`[bossRecommend] clearCache 失败（忽略）：`, e?.message || e);
    }
    try {
      const navUrl = `${opened.url}${opened.url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
      if (typeof window?.api?.tabs?.loadUrl === "function") {
        await window.api.tabs.loadUrl(opened.tabId, navUrl);
        console.log(`[bossRecommend] tabs.loadUrl 已触发 tab=${opened.tabId} url=${navUrl}`);
      } else if (typeof window?.api?.tabs?.reload === "function") {
        await window.api.tabs.reload(opened.tabId);
        console.log(
          `[bossRecommend] tabs.loadUrl 不可用，降级 reload tab=${opened.tabId}（请重启 Electron 客户端拿到新 preload）`
        );
      }
    } catch (e) {
      console.warn(`[bossRecommend] loadUrl/reload 失败（忽略，继续）：`, e?.message || e);
    }
    sinceTs = Date.now();

    // 拟人 dwell：打开后随机停留 5-15s 再继续
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
  }

  // 2.5) stopAfter='open' → 提前返回
  if (stopAfter === "open") {
    console.log("[bossRecommend] stopAfter=open, return without running scripts");
    return { ok: true, tabId: opened.tabId, url: opened.url, select: selectResult, geekList: [] };
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
      select: selectResult,
      verify: res.data,
      geekList: [],
      errorCode: res.errorCode,
      message: res.message
    };
  }

  // ★ 给推荐卡 step1 "分析画像关键词" 一个可见的 processing 窗口（仅 autoSelectJob 路径）
  //
  // 实际前端没真的在做"分析"，但用户期望「选中职位 → 分析关键词 → 获取候选人」三步顺次显示。
  // select.done 之后到 fetchBossRecommendList 之间有真实的等待（响应延迟可短可长），
  // 这里 emit 'analyzing' 让 IndexPage 切 SELECTED phase，并 sleep 一小段确保 UI 渲染到位。
  // 顺带也降低了"select 完立刻 fetch"的机器人节奏。
  if (autoSelectJob) {
    if (typeof onProgress === "function") onProgress("analyzing", { dwellMs: 1200 });
    await new Promise((r) => setTimeout(r, 1200));
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

  // emit 'fetching'：让 UI 推荐卡切到 step2 "获取候选人列表" processing
  if (typeof onProgress === "function") onProgress("fetching", { sinceTs });

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
      select: selectResult,
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

  // ⚠️ 注意：这里**不再**有 "firstPage 已够 → 跳过 humanize" 的早返回。
  // 原因：用户明确要求"拟人化操作"是流程的一部分（防风控关键），即使首屏已经够数也
  // 要走一轮 humanize 让 BOSS 看到自然行为节奏。下面的循环内部首轮会处理 firstPage 数据，
  // 之后如果 merged >= targetCount 就 break，不会做多余的滚底/翻页。
  //
  // 如果以后想要"firstPage 够就秒回"模式，加 `args.skipHumanizeIfEnough: boolean` 配置即可。

  // ============= 拟人浏览 + 分页加载循环（safe-only）=============
  //
  // 循环流程（每一轮 = 一个 "round"）：
  //   ① 选当前 batch = merged 里**还没被 humanize 过**的 geek
  //   ② humanizeBrowseGeeks 跑一遍 batch（每个 click 15-60s，browse 1.5-4.5s）
  //   ③ 检查 humanize 期间 BOSS 自家有没有发新 /wapi/zpjob/rec/geek/list
  //      （humanize 的 smooth scroll 可能触发了 BOSS lazy load）
  //      → 有：新 geek 进 merged，进入下一轮（下轮 batch = 这些新 geek）
  //   ④ 没自动触发 → 主动调 smoothScrollToBottom 强制把容器滚到底
  //      → siteNetwork.waitForResponse 等下一页 /rec/geek/list（8s 超时）
  //      → 有响应：新 geek 进 merged，进入下一轮
  //      → 超时：真没数据了（BOSS 推荐池见底），结束循环
  //   ⑤ accumulated >= targetCount → 结束（拿够了）
  //   ⑥ 安全护栏：最多 MAX_HUMANIZE_ROUNDS 轮（防死循环）
  //
  // 设计要点：
  //   - `processedGeekIds` Set 标记"已 humanize 过"，避免反复看同一个 geek
  //   - `seen` Set 全局 dedup encryptGeekId（first page → humanize → 多轮分页都不重复）
  //   - 每轮 humanize 一开始记 humanizeStartTs，后续 listCache 用它过滤"本轮期间新到的响应"
  //   - 触发性 lazy load（humanize 内 scroll 引起）+ 强制性滚到底两种触发方式
  //     都通过 BOSS 自家 SPA 发请求，不是我们 fetch，安全
  let humanizeError = null;
  const humanizePerRoundResults = [];
  const processedGeekIds = new Set();
  const MAX_HUMANIZE_ROUNDS = 8;
  let rounds = 0;

  const { humanizeBrowseGeeks, smoothScrollToBottom } = await import(
    "src/util/automation/bossHumanizeBrowse"
  );

  // helper：把 BOSS rec/geek/list 响应里的 geek 合进 merged（dedup），返回实际新增数
  function mergeNewGeeks(geeks) {
    let added = 0;
    for (const g of geeks) {
      const id = String(g.encryptGeekId || g.geekId || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(g);
      added++;
    }
    return added;
  }

  // helper：扫 siteNetwork 缓存里 BOSS 在 sinceTs 之后发的 /rec/geek/list 响应，
  // 提取所有 geek。这是"humanize 期间是否触发了 lazy load"的判定依据。
  async function collectLazyLoadedGeeksSince(sinceTs) {
    try {
      const cache = await window.api.siteNetwork.listCache("boss");
      const arr = Array.isArray(cache) ? cache : cache?.entries || [];
      const newResps = arr.filter(
        (c) =>
          c &&
          typeof c.url === "string" &&
          c.url.includes("/wapi/zpjob/rec/geek/list") &&
          c.receivedAt > sinceTs
      );
      const geeks = [];
      for (const r of newResps) {
        const list = r.bodyJson?.zpData?.geekList || [];
        if (Array.isArray(list)) geeks.push(...list);
      }
      return { responses: newResps.length, geeks };
    } catch (e) {
      console.warn(`[bossRecommend] listCache 失败:`, e?.message || e);
      return { responses: 0, geeks: [] };
    }
  }

  // 用户主动停止 abort check：每轮 humanize 顶部检查当前 chat 的 task 是否被用户标 STOPPED。
  // 来源：SearchTasks/stopForChat action 会 commit markTaskUserStopped → state.userStoppedTaskIds
  // 同时也会改 task.taskStatus=STOPPED，所以两个信号都可以判定。
  // 动态 import store 避免顶层循环依赖。
  async function isUserAborted() {
    try {
      const storeMod = await import("src/store");
      const store = storeMod.default || storeMod;
      const cid = store?.getters?.getLatestChatId;
      if (!cid) return false;
      const getLatest = store?.getters?.["SearchTasks/getLatestTaskByChat"];
      const task = typeof getLatest === "function" ? getLatest(cid) : null;
      if (!task) return false;
      // 双重判定：state.userStoppedTaskIds 命中 OR task.taskStatus 已是 STOPPED
      const stoppedMap = store?.state?.SearchTasks?.userStoppedTaskIds || {};
      return stoppedMap[String(task.taskId)] === true || task.taskStatus === "STOPPED";
    } catch (e) {
      console.warn("[bossRecommend] isUserAborted check 失败（默认 false）:", e?.message || e);
      return false;
    }
  }

  while (rounds < MAX_HUMANIZE_ROUNDS) {
    rounds++;

    // ★ 每轮先 check 用户是否主动停止；停了就立刻 break，把已有的 merged 数据带回去
    if (await isUserAborted()) {
      console.log(
        `[bossRecommend][humanize][round ${rounds}] 用户主动停止任务，立即 break 循环（已累计 ${merged.length} 条）`
      );
      humanizeError = { code: "USER_STOPPED", message: "用户主动停止任务" };
      break;
    }

    // ① 选当前 batch
    const batchGeekIds = merged
      .map((g) => String(g.encryptGeekId || g.geekId || ""))
      .filter((id) => id && !processedGeekIds.has(id));

    if (batchGeekIds.length === 0) {
      console.log(`[bossRecommend][humanize][round ${rounds}] 无未处理 batch，结束循环`);
      break;
    }
    console.log(
      `[bossRecommend][humanize][round ${rounds}] batch=${batchGeekIds.length} ` +
        `accumulated=${merged.length}/${targetCount}`
    );

    // ② 跑 humanize（记录开始时间用于过滤本轮 lazy load 响应）
    const humanizeStartTs = Date.now();
    try {
      const hRes = await humanizeBrowseGeeks(first.tabId, batchGeekIds, {
        config: humanizeOpts?.config || undefined,
        onProgress: (stage, payload) => {
          if (typeof onProgress === "function") {
            onProgress(`humanize.${stage}`, { ...payload, round: rounds });
          }
        }
      });
      humanizePerRoundResults.push(hRes);
      batchGeekIds.forEach((id) => processedGeekIds.add(id));

      if (!hRes?.ok) {
        humanizeError = { code: hRes?.errorCode || "UNKNOWN", message: hRes?.message || "" };
        console.warn(
          `[bossRecommend][humanize][round ${rounds}] humanizeBrowseGeeks failed:`,
          humanizeError
        );
        break;
      }
      console.log(
        `[bossRecommend][humanize][round ${rounds}] humanize ok: plan=${hRes.plan.length} ` +
          `executed=${hRes.executed.length} errors=${hRes.errors.length}`
      );
    } catch (e) {
      humanizeError = { code: "EXCEPTION", message: e?.message || String(e) };
      console.warn(`[bossRecommend][humanize][round ${rounds}] humanize 异常:`, humanizeError);
      break;
    }

    // ③ 检查 humanize 期间 BOSS 自家有没有 lazy load
    const lazyAutoLoad = await collectLazyLoadedGeeksSince(humanizeStartTs);
    console.log(
      `[bossRecommend][humanize][round ${rounds}] humanize 期间 BOSS 自动发了 ` +
        `${lazyAutoLoad.responses} 条 /rec/geek/list，含 ${lazyAutoLoad.geeks.length} 个 geek`
    );

    let newGeeksThisRound = lazyAutoLoad.geeks;

    // ④ 没自动触发 → 主动滚到底强制触发
    if (newGeeksThisRound.length === 0) {
      console.log(
        `[bossRecommend][humanize][round ${rounds}] 未自动触发 lazy load，主动 smoothScrollToBottom（多管齐下：主frame+iframe多容器+sentinel scrollIntoView）`
      );
      const forceTs = Date.now();
      try {
        await smoothScrollToBottom(first.tabId, {
          config: humanizeOpts?.config || undefined
        });
        // smoothScrollToBottom 内部已经打了详细 attempts 日志（每个容器的 scrolled / scrollHeight / clientHeight）
      } catch (e) {
        console.warn(
          `[bossRecommend][humanize][round ${rounds}] smoothScrollToBottom 失败:`,
          e?.message || e
        );
        break;
      }
      // 等 BOSS 自家发下一页响应（延长到 12s，给 IntersectionObserver + 网络往返多留点时间）
      const next = await window.api.siteNetwork.waitForResponse({
        siteKey: "boss",
        urlPattern: "/wapi/zpjob/rec/geek/list",
        timeoutMs: 12_000,
        sinceTs: forceTs
      });
      if (!next?.ok) {
        console.log(
          `[bossRecommend][humanize][round ${rounds}] 强制滚底后 12s 没等到响应（${next?.code}），结束循环（BOSS 推荐池可能见底 或 lazy load 未触发）`
        );
        break;
      }
      const geeks = next.data?.bodyJson?.zpData?.geekList || [];
      if (geeks.length === 0) {
        console.log(
          `[bossRecommend][humanize][round ${rounds}] BOSS 返回空 geekList，结束循环（无更多数据）`
        );
        break;
      }
      console.log(
        `[bossRecommend][humanize][round ${rounds}] 强制滚底触发成功，BOSS 返回 ${geeks.length} 个新 geek`
      );
      newGeeksThisRound = geeks;
    }

    // ⑤ 合并到 merged，检查是否够了
    const added = mergeNewGeeks(newGeeksThisRound);
    console.log(
      `[bossRecommend][humanize][round ${rounds}] dedup 后新增 ${added} 个，` +
        `accumulated=${merged.length}/${targetCount}`
    );

    if (added === 0) {
      console.log(
        `[bossRecommend][humanize][round ${rounds}] 全部 duplicate（BOSS 返回的都跟已有重复），跳出避免死循环`
      );
      break;
    }

    if (merged.length >= targetCount) {
      console.log(
        `[bossRecommend][humanize][round ${rounds}] 已达到 targetCount=${targetCount}，结束循环`
      );
      break;
    }
  }

  if (rounds >= MAX_HUMANIZE_ROUNDS) {
    console.warn(
      `[bossRecommend][humanize] 达到最大轮数护栏 MAX_HUMANIZE_ROUNDS=${MAX_HUMANIZE_ROUNDS}，强制结束`
    );
  }

  console.log(
    `[bossRecommend] humanize+pagination 整体结束 rounds=${rounds} ` +
      `final=${merged.length}/${targetCount} 各轮 humanize=${humanizePerRoundResults
        .map((r) => `${r.executed?.length || 0}/${r.plan?.length || 0}`)
        .join(", ")}`
  );

  // 给上层一个聚合的 humanize 结果（包含每轮明细）
  const humanizeAggregate = {
    rounds,
    perRound: humanizePerRoundResults,
    totalExecuted: humanizePerRoundResults.reduce((s, r) => s + (r.executed?.length || 0), 0),
    totalPlan: humanizePerRoundResults.reduce((s, r) => s + (r.plan?.length || 0), 0),
    totalErrors: humanizePerRoundResults.reduce((s, r) => s + (r.errors?.length || 0), 0)
  };
  if (typeof onProgress === "function") onProgress("humanized", humanizeAggregate);

  return {
    ok: true,
    tabId: first.tabId,
    url: first.url,
    select: selectResult,
    firstPage: first.data,
    humanize: humanizeAggregate,
    humanizeError,
    geekList: merged.slice(0, targetCount) // 不超过 targetCount，多余的截掉
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
