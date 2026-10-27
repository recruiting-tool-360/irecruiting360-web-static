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

import {
  BOSS_ENTITLEMENT_REQUIRED,
  detectBossEntitlementDialog,
} from "src/util/automation/bossEntitlementDialog";

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

function createEntitlementRequiredError() {
  const error = new Error("BOSS直聘查看权益不足，无法继续查看候选人");
  error.code = BOSS_ENTITLEMENT_REQUIRED;
  return error;
}

/** 等待详情状态时同步检测升级权益弹窗，命中后立即中断，不再等待详情超时。 */
async function waitForDetailState(
  tabId,
  { timeoutMs = 0, expectCollected = null, requireCollectButton = true } = {}
) {
  const startedAt = Date.now();
  let last = null;
  do {
    const entitlement = await detectBossEntitlementDialog(tabId);
    if (entitlement?.found) throw createEntitlementRequiredError();

    last = await readDetailState(tabId, { timeoutMs: 0, expectCollected });
    const stateMatched =
      (requireCollectButton ? last?.ready : last?.detailOpen) &&
      (expectCollected === null || last.collected === expectCollected);
    if (stateMatched) return { ...last, timedOut: false };
    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(180);
  } while (Date.now() - startedAt <= timeoutMs);

  return {
    ...(last || {}),
    timedOut: true,
    elapsedMs: Date.now() - startedAt,
  };
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

/**
 * 打开某个推荐候选人的详情面板（不收藏）。
 *
 * 画像评分链路需要在「收藏」之前拿到完整简历，这里复用推荐的卡片点击 + 详情等待逻辑。
 * 调用方负责在 finally 里调 closeBossRecommendDetail 关闭面板。
 */
export async function openBossRecommendDetail(tabId, geek) {
  const geekId = getGeekId(geek);
  if (!tabId || !geekId) {
    throw new Error("openBossRecommendDetail: tabId & geekId required");
  }
  await closeDetailIfOpen(tabId);

  const scrollResult = await evalOnTab(tabId, buildScrollCardScript(geekId), true);
  if (!scrollResult?.ok) throw new Error(`CARD_NOT_FOUND geekId=${geekId}`);

  await sleep(randomBetween(250, 600));
  await clickOnTab(
    tabId,
    buildCardSelector(scrollResult.domGeekId || geekId),
    randomBetween(55, 100)
  );

  const state = await waitForDetailState(tabId, {
    timeoutMs: DETAIL_OPEN_TIMEOUT_MS,
    requireCollectButton: false,
  });
  if (state?.timedOut || !state?.detailOpen) {
    throw new Error(`DETAIL_OPEN_TIMEOUT geekId=${geekId}`);
  }
  return state;
}

/** 关闭当前打开的推荐详情面板（幂等）。 */
export async function closeBossRecommendDetail(tabId) {
  if (!tabId) return { closed: true, wasOpen: false };
  return closeDetailIfOpen(tabId);
}

/**
 * 读取当前详情面板的 HTML（接口抓不到时的兜底）。
 *
 * 只取可见的 .lib-standard-resume.with-right-side 根节点 outerHTML，
 * 调用方负责清掉 script / inline handler 再上传。
 */
export async function readBossRecommendDetailHtml(tabId, timeoutMs = 5000) {
  if (!tabId) return { ok: false, code: "BAD_REQUEST" };
  const script = `
(async function readBossRecommendDetailHtml() {
  var startedAt = Date.now();
  var timeoutMs = ${Math.max(0, Number(timeoutMs) || 0)};
  function visible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
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
  function findRoot() {
    var docs = documents();
    for (var di = 0; di < docs.length; di++) {
      var roots = docs[di].doc.querySelectorAll(${JSON.stringify(DETAIL_SELECTOR)});
      for (var ri = 0; ri < roots.length; ri++) {
        if (visible(roots[ri])) return { root: roots[ri], label: docs[di].label };
      }
    }
    return null;
  }
  var found = findRoot();
  while (!found && Date.now() - startedAt < timeoutMs) {
    await new Promise(function(resolve) { setTimeout(resolve, 150); });
    found = findRoot();
  }
  if (!found) return { ok: false, code: 'DETAIL_NOT_OPEN', elapsedMs: Date.now() - startedAt };
  var text = String(found.root.innerText || found.root.textContent || '');
  var waited = 0;
  while (text.length < 50 && waited < Math.min(2000, timeoutMs)) {
    await new Promise(function(resolve) { setTimeout(resolve, 150); });
    waited += 150;
    text = String(found.root.innerText || found.root.textContent || '');
  }
  return {
    ok: true,
    html: found.root.outerHTML,
    textLength: text.length,
    foundIn: found.label,
    elapsedMs: Date.now() - startedAt
  };
})();
`;
  return evalOnTab(tabId, script, true);
}

/**
 * 读取当前详情面板在「顶层页面」坐标系里的可见区域，供 main 进程 capturePage 截图。
 *
 * BOSS 详情既可能在主文档，也可能在同源 iframe 内；iframe 场景要把 iframe
 * 自身的偏移叠加进去，否则截图会截到列表区域。
 * 返回值已裁剪到 viewport 内；详情未就绪时抛出错误。
 */
export async function readBossRecommendDetailRect(tabId, timeoutMs = 3000) {
  if (!tabId) throw new Error("DETAIL_TAB_REQUIRED");
  const script = `
(async function measureBossRecommendDetailRect() {
  var startedAt = Date.now();
  var timeoutMs = ${Math.max(0, Number(timeoutMs) || 0)};
  var DETAIL_SELECTOR = ".lib-standard-resume.with-right-side";
  function visible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
  }
  function findIn(doc) {
    var roots = doc.querySelectorAll(DETAIL_SELECTOR);
    for (var i = 0; i < roots.length; i++) {
      if (visible(roots[i])) return roots[i];
    }
    return null;
  }
  function findRoot() {
    var root = findIn(document);
    if (root) return { root: root, foundIn: 'mainFrame' };
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var frame = iframes[i];
      var doc = null;
      try { doc = frame.contentDocument; } catch (e) { continue; }
      if (!doc) continue;
      var inner = findIn(doc);
      if (!inner) continue;
      var fr = frame.getBoundingClientRect();
      return {
        root: inner,
        frame: frame,
        foundIn: frame.src || ('iframe[' + i + ']'),
        frameOffset: {
          x: fr.left + (frame.clientLeft || 0),
          y: fr.top + (frame.clientTop || 0)
        }
      };
    }
    return null;
  }
  var found = findRoot();
  while (!found && Date.now() - startedAt < timeoutMs) {
    await new Promise(function(resolve) { setTimeout(resolve, 150); });
    found = findRoot();
  }
  if (!found) return { ok: false, code: 'DETAIL_NOT_FOUND' };
  var text = String(found.root.innerText || found.root.textContent || '').trim();
  var stableReads = 0;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(function(resolve) { setTimeout(resolve, 150); });
    var nextText = String(found.root.innerText || found.root.textContent || '').trim();
    stableReads = nextText.length >= 50 && nextText === text ? stableReads + 1 : 0;
    text = nextText;
    if (stableReads >= 2) break;
  }
  if (stableReads < 2) return { ok: false, code: 'DETAIL_CONTENT_NOT_READY' };
  if (!found.root.isConnected || !visible(found.root)) {
    return { ok: false, code: 'DETAIL_CLOSED' };
  }
  var rect = found.root.getBoundingClientRect();
  var offset = found.frameOffset || { x: 0, y: 0 };
  var left = offset.x + rect.left;
  var top = offset.y + rect.top;
  var vw = window.innerWidth || document.documentElement.clientWidth;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var x = Math.max(0, Math.floor(left));
  var y = Math.max(0, Math.floor(top));
  var right = Math.min(vw, Math.ceil(left + rect.width));
  var bottom = Math.min(vh, Math.ceil(top + rect.height));
  var ancestor = found.root.parentElement;
  var win = found.root.ownerDocument.defaultView || window;
  while (ancestor) {
    var style = win.getComputedStyle(ancestor);
    var bounds = ancestor.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      x = Math.max(x, Math.ceil(offset.x + bounds.left + ancestor.clientLeft));
      right = Math.min(right, Math.floor(offset.x + bounds.left + ancestor.clientLeft + ancestor.clientWidth));
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      y = Math.max(y, Math.ceil(offset.y + bounds.top + ancestor.clientTop));
      bottom = Math.min(bottom, Math.floor(offset.y + bounds.top + ancestor.clientTop + ancestor.clientHeight));
    }
    ancestor = ancestor.parentElement;
  }
  if (found.frame) {
    x = Math.max(x, Math.ceil(offset.x));
    y = Math.max(y, Math.ceil(offset.y));
    right = Math.min(right, Math.floor(offset.x + found.frame.clientWidth));
    bottom = Math.min(bottom, Math.floor(offset.y + found.frame.clientHeight));
  }
  if (right - x < 20 || bottom - y < 20) {
    return { ok: false, code: 'DETAIL_RECT_TOO_SMALL', foundIn: found.foundIn };
  }
  return {
    ok: true,
    rect: { x: x, y: y, width: right - x, height: bottom - y },
    foundIn: found.foundIn,
    textLength: text.length,
    viewport: { width: vw, height: vh }
  };
})();
`;
  const result = await evalOnTab(tabId, script, true);
  if (!result?.ok || !result.rect) {
    throw new Error(`候选人详情尚未就绪，无法截图: ${result?.code || "DETAIL_NOT_FOUND"}`);
  }
  return result.rect;
}

async function collectOneGeek(tabId, geekId) {
  // 上一个候选人如果异常残留详情，先关掉，避免点击落在蒙层后的列表上。
  await closeDetailIfOpen(tabId);

  const scrollResult = await evalOnTab(
    tabId,
    buildScrollCardScript(geekId),
    true
  );
  if (!scrollResult?.ok) throw new Error(`CARD_NOT_FOUND geekId=${geekId}`);

  await sleep(randomBetween(250, 600));
  await clickOnTab(
    tabId,
    buildCardSelector(scrollResult.domGeekId || geekId),
    randomBetween(55, 100)
  );

  let operationResult = null;
  let operationError = null;
  try {
    let state = await waitForDetailState(tabId, {
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
        state = await waitForDetailState(tabId, {
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
        console.warn("[任务流程] [bossRecommendCollect] shouldAbort 检查失败（忽略）:", e?.message || e);
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
          `[任务流程] [bossRecommendCollect] 详情关闭异常 geekId=${geekId}: ${result.closeWarning}`
        );
      }
    } catch (e) {
      const error = e?.message || String(e);
      const errorCode = e?.code || "COLLECT_FAILED";
      errors.push({ geekId, error, errorCode });
      onProgress("itemError", {
        geekId,
        error,
        errorCode,
        index,
        total: geeks.length,
      });
      console.warn(`[任务流程] [bossRecommendCollect] 收藏失败 geekId=${geekId}:`, error);
      if (errorCode === BOSS_ENTITLEMENT_REQUIRED) {
        onProgress("done", {
          attempted: attemptedGeekIds.length,
          collected: collectedGeekIds.length,
          alreadyCollected: alreadyCollectedGeekIds.length,
          errors: errors.length,
          aborted: true,
          errorCode,
        });
        return {
          ok: false,
          aborted: true,
          errorCode,
          message: "BOSS直聘查看权益不足，推荐任务已停止",
          attemptedGeekIds,
          collectedGeekIds,
          alreadyCollectedGeekIds,
          errors,
        };
      }
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
