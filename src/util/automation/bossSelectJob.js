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
 * 节奏设计（按 DOM 就绪动态推进，15s 仅作为兜底上限）：
 *   - 打开 tab → 等 `.job-selecter-wrap` 出现、可见并连续稳定约 120ms
 *   - CDP click `.job-selecter-wrap` 打开下拉 → 等列表节点和 `.curr` 渲染完成
 *   - 目标职位不在下拉可视区时，先滚动职位列表 → CDP click `li.job-item[value=...]`
 *   - 点击后立即轮询 `.curr`，确认切到目标职位就返回，避免固定等待
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
 *   - 节奏控制：DOM 就绪即继续，15s 只是页面加载/下拉渲染的兜底超时；
 *     点击后立即校验职位切换，成功即返回
 *   - **不要**短时间内反复调本函数切换不同职位（明显爬虫节奏），切换间隔保持 10s+
 */

import notify from "src/util/notify";
import { normalizeBossJobId } from "src/util/bossSearchFilters";

const DEFAULT_INITIAL_WAIT_TIMEOUT_MS = 15_000;    // 页面 DOM 就绪的最长等待，命中后提前继续
const DEFAULT_DROPDOWN_READY_TIMEOUT_MS = 15_000;  // 下拉 DOM 就绪的最长等待，命中后提前继续
const DEFAULT_DOM_STABLE_MS = 120;                 // 同一 DOM 状态连续稳定后认为可操作
const DEFAULT_DROPDOWN_BROWSE_MS = 180;            // 下拉出现后的轻微视线停留
const DEFAULT_SELECT_VERIFY_TIMEOUT_MS = 3_000;    // 点击后校验切换的最长等待
const CURRENT_JOB_READ_TIMEOUT_MS = 3_000;
const TARGET_JOB_REVEAL_TIMEOUT_MS = 3_000;

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

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 等职位选择器出现、可见并短暂稳定。页面加载完成就立即返回，不再固定 sleep 15s。
 */
async function waitForBossJobPageReady(tabId, triggerSelector, timeoutMs, stableMs) {
  const code = `
(function waitForBossJobPageReady() {
  var selector = ${JSON.stringify(triggerSelector)};
  var timeoutMs = ${Number(timeoutMs) || 0};
  var stableMs = ${Number(stableMs) || 0};
  var startedAt = Date.now();

  function documents() {
    var result = [{ doc: document, label: 'mainFrame', src: location.href }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({
            doc: iframes[i].contentDocument,
            label: iframes[i].src || ('iframe[' + i + ']'),
            src: iframes[i].src || ''
          });
        }
      } catch (e) {}
    }
    return result;
  }

  function readState() {
    var docs = documents();
    var diagnostics = [];
    for (var i = 0; i < docs.length; i++) {
      var el = docs[i].doc.querySelector(selector);
      if (!el) {
        diagnostics.push(docs[i].label + ': element=null');
        continue;
      }
      var style = el.ownerDocument.defaultView.getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      var visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden';
      diagnostics.push(
        docs[i].label + ': element=found size=' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
        ' display=' + style.display + ' visibility=' + style.visibility
      );
      if (!visible) continue;
      return {
        found: true,
        foundIn: docs[i].label,
        iframeSrc: docs[i].src || '',
        width: rect.width,
        height: rect.height,
        diagnostics: diagnostics
      };
    }
    return { found: false, diagnostics: diagnostics };
  }

  return new Promise(function(resolve) {
    var lastSignature = '';
    var stableSince = 0;
    var lastState = null;

    function poll() {
      var now = Date.now();
      var state = readState();
      if (state && state.found) {
        var signature = state.foundIn + '|' + state.iframeSrc + '|' + Math.round(state.width) + 'x' + Math.round(state.height);
        if (signature !== lastSignature) {
          lastSignature = signature;
          stableSince = now;
        } else if (now - stableSince >= stableMs) {
          resolve(Object.assign({ ok: true, elapsedMs: now - startedAt }, state));
          return;
        }
        lastState = state;
      } else {
        lastSignature = '';
        stableSince = 0;
        lastState = null;
      }

      if (now - startedAt >= timeoutMs) {
        resolve({
          ok: false,
          timedOut: true,
          elapsedMs: now - startedAt,
          lastState: lastState,
          diagnostics: state && state.diagnostics ? state.diagnostics : []
        });
        return;
      }
      setTimeout(poll, 60);
    }

    poll();
  });
})();
`;
  const res = await withTimeout(
    window.api.automation.evalOnTab({ tabId, code, awaitPromise: true }),
    Math.max(2_000, Number(timeoutMs) + 2_000),
    `等待 BOSS 职位选择器就绪超时（${timeoutMs}ms）`
  );
  if (!res?.ok) {
    return { ok: false, error: `EVAL_FAILED: ${res?.error?.message || "UNKNOWN"}` };
  }
  return res.result || { ok: false, error: "NO_RESULT" };
}

/**
 * 等下拉真正展开且职位列表完成首帧渲染。DOM 条件满足后立即返回。
 */
async function waitForBossJobDropdownReady(
  tabId,
  triggerSelector,
  timeoutMs,
  stableMs
) {
  const code = `
(function waitForBossJobDropdownReady() {
  var triggerSelector = ${JSON.stringify(triggerSelector)};
  var timeoutMs = ${Number(timeoutMs) || 0};
  var stableMs = ${Number(stableMs) || 0};
  var startedAt = Date.now();

  function documents() {
    var result = [{ doc: document, label: 'mainFrame', src: location.href }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({
            doc: iframes[i].contentDocument,
            label: iframes[i].src || ('iframe[' + i + ']'),
            src: iframes[i].src || ''
          });
        }
      } catch (e) {}
    }
    return result;
  }

  function readState() {
    var docs = documents();
    for (var i = 0; i < docs.length; i++) {
      var wrapper = docs[i].doc.querySelector(triggerSelector);
      if (!wrapper) continue;

      var list = wrapper.querySelector('.ui-dropmenu-list');
      if (!list) continue;
      var wrapperStyle = wrapper.ownerDocument.defaultView.getComputedStyle(wrapper);
      var listStyle = list.ownerDocument.defaultView.getComputedStyle(list);
      var listRect = list.getBoundingClientRect();
      var openedClass = wrapper.classList.contains('ui-dropmenu-visible');
      var listVisible =
        listRect.width > 0 &&
        listRect.height > 0 &&
        listStyle.display !== 'none' &&
        listStyle.visibility !== 'hidden';
      if (!openedClass || !listVisible) continue;

      var items = wrapper.querySelectorAll('.job-list li.job-item[value]');
      if (items.length === 0) continue;
      var current = wrapper.querySelector('.job-list li.job-item.curr[value]');
      var currentId = current ? current.getAttribute('value') : '';

      return {
        found: true,
        foundIn: docs[i].label,
        iframeSrc: docs[i].src || '',
        itemCount: items.length,
        currentSelectedJobId: currentId,
        wrapperClass: wrapper.className || '',
        wrapperVisibility: wrapperStyle.visibility
      };
    }
    return null;
  }

  return new Promise(function(resolve) {
    var lastSignature = '';
    var stableSince = 0;
    var lastState = null;

    function poll() {
      var now = Date.now();
      var state = readState();
      if (state) {
        var signature = state.foundIn + '|' + state.iframeSrc + '|' + state.itemCount + '|' + state.currentSelectedJobId + '|' + state.wrapperClass;
        if (signature !== lastSignature) {
          lastSignature = signature;
          stableSince = now;
        } else if (now - stableSince >= stableMs) {
          resolve(Object.assign({ ok: true, elapsedMs: now - startedAt }, state));
          return;
        }
        lastState = state;
      } else {
        lastSignature = '';
        stableSince = 0;
        lastState = null;
      }

      if (now - startedAt >= timeoutMs) {
        resolve({
          ok: false,
          timedOut: true,
          elapsedMs: now - startedAt,
          lastState: lastState
        });
        return;
      }
      setTimeout(poll, 60);
    }

    poll();
  });
})();
`;
  const res = await withTimeout(
    window.api.automation.evalOnTab({ tabId, code, awaitPromise: true }),
    Math.max(2_000, Number(timeoutMs) + 2_000),
    `等待 BOSS 职位下拉就绪超时（${timeoutMs}ms）`
  );
  if (!res?.ok) {
    return { ok: false, error: `EVAL_FAILED: ${res?.error?.message || "UNKNOWN"}` };
  }
  return res.result || { ok: false, error: "NO_RESULT" };
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
 * @param {number} [opts.initialWaitTimeoutMs=15000]  页面 DOM 就绪的最长等待，就绪即继续
 * @param {number} [opts.initialDelayMs]              initialWaitTimeoutMs 的兼容别名
 * @param {number} [opts.dropdownReadyTimeoutMs=15000] 下拉 DOM 就绪的最长等待，就绪即继续
 * @param {number} [opts.dropdownDwellMs]             dropdownReadyTimeoutMs 的兼容别名
 * @param {number} [opts.domStableMs=120]              DOM 状态稳定窗口
 * @param {number} [opts.dropdownBrowseMs=180]         下拉出现后的轻微视线停留
 * @param {number} [opts.selectVerifyTimeoutMs=3000]   点击后校验职位切换的最长等待
 * @param {number} [opts.selectSettleMs]              selectVerifyTimeoutMs 的兼容别名
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
  const res = await withTimeout(
    window.api.automation.evalOnTab({ tabId, code }),
    CURRENT_JOB_READ_TIMEOUT_MS,
    `读取当前职位超时（${CURRENT_JOB_READ_TIMEOUT_MS}ms）`
  );
  if (!res?.ok) return { ok: false, error: `EVAL_FAILED: ${res?.error?.message}` };
  return res.result || { ok: false, error: "NO_RESULT" };
}

/**
 * 把目标职位项在 BOSS 下拉自身的滚动容器中滚到可视区。
 *
 * clickOnTab 只用元素中心点发送 CDP 鼠标事件，并且当前可见性判断只看 iframe
 * viewport。职位列表很长时，靠下 li 虽然仍在 DOM 中，但会被 `.ui-dropmenu-list`
 * / `.job-selecter-options` 的内部 overflow 裁切；此时直接按 li 中心坐标点击会
 * 落到下拉框下面的页面区域。这里只滚动 DOM，点击仍然走 clickOnTab。
 */
async function revealTargetJobOption(tabId, optionSelector) {
  const code = `
(function revealTargetJobOption() {
  var selector = ${JSON.stringify(optionSelector)};
  var docs = [{ doc: document, label: 'mainFrame' }];
  var iframes = document.querySelectorAll('iframe');
  for (var i = 0; i < iframes.length; i++) {
    try {
      if (iframes[i].contentDocument) {
        docs.push({ doc: iframes[i].contentDocument, label: iframes[i].src || ('iframe[' + i + ']') });
      }
    } catch (e) {}
  }

  function findScroller(el) {
    var node = el.parentElement;
    var fallback = null;
    while (node && node !== node.ownerDocument.body) {
      var style = node.ownerDocument.defaultView.getComputedStyle(node);
      var overflowY = style.overflowY;
      if (node.matches('.job-selecter-options, .ui-dropmenu-list')) {
        fallback = node;
      }
      if (
        node.scrollHeight > node.clientHeight + 1 &&
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return fallback;
  }

  for (var di = 0; di < docs.length; di++) {
    var el = docs[di].doc.querySelector(selector);
    if (!el) continue;

    var scroller = findScroller(el);
    if (!scroller) {
      return {
        found: true,
        visible: false,
        foundIn: docs[di].label,
        error: 'SCROLL_CONTAINER_NOT_FOUND'
      };
    }

    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

    var margin = 8;
    var targetRect = el.getBoundingClientRect();
    var scrollerRect = scroller.getBoundingClientRect();
    if (targetRect.top < scrollerRect.top + margin) {
      scroller.scrollTop += targetRect.top - scrollerRect.top - margin;
    } else if (targetRect.bottom > scrollerRect.bottom - margin) {
      scroller.scrollTop += targetRect.bottom - scrollerRect.bottom + margin;
    }

    targetRect = el.getBoundingClientRect();
    scrollerRect = scroller.getBoundingClientRect();
    var visible =
      targetRect.width > 0 &&
      targetRect.height > 0 &&
      targetRect.top >= scrollerRect.top - 1 &&
      targetRect.bottom <= scrollerRect.bottom + 1;

    return {
      found: true,
      visible: visible,
      foundIn: docs[di].label,
      scrollTop: scroller.scrollTop,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      scrollerTop: scrollerRect.top,
      scrollerBottom: scrollerRect.bottom
    };
  }

  return { found: false, visible: false };
})();
`;
  const res = await withTimeout(
    window.api.automation.evalOnTab({ tabId, code }),
    TARGET_JOB_REVEAL_TIMEOUT_MS,
    `滚动目标职位超时（${TARGET_JOB_REVEAL_TIMEOUT_MS}ms）`
  );
  if (!res?.ok) {
    return {
      found: false,
      visible: false,
      error: `EVAL_FAILED: ${res?.error?.message || "UNKNOWN"}`
    };
  }
  return res.result || { found: false, visible: false, error: "NO_RESULT" };
}

async function waitForSelectedJob(tabId, encryptJobId, timeoutMs) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  let lastRead = null;
  do {
    try {
      lastRead = await readCurrentSelectedJobId(tabId);
      if (lastRead?.ok && lastRead.value === encryptJobId) {
        return { ok: true, value: lastRead.value, read: lastRead };
      }
    } catch (error) {
      lastRead = { ok: false, error: error?.message || String(error) };
    }
    if (Date.now() >= deadline) break;
    await sleep(200);
  } while (Date.now() <= deadline);
  return {
    ok: false,
    value: lastRead?.ok ? lastRead.value : null,
    read: lastRead
  };
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
  encryptJobId = normalizeBossJobId(encryptJobId);
  if (!encryptJobId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "encryptJobId required" };
  }

  const initialWaitTimeoutMs = Math.max(
    0,
    opts.initialWaitTimeoutMs ?? opts.initialDelayMs ?? DEFAULT_INITIAL_WAIT_TIMEOUT_MS
  );
  const dropdownReadyTimeoutMs = Math.max(
    0,
    opts.dropdownReadyTimeoutMs ??
      opts.dropdownDwellMs ??
      opts.dropdownRenderMs ??
      DEFAULT_DROPDOWN_READY_TIMEOUT_MS
  );
  const domStableMs = Math.max(0, opts.domStableMs ?? DEFAULT_DOM_STABLE_MS);
  const dropdownBrowseMs = Math.max(
    0,
    opts.dropdownBrowseMs ?? DEFAULT_DROPDOWN_BROWSE_MS
  );
  const selectVerifyTimeoutMs = Math.max(
    0,
    opts.selectVerifyTimeoutMs ?? opts.selectSettleMs ?? DEFAULT_SELECT_VERIFY_TIMEOUT_MS
  );
  const triggerSelector = opts.triggerSelector || DEFAULT_TRIGGER_SELECTOR;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};

  console.log(
    "[任务流程]", `[bossSelectJob] start tabId=${tabId} encryptJobId=${encryptJobId} ` +
      `initialWaitTimeout=${initialWaitTimeoutMs}ms dropdownReadyTimeout=${dropdownReadyTimeoutMs}ms ` +
      `domStable=${domStableMs}ms dropdownBrowse=${dropdownBrowseMs}ms ` +
      `selectVerifyTimeout=${selectVerifyTimeoutMs}ms triggerSelector=${triggerSelector}`
  );

  const startJitterMs = randomBetween(1000, 3000);
  console.log(`[任务流程] [bossSelectJob] 选择职位前随机等待 ${startJitterMs}ms`);
  await sleep(startJitterMs);

  try {
    // ============= Step 1: 等职位选择器 DOM 就绪 =============
    //
    // BOSS 宿主页会先挂载 iframe，再做 Vue 渲染和 jobid 同步。这里不固定 sleep，
    // 而是等待 `.job-selecter-wrap` 真实可见并连续稳定一段时间；15s 只是兜底上限。
    onProgress("waiting", {
      timeoutMs: initialWaitTimeoutMs,
      stableMs: domStableMs,
      strategy: "dom-ready"
    });
    console.log(
      `[任务流程] [bossSelectJob] 等待 ${triggerSelector} 的 DOM 就绪 ` +
        `(timeout=${initialWaitTimeoutMs}ms stable=${domStableMs}ms)`
    );
    const pageReady = await waitForBossJobPageReady(
      tabId,
      triggerSelector,
      initialWaitTimeoutMs,
      domStableMs
    );
    if (!pageReady.ok) {
      const message =
        `等待 BOSS 职位选择器就绪失败: ${pageReady.error || "TIMEOUT"} ` +
        `elapsed=${pageReady.elapsedMs || 0}ms`;
      console.warn("[任务流程] [bossSelectJob]", message, pageReady);
      return {
        ok: false,
        encryptJobId,
        errorCode: "OPEN_DROPDOWN_FAILED",
        message
      };
    }
    console.log(
      `[任务流程] [bossSelectJob] 职位选择器已就绪 elapsed=${pageReady.elapsedMs}ms ` +
        `foundIn=${pageReady.foundIn} iframe=${pageReady.iframeSrc || "(main)"}`
    );

    // ============= Step 2: 点开职位下拉 =============
    //
    // selector `.job-selecter-wrap` 在 iframe 里。cdpInputDispatcher.findElement
    // 会自动扫主 frame → 同源 iframe，命中后用 iframe contentWindow + frameElement
    // 的 offset 算 viewport 绝对坐标，所以这里直接传 selector 就行。
    onProgress("openingDropdown", { selector: triggerSelector });
    console.log(`[任务流程] [bossSelectJob] CDP click ${triggerSelector}（打开职位下拉）`);
    const openRes = await window.api.automation.clickOnTab({
      tabId,
      selector: triggerSelector,
      pressHoldMs: 50,
      requireVisible: true
    });

    if (!openRes?.ok) {
      console.warn(
        "[任务流程] [bossSelectJob] 打开下拉失败:",
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
      `[任务流程] [bossSelectJob] 下拉已打开 at (${openRes.data?.x},${openRes.data?.y}) in ${openRes.data?.foundIn}`
    );

    // ============= Step 3: 等下拉和职位节点完成渲染 =============
    //
    // BOSS 点 trigger 后会加 .ui-dropmenu-visible/.expanding，并渲染
    // `.job-list li.job-item`。这里等到可见下拉、职位节点和稳定状态同时满足，
    // 再保留一个很短的浏览停留用于界面稳定。
    onProgress("browsingDropdown", {
      timeoutMs: dropdownReadyTimeoutMs,
      stableMs: domStableMs,
      browseMs: dropdownBrowseMs,
      strategy: "dropdown-dom-ready"
    });
    console.log(
      `[任务流程] [bossSelectJob] 等待职位下拉 DOM 就绪 ` +
        `(timeout=${dropdownReadyTimeoutMs}ms stable=${domStableMs}ms)`
    );
    const dropdownReady = await waitForBossJobDropdownReady(
      tabId,
      triggerSelector,
      dropdownReadyTimeoutMs,
      domStableMs
    );
    if (!dropdownReady.ok) {
      const message =
        `等待 BOSS 职位下拉渲染失败: ${dropdownReady.error || "TIMEOUT"} ` +
        `elapsed=${dropdownReady.elapsedMs || 0}ms`;
      console.warn("[任务流程] [bossSelectJob]", message, dropdownReady);
      return {
        ok: false,
        encryptJobId,
        errorCode: "OPEN_DROPDOWN_FAILED",
        message,
        logs: openRes.logs
      };
    }
    console.log(
      `[任务流程] [bossSelectJob] 职位下拉已就绪 elapsed=${dropdownReady.elapsedMs}ms ` +
        `items=${dropdownReady.itemCount} current=${dropdownReady.currentSelectedJobId || "未知"}`
    );
    if (dropdownBrowseMs > 0) await sleep(dropdownBrowseMs);

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
    let currRead = dropdownReady.currentSelectedJobId
      ? {
          ok: true,
          value: dropdownReady.currentSelectedJobId,
          foundIn: dropdownReady.foundIn
        }
      : null;
    if (!currRead) {
      console.log("[任务流程] [bossSelectJob] 下拉已渲染但未读到当前职位，追加读取（最多 3s）");
      try {
        currRead = await readCurrentSelectedJobId(tabId);
      } catch (error) {
        // 读取当前职位只是优化项，不能阻塞后续目标职位点击。
        console.warn(
          "[任务流程] [bossSelectJob] 读取当前已选职位失败，继续点击目标职位:",
          error?.message || error
        );
        currRead = { ok: false, error: "CURRENT_JOB_READ_TIMEOUT" };
      }
    }
    const currentSelectedJobId = currRead?.ok ? currRead.value : null;
    console.log(
      "[任务流程]", `[bossSelectJob] 当前选中 currentJobId=${currentSelectedJobId} (foundIn=${currRead?.foundIn || "N/A"}), ` +
        `目标 targetJobId=${encryptJobId}, match=${currentSelectedJobId === encryptJobId}`
    );

    if (currentSelectedJobId && currentSelectedJobId === encryptJobId) {
      // ★ 已经选中目标 → 不点 li，关闭下拉
      console.log(`[任务流程] [bossSelectJob] ✅ 已经选中目标职位 → 跳过 li click，关闭下拉`);
      const closeRes = await window.api.automation.clickOnTab({
        tabId,
        selector: triggerSelector,
        pressHoldMs: 50,
        requireVisible: true
      });
      if (!closeRes?.ok) {
        // 关下拉失败不影响业务（下拉就在那里，后续 humanize 也无所谓）
        console.warn(
          `[任务流程] [bossSelectJob] 关闭下拉失败（忽略，业务不影响）：`,
          closeRes?.error?.code,
          closeRes?.error?.message
        );
      }
      onProgress("done", { alreadySelected: true, elapsedMs: 0 });
      console.log(
        "[任务流程]", `[bossSelectJob] DONE alreadySelected=true encryptJobId=${encryptJobId} ` +
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
      `[任务流程] [bossSelectJob] 准备选择 ${optionSelector}（切换：${currentSelectedJobId || "未知"} → ${encryptJobId}）`
    );

    const revealRes = await revealTargetJobOption(tabId, optionSelector);
    if (!revealRes.found || !revealRes.visible) {
      const selectionErrorCode = revealRes.found
        ? "TARGET_JOB_NOT_VISIBLE"
        : "TARGET_JOB_NOT_FOUND";
      const message = revealRes.found
        ? `目标职位已找到，但无法滚动到下拉可视区: ${JSON.stringify(revealRes)}`
        : `目标职位不在 BOSS 职位下拉列表中（targetJobId=${encryptJobId}）: ${revealRes.error || "NOT_FOUND"}`;
      console.warn("[任务流程] [bossSelectJob] 定位目标职位失败:", message);
      return {
        ok: false,
        encryptJobId,
        alreadySelected: false,
        currentSelectedJobId,
        openDropdown: openRes.data,
        errorCode: "SELECT_JOB_FAILED",
        selectionErrorCode,
        message,
        logs: openRes.logs
      };
    }
    console.log(
      `[任务流程] [bossSelectJob] 目标职位已滚入可视区 scrollTop=${revealRes.scrollTop} ` +
        `target=${revealRes.targetTop}-${revealRes.targetBottom} ` +
        `container=${revealRes.scrollerTop}-${revealRes.scrollerBottom}`
    );
    await sleep(150);

    // 记录 li click 之前的时间戳，给上层 waitForResponse 当 sinceTs。
    // BOSS 点 li 后会发 /wapi/zpjob/rec/geek/list 拉新职位数据，
    // 这个时间戳能保证 waitForResponse 只接收"click 之后"的响应，避免
    // 命中页面初始加载时的旧首屏数据。必须在滚动完成后记录。
    const liClickedAt = Date.now();
    const selectRes = await window.api.automation.clickOnTab({
      tabId,
      selector: optionSelector,
      pressHoldMs: 50,
      requireVisible: true
    });

    if (!selectRes?.ok) {
      console.warn(
        "[任务流程] [bossSelectJob] 选中目标职位失败:",
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
      `[任务流程] [bossSelectJob] 已发送 CDP click at (${selectRes.data?.x},${selectRes.data?.y}) in ${selectRes.data?.foundIn}`
    );

    // ============= Step 6: 等 BOSS 真正切到目标职位 =============
    onProgress("settling", {
      timeoutMs: selectVerifyTimeoutMs,
      strategy: "poll-current-job"
    });

    // clickOnTab 只代表鼠标事件发送成功，不代表页面状态已经切换。
    // 这里不再固定等待，立即轮询 `.curr`；一旦切到目标就继续。
    const verifyRes = await waitForSelectedJob(
      tabId,
      encryptJobId,
      selectVerifyTimeoutMs
    );
    if (!verifyRes.ok) {
      const message =
        `点击目标职位后未完成切换，当前职位=${verifyRes.value || "未知"}，` +
        `目标职位=${encryptJobId}`;
      console.warn("[任务流程] [bossSelectJob] 职位切换校验失败:", message);
      return {
        ok: false,
        encryptJobId,
        alreadySelected: false,
        currentSelectedJobId: verifyRes.value || currentSelectedJobId,
        openDropdown: openRes.data,
        liClickedAt,
        errorCode: "SELECT_JOB_FAILED",
        selectionErrorCode: "SELECTION_NOT_APPLIED",
        message,
        logs: [...(openRes.logs || []), ...(selectRes.logs || [])]
      };
    }

    onProgress("done");
    console.log(`[任务流程] [bossSelectJob] DONE encryptJobId=${encryptJobId} liClickedAt=${liClickedAt}`);
    return {
      ok: true,
      encryptJobId,
      alreadySelected: false,
      currentSelectedJobId,
      selectedJobId: verifyRes.value,
      openDropdown: openRes.data,
      selectItem: selectRes.data,
      liClickedAt,
      logs: [...(openRes.logs || []), ...(selectRes.logs || [])]
    };
  } catch (e) {
    console.error("[任务流程] [bossSelectJob] 异常:", e);
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
 *   - openAndSelectBossRecommend（本函数）：打开 → 等职位 DOM 就绪 → 主动 click select 切职位 →
 *                                          等 select 切换触发的新首屏请求
 *
 * 用 `openAndSelectBossRecommend` 时，URL 里也带 ?jobid=... 是无害的（BOSS 会先按
 * URL 渲染一次；选择器 DOM 就绪后我们 click 把 select 切到同一职位，保证
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
      console.warn("[任务流程] [bossSelectJob] 等首屏响应超时:", wait?.error);
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
