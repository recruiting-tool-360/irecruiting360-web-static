/**
 * BOSS 推荐页 - 主动选中指定职位（CDP 模拟人为点击）
 *
 * 业务背景：
 *   1. 我们 SPA 里的"职位"跟 BOSS 后台的 encryptJobId 是 1:1 映射
 *   2. 用户在 SPA 创建任务时已经选好了目标职位，对应一个 encryptJobId
 *   3. 打开 BOSS 推荐 tab 时虽然 URL 里带了 ?jobid=xxx，但 BOSS 实际渲染的可能是
 *      用户上次留下的 select 状态（或者首次加载时 URL 参数没生效），所以需要
 *      **主动点开顶部职位下拉 → 选中目标 <li>** 把 BOSS 强制切到我们要的职位
 *
 * 节奏 / dwell 设计（拟人化关键，总耗时 ≈ 31.5s）：
 *   - 打开 tab → 15s 初始 dwell（等 iframe + Vue + 反爬脚本稳定）
 *   - CDP click `.job-selecter-wrap` 打开下拉 → **15s 浏览 dwell**
 *     （人会扫一眼列表才挑目标；秒级点击是机器特征，BOSS 风控会盯）
 *   - CDP click `li.job-item[value=...]` 选中 → 1.5s settle 让 BOSS 拉新数据
 *
 * DOM 结构（位于 BOSS 推荐宿主页内嵌的 /web/frame/recommend iframe 中）：
 *
 *   .recommend-wrap
 *     └─ .candidate-head
 *         └─ .header-wrap
 *             └─ .job-selecter-wrap        ← 点这个打开职位下拉
 *                 └─ .ui-dropmenu(.expanding)
 *                     └─ .ui-dropmenu-list
 *                         └─ .job-list (ul)
 *                             └─ li.job-item[value="<encryptJobId>"]  ← 点这个选职位
 *                                 li.job-item.curr  当前选中的
 *
 *   `<li>` 的 `value` 属性就是 encryptJobId（跟我们 SPA 里的字段同源）
 *
 * 跨 iframe 处理：
 *   cdpInputDispatcher.findElement 内部会自动扫描主 frame + 同源 iframe，
 *   命中后用 `getBoundingClientRect()` + iframe offset 算出 viewport 绝对坐标，
 *   再发 CDP `Input.dispatchMouseEvent`。BOSS 推荐宿主 chat/recommend 跟内嵌
 *   /web/frame/recommend 同 zhipin.com 域，contentDocument 可读，**完美适配**。
 *
 * 风控基线：
 *   - 走 webContents.debugger 同进程 CDP（不开 --remote-debugging-port、不连 WS、
 *     不暴露 navigator.webdriver）
 *   - Input.dispatchMouseEvent 产生的事件 `isTrusted=true`
 *   - 节奏控制：打开 tab → 15s dwell → 点 select → 800ms 等下拉渲染 → 点 li →
 *     1.5s 等 BOSS 切职位并自动拉新数据，全程跟真实用户操作节奏接近
 *   - **不要**短时间内反复调本函数切换不同职位（明显爬虫节奏），切换间隔保持 10s+
 */

import notify from "src/util/notify";

const DEFAULT_INITIAL_DELAY_MS = 15_000;       // 打开 tab 后等多久才开始点（iframe + SPA + 反爬脚本稳定）
const DEFAULT_DROPDOWN_DWELL_MS = 15_000;      // 打开下拉后等多久才点目标 li（拟人化：人会扫一眼列表才选，
                                               // 同时也防止 BOSS 风控盯"打开下拉 → 立刻点"的机器节奏）
const DEFAULT_SELECT_SETTLE_MS = 1500;         // 选中 li 后等 BOSS 重新拉数据

/** 触发职位下拉的元素 selector（业务方可覆盖） */
const DEFAULT_TRIGGER_SELECTOR = ".job-selecter-wrap";

function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api &&
      window.api.automation &&
      typeof window.api.automation.clickOnTab === "function"
  );
}

/**
 * 给定 encryptJobId，构造下拉里那个 `<li>` 的 CSS selector。
 *
 * 用 attribute selector 精确匹配 value，不依赖 li 的 class / 顺序。
 * 注意 encryptJobId 里可能含特殊字符（实际看到的都是 alphanumeric+nZ80tq 这种
 * 安全字符，但仍用 CSS.escape 兜底）；CSS.escape 浏览器都有原生支持。
 */
function buildOptionSelector(encryptJobId) {
  // 浏览器侧不一定有 CSS.escape（renderer 里有），简单转义 " 兜底
  const safeId = String(encryptJobId).replace(/"/g, '\\"');
  return `.job-list li.job-item[value="${safeId}"]`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 在已打开的 BOSS 推荐 tab 上，主动点选指定 encryptJobId 的职位。
 *
 * 调用前提：
 *   - tabId 来自 `openBossRecommend(encryptJobId)` 的返回
 *   - 同一个 encryptJobId（URL 已经带过去了），本函数额外**保证** select UI 也切到对应职位
 *
 * @param {string} tabId
 * @param {string} encryptJobId  目标职位的 encryptJobId（DOM 里 li.job-item 的 value 属性值）
 * @param {object} [opts]
 * @param {number} [opts.initialDelayMs=15000]    打开后多久才开始点（建议 ≥10s 让 BOSS 完全加载）
 * @param {number} [opts.dropdownDwellMs=15000]   打开下拉后多久才点目标 li（≥15s 拟人化要求，
 *                                                别短于 5s——短时间内"打开下拉 → 立刻点"非常机器化）
 * @param {number} [opts.selectSettleMs=1500]
 * @param {string} [opts.triggerSelector=".job-selecter-wrap"]  触发下拉的元素 selector（可覆盖）
 * @param {(stage: string, payload?: object) => void} [opts.onProgress]  阶段回调
/**
 * 在打开的下拉列表里读出当前已选中职位（`<li class="job-item curr" value="...">`）的 encryptJobId。
 *
 * 跨 iframe 处理：主 frame 没找到再扫同源 iframe.contentDocument。
 *
 * 返回值：
 *   - { ok: true, value: encryptJobId, foundIn: 'mainFrame'|'iframe[i]' }
 *   - { ok: false, error: 'NO_CURR_FOUND' }   下拉还没渲染 / DOM 没找到 .curr
 */
async function readCurrentSelectedJobId(tabId) {
  const code = `
(function readCurr() {
  function find(doc) {
    var el = doc.querySelector('li.job-item.curr[value]');
    if (!el) return null;
    return el.getAttribute('value');
  }
  var v = find(document);
  if (v) return { ok: true, value: v, foundIn: 'mainFrame' };
  var iframes = document.querySelectorAll('iframe');
  for (var i = 0; i < iframes.length; i++) {
    try {
      var idoc = iframes[i].contentDocument;
      if (!idoc) continue;
      var v2 = find(idoc);
      if (v2) return { ok: true, value: v2, foundIn: 'iframe[' + i + ']' };
    } catch (e) {}
  }
  return { ok: false, error: 'NO_CURR_FOUND' };
})();
`;
  const res = await window.api.automation.evalOnTab({ tabId, code });
  if (!res?.ok) return { ok: false, error: `EVAL_FAILED: ${res?.error?.message}` };
  return res.result || { ok: false, error: "NO_RESULT" };
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   encryptJobId?: string,
 *   alreadySelected?: boolean,   // ★ 当前已经选中目标职位，没做 li click → 上层应该用 tab open 之前的 sinceTs 等首屏响应
 *   currentSelectedJobId?: string, // 探测到的当前选中（无论是否跟 target 一致）
 *   openDropdown?: { x: number, y: number, foundIn: string, elapsedMs: number },
 *   selectItem?: { x: number, y: number, foundIn: string, elapsedMs: number },  // alreadySelected=true 时为 null
 *   closeDropdown?: { x: number, y: number, foundIn: string, elapsedMs: number }, // alreadySelected=true 时关闭下拉的二次点击
 *   liClickedAt?: number,    // alreadySelected=false 时点击目标 li 之前一刻的 Date.now()，
 *                            // 调用方可作为 siteNetwork.waitForResponse 的 sinceTs，
 *                            // 确保等到的是 BOSS 因为切职位发的新 /rec/geek/list
 *   errorCode?: 'NOT_IN_CLIENT'|'BAD_REQUEST'|'OPEN_DROPDOWN_FAILED'|'SELECT_JOB_FAILED'|'EXCEPTION',
 *   message?: string,
 *   logs?: string[]
 * }>}
 */
export async function selectJobInBossRecommend(tabId, encryptJobId, opts = {}) {
  if (!isInElectronClient()) {
    return {
      ok: false,
      errorCode: "NOT_IN_CLIENT",
      message: "window.api.automation.clickOnTab 不可用（浏览器模式 / 旧版 preload）"
    };
  }
  if (!tabId || typeof tabId !== "string") {
    return { ok: false, errorCode: "BAD_REQUEST", message: "tabId required" };
  }
  if (!encryptJobId || typeof encryptJobId !== "string") {
    return { ok: false, errorCode: "BAD_REQUEST", message: "encryptJobId required" };
  }

  const initialDelayMs = Math.max(0, opts.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);
  // 兼容旧入参名 dropdownRenderMs（早期 API），优先用新的 dropdownDwellMs
  const dropdownDwellMs = Math.max(
    0,
    opts.dropdownDwellMs ?? opts.dropdownRenderMs ?? DEFAULT_DROPDOWN_DWELL_MS
  );
  const selectSettleMs = Math.max(0, opts.selectSettleMs ?? DEFAULT_SELECT_SETTLE_MS);
  const triggerSelector = opts.triggerSelector || DEFAULT_TRIGGER_SELECTOR;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};

  console.log(
    `[bossSelectJob] start tabId=${tabId} encryptJobId=${encryptJobId} ` +
      `initialDelay=${initialDelayMs}ms dropdownDwell=${dropdownDwellMs}ms ` +
      `selectSettle=${selectSettleMs}ms triggerSelector=${triggerSelector}`
  );

  try {
    // ============= Step 1: 初始 dwell（等 BOSS 完全稳定）=============
    //
    // BOSS 推荐宿主 chat/recommend 跳转后会：
    //   - 重新挂载 iframe /web/frame/recommend
    //   - iframe 内部跑大量 BOSS 自家 JS 初始化（include 反爬探针、Vue mount、首屏请求）
    //   - 顶部 `.job-selecter-wrap` 是 Vue 渲染的，DOM ready ≠ Vue 渲染完成
    //
    // 15s 是经验值（业务方要求）；如果你后续测试发现 10s 也稳，可以调小。
    onProgress("waiting", { delayMs: initialDelayMs });
    if (initialDelayMs > 0) {
      console.log(`[bossSelectJob] 等待 ${initialDelayMs}ms 让 iframe + Vue + 反爬脚本稳定`);
      await sleep(initialDelayMs);
    }

    // ============= Step 2: 点开职位下拉 =============
    //
    // selector `.job-selecter-wrap` 在 iframe 里。cdpInputDispatcher.findElement
    // 会自动扫主 frame → 同源 iframe，命中后用 iframe contentWindow + frameElement
    // 的 offset 算 viewport 绝对坐标，所以这里直接传 selector 就行。
    onProgress("openingDropdown", { selector: triggerSelector });
    console.log(`[bossSelectJob] CDP click ${triggerSelector}（打开职位下拉）`);
    const openRes = await window.api.automation.clickOnTab({
      tabId,
      selector: triggerSelector,
      pressHoldMs: 50,
      requireVisible: true
    });

    if (!openRes?.ok) {
      console.warn(
        "[bossSelectJob] 打开下拉失败:",
        openRes?.error?.code,
        openRes?.error?.message
      );
      return {
        ok: false,
        encryptJobId,
        errorCode: "OPEN_DROPDOWN_FAILED",
        message: `打开职位下拉失败（${openRes?.error?.code || "UNKNOWN"}）: ${openRes?.error?.message || ""}`,
        logs: openRes?.logs
      };
    }
    console.log(
      `[bossSelectJob] 下拉已打开 at (${openRes.data?.x},${openRes.data?.y}) in ${openRes.data?.foundIn}`
    );

    // ============= Step 3: 下拉打开后浏览 dwell（拟人化关键）=============
    //
    // BOSS 用 ui-dropmenu 组件，点 trigger 后会加 .expanding class + 渲染
    // .ui-dropmenu-list 下的 .job-list ul。渲染本身大概 100-300ms，但**不能**
    // 渲染完就立刻点目标 li——这是典型机器特征，BOSS 风控会盯。
    //
    // 默认 15s dwell 模拟真实用户「打开下拉 → 视线扫一遍列表 → 找到目标 → 点」
    // 的节奏。业务方可调小，但**强烈不建议低于 5s**。
    onProgress("browsingDropdown", { dwellMs: dropdownDwellMs });
    if (dropdownDwellMs > 0) {
      console.log(`[bossSelectJob] 下拉已打开，dwell ${dropdownDwellMs}ms 模拟人眼浏览列表`);
      await sleep(dropdownDwellMs);
    }

    // ============= Step 4: 读当前已选职位，判断是否需要 click target =============
    //
    // DOM 规律：`<li class="job-item curr" value="<encryptJobId>">` 上的 `curr` class
    // 标记 BOSS 当前选中的职位。下拉打开后这个 li 已渲染，可以直接 querySelector 读 value。
    //
    // 如果 currentSelectedJobId === target encryptJobId → 已经在目标职位上，
    // 点 li 也不会触发 BOSS 重新发 /wapi/zpjob/rec/geek/list（同 jobid，BOSS 不会重 fetch）。
    // → 这时**不要点 li**，直接关闭下拉。上层用 tab open 之前的 sinceTs 等首屏响应即可。
    //
    // 关闭下拉的方式：再次 CDP click `.job-selecter-wrap` toggle 关闭（BOSS ui-dropmenu 标准行为）。
    const currRead = await readCurrentSelectedJobId(tabId);
    const currentSelectedJobId = currRead?.ok ? currRead.value : null;
    console.log(
      `[bossSelectJob] 当前选中 currentJobId=${currentSelectedJobId} (foundIn=${currRead?.foundIn || "N/A"}), ` +
        `目标 targetJobId=${encryptJobId}, match=${currentSelectedJobId === encryptJobId}`
    );

    if (currentSelectedJobId && currentSelectedJobId === encryptJobId) {
      // ★ 已经选中目标 → 不点 li，关闭下拉
      console.log(`[bossSelectJob] ✅ 已经选中目标职位 → 跳过 li click，关闭下拉`);
      const closeRes = await window.api.automation.clickOnTab({
        tabId,
        selector: triggerSelector,
        pressHoldMs: 50,
        requireVisible: true
      });
      if (!closeRes?.ok) {
        // 关下拉失败不影响业务（下拉就在那里，后续 humanize 也无所谓）
        console.warn(
          `[bossSelectJob] 关闭下拉失败（忽略，业务不影响）：`,
          closeRes?.error?.code,
          closeRes?.error?.message
        );
      }
      onProgress("settling", { delayMs: selectSettleMs });
      if (selectSettleMs > 0) await sleep(selectSettleMs);
      onProgress("done");
      console.log(
        `[bossSelectJob] DONE alreadySelected=true encryptJobId=${encryptJobId} ` +
          `（不点 li，上层用 tab open 前的 sinceTs 等首屏响应）`
      );
      return {
        ok: true,
        encryptJobId,
        alreadySelected: true,
        currentSelectedJobId,
        openDropdown: openRes.data,
        selectItem: null,
        closeDropdown: closeRes?.data || null,
        logs: [...(openRes.logs || []), ...(closeRes?.logs || [])]
      };
    }

    // ============= Step 5: 点选目标 <li>（current !== target 或读不到 .curr）=============
    const optionSelector = buildOptionSelector(encryptJobId);
    onProgress("selectingItem", { selector: optionSelector });
    console.log(
      `[bossSelectJob] CDP click ${optionSelector}（切换：${currentSelectedJobId || "未知"} → ${encryptJobId}）`
    );
    // 记录 li click 之前的时间戳，给上层 waitForResponse 当 sinceTs。
    // BOSS 点 li 后会发 /wapi/zpjob/rec/geek/list 拉新职位数据，
    // 这个时间戳能保证 waitForResponse 只接收"click 之后"的响应，避免
    // 命中页面初始加载时的旧首屏数据。
    const liClickedAt = Date.now();
    const selectRes = await window.api.automation.clickOnTab({
      tabId,
      selector: optionSelector,
      pressHoldMs: 50,
      requireVisible: true
    });

    if (!selectRes?.ok) {
      console.warn(
        "[bossSelectJob] 选中目标职位失败:",
        selectRes?.error?.code,
        selectRes?.error?.message
      );
      return {
        ok: false,
        encryptJobId,
        alreadySelected: false,
        currentSelectedJobId,
        openDropdown: openRes.data,
        liClickedAt,
        errorCode: "SELECT_JOB_FAILED",
        message:
          `选中职位失败（${selectRes?.error?.code || "UNKNOWN"}）: ${selectRes?.error?.message || ""}。` +
          `可能原因：encryptJobId 在 BOSS 下拉列表中不存在 / 下拉未展开 / iframe 未加载完成`,
        logs: selectRes?.logs
      };
    }
    console.log(
      `[bossSelectJob] 已选中 at (${selectRes.data?.x},${selectRes.data?.y}) in ${selectRes.data?.foundIn}`
    );

    // ============= Step 6: 等 BOSS 切职位 + 拉新数据稳定 =============
    onProgress("settling", { delayMs: selectSettleMs });
    if (selectSettleMs > 0) {
      await sleep(selectSettleMs);
    }

    onProgress("done");
    console.log(`[bossSelectJob] DONE encryptJobId=${encryptJobId} liClickedAt=${liClickedAt}`);
    return {
      ok: true,
      encryptJobId,
      alreadySelected: false,
      currentSelectedJobId,
      openDropdown: openRes.data,
      selectItem: selectRes.data,
      liClickedAt,
      logs: [...(openRes.logs || []), ...(selectRes.logs || [])]
    };
  } catch (e) {
    console.error("[bossSelectJob] 异常:", e);
    return {
      ok: false,
      encryptJobId,
      errorCode: "EXCEPTION",
      message: e?.message || String(e)
    };
  }
}

/**
 * 便捷封装：从 SPA 拿到 encryptJobId 后，一站式
 *   1) 打开 BOSS 推荐 tab（如果没开）
 *   2) 主动选中目标职位
 *   3) （可选）等首屏 /wapi/zpjob/rec/geek/list 响应
 *
 * 跟 `fetchBossRecommendList` 的区别：
 *   - fetchBossRecommendList：打开 → 被动等 BOSS 自家 SPA 因 URL 触发的首屏请求
 *   - openAndSelectBossRecommend（本函数）：打开 → 等 15s → 主动 click select 切职位 →
 *                                          等 select 切换触发的新首屏请求
 *
 * 用 `openAndSelectBossRecommend` 时，URL 里也带 ?jobid=... 是无害的（BOSS 会先按
 * URL 渲染一次，15s 后我们 click 把 select 切到同一职位 → 没切换效果，但保证
 * UI 一致性 + 触发一次稳定的数据刷新）。
 *
 * @param {object} args
 * @param {string} args.encryptJobId
 * @param {number} [args.waitFirstPageMs]  等首屏响应的超时；不传则不等
 * @param {object} [args.selectOpts]       透传到 selectJobInBossRecommend
 * @param {object} [args.urlOpts]          透传到 openBossRecommend
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   select?: object,
 *   firstPage?: object,
 *   errorCode?: string,
 *   message?: string
 * }>}
 */
export async function openAndSelectBossRecommend(args) {
  const { encryptJobId, waitFirstPageMs, selectOpts, urlOpts } = args || {};
  if (!encryptJobId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "encryptJobId required" };
  }

  // 1) 打开 tab（直接复用 bossRecommend.openBossRecommend）
  //
  // 用动态 import 是为了让循环依赖更宽松——本模块跟 bossRecommend.js 同目录，但
  // bossRecommend.js 后续可能反向调用 selectJobInBossRecommend；静态 import 容易
  // 撞循环。
  const { openBossRecommend } = await import("src/util/automation/bossRecommend");
  const opened = await openBossRecommend(encryptJobId, urlOpts);
  if (!opened.ok) return opened;

  // 2) 主动点选职位（核心：15s dwell + click select + click li）
  const selectRes = await selectJobInBossRecommend(opened.tabId, encryptJobId, selectOpts);
  if (!selectRes.ok) {
    // 选中失败不抛错——已经打开 tab 了，业务方可以决定要不要 fallback 到被动模式
    notify.warning?.(`BOSS 自动选中职位失败：${selectRes.message || selectRes.errorCode}`);
    return {
      ok: false,
      tabId: opened.tabId,
      url: opened.url,
      select: selectRes,
      errorCode: selectRes.errorCode,
      message: selectRes.message
    };
  }

  // 3) 可选：等首屏响应
  let firstPage = null;
  if (Number(waitFirstPageMs) > 0 && window?.api?.siteNetwork?.waitForResponse) {
    const wait = await window.api.siteNetwork.waitForResponse({
      siteKey: "boss",
      urlPattern: "/wapi/zpjob/rec/geek/list",
      timeoutMs: Number(waitFirstPageMs)
    });
    if (wait?.ok) {
      firstPage = wait;
    } else {
      console.warn("[bossSelectJob] 等首屏响应超时:", wait?.error);
    }
  }

  return {
    ok: true,
    tabId: opened.tabId,
    url: opened.url,
    select: selectRes,
    firstPage
  };
}
