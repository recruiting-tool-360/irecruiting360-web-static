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

const CARD_SELECTOR_PREFIX = ".candidate-recommend .card-inner.common-wrap";
const DETAIL_SELECTOR = ".lib-standard-resume.with-right-side";
const DETAIL_ROOT_SELECTOR =
  ".lib-standard-resume.with-right-side, .lib-standard-resume, div#resume";
const RESUME_CANVAS_SELECTOR = "div#resume canvas#resume";
const COLLECT_SELECTOR = ".resume-right-side .like-icon-and-text";
const CLOSE_SELECTOR = ".close-btn";

const CARD_READY_TIMEOUT_MS = 10_000;
const DETAIL_OPEN_TIMEOUT_MS = 12_000;
const DETAIL_FIRST_CLICK_WAIT_MS = 4_000;
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
  return String(value == null ? "" : value)
    .trim()
    .replace(/~+$/, "")
    .replace(/^rec_/, "");
}

function getGeekId(geek) {
  return String(
    geek?.encryptGeekId ||
      geek?.geekId ||
      geek?.uniqSign ||
      geek?.outId ||
      geek?.geekCard?.encryptGeekId ||
      geek?.geekCard?.geekId ||
      ""
  ).trim();
}

/**
 * BOSS API / DOM 在不同页面版本里可能分别使用普通 geekId、encryptGeekId、
 * uniqSign（rec_<geekId>）以及末尾带 "~~" 的加密 ID。必须一并匹配，
 * 否则接口抓到的候选人在 DOM 中明明存在，也会报 CARD_NOT_FOUND。
 */
function getGeekIdentityIds(geekOrIds) {
  const values = Array.isArray(geekOrIds)
    ? geekOrIds
    : typeof geekOrIds === "string" || typeof geekOrIds === "number"
    ? [geekOrIds]
    : [
        geekOrIds?.encryptGeekId,
        geekOrIds?.geekId,
        geekOrIds?.uniqSign,
        geekOrIds?.outId,
        geekOrIds?.geekCard?.encryptGeekId,
        geekOrIds?.geekCard?.geekId
      ];
  return [...new Set(values.map(normalizeGeekId).filter(Boolean))];
}

function getGeekName(geek) {
  return String(
    geek?.geekCard?.geekName ||
      geek?.geekCard?.name ||
      geek?.geekName ||
      geek?.name ||
      ""
  ).trim();
}

function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildCardSelector(geekId, attribute = "data-geekid") {
  return `${CARD_SELECTOR_PREFIX}[${attribute}="${escapeAttributeValue(geekId)}"]`;
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

async function clickOnTab(tabId, selector, pressHoldMs = 70, options = {}) {
  const res = await window.api.automation.clickOnTab({
    tabId,
    selector,
    pressHoldMs,
    requireVisible: true,
    ...options,
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

function buildScrollCardScript(geekOrIds, timeoutMs = CARD_READY_TIMEOUT_MS) {
  const wantedIds = getGeekIdentityIds(geekOrIds);
  const wantedName = typeof geekOrIds === "object" ? getGeekName(geekOrIds) : "";
  return `
(async function scrollBossRecommendCard() {
  var wantedIds = ${JSON.stringify(wantedIds)};
  var wantedName = ${JSON.stringify(wantedName)};
  var wantedSet = {};
  for (var wi = 0; wi < wantedIds.length; wi++) wantedSet[wantedIds[wi]] = true;
  var timeoutMs = ${Math.max(0, Number(timeoutMs) || 0)};
  var startedAt = Date.now();
  var lastScrollAt = 0;
  function norm(value) {
    return String(value == null ? '' : value).trim().replace(/~+$/, '').replace(/^rec_/, '');
  }
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
  }
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
  function cardWrap(card) {
    return (card.closest && (card.closest('.candidate-card-wrap') || card.closest('li.card-item'))) || card;
  }
  function cardName(card) {
    var wrap = cardWrap(card);
    var nameEl = wrap.querySelector('.name') || wrap.querySelector('.geek-name') || wrap.querySelector('.name-wrap .name');
    return nameEl ? String(nameEl.textContent || '').trim() : '';
  }
  function clickTargets(card) {
    var out = [];
    var nodes = card.querySelectorAll('a[href], button, [role="button"]');
    for (var i = 0; i < nodes.length && out.length < 8; i++) {
      var node = nodes[i];
      out.push({
        tag: node.tagName.toLowerCase(),
        className: String(node.className || '').slice(0, 160),
        href: node.href || node.getAttribute('href') || '',
        role: node.getAttribute('role') || ''
      });
    }
    var link = card.closest && card.closest('a[href]');
    return {
      closestHref: link ? (link.href || link.getAttribute('href') || '') : '',
      targets: out
    };
  }
  function findTarget() {
    var docs = documents();
    var renderedCards = 0;
    var renderedIds = [];
    var renderedNames = [];
    var frameStates = [];
    var nameHits = [];
    for (var di = 0; di < docs.length; di++) {
      var cards = docs[di].doc.querySelectorAll(
        '.candidate-recommend .card-inner.common-wrap[data-geekid],' +
        '.candidate-recommend .card-inner.common-wrap[data-geek],' +
        '.card-inner.common-wrap[data-geekid],' +
        '.card-inner.common-wrap[data-geek]'
      );
      frameStates.push({ label: docs[di].label, cards: cards.length });
      for (var ci = 0; ci < cards.length; ci++) {
        var card = cards[ci];
        var attr = card.hasAttribute('data-geekid') ? 'data-geekid' : 'data-geek';
        var rawId = card.getAttribute(attr) || '';
        var name = cardName(card);
        renderedCards++;
        if (renderedIds.length < 30 && rawId) renderedIds.push(rawId);
        if (renderedNames.length < 30 && name) renderedNames.push(name);
        if (rawId && wantedSet[norm(rawId)]) {
          return { found: true, card: card, foundIn: docs[di].label, renderedCards: renderedCards,
            frameStates: frameStates, renderedIds: renderedIds, renderedNames: renderedNames,
            domGeekAttr: attr, matchBy: 'id' };
        }
        if (wantedName && name === wantedName) {
          nameHits.push({ card: card, foundIn: docs[di].label, domGeekAttr: attr });
        }
      }
    }
    // 仅在当前已渲染卡片中姓名唯一时兜底，避免 ID 口径变化时点错同名候选人。
    if (nameHits.length === 1) {
      return { found: true, card: nameHits[0].card, foundIn: nameHits[0].foundIn,
        renderedCards: renderedCards, frameStates: frameStates, renderedIds: renderedIds,
        renderedNames: renderedNames, domGeekAttr: nameHits[0].domGeekAttr, matchBy: 'name' };
    }
    return {
      found: false,
      renderedCards: renderedCards,
      frameStates: frameStates,
      renderedIds: renderedIds,
      renderedNames: renderedNames,
      nameHitCount: nameHits.length
    };
  }
  function scrollListStep() {
    var docs = documents();
    var best = null;
    var bestRange = 0;
    for (var di = 0; di < docs.length; di++) {
      var nodes = docs[di].doc.querySelectorAll('*');
      for (var ni = 0; ni < nodes.length; ni++) {
        var el = nodes[ni];
        var range = Number(el.scrollHeight || 0) - Number(el.clientHeight || 0);
        if (range > bestRange && isVisible(el)) {
          best = el;
          bestRange = range;
        }
      }
    }
    if (!best || bestRange < 40) return false;
    var step = Math.max(420, Math.min(900, Math.floor(best.clientHeight * 0.75)));
    best.scrollTop = Math.min(best.scrollHeight, best.scrollTop + step);
    return true;
  }

  // 同一 BOSS 页会连续处理多批候选人。先把列表复位，再主动向下扫描，
  // 避免上一批停在中后段时漏掉本轮位于列表上半部分的候选人。
  (function resetScrollToStart() {
    var docs = documents();
    var best = null;
    var bestRange = 0;
    for (var di = 0; di < docs.length; di++) {
      var nodes = docs[di].doc.querySelectorAll('*');
      for (var ni = 0; ni < nodes.length; ni++) {
        var el = nodes[ni];
        var range = Number(el.scrollHeight || 0) - Number(el.clientHeight || 0);
        if (range > bestRange && isVisible(el)) {
          best = el;
          bestRange = range;
        }
      }
    }
    if (best) best.scrollTop = 0;
  })();

  var last = findTarget();
  while (Date.now() - startedAt < timeoutMs) {
    if (last.found) {
      last.card.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    } else if (Date.now() - lastScrollAt >= 900) {
      scrollListStep();
      lastScrollAt = Date.now();
    }
    await new Promise(function(resolve) { setTimeout(resolve, 150); });
    last = findTarget();
    if (last.found && isVisible(last.card)) {
      await new Promise(function(resolve) { setTimeout(resolve, 200); });
      last = findTarget();
      if (last.found && isVisible(last.card)) {
        var rect = last.card.getBoundingClientRect();
        return {
          ok: true,
          foundIn: last.foundIn,
          domGeekId: last.card.getAttribute(last.domGeekAttr || 'data-geekid') || '',
          domGeekAttr: last.domGeekAttr || 'data-geekid',
          matchBy: last.matchBy || 'id',
          renderedCards: last.renderedCards,
          renderedIds: last.renderedIds || [],
          renderedNames: last.renderedNames || [],
          clickTargets: clickTargets(last.card),
          elapsedMs: Date.now() - startedAt,
          rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
        };
      }
    }
  }

  return {
    ok: false,
    error: last.nameHitCount > 1 ? 'NAME_AMBIGUOUS' : (last.found ? 'CARD_NOT_READY' : 'CARD_NOT_FOUND'),
    wanted: wantedIds,
    wantedName: wantedName,
    elapsedMs: Date.now() - startedAt,
    renderedCards: last.renderedCards,
    renderedIds: last.renderedIds || [],
    renderedNames: last.renderedNames || [],
    nameHitCount: last.nameHitCount || 0,
    frameStates: last.frameStates
  };
})();
`;
}

function ensureRecommendCardReady(geekOrIds, result) {
  const wantedIds = getGeekIdentityIds(geekOrIds);
  if (result?.ok) {
    if (Number(result.elapsedMs) >= 500) {
      console.log(
        `[任务流程] [bossRecommendCollect] 候选人卡片已就绪 geekIds=${wantedIds.join(",")} ` +
          `matchedId=${result.domGeekId || "-"} matchBy=${result.matchBy || "id"} ` +
          `等待=${result.elapsedMs}ms 已渲染=${result.renderedCards || 0}`
      );
    }
    return;
  }

  const code = result?.error || "CARD_NOT_FOUND";
  const frameSummary = Array.isArray(result?.frameStates)
    ? result.frameStates
        .map((item) => `${item.label || "unknown"}:${item.cards || 0}`)
        .join(" | ")
    : "unavailable";
  const domIdSamples = Array.isArray(result?.renderedIds)
    ? result.renderedIds.slice(0, 10).join(", ")
    : "";
  const domNameSamples = Array.isArray(result?.renderedNames)
    ? result.renderedNames.slice(0, 10).join(", ")
    : "";
  const error = new Error(
    `${code} geekIds=[${wantedIds.join(", ")}] waited=${Number(result?.elapsedMs) || 0}ms ` +
      `renderedCards=${Number(result?.renderedCards) || 0} frames=${frameSummary} ` +
      `domIdSamples=[${domIdSamples}] name=${result?.wantedName || "-"} ` +
      `nameHitCount=${Number(result?.nameHitCount) || 0} domNameSamples=[${domNameSamples}]`
  );
  error.code = code;
  error.diagnostics = result || null;
  throw error;
}

function buildReadDetailStateScript({
  timeoutMs = 0,
  expectCollected = null,
  requireResumeCanvas = false,
} = {}) {
  return `
(async function readBossRecommendDetailState() {
  var timeoutMs = ${Number(timeoutMs) || 0};
  var expectCollected = ${JSON.stringify(expectCollected)};
  var requireResumeCanvas = ${JSON.stringify(!!requireResumeCanvas)};
  var startedAt = Date.now();

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < win.innerHeight &&
      rect.left < win.innerWidth;
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
    var out = [];
    var seen = [];
    function visit(doc, label, depth, path) {
      if (!doc || depth > 8 || seen.indexOf(doc) >= 0) return;
      seen.push(doc);
      out.push({ doc: doc, label: label, depth: depth, path: path });
      var iframes = doc.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        var frame = iframes[i];
        if (!isVisible(frame)) continue;
        var src = frame.src || frame.getAttribute('src') || ('iframe[' + i + ']');
        try {
          if (frame.contentDocument) {
            visit(frame.contentDocument, src, depth + 1, path + ' > ' + src);
          }
        } catch (e) {}
      }
    }
    visit(document, 'mainFrame', 0, 'mainFrame');
    return out;
  }

  function firstVisible(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) return nodes[i];
    }
    return null;
  }

  function firstReadyCanvas(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var canvas = nodes[i];
      if (isVisible(canvas) &&
          Number(canvas.width) >= 200 &&
          Number(canvas.height) >= 100) return canvas;
    }
    return null;
  }

  function findClose(doc, root) {
    var closeButton = root ? firstVisible(root.querySelectorAll(${JSON.stringify(CLOSE_SELECTOR)})) : null;
    if (!closeButton) closeButton = firstVisible(doc.querySelectorAll(${JSON.stringify(CLOSE_SELECTOR)}));
    return closeButton ? makeUniqueSelector(closeButton, doc) : '';
  }

  function diagnostics(docs) {
    var frames = [];
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i].doc;
      try {
        frames.push({
          label: docs[i].label,
          depth: docs[i].depth,
          url: doc.URL || '',
          title: String(doc.title || '').slice(0, 120),
          readyState: doc.readyState || '',
          resumeRoots: doc.querySelectorAll(${JSON.stringify(DETAIL_ROOT_SELECTOR)}).length,
          resumeCanvases: doc.querySelectorAll(${JSON.stringify(RESUME_CANVAS_SELECTOR)}).length,
          readyCanvases: Array.prototype.filter.call(
            doc.querySelectorAll(${JSON.stringify(RESUME_CANVAS_SELECTOR)}),
            function(canvas) { return Number(canvas.width) >= 200 && Number(canvas.height) >= 100; }
          ).length,
          closeButtons: doc.querySelectorAll(${JSON.stringify(CLOSE_SELECTOR)}).length
        });
      } catch (e) {
        frames.push({ label: docs[i].label, depth: docs[i].depth, error: String(e && e.message || e) });
      }
    }
    return { url: location.href, frames: frames };
  }

  function readOnce() {
    var docs = documents();
    var fallback = null;

    // 旧版详情抽屉：优先读取右侧收藏按钮，兼顾收藏动作。
    for (var di = 0; di < docs.length; di++) {
      var roots = docs[di].doc.querySelectorAll(${JSON.stringify(
        DETAIL_SELECTOR
      )});
      for (var ri = 0; ri < roots.length; ri++) {
        var root = roots[ri];
        if (!isVisible(root)) continue;
        var button = firstVisible(root.querySelectorAll(${JSON.stringify(COLLECT_SELECTOR)}));
        var closeSelector = findClose(docs[di].doc, root);
        var resumeReady = !!firstReadyCanvas(root.querySelectorAll(${JSON.stringify(RESUME_CANVAS_SELECTOR)}));
        if (!button || (requireResumeCanvas && !resumeReady)) {
          if (!fallback) {
            var fallbackText = button
              ? (button.querySelector('.btn-text') && button.querySelector('.btn-text').textContent || '').trim()
              : '';
            fallback = {
              detailOpen: true,
              ready: !!button,
              collected: false,
              text: fallbackText,
              foundIn: docs[di].label,
              framePath: docs[di].path,
              collectSelector: button ? makeUniqueSelector(button, docs[di].doc) : '',
              closeSelector: closeSelector,
              resumeReady: resumeReady,
              waitingForResumeCanvas: requireResumeCanvas && !resumeReady
            };
          }
          continue;
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
          framePath: docs[di].path,
          collectSelector: makeUniqueSelector(button, docs[di].doc),
          closeSelector: closeSelector,
          resumeReady: resumeReady
        };
      }
    }

    // c-resume 才是截图正文。必须先把所有 doc/frame 扫完再回退到外层抽屉，
    // 否则旧外层抽屉会抢先命中，导致调用方在 canvas 尚未挂载时就开始截图。
    for (var gi = 0; gi < docs.length; gi++) {
      var canvas = firstReadyCanvas(docs[gi].doc.querySelectorAll(${JSON.stringify(RESUME_CANVAS_SELECTOR)}));
      if (!canvas) continue;
      return {
        detailOpen: true,
        ready: false,
        collected: false,
        text: '',
        foundIn: docs[gi].label,
        framePath: docs[gi].path,
        collectSelector: '',
        closeSelector: findClose(docs[gi].doc, null),
        resumeReady: true
      };
    }
    for (var ri2 = 0; ri2 < docs.length; ri2++) {
      var genericRoot = firstVisible(docs[ri2].doc.querySelectorAll(${JSON.stringify(DETAIL_ROOT_SELECTOR)}));
      if (!genericRoot) continue;
      return {
        detailOpen: true,
        ready: false,
        collected: false,
        text: '',
        foundIn: docs[ri2].label,
        framePath: docs[ri2].path,
        collectSelector: '',
        closeSelector: findClose(docs[ri2].doc, null),
        resumeReady: false,
        diagnostics: diagnostics(docs)
      };
    }

    if (fallback) return fallback;
    return {
      detailOpen: false,
      ready: false,
      collected: false,
      text: '',
      resumeReady: false,
      diagnostics: diagnostics(docs)
    };
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
    var roots = doc.querySelectorAll(${JSON.stringify(DETAIL_ROOT_SELECTOR)});
    for (var i = 0; i < roots.length; i++) {
      var rect = roots[i].getBoundingClientRect();
      var win = roots[i].ownerDocument.defaultView || window;
      var style = win.getComputedStyle(roots[i]);
      if (rect.width > 0 && rect.height > 0 &&
          style.display !== 'none' && style.visibility !== 'hidden' &&
          rect.bottom > 0 && rect.right > 0 &&
          rect.top < win.innerHeight && rect.left < win.innerWidth) return true;
    }
    return false;
  }
  function hasOpenDetail(doc, depth) {
    if (!doc || depth > 8) return false;
    if (visibleDetail(doc)) return true;
    var iframes = doc.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument && hasOpenDetail(iframes[i].contentDocument, depth + 1)) return true;
      } catch (e) {}
    }
    return false;
  }
  function isOpen() {
    return hasOpenDetail(document, 0);
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

async function listTabsSafe() {
  if (typeof window?.api?.tabs?.list !== "function") return [];
  try {
    const tabs = await window.api.tabs.list();
    return Array.isArray(tabs) ? tabs : [];
  } catch (error) {
    console.warn(
      "[任务流程] [bossRecommendCollect] tabs.list 失败，跳过新详情 tab 检测:",
      error?.message || String(error)
    );
    return [];
  }
}

function isBossDetailTab(tab) {
  if (!tab) return false;
  if (tab.role === "boss-detail") return true;
  if (tab.channel !== "boss") return false;
  try {
    const url = new URL(tab.url || "");
    return (
      /(^|\.)zhipin\.com$/i.test(url.hostname) &&
      (url.pathname.includes("/web/geek/detail") ||
        url.pathname.includes("/resume/detail") ||
        url.pathname.includes("/web/frame/recommend/resume"))
    );
  } catch {
    return false;
  }
}

/**
 * BOSS 可能把详情开在当前 iframe，也可能通过 window.open 新建 boss-detail tab。
 * 两条路径同时轮询，返回实际承载简历的 tabId，截图必须使用该 tab。
 */
async function waitForOpenedDetailState(tabId, knownTabIds, timeoutMs) {
  const startedAt = Date.now();
  const known = knownTabIds instanceof Set ? knownTabIds : new Set();
  let lastOrigin = null;
  let lastDetailTab = null;
  const seenDetailTabIds = [];

  do {
    const entitlement = await detectBossEntitlementDialog(tabId);
    if (entitlement?.found) throw createEntitlementRequiredError();

    lastOrigin = await readDetailState(tabId, {
      timeoutMs: 0,
      requireResumeCanvas: true,
    });
    if (lastOrigin?.detailOpen) {
      if (lastOrigin.resumeReady) {
        return {
          ...lastOrigin,
          detailTabId: tabId,
          openedIn: "same-tab",
          timedOut: false,
          elapsedMs: Date.now() - startedAt,
        };
      }
    }

    const tabs = await listTabsSafe();
    const newDetailTabs = tabs.filter(
      (tab) => !known.has(tab.id) && isBossDetailTab(tab)
    );
    for (const tab of newDetailTabs) {
      if (!seenDetailTabIds.includes(tab.id)) {
        seenDetailTabIds.push(tab.id);
        console.log("[任务流程] [bossRecommendCollect] 检测到新详情 tab", {
          tabId: tab.id,
          role: tab.role,
          loading: tab.loading,
          url: tab.url,
        });
      }
      if (tab.loading) continue;
      try {
        const detailEntitlement = await detectBossEntitlementDialog(tab.id);
        if (detailEntitlement?.found) throw createEntitlementRequiredError();
        lastDetailTab = await readDetailState(tab.id, {
          timeoutMs: 0,
          requireResumeCanvas: true,
        });
        if (lastDetailTab?.detailOpen) {
          return {
            ...lastDetailTab,
            detailTabId: tab.id,
            openedIn: "new-tab",
            timedOut: false,
            elapsedMs: Date.now() - startedAt,
          };
        }
      } catch (error) {
        if (error?.code === BOSS_ENTITLEMENT_REQUIRED) throw error;
      }
    }

    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(180);
  } while (Date.now() - startedAt <= timeoutMs);

  return {
    ...(lastOrigin || lastDetailTab || {}),
    detailTabId:
      seenDetailTabIds.length > 0 ? seenDetailTabIds[seenDetailTabIds.length - 1] : tabId,
    openedIn: seenDetailTabIds.length > 0 ? "new-tab" : "same-tab",
    detailTabIds: seenDetailTabIds,
    timedOut: true,
    elapsedMs: Date.now() - startedAt,
  };
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
  const identityIds = getGeekIdentityIds(geek);
  const geekId = getGeekId(geek) || identityIds[0];
  if (!tabId || identityIds.length === 0) {
    throw new Error("openBossRecommendDetail: tabId & candidate IDs required");
  }
  const startedAt = Date.now();
  console.log(
    `[任务流程] [bossRecommendCollect] 打开候选人详情 >>> ` +
      `geekIds=${identityIds.join(",")} tabId=${tabId}`
  );

  const closeStartedAt = Date.now();
  const previous = await closeDetailIfOpen(tabId);
  console.log("[任务流程] [bossRecommendCollect] 打开前检查详情面板", {
    geekId,
    geekIds: identityIds,
    wasOpen: !!previous?.wasOpen,
    elapsedMs: Date.now() - closeStartedAt
  });

  const cardStartedAt = Date.now();
  const scrollResult = await evalOnTab(tabId, buildScrollCardScript(geek), true);
  ensureRecommendCardReady(geek, scrollResult);
  console.log("[任务流程] [bossRecommendCollect] 候选人卡片已定位", {
    geekId,
    matchedId: scrollResult?.domGeekId,
    matchBy: scrollResult?.matchBy,
    domGeekAttr: scrollResult?.domGeekAttr,
    foundIn: scrollResult?.foundIn,
    rect: scrollResult?.rect,
    clickTargets: scrollResult?.clickTargets,
    elapsedMs: Date.now() - cardStartedAt
  });

  const knownTabIds = new Set((await listTabsSafe()).map((tab) => tab.id));
  const clickStartedAt = Date.now();
  const cardSelector = buildCardSelector(
    scrollResult.domGeekId || identityIds[0],
    scrollResult.domGeekAttr || "data-geekid"
  );
  const clickOptions = { hoverSelector: cardSelector, hoverWaitMs: 180 };
  const clickResult = await clickOnTab(tabId, cardSelector, randomBetween(55, 100), clickOptions);
  console.log("[任务流程] [bossRecommendCollect] 候选人卡片已点击", {
    geekId,
    matchedId: scrollResult?.domGeekId,
    x: clickResult?.x,
    y: clickResult?.y,
    width: clickResult?.width,
    height: clickResult?.height,
    foundIn: clickResult?.foundIn,
    elapsedMs: Date.now() - clickStartedAt
  });

  const detailWaitStartedAt = Date.now();
  let state = await waitForOpenedDetailState(
    tabId,
    knownTabIds,
    DETAIL_FIRST_CLICK_WAIT_MS
  );
  if (!state?.detailOpen && !(state?.detailTabIds?.length > 0)) {
    console.warn(
      "[任务流程] [bossRecommendCollect] 首次点击未出现详情，重试同一候选人卡片",
      { geekId, waitMs: Date.now() - detailWaitStartedAt }
    );
    const retryClickResult = await clickOnTab(
      tabId,
      cardSelector,
      randomBetween(55, 100),
      clickOptions
    );
    console.log("[任务流程] [bossRecommendCollect] 候选人卡片重试点击完成", {
      geekId,
      x: retryClickResult?.x,
      y: retryClickResult?.y,
      width: retryClickResult?.width,
      height: retryClickResult?.height,
      foundIn: retryClickResult?.foundIn,
    });
  }
  if (!state?.detailOpen || !state?.resumeReady) {
    const remainingMs = Math.max(
      3_000,
      DETAIL_OPEN_TIMEOUT_MS - (Date.now() - detailWaitStartedAt)
    );
    state = await waitForOpenedDetailState(tabId, knownTabIds, remainingMs);
  }
  const detailWaitMs = Date.now() - detailWaitStartedAt;
  if (state?.timedOut || !state?.detailOpen) {
    console.warn("[任务流程] [bossRecommendCollect] 候选人详情打开失败", {
      geekId,
      tabId,
      waitMs: detailWaitMs,
      state
    });
    if (state?.detailTabId && state.detailTabId !== tabId) {
      try {
        await closeBossRecommendDetail(state.detailTabId);
      } catch (error) {
        console.warn(
          "[任务流程] [bossRecommendCollect] 清理未就绪详情 tab 失败（忽略）:",
          error?.message || String(error)
        );
      }
    }
    const errorCode =
      state?.detailOpen && !state?.resumeReady ? "DETAIL_CANVAS_TIMEOUT" : "DETAIL_OPEN_TIMEOUT";
    const error = new Error(
      `${errorCode} geekId=${geekId} resumeReady=${!!state?.resumeReady}`
    );
    error.code = errorCode;
    throw error;
  }
  console.log("[任务流程] [bossRecommendCollect] 候选人详情已打开 ✓", {
    geekId,
    tabId,
    detailTabId: state.detailTabId || tabId,
    openedIn: state.openedIn || "same-tab",
    foundIn: state.foundIn,
    framePath: state.framePath,
    resumeReady: !!state.resumeReady,
    detailWaitMs,
    totalElapsedMs: Date.now() - startedAt
  });

  const detailOpenedJitterMs = randomBetween(1000, 3000);
  console.log(
    `[任务流程] [bossRecommendCollect] 详情打开后随机等待 ${detailOpenedJitterMs}ms geekId=${geekId}`
  );
  await sleep(detailOpenedJitterMs);
  return state;
}

/** 关闭当前打开的推荐详情面板（幂等）。 */
export async function closeBossRecommendDetail(tabId) {
  if (!tabId) return { closed: true, wasOpen: false };
  const tabs = await listTabsSafe();
  const tab = tabs.find((item) => item.id === tabId);
  if (tab?.role === "boss-detail" && typeof window?.api?.tabs?.close === "function") {
    const closed = await window.api.tabs.close(tabId);
    return { closed: !!closed, wasOpen: true, closedTab: true };
  }
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

async function collectOneGeek(tabId, geek) {
  const identityIds = getGeekIdentityIds(geek);
  const geekId = getGeekId(geek) || identityIds[0];
  if (!geekId) {
    throw new Error("collectOneGeek: candidate IDs required");
  }
  const startedAt = Date.now();
  console.log(
    `[任务流程] [bossRecommendCollect] 收藏候选人详情 >>> ` +
      `geekIds=${identityIds.join(",")} tabId=${tabId}`
  );
  // 上一个候选人如果异常残留详情，先关掉，避免点击落在蒙层后的列表上。
  await closeDetailIfOpen(tabId);

  const scrollResult = await evalOnTab(tabId, buildScrollCardScript(geek), true);
  ensureRecommendCardReady(geek, scrollResult);
  console.log("[任务流程] [bossRecommendCollect] 收藏候选人卡片已定位", {
    geekId,
    matchedId: scrollResult?.domGeekId,
    matchBy: scrollResult?.matchBy,
    domGeekAttr: scrollResult?.domGeekAttr,
    foundIn: scrollResult?.foundIn,
    rect: scrollResult?.rect
  });

  await clickOnTab(
    tabId,
    buildCardSelector(
      scrollResult.domGeekId || identityIds[0],
      scrollResult.domGeekAttr || "data-geekid"
    ),
    randomBetween(55, 100)
  );

  let operationResult = null;
  let operationError = null;
  try {
    const detailWaitStartedAt = Date.now();
    let state = await waitForDetailState(tabId, {
      timeoutMs: DETAIL_OPEN_TIMEOUT_MS,
    });
    if (!state?.ready) throw new Error(`DETAIL_OPEN_TIMEOUT geekId=${geekId}`);
    console.log("[任务流程] [bossRecommendCollect] 收藏候选人详情已打开", {
      geekId,
      foundIn: state.foundIn,
      detailWaitMs: Date.now() - detailWaitStartedAt,
      collected: state.collected
    });

    const detailOpenedJitterMs = randomBetween(1000, 3000);
    console.log(
      `[任务流程] [bossRecommendCollect] 详情打开后随机等待 ${detailOpenedJitterMs}ms geekId=${geekId}`
    );
    await sleep(detailOpenedJitterMs);
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
  console.log("[任务流程] [bossRecommendCollect] 收藏候选人详情完成 ✓", {
    geekId,
    geekIds: identityIds,
    status: operationResult?.status,
    elapsedMs: Date.now() - startedAt,
    closeWarning: closeWarning || null
  });
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

    const geek = geeks[index];
    const identityIds = getGeekIdentityIds(geek);
    const geekId = getGeekId(geek) || identityIds[0];
    if (!geekId) continue;
    attemptedGeekIds.push(geekId);
    onProgress("itemStart", {
      geekId,
      geekIds: identityIds,
      index,
      total: geeks.length,
    });

    try {
      const result = await collectOneGeek(tabId, geek);
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
      errors.push({ geekId, geekIds: identityIds, error, errorCode });
      onProgress("itemError", {
        geekId,
        geekIds: identityIds,
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
