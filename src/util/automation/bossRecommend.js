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
import { safeImport } from "src/util/safeDynamicImport";

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
      url,
      // ★ 后台模式：tab 栏出现 BOSS 推荐页，但用户继续停在主页（不切过去）。
      //   tab 仍真实渲染（主进程 background 模式），CDP 选职位 + 滚动懒加载照常工作。
      background: true
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
 * @param {string} [args.tabId]  已打开的推荐 tab id。传了就**复用**该 tab，不再 openBossRecommend
 *                               （避免对已加载/已选职位的推荐页再 loadURL 触发整页 reload → 换一批牛人）。
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
  const { encryptJobId, waitMs = 10000, navWaitMs = 0, urlOpts, sinceTs, tabId } = args || {};

  // ★ 关键修复：tabId 传了就**复用已打开的推荐 tab**，不再 openBossRecommend。
  //   原因：runBossRecommend 已经 openBossRecommend + selectJob 把推荐页加载并选好职位了，
  //   这里再 openBossRecommend → openOrActivate → openBossSingleton 会对同一个 tab 再
  //   `loadURL(recommendUrl)` 一次 = **整页 reload**，BOSS 会重新返回**另一批**牛人
  //   （page=1 内容都变了），导致我们 capture 到的列表跟 reload 后 DOM 渲染的列表不一致
  //   → 拟人化 / 立即沟通 按 encryptGeekId 匹配不到卡片。
  //   （日志实证：同一次任务里出现两次 did-navigate 到 /web/chat/recommend，第二次后
  //    /rec/geek/list page=1 的 body 大小从 223787 变成 193529。）
  let opened;
  if (tabId) {
    opened = { ok: true, tabId, url: buildBossRecommendUrl(encryptJobId, urlOpts) };
  } else {
    opened = await openBossRecommend(encryptJobId, urlOpts);
    if (!opened.ok) return opened;
  }
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
 *   5. 对推荐候选人逐个执行：滚到卡片 → CDP 点击详情 → CDP 点击收藏 → 校验「已收藏」→ 关闭详情。
 *      只有本次新收藏成功的候选人才计入 targetCount；当前页不足时继续滚动加载下一页。
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
 *     - ('collect.itemStart',  { geekId, index, total })
 *     - ('collect.itemDone',   { geekId, status, index, total })
 *     - ('collect.itemError',  { geekId, error, index, total })
 *     - ('collect.done',       { attempted, collected, alreadyCollected, errors })
 *     - ('collected',          collectionAggregate)
 * @param {[number, number]} [args.firstDwellMs]  仅 autoSelectJob=false 时生效，dwell 范围 [min, max]
 * @param {boolean} [args.autoSelectJob=true]     是否主动 CDP 点选职位（推荐路径，确保 BOSS UI 切到目标职位）
 * @param {object} [args.selectJobOpts]           透传给 selectJobInBossRecommend 的 opts
 *                                                （initialDelayMs / dropdownDwellMs / selectSettleMs 等）
 * @param {object} [args.humanizeOpts]   兼容旧调用参数；其中 config 继续用于分页滚动配置。
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   select?: object,           // autoSelectJob=true 才有，selectJobInBossRecommend 的返回
 *   firstPage?: object,
 *   collection?: object,
 *   geekList: Array,           // 本次页面 RPA 新收藏成功的候选人
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
    /**
     * 推荐渠道的 taskChannelId。传了就先拉「该渠道已保存简历 outId(=geekId)」集合，
     * 用于把**已入库**的牛人从候选池中排除，不再重复打开详情或收藏。
     */
    recommendTaskChannelId,
    /**
     * ★ 该会话**所有**推荐渠道的 taskChannelId 数组（含历史任务）。
     *   保留增量(CONTINUE)时，当前任务的 recommendTaskChannelId 是新建的、还没保存任何简历，
     *   只用它去重会漏掉「之前几次推荐已入库」的人 → 采集时不跳过 → 凑够 targetCount 后端再去重
     *   → 最终新增少了几个（设 20 实得 17/18）。传全部渠道 id，合并它们已保存的 outId 一起去重，
     *   采集时就跳过所有历史已入库的人，继续翻页直到凑够 targetCount 个**真·未入库**新人。
     */
    recommendTaskChannelIds,
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
     *   - 'firstPage' → 上面所有 + fetch 首屏（不执行收藏）
     *   - undefined / 其它 → 完整流程
     */
    stopAfter,
    /**
     * ★ 本次推荐运行所属的 taskId（由 doFetchRecommend 在流程**开始时**捕获并传入）。
     *   用户停止当前任务后又立刻开新任务时，"最新任务"已变成新任务（RUNNING），
     *   若 isUserAborted 仍按 getLatestTaskByChat 判定，旧的在途收藏循环会读到
     *   新任务状态（未停）→ 永不 break → 旧任务继续收藏并上传（串台 bug）。
     *   传入本运行**自己**的 taskId，isUserAborted 只认这个 id 的停止标记，互不影响。
     */
    abortTaskId
  } = args || {};

  // 1) 主动 select 分支需要在 open 之前做两件事：
  //    a. clearCache('boss') —— 清旧响应防 sinceTs 过滤后还混入历史数据
  //    b. 记 openStartTs —— 给「alreadySelected」短路 case 用作 sinceTs
  //    （被动 dwell 分支不需要，它在 else 里自己 clearCache + loadUrl 强制 navigation）
  // BOSS 主签现在永久固定不可关闭；openBossSingleton 每次都会 loadURL，仍能确保重新导航。
  // 候选人详情签属于用户浏览上下文，启动推荐任务时必须保留，不能批量关闭。
  let openStartTs = 0;
  if (autoSelectJob) {
    // a. 清缓存
    try {
      if (typeof window?.api?.siteNetwork?.clearCache === "function") {
        await window.api.siteNetwork.clearCache("boss");
        console.log("[bossRecommend] siteNetwork.clearCache(boss) ok（清旧响应防混淆）");
      }
    } catch (e) {
      console.warn("[bossRecommend] clearCache 失败（忽略）：", e?.message || e);
    }

    // b. 记 openStartTs（必须在 openBossRecommend 之前，确保 BOSS 自动发的首屏响应
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
  // 上一次任务异常遗留的锁先解掉再设新的，避免旧任务状态影响当前主签。
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
    const { selectJobInBossRecommend } = await safeImport(() =>
      import("src/util/automation/bossSelectJob")
    );
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

  // ★ 复用已打开 + 已选职位的推荐 tab（opened.tabId），不要让 fetchBossRecommendList 再
  //   openBossRecommend 触发整页 reload（会换成另一批牛人，导致后续拟人化/立即沟通匹配不上）。
  const first = await fetchBossRecommendList({
    encryptJobId,
    navWaitMs: 0,
    sinceTs,
    tabId: opened.tabId
  });
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

  // ★ 拉「该推荐渠道已保存的简历 outId(=geekId)」集合：已入库的牛人**不计入目标、不 humanize、只滚过**。
  //   out_id 口径：BOSS 推荐按约定 = geekId（见 search_task_api_doc.md §3.1 渠道 ID 口径）。
  const savedOutIdSet = new Set();
  // 合并「当前 + 历史」所有推荐渠道 id 去重拉已保存简历
  const dedupChannelIds = [
    ...new Set(
      [...(Array.isArray(recommendTaskChannelIds) ? recommendTaskChannelIds : []), recommendTaskChannelId]
        .filter((x) => x !== undefined && x !== null && x !== "")
        .map(String)
    )
  ];
  if (dedupChannelIds.length > 0) {
    try {
      const { getTaskChannelResumeIds } = await safeImport(() =>
        import("src/api/searchTaskApi")
      );
      const resps = await Promise.all(
        dedupChannelIds.map((id) => getTaskChannelResumeIds(id).catch(() => null))
      );
      for (const resp of resps) {
        const respData = resp?.data || resp;
        const taskResumes = Array.isArray(respData?.taskResumes) ? respData.taskResumes : [];
        for (const tr of taskResumes) {
          const oid = tr?.channelResumeId ?? tr?.outId;
          if (oid !== undefined && oid !== null && oid !== "") savedOutIdSet.add(String(oid));
        }
      }
      console.log(
        `[bossRecommend] 已保存简历过滤：渠道数=${dedupChannelIds.length} 已保存 outId 数=${savedOutIdSet.size}`,
        [...savedOutIdSet].slice(0, 30)
      );
    } catch (e) {
      console.warn(
        `[bossRecommend] 拉已保存 resumeIds 失败（忽略，按不过滤处理）:`,
        e?.message || e
      );
    }
  } else {
    console.log("[bossRecommend] 未传 recommendTaskChannelId(s)，跳过已保存过滤");
  }

  const firstList = (first.data && first.data.geekList) || [];
  const seen = new Set(); // 全局 session 去重：encryptGeekId||geekId（含已保存被跳过的）
  const discovered = []; // 已发现且未入库、等待页面收藏的候选人
  const collectedGeeks = []; // 只有本次从「收藏」变为「已收藏」的候选人才进入结果
  let skippedSavedCount = 0; // 累计被「已保存」过滤掉的人数（仅日志）

  const firstConsume = mergeNewGeeks(firstList);
  // BOSS 列表「是否还有下一页」：以最近一次 /rec/geek/list 响应的 zpData.hasMore 为准。
  //   终止条件 = 「未入库新人达到 targetCount」或「hasMore=false（BOSS 没有更多数据）」。
  let lastHasMore = !!(first.data && first.data.hasMore);
  console.log(
    `[bossRecommend] 首屏 geek=${firstList.length} 新人(未入库)=${firstConsume.mergedAdded} ` +
      `已保存跳过=${skippedSavedCount} discovered=${discovered.length} ` +
      `collected=${collectedGeeks.length}/${targetCount} hasMore=${lastHasMore}`
  );

  // ============= 页面收藏 + 分页加载循环（safe-only）=============
  //
  // 循环流程（每一轮 = 一个 "round"）：
  //   ① 选当前 batch = discovered 里还没尝试收藏的 geek
  //   ② 逐个打开详情并点击收藏，只有状态变成「已收藏」才计数
  //   ③ 检查操作期间 BOSS 自家有没有发新 /wapi/zpjob/rec/geek/list
  //      → 有：新 geek 进入 discovered，下一轮继续收藏
  //   ④ 没自动触发 → 主动调 smoothScrollToBottom 强制把容器滚到底
  //      → siteNetwork.waitForResponse 等下一页 /rec/geek/list（8s 超时）
  //      → 有响应：新 geek 进入 discovered，进入下一轮
  //      → 超时：真没数据了（BOSS 推荐池见底），结束循环
  //   ⑤ collectedGeeks.length >= targetCount → 结束
  //   ⑥ 安全护栏：最多 MAX_COLLECTION_ROUNDS 轮（防死循环）
  //
  // 设计要点：
  //   - `processedGeekIds` Set 标记已尝试收藏的候选人，避免重复点击
  //   - `seen` Set 全局去重 encryptGeekId
  //   - 每轮记录 collectionStartTs，后续 listCache 只读取本轮期间的新响应
  //   - 操作触发的 lazy load + 强制滚到底两种触发方式
  //     都通过 BOSS 自家 SPA 发请求，不是我们 fetch，安全
  let collectionError = null;
  const collectionPerRoundResults = [];
  const processedGeekIds = new Set();
  // 已收藏、已入库或收藏失败均不计数，可能需要多翻几页才能凑够 targetCount。
  const MAX_COLLECTION_ROUNDS = 20;
  let rounds = 0;

  const { smoothScrollToBottom } = await safeImport(() =>
    import("src/util/automation/bossHumanizeBrowse")
  );
  const { collectBossRecommendGeeks } = await safeImport(() =>
    import("src/util/automation/bossRecommendCollect")
  );

  // helper：geek 用于跟「已保存 outId(geekId)」匹配的候选 ID（容错多字段）
  function geekCandidateIds(g) {
    const out = [];
    const push = (v) => {
      if (v !== undefined && v !== null && v !== "" && v !== 0) out.push(String(v));
    };
    push(g?.geekId);
    push(g?.encryptGeekId);
    push(g?.geekCard?.geekId);
    push(g?.geekCard?.encryptGeekId);
    push(g?.uniqSign);
    return out;
  }
  function isSavedGeek(g) {
    if (savedOutIdSet.size === 0) return false;
    return geekCandidateIds(g).some((id) => savedOutIdSet.has(id));
  }

  // helper：把 BOSS rec/geek/list 响应里的 geek 合进 discovered（去重 + 过滤已保存）。
  //   返回 { sessionNew, mergedAdded }：
  //     - sessionNew  = 本次「之前没见过」的 geek 数（含已保存被跳过的）→ 用来判断 BOSS 是否真返回了新内容
  //     - mergedAdded = 真正进入待收藏候选池的人数
  //   已保存的人：只 markSeen + 计 skippedSavedCount，不进入待收藏候选池。
  function mergeNewGeeks(geeks) {
    let sessionNew = 0;
    let mergedAdded = 0;
    for (const g of geeks) {
      const id = String(g.encryptGeekId || g.geekId || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      sessionNew++;
      if (isSavedGeek(g)) {
        skippedSavedCount++;
        console.log(
          `[bossRecommend] 跳过已保存 geek（不计入目标，只滚过）dedupId=${id} ` +
            `候选outId=[${geekCandidateIds(g).join(",")}]`
        );
        continue;
      }
      discovered.push(g);
      mergedAdded++;
    }
    return { sessionNew, mergedAdded };
  }

  // helper：扫 siteNetwork 缓存里 BOSS 在 sinceTs 之后发的 /rec/geek/list 响应，
  // 提取所有 geek。这是收藏操作期间是否触发 lazy load 的判定依据。
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
      let hasMore = null; // 取最后一条响应的 hasMore（BOSS 是否还有下一页）
      for (const r of newResps) {
        const zp = r.bodyJson?.zpData;
        const list = zp?.geekList || [];
        if (Array.isArray(list)) geeks.push(...list);
        if (zp && typeof zp.hasMore === "boolean") hasMore = zp.hasMore;
      }
      return { responses: newResps.length, geeks, hasMore };
    } catch (e) {
      console.warn(`[bossRecommend] listCache 失败:`, e?.message || e);
      return { responses: 0, geeks: [], hasMore: null };
    }
  }

  // 用户主动停止 abort check：每轮收藏前检查当前 chat 的 task 是否被用户标 STOPPED。
  // 来源：SearchTasks/stopForChat action 会 commit markTaskUserStopped → state.userStoppedTaskIds
  // 同时也会改 task.taskStatus=STOPPED，所以两个信号都可以判定。
  // 动态 import store 避免顶层循环依赖。
  async function isUserAborted() {
    try {
      const storeMod = await import("src/store");
      const store = storeMod.default || storeMod;
      const stoppedMap = store?.state?.SearchTasks?.userStoppedTaskIds || {};
      // ★ 优先认本次运行**自己**的 taskId（abortTaskId）。
      //   用户停旧任务→立刻开新任务时，"最新任务"已是新任务，再按 getLatestTaskByChat 判定会
      //   读到新任务（RUNNING）导致旧循环永不 break。只认 abortTaskId 即可精确停掉本运行。
      if (abortTaskId) {
        if (stoppedMap[String(abortTaskId)] === true) return true;
        const t = store?.state?.SearchTasks?.tasksById?.[abortTaskId];
        if (t && t.taskStatus === "STOPPED") return true;
        return false;
      }
      // 兜底（未传 abortTaskId 的老调用方）：按 chat 最新任务判定
      const cid = store?.getters?.getLatestChatId;
      if (!cid) return false;
      const getLatest = store?.getters?.["SearchTasks/getLatestTaskByChat"];
      const task = typeof getLatest === "function" ? getLatest(cid) : null;
      if (!task) return false;
      return stoppedMap[String(task.taskId)] === true || task.taskStatus === "STOPPED";
    } catch (e) {
      console.warn("[bossRecommend] isUserAborted check 失败（默认 false）:", e?.message || e);
      return false;
    }
  }

  while (rounds < MAX_COLLECTION_ROUNDS) {
    rounds++;

    // ★ 每轮先 check 用户是否主动停止；停了就立刻 break，不再产生新的页面收藏。
    if (await isUserAborted()) {
      console.log(
        `[bossRecommend][collect][round ${rounds}] 用户主动停止任务，立即 break ` +
          `（已新收藏 ${collectedGeeks.length}/${targetCount}）`
      );
      collectionError = { code: "USER_STOPPED", message: "用户主动停止任务" };
      break;
    }

    // ① 选当前 batch：只处理未入库、且本轮还没尝试过收藏的候选人。
    const batchGeeks = discovered.filter((g) => {
      const id = String(g.encryptGeekId || g.geekId || "");
      return id && !processedGeekIds.has(id);
    });

    // ② 逐个打开详情并点击收藏。记录开始时间，用于判断操作过程中是否触发了 lazy load。
    const collectionStartTs = Date.now();
    if (batchGeeks.length === 0) {
      console.log(
        `[bossRecommend][collect][round ${rounds}] 无待收藏候选人，` +
          `准备加载更多 collected=${collectedGeeks.length}/${targetCount}`
      );
    } else {
      console.log(
        `[bossRecommend][collect][round ${rounds}] batch=${batchGeeks.length} ` +
          `collected=${collectedGeeks.length}/${targetCount}`
      );
      try {
        const collectRes = await collectBossRecommendGeeks(first.tabId, batchGeeks, {
          targetCount: Math.max(0, targetCount - collectedGeeks.length),
          shouldAbort: isUserAborted,
          onProgress: (stage, payload) => {
            if (typeof onProgress === "function") {
              onProgress(`collect.${stage}`, { ...payload, round: rounds });
            }
          }
        });
        collectionPerRoundResults.push(collectRes);
        for (const id of collectRes?.attemptedGeekIds || []) processedGeekIds.add(String(id));

        // 只把本次页面状态从「收藏」变成「已收藏」的候选人加入最终结果。
        for (const collectedId of collectRes?.collectedGeekIds || []) {
          const normalized = String(collectedId).replace(/~+$/, "");
          const geek = discovered.find((item) =>
            geekCandidateIds(item).some(
              (id) => String(id).replace(/~+$/, "") === normalized
            )
          );
          if (!geek) continue;
          const alreadyAdded = collectedGeeks.some((item) =>
            geekCandidateIds(item).some(
              (id) => String(id).replace(/~+$/, "") === normalized
            )
          );
          if (!alreadyAdded) collectedGeeks.push(geek);
        }

        // 先处理明确业务错误；权益不足也会中断当前批次，但不能被当成 USER_STOPPED。
        if (!collectRes?.ok) {
          collectionError = {
            code: collectRes?.errorCode || "UNKNOWN",
            message: collectRes?.message || ""
          };
          console.warn(
            `[bossRecommend][collect][round ${rounds}] collectBossRecommendGeeks failed:`,
            collectionError
          );
          break;
        }

        if (collectRes?.aborted) {
          console.log(
            `[bossRecommend][collect][round ${rounds}] 收藏批次因用户停止中断`
          );
          collectionError = { code: "USER_STOPPED", message: "用户主动停止任务" };
          break;
        }
        console.log(
          `[bossRecommend][collect][round ${rounds}] batch done: ` +
            `attempted=${collectRes.attemptedGeekIds?.length || 0} ` +
            `newCollected=${collectRes.collectedGeekIds?.length || 0} ` +
            `alreadyCollected=${collectRes.alreadyCollectedGeekIds?.length || 0} ` +
            `errors=${collectRes.errors?.length || 0} ` +
            `total=${collectedGeeks.length}/${targetCount}`
        );
      } catch (e) {
        collectionError = { code: "EXCEPTION", message: e?.message || String(e) };
        console.warn(
          `[bossRecommend][collect][round ${rounds}] 收藏批次异常:`,
          collectionError
        );
        break;
      }
    }

    if (collectedGeeks.length >= targetCount) {
      console.log(
        `[bossRecommend][collect][round ${rounds}] 新收藏成功数达到 targetCount=${targetCount}`
      );
      break;
    }

    if (lastHasMore === false) {
      console.log(
        `[bossRecommend][collect][round ${rounds}] BOSS hasMore=false，` +
          `候选池见底（新收藏 ${collectedGeeks.length}/${targetCount}）`
      );
      break;
    }

    // ③ 检查收藏期间 BOSS 自家有没有 lazy load
    const lazyAutoLoad = await collectLazyLoadedGeeksSince(collectionStartTs);
    console.log(
      `[bossRecommend][collect][round ${rounds}] 收藏期间 BOSS 自动发了 ` +
        `${lazyAutoLoad.responses} 条 /rec/geek/list，含 ${lazyAutoLoad.geeks.length} 个 geek`
    );

    let newGeeksThisRound = lazyAutoLoad.geeks;
    if (lazyAutoLoad.responses > 0 && typeof lazyAutoLoad.hasMore === "boolean") {
      lastHasMore = lazyAutoLoad.hasMore;
    }

    // ④ 没自动触发 → 主动滚到底强制触发
    if (newGeeksThisRound.length === 0) {
      // 强制滚底 + 等响应最多 12s，是个耗时段；进入前再 check 一次停止，避免停止后还白等一轮
      if (await isUserAborted()) {
        console.log(
          `[bossRecommend][collect][round ${rounds}] 强制滚底前检测到用户停止，立即 break`
        );
        collectionError = { code: "USER_STOPPED", message: "用户主动停止任务" };
        break;
      }
      console.log(
        `[bossRecommend][collect][round ${rounds}] 未自动触发 lazy load，主动 smoothScrollToBottom`
      );
      const forceTs = Date.now();
      try {
        await smoothScrollToBottom(first.tabId, {
          config: humanizeOpts?.config || undefined
        });
        // smoothScrollToBottom 内部已经打了详细 attempts 日志（每个容器的 scrolled / scrollHeight / clientHeight）
      } catch (e) {
        console.warn(
          `[bossRecommend][collect][round ${rounds}] smoothScrollToBottom 失败:`,
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
          `[bossRecommend][collect][round ${rounds}] 强制滚底后 12s 没等到响应（${next?.code}），结束循环`
        );
        break;
      }
      const nextZp = next.data?.bodyJson?.zpData;
      const geeks = nextZp?.geekList || [];
      if (typeof nextZp?.hasMore === "boolean") lastHasMore = nextZp.hasMore;
      if (geeks.length === 0) {
        console.log(
          `[bossRecommend][collect][round ${rounds}] BOSS 返回空 geekList，结束循环`
        );
        break;
      }
      console.log(
        `[bossRecommend][collect][round ${rounds}] 强制滚底触发成功，BOSS 返回 ${geeks.length} 个 geek`
      );
      newGeeksThisRound = geeks;
    }

    // ⑤ 合并到待收藏候选池，下一轮继续逐个打开详情收藏。
    const consume = mergeNewGeeks(newGeeksThisRound);
    console.log(
      `[bossRecommend][collect][round ${rounds}] BOSS返回${newGeeksThisRound.length}个，` +
        `本轮新出现=${consume.sessionNew}（其中未入库新人=${consume.mergedAdded}、已保存跳过=${consume.sessionNew - consume.mergedAdded}），` +
        `discovered=${discovered.length} collected=${collectedGeeks.length}/${targetCount} ` +
        `累计已保存跳过=${skippedSavedCount} hasMore=${lastHasMore}`
    );

    // ★ 终止条件（严格按用户要求）：
    //   1) 未入库新人凑够 targetCount → 结束（拿够了）
    //   2) BOSS hasMore=false → 结束（接口明确没有更多数据）
    //   其它情况（哪怕本轮全是已保存/重复、sessionNew=0）只要 hasMore!==false 就继续翻页，
    //   重复的人不计入 targetCount，靠 MAX_COLLECTION_ROUNDS 兜底防死循环。
    if (lastHasMore === false) {
      console.log(
        `[bossRecommend][collect][round ${rounds}] BOSS hasMore=false，没有更多数据`
      );
      break;
    }

    if (consume.sessionNew === 0) {
      console.log(
        `[bossRecommend][collect][round ${rounds}] 本轮无新候选人但 hasMore=${lastHasMore}，继续翻页`
      );
    }
  }

  if (rounds >= MAX_COLLECTION_ROUNDS) {
    console.warn(
      `[bossRecommend][collect] 达到最大轮数护栏 MAX_COLLECTION_ROUNDS=${MAX_COLLECTION_ROUNDS}，强制结束`
    );
  }

  console.log(
    `[bossRecommend] collect+pagination 整体结束 rounds=${rounds} ` +
      `final=${collectedGeeks.length}/${targetCount} 各轮收藏=${collectionPerRoundResults
        .map((r) => `${r.collectedGeekIds?.length || 0}/${r.attemptedGeekIds?.length || 0}`)
        .join(", ")}`
  );

  const collectionAggregate = {
    rounds,
    perRound: collectionPerRoundResults,
    targetCount,
    collectedCount: collectedGeeks.length,
    totalAttempted: collectionPerRoundResults.reduce(
      (sum, result) => sum + (result.attemptedGeekIds?.length || 0),
      0
    ),
    totalAlreadyCollected: collectionPerRoundResults.reduce(
      (sum, result) => sum + (result.alreadyCollectedGeekIds?.length || 0),
      0
    ),
    totalErrors: collectionPerRoundResults.reduce(
      (sum, result) => sum + (result.errors?.length || 0),
      0
    )
  };
  if (typeof onProgress === "function") onProgress("collected", collectionAggregate);

  // 升级权益弹窗属于不可恢复的渠道业务限制，不能像普通单个收藏失败一样继续翻页。
  // 将错误提升到 runBossRecommend 顶层，让 IndexPage 停止当前推荐任务。
  if (collectionError?.code === "BOSS_ENTITLEMENT_REQUIRED") {
    return {
      ok: false,
      tabId: first.tabId,
      url: first.url,
      select: selectResult,
      firstPage: first.data,
      collection: collectionAggregate,
      collectionError,
      geekList: collectedGeeks.slice(0, targetCount),
      errorCode: collectionError.code,
      message: collectionError.message || "BOSS直聘查看权益不足，推荐任务已停止"
    };
  }

  return {
    ok: true,
    tabId: first.tabId,
    url: first.url,
    select: selectResult,
    firstPage: first.data,
    collection: collectionAggregate,
    collectionError,
    geekList: collectedGeeks.slice(0, targetCount)
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
