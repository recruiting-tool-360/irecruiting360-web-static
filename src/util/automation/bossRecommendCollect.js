/**
 * BOSS 推荐牛人：逐个打开候选人详情并通过页面真实点击完成收藏。
 *
 * DOM（2026-08-03 实测）：
 *   - 列表卡片：.card-inner.common-wrap[data-geekid="<encryptGeekId>"]
 *   - 详情容器：.lib-standard-resume.with-right-side
 *   - 收藏按钮：.resume-right-side .like-icon-and-text
 *   - 已收藏：.like-icon.like-icon-active + 文案「已收藏」
 *   - 关闭按钮：.close-btn
 *
 * 点击统一走 automation.clickOnTab（CDP Input.dispatchMouseEvent，isTrusted=true），
 * evalOnTab 只用于读取 DOM、滚动和等待状态，禁止在页面上下文调用 el.click()。
 */

const CARD_SELECTOR_PREFIX =
  ".candidate-recommend .card-inner.common-wrap[data-geekid=";
const DETAIL_SELECTOR = ".lib-standard-resume.with-right-side";
const COLLECT_SELECTOR = ".resume-right-side .like-icon-and-text";
const CLOSE_SELECTOR = ".close-btn";

const DETAIL_OPEN_TIMEOUT_MS = 8_000;
const COLLECT_STATE_TIMEOUT_MS = 6_000;
const DETAIL_CLOSE_TIMEOUT_MS = 4_000;
const MAX_COLLECT_RETRIES = 1;

function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api?.automation &&
      typeof window.api.automation.evalOnTab === "function" &&
      typeof window.api.automation.clickOnTab === "function"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function normalizeGeekId(value) {
  return String(value == null ? "" : value).replace(/~+$/, "");
}

function getGeekId(geek) {
  return String(
    geek?.encryptGeekId ||
      geek?.geekId ||
      geek?.geekCard?.encryptGeekId ||
      geek?.geekCard?.geekId ||
      ""
  );
}

function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildCardSelector(geekId) {
  return `${CARD_SELECTOR_PREFIX}"${escapeAttributeValue(geekId)}"]`;
}

async function evalOnTab(tabId, code, awaitPromise = false) {
  const res = await window.api.automation.evalOnTab({
    tabId,
    code,
    awaitPromise,
  });
  if (!res?.ok) {
    throw new Error(
      `evalOnTab failed (${res?.error?.code || "UNKNOWN"}): ${
        res?.error?.message || ""
      }`
    );
  }
  return res.result;
}

async function clickOnTab(tabId, selector, pressHoldMs = 70) {
  const res = await window.api.automation.clickOnTab({
    tabId,
    selector,
    pressHoldMs,
    requireVisible: true,
  });
  if (!res?.ok) {
    throw new Error(
      `clickOnTab failed (${res?.error?.code || "UNKNOWN"}): ${
        res?.error?.message || ""
      }`
    );
  }
  return res.data;
}

function buildScrollCardScript(geekId) {
  return `
(async function scrollBossRecommendCard() {
  var wanted = ${JSON.stringify(normalizeGeekId(geekId))};
  function norm(value) { return String(value == null ? '' : value).replace(/~+$/, ''); }
  function documents() {
    var out = [{ doc: document, win: window, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          out.push({
            doc: iframes[i].contentDocument,
            win: iframes[i].contentWindow || window,
            label: iframes[i].src || ('iframe[' + i + ']')
          });
        }
      } catch (e) {}
    }
    return out;
  }
  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var cards = docs[di].doc.querySelectorAll('.candidate-recommend .card-inner.common-wrap[data-geekid]');
    for (var ci = 0; ci < cards.length; ci++) {
      if (norm(cards[ci].dataset.geekid) !== wanted) continue;
      cards[ci].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      await new Promise(function(resolve) { setTimeout(resolve, 350); });
      var rect = cards[ci].getBoundingClientRect();
      return {
        ok: true,
        foundIn: docs[di].label,
        domGeekId: cards[ci].dataset.geekid || '',
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
      };
    }
  }
  return { ok: false, error: 'CARD_NOT_FOUND', wanted: wanted };
})();
`;
}

function buildReadDetailStateScript({
  timeoutMs = 0,
  expectCollected = null,
} = {}) {
  return `
(async function readBossRecommendDetailState() {
  var timeoutMs = ${Number(timeoutMs) || 0};
  var expectCollected = ${JSON.stringify(expectCollected)};
  var startedAt = Date.now();

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
  }

  function makeUniqueSelector(el, doc) {
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var current = el;
    while (current && current !== doc.body && current !== doc.documentElement && parts.length < 9) {
      var part = current.tagName.toLowerCase();
      if (current.classList && current.classList.length > 0) {
        part += Array.prototype.slice.call(current.classList, 0, 3)
          .map(function(name) { return '.' + CSS.escape(name); })
          .join('');
      }
      if (current.parentElement) {
        var siblings = Array.prototype.filter.call(
          current.parentElement.children,
          function(node) { return node.tagName === current.tagName; }
        );
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function documents() {
    var out = [{ doc: document, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          out.push({ doc: iframes[i].contentDocument, label: iframes[i].src || ('iframe[' + i + ']') });
        }
      } catch (e) {}
    }
    return out;
  }

  function readOnce() {
    var docs = documents();
    for (var di = 0; di < docs.length; di++) {
      var roots = docs[di].doc.querySelectorAll(${JSON.stringify(
        DETAIL_SELECTOR
      )});
      for (var ri = 0; ri < roots.length; ri++) {
        var root = roots[ri];
        if (!isVisible(root)) continue;
        var buttons = root.querySelectorAll(${JSON.stringify(
          COLLECT_SELECTOR
        )});
        var button = null;
        for (var bi = 0; bi < buttons.length; bi++) {
          if (isVisible(buttons[bi])) { button = buttons[bi]; break; }
        }
        var closeButtons = root.querySelectorAll(${JSON.stringify(
          CLOSE_SELECTOR
        )});
        var closeButton = null;
        for (var ci = 0; ci < closeButtons.length; ci++) {
          if (isVisible(closeButtons[ci])) { closeButton = closeButtons[ci]; break; }
        }
        if (!button) {
          return {
            detailOpen: true,
            ready: false,
            collected: false,
            text: '',
            foundIn: docs[di].label,
            collectSelector: '',
            closeSelector: closeButton ? makeUniqueSelector(closeButton, docs[di].doc) : ''
          };
        }
        var icon = button.querySelector('.like-icon');
        var text = (button.querySelector('.btn-text') && button.querySelector('.btn-text').textContent || '').trim();
        var collected = !!(icon && icon.classList.contains('like-icon-active')) && text === '已收藏';
        return {
          detailOpen: true,
          ready: true,
          collected: collected,
          text: text,
          foundIn: docs[di].label,
          collectSelector: makeUniqueSelector(button, docs[di].doc),
          closeSelector: closeButton ? makeUniqueSelector(closeButton, docs[di].doc) : ''
        };
      }
    }
    return { detailOpen: false, ready: false, collected: false, text: '' };
  }

  var last = readOnce();
  while (
    Date.now() - startedAt < timeoutMs &&
    (!last.ready || (expectCollected !== null && last.collected !== expectCollected))
  ) {
    await new Promise(function(resolve) { setTimeout(resolve, 180); });
    last = readOnce();
  }
  last.timedOut = !last.ready || (expectCollected !== null && last.collected !== expectCollected);
  last.elapsedMs = Date.now() - startedAt;
  return last;
})();
`;
}

function buildWaitDetailClosedScript(timeoutMs) {
  return `
(async function waitBossRecommendDetailClosed() {
  var startedAt = Date.now();
  var timeoutMs = ${Number(timeoutMs) || 0};
  function visibleDetail(doc) {
    var roots = doc.querySelectorAll(${JSON.stringify(DETAIL_SELECTOR)});
    for (var i = 0; i < roots.length; i++) {
      var rect = roots[i].getBoundingClientRect();
      var win = roots[i].ownerDocument.defaultView || window;
      var style = win.getComputedStyle(roots[i]);
      if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') return true;
    }
    return false;
  }
  function isOpen() {
    if (visibleDetail(document)) return true;
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try { if (iframes[i].contentDocument && visibleDetail(iframes[i].contentDocument)) return true; } catch (e) {}
    }
    return false;
  }
  while (Date.now() - startedAt < timeoutMs) {
    if (!isOpen()) return { closed: true, elapsedMs: Date.now() - startedAt };
    await new Promise(function(resolve) { setTimeout(resolve, 150); });
  }
  return { closed: !isOpen(), elapsedMs: Date.now() - startedAt };
})();
`;
}

async function readDetailState(tabId, opts) {
  return evalOnTab(tabId, buildReadDetailStateScript(opts), true);
}

async function closeDetailIfOpen(tabId) {
  let state = await readDetailState(tabId, { timeoutMs: 0 });
  if (!state?.detailOpen) return { closed: true, wasOpen: false };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!state.closeSelector) {
      lastError = new Error("DETAIL_CLOSE_BUTTON_NOT_FOUND");
      break;
    }
    try {
      await clickOnTab(tabId, state.closeSelector, 60);
      const waited = await evalOnTab(
        tabId,
        buildWaitDetailClosedScript(DETAIL_CLOSE_TIMEOUT_MS),
        true
      );
      if (waited?.closed) return { closed: true, wasOpen: true };
      lastError = new Error("DETAIL_CLOSE_TIMEOUT");
    } catch (e) {
      lastError = e;
    }
    state = await readDetailState(tabId, { timeoutMs: 300 });
    if (!state?.detailOpen) return { closed: true, wasOpen: true };
  }
  throw lastError || new Error("DETAIL_CLOSE_FAILED");
}

async function collectOneGeek(tabId, geekId) {
  // 上一个候选人如果异常残留详情，先关掉，避免点击落在蒙层后的列表上。
  await closeDetailIfOpen(tabId);

  const cardSelector = buildCardSelector(geekId);
  const scrollResult = await evalOnTab(
    tabId,
    buildScrollCardScript(geekId),
    true
  );
  if (!scrollResult?.ok) throw new Error(`CARD_NOT_FOUND geekId=${geekId}`);

  await sleep(randomBetween(250, 600));
  await clickOnTab(tabId, cardSelector, randomBetween(55, 100));

  let operationResult = null;
  let operationError = null;
  try {
    let state = await readDetailState(tabId, {
      timeoutMs: DETAIL_OPEN_TIMEOUT_MS,
    });
    if (!state?.ready) throw new Error(`DETAIL_OPEN_TIMEOUT geekId=${geekId}`);

    await sleep(randomBetween(450, 900));
    if (state.collected) {
      operationResult = { geekId, status: "ALREADY_COLLECTED" };
    } else {
      for (let attempt = 0; attempt <= MAX_COLLECT_RETRIES; attempt++) {
        if (!state.collectSelector)
          throw new Error(`COLLECT_BUTTON_NOT_FOUND geekId=${geekId}`);
        await clickOnTab(tabId, state.collectSelector, randomBetween(55, 100));
        state = await readDetailState(tabId, {
          timeoutMs: COLLECT_STATE_TIMEOUT_MS,
          expectCollected: true,
        });
        if (state?.ready && state.collected) {
          operationResult = {
            geekId,
            status: "COLLECTED",
            attempts: attempt + 1,
          };
          break;
        }
        if (attempt < MAX_COLLECT_RETRIES) {
          state = await readDetailState(tabId, { timeoutMs: 350 });
          if (state?.collected) {
            operationResult = {
              geekId,
              status: "COLLECTED",
              attempts: attempt + 1,
            };
            break;
          }
          await sleep(randomBetween(500, 900));
        }
      }
      if (!operationResult)
        throw new Error(`COLLECT_STATE_TIMEOUT geekId=${geekId}`);
    }
  } catch (e) {
    operationError = e;
  }

  let closeWarning = null;
  try {
    await sleep(randomBetween(350, 700));
    await closeDetailIfOpen(tabId);
  } catch (e) {
    closeWarning = e?.message || String(e);
  }

  if (operationError) throw operationError;
  return { ...operationResult, closeWarning };
}

/**
 * 按输入顺序逐个收藏候选人；只把本次从「收藏」变成「已收藏」的人计入 collectedGeekIds。
 */
export async function collectBossRecommendGeeks(tabId, geeks, opts = {}) {
  const targetCount = Math.max(0, Number(opts.targetCount) || 0);
  const onProgress =
    typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const shouldAbort =
    typeof opts.shouldAbort === "function" ? opts.shouldAbort : null;

  if (!isInElectronClient()) {
    return {
      ok: false,
      errorCode: "NOT_IN_CLIENT",
      message: "window.api.automation.{evalOnTab,clickOnTab} 不可用",
      collectedGeekIds: [],
      alreadyCollectedGeekIds: [],
      errors: [],
    };
  }
  if (!tabId || !Array.isArray(geeks)) {
    return {
      ok: false,
      errorCode: "BAD_REQUEST",
      message: "tabId and geeks required",
      collectedGeekIds: [],
      alreadyCollectedGeekIds: [],
      errors: [],
    };
  }

  const collectedGeekIds = [];
  const alreadyCollectedGeekIds = [];
  const attemptedGeekIds = [];
  const errors = [];
  let aborted = false;

  for (let index = 0; index < geeks.length; index++) {
    if (targetCount > 0 && collectedGeekIds.length >= targetCount) break;
    let stopRequested = false;
    if (shouldAbort) {
      try {
        stopRequested = await shouldAbort();
      } catch (e) {
        console.warn("[bossRecommendCollect] shouldAbort 检查失败（忽略）:", e?.message || e);
      }
    }
    if (stopRequested) {
      aborted = true;
      break;
    }

    const geekId = getGeekId(geeks[index]);
    if (!geekId) continue;
    attemptedGeekIds.push(geekId);
    onProgress("itemStart", { geekId, index, total: geeks.length });

    try {
      const result = await collectOneGeek(tabId, geekId);
      if (result.status === "COLLECTED") collectedGeekIds.push(geekId);
      if (result.status === "ALREADY_COLLECTED")
        alreadyCollectedGeekIds.push(geekId);
      onProgress("itemDone", { ...result, index, total: geeks.length });
      if (result.closeWarning) {
        console.warn(
          `[bossRecommendCollect] 详情关闭异常 geekId=${geekId}: ${result.closeWarning}`
        );
      }
    } catch (e) {
      const error = e?.message || String(e);
      errors.push({ geekId, error });
      onProgress("itemError", { geekId, error, index, total: geeks.length });
      console.warn(`[bossRecommendCollect] 收藏失败 geekId=${geekId}:`, error);
    }

    await sleep(randomBetween(500, 1_100));
  }

  onProgress("done", {
    attempted: attemptedGeekIds.length,
    collected: collectedGeekIds.length,
    alreadyCollected: alreadyCollectedGeekIds.length,
    errors: errors.length,
    aborted,
  });

  return {
    ok: true,
    aborted,
    attemptedGeekIds,
    collectedGeekIds,
    alreadyCollectedGeekIds,
    errors,
  };
}

export default { collectBossRecommendGeeks };
