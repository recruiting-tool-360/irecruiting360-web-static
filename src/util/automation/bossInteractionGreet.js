/**
 * BOSS 互动页「立即沟通」RPA。
 *
 * DOM（2026-08-03 实测）：
 *   - 收藏牛人页签：.interaction-header .tab-item[title="收藏牛人"]
 *   - 候选人卡片：#recommend-list .card-list > .card-item
 *   - 候选人 ID：.card-inner.new-geek-wrap[data-geek]
 *   - 首次沟通：.operate-side .btn-greet
 *   - 继续沟通：.operate-side .btn-continue
 *   - 首次沟通提示：.dialog-wrap.dialog-chat-greeting
 *   - 提示「知道了」：.dialog-wrap.dialog-chat-greeting .buttons button.btn
 *   - 全局聊天窗口：.chat-global-outer-wrap
 *   - 聊天窗口关闭：.chat-global-top .iboss.iboss-close
 *
 * evalOnTab 只读取 DOM、滚动和添加临时定位属性；所有点击均走
 * clickOnTab（CDP Input.dispatchMouseEvent，isTrusted=true）。
 */

import {
  extractGeekIds,
  extractGeekName,
} from "src/util/automation/bossRecommendGreet";

const INTERACTION_URL = "https://www.zhipin.com/web/chat/interaction";
const TARGET_ATTRIBUTE = "data-ikz-interaction-target";

const COLLECTED_TAB_SELECTOR =
  '.page-interaction .interaction-header .tab-item[title="收藏牛人"]';
const CARD_SELECTOR =
  ".page-interaction #recommend-list ul.card-list > li.card-item";
const CARD_GEEK_SELECTOR = ".card-inner.new-geek-wrap[data-geek]";
const GREET_BUTTON_SELECTOR = ".operate-side .btn-greet";
const CONTINUE_BUTTON_SELECTOR = ".operate-side .btn-continue";
const LIST_SCROLL_SELECTORS = [
  ".page-interaction .recommend-list-wrap",
  ".page-interaction #recommend-list",
];

const GREETING_DIALOG_SELECTOR =
  ".dialog-wrap.dialog-chat-greeting .dialog-container";
const GREETING_CONFIRM_SELECTOR =
  ".dialog-wrap.dialog-chat-greeting .dialog-container .buttons button.btn";
const GREETING_CLOSE_SELECTOR =
  ".dialog-wrap.dialog-chat-greeting .dialog-container .dialog-header .close";
const CHAT_CLOSE_SELECTOR =
  ".chat-global-outer-wrap .chat-global-top .iboss.iboss-close";

const PAGE_READY_TIMEOUT_MS = 15_000;
const GREETING_DIALOG_WAIT_MIN_MS = 1_000;
const GREETING_DIALOG_WAIT_MAX_MS = 3_000;
const ACTION_VERIFY_TIMEOUT_MS = 4_000;
const NAVIGATION_READY_TIMEOUT_MS = 20_000;
const TARGET_STABLE_WAIT_MS = 350;
const MAX_ACTION_RETRIES = 1;
const MAX_SCROLL_ROUNDS = 12;

function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api?.automation &&
      typeof window.api.automation.openOrActivate === "function" &&
      typeof window.api.automation.evalOnTab === "function" &&
      typeof window.api.automation.clickOnTab === "function" &&
      window.api.tabs &&
      typeof window.api.tabs.list === "function"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function createMarker(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function reportProgress(options, stage) {
  if (typeof options?.onProgress !== "function") return;
  try {
    options.onProgress(stage);
  } catch (error) {
    console.warn("[bossInteractionGreet] 更新沟通进度失败（继续执行）:", error);
  }
}

async function evalOnTab(tabId, code, awaitPromise = false) {
  const result = await window.api.automation.evalOnTab({
    tabId,
    code,
    awaitPromise,
  });
  if (!result?.ok) {
    throw new Error(
      result?.error?.message || result?.error?.code || "读取 BOSS 互动页失败"
    );
  }
  return result.result;
}

async function clickOnTab(tabId, selector) {
  const result = await window.api.automation.clickOnTab({
    tabId,
    selector,
    pressHoldMs: 70,
    requireVisible: true,
  });
  if (!result?.ok) {
    throw new Error(
      result?.error?.message || result?.error?.code || "点击 BOSS 互动页失败"
    );
  }
  return result.data;
}

function isInteractionUrl(url) {
  return (
    typeof url === "string" && url.includes("/web/chat/interaction")
  );
}

function buildInteractionReadyScript() {
  return `
(function readBossInteractionReadyState() {
  function documents() {
    var result = [{ doc: document, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({
            doc: iframes[i].contentDocument,
            label: iframes[i].src || ('iframe[' + i + ']')
          });
        }
      } catch (error) {}
    }
    return result;
  }

  var docs = documents();
  var page = null;
  var collectedTab = null;
  var list = null;
  var foundIn = '';
  for (var di = 0; di < docs.length; di++) {
    var candidatePage = docs[di].doc.querySelector('.page-interaction');
    var candidateTab = docs[di].doc.querySelector(${JSON.stringify(
      COLLECTED_TAB_SELECTOR
    )});
    var candidateList = docs[di].doc.querySelector('.page-interaction #recommend-list');
    if (candidatePage || candidateTab || candidateList) {
      page = candidatePage;
      collectedTab = candidateTab;
      list = candidateList;
      foundIn = docs[di].label;
    }
    if (page && collectedTab && list) break;
  }
  return {
    url: location.href,
    readyState: document.readyState,
    pageFound: !!page,
    collectedTabFound: !!collectedTab,
    listFound: !!list,
    cardCount: list ? list.querySelectorAll('ul.card-list > li.card-item').length : 0,
    iframeCount: Math.max(0, docs.length - 1),
    foundIn: foundIn
  };
})();
`;
}

/**
 * 等待 Electron 导航真正结束，并确认 BOSS SPA 已生成互动列表 DOM。
 * 连续三次 loading=false，避免 did-stop-loading 后马上又触发二次导航。
 */
async function waitForInteractionPageReady(tabId) {
  const startedAt = Date.now();
  let stableStoppedCount = 0;
  let lastState = null;
  let lastDomState = null;

  while (Date.now() - startedAt < NAVIGATION_READY_TIMEOUT_MS) {
    const tabs = await window.api.tabs.list();
    const tab = (Array.isArray(tabs) ? tabs : []).find(
      (item) => item?.id === tabId
    );
    lastState = tab || null;

    if (tab && isInteractionUrl(tab.url) && tab.loading === false) {
      stableStoppedCount += 1;
    } else {
      stableStoppedCount = 0;
    }

    if (stableStoppedCount >= 3) {
      try {
        lastDomState = await evalOnTab(tabId, buildInteractionReadyScript());
        if (
          isInteractionUrl(lastDomState?.url) &&
          lastDomState?.readyState === "complete" &&
          lastDomState?.pageFound &&
          lastDomState?.collectedTabFound &&
          lastDomState?.listFound
        ) {
          console.log("[bossInteractionGreet] 互动页面加载完成:", {
            tabId,
            tabState: tab,
            domState: lastDomState,
          });
          return lastDomState;
        }
      } catch (error) {
        // 导航切换的瞬间 executeJavaScript 可能失败，下一轮继续等待。
        console.warn("[bossInteractionGreet] 等待互动页 DOM:", error);
      }
    }
    await sleep(250);
  }

  throw new Error(
    `BOSS 互动页面加载超时（url=${lastState?.url || ""} loading=${
      lastState?.loading
    } page=${Boolean(lastDomState?.pageFound)} list=${Boolean(
      lastDomState?.listFound
    )} iframeCount=${lastDomState?.iframeCount ?? 0} foundIn=${
      lastDomState?.foundIn || ""
    }）`
  );
}

async function openInteractionTabInBackground() {
  // background=true：BOSS view 保持真实尺寸渲染，CDP 可以正常点击；
  // 但 active tab 仍停留在 i快招，直到沟通动作与结果校验全部完成。
  const opened = await window.api.automation.openOrActivate({
    channel: "boss",
    url: INTERACTION_URL,
    background: true,
  });
  const tabId = opened?.tabId;

  if (!tabId) throw new Error("打开 BOSS 互动页面失败：未返回 tabId");
  await waitForInteractionPageReady(tabId);
  return tabId;
}

async function activateBossTab(tabId) {
  if (typeof window.api.tabs.activate !== "function") return false;
  return window.api.tabs.activate(tabId);
}

function buildMarkVisibleElementScript(selector, marker) {
  return `
(function markVisibleBossElement() {
  var selector = ${JSON.stringify(selector)};
  var marker = ${JSON.stringify(marker)};
  var markerAttr = ${JSON.stringify(TARGET_ATTRIBUTE)};

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
  }
  function documents() {
    var result = [{ doc: document, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({ doc: iframes[i].contentDocument, label: iframes[i].src || ('iframe[' + i + ']') });
        }
      } catch (error) {}
    }
    return result;
  }

  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var oldTargets = docs[di].doc.querySelectorAll('[' + markerAttr + ']');
    for (var oi = 0; oi < oldTargets.length; oi++) oldTargets[oi].removeAttribute(markerAttr);
  }
  for (var fi = 0; fi < docs.length; fi++) {
    var elements = docs[fi].doc.querySelectorAll(selector);
    for (var ei = 0; ei < elements.length; ei++) {
      if (!isVisible(elements[ei])) continue;
      elements[ei].setAttribute(markerAttr, marker);
      elements[ei].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      return {
        found: true,
        selector: '[' + markerAttr + '="' + marker + '"]',
        foundIn: docs[fi].label
      };
    }
  }
  return { found: false };
})();
`;
}

async function findVisibleElement(tabId, selector, markerPrefix) {
  const marker = createMarker(markerPrefix);
  return evalOnTab(tabId, buildMarkVisibleElementScript(selector, marker));
}

async function closeVisibleElement(tabId, selector, markerPrefix) {
  const found = await findVisibleElement(tabId, selector, markerPrefix);
  if (!found?.found || !found.selector) return false;
  await clickOnTab(tabId, found.selector);
  await sleep(350);
  return true;
}

/**
 * 开始下一次沟通前清理上一次操作遗留的弹层。
 * 首次沟通提示优先点「知道了」；按钮不存在时才点右上角关闭。
 */
async function closeExistingInteractionDialogs(tabId) {
  const greetingDialog = await findVisibleElement(
    tabId,
    GREETING_DIALOG_SELECTOR,
    "existing-greeting-dialog"
  );
  if (greetingDialog?.found) {
    const confirmed = await closeVisibleElement(
      tabId,
      GREETING_CONFIRM_SELECTOR,
      "existing-greeting-confirm"
    );
    if (!confirmed) {
      await closeVisibleElement(
        tabId,
        GREETING_CLOSE_SELECTOR,
        "existing-greeting-close"
      );
    }
  }

  // .chat-global-outer-wrap 是常驻的全局聊天入口，不能用它判断聊天窗是否打开。
  // 只有右上角关闭按钮可见时，才说明会话窗口当前确实处于展开状态。
  await closeVisibleElement(
    tabId,
    CHAT_CLOSE_SELECTOR,
    "existing-chat-close"
  );
}

function buildCollectedTabStateScript(marker) {
  return `
(function readCollectedTabState() {
  var selector = ${JSON.stringify(COLLECTED_TAB_SELECTOR)};
  var marker = ${JSON.stringify(marker)};
  var markerAttr = ${JSON.stringify(TARGET_ATTRIBUTE)};
  function documents() {
    var result = [{ doc: document, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({ doc: iframes[i].contentDocument, label: iframes[i].src || ('iframe[' + i + ']') });
        }
      } catch (error) {}
    }
    return result;
  }
  var docs = documents();
  var tab = null;
  var foundIn = '';
  for (var di = 0; di < docs.length; di++) {
    tab = docs[di].doc.querySelector(selector);
    if (tab) {
      foundIn = docs[di].label;
      break;
    }
  }
  if (!tab) return { found: false, current: false };
  var rect = tab.getBoundingClientRect();
  var style = (tab.ownerDocument.defaultView || window).getComputedStyle(tab);
  var visible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  if (!visible) return { found: true, current: tab.classList.contains('curr'), visible: false, foundIn: foundIn };
  if (!tab.classList.contains('curr')) {
    tab.setAttribute(markerAttr, marker);
    tab.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
  }
  return {
    found: true,
    current: tab.classList.contains('curr'),
    visible: true,
    selector: '[' + markerAttr + '="' + marker + '"]',
    foundIn: foundIn
  };
})();
`;
}

/** 确保当前位于互动页「收藏牛人」列表。 */
async function ensureCollectedTab(tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
    const marker = createMarker("collected-tab");
    const state = await evalOnTab(
      tabId,
      buildCollectedTabStateScript(marker)
    );
    if (state?.found && state.current) return true;
    if (state?.found && state.visible && state.selector) {
      await clickOnTab(tabId, state.selector);
      await sleep(700);
      return true;
    }
    await sleep(400);
  }
  throw new Error("BOSS 互动页面未加载出“收藏牛人”页签");
}

/** 从收藏列表顶部开始查找，兼容 BOSS 虚拟列表只渲染当前滚动区。 */
async function resetInteractionListScroll(tabId) {
  const code = `
(function resetBossInteractionListScroll() {
  var selectors = ${JSON.stringify(LIST_SCROLL_SELECTORS)};
  function documents() {
    var result = [{ doc: document, win: window }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({ doc: iframes[i].contentDocument, win: iframes[i].contentWindow || window });
        }
      } catch (error) {}
    }
    return result;
  }
  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    for (var si = 0; si < selectors.length; si++) {
      var nodes = docs[di].doc.querySelectorAll(selectors[si]);
      for (var ni = 0; ni < nodes.length; ni++) {
        if (nodes[ni].scrollTop > 0) nodes[ni].scrollTo({ top: 0, behavior: 'instant' });
      }
    }
    if ((docs[di].win.scrollY || 0) > 0) docs[di].win.scrollTo({ top: 0, behavior: 'instant' });
  }
  return { ok: true };
})();
`;
  await evalOnTab(tabId, code);
  await sleep(250);
}

/**
 * 打开 BOSS 互动页并准备好“收藏牛人”列表，供沟通和取消收藏 RPA 共用。
 * 返回的 tab 保持后台渲染，不会提前把用户从 i 快招切走。
 */
export async function prepareBossCollectedInteractionTab() {
  const tabId = await openInteractionTabInBackground();
  await closeExistingInteractionDialogs(tabId);
  await ensureCollectedTab(tabId);
  await resetInteractionListScroll(tabId);
  return tabId;
}

/** 按 data-geek 精确定位卡片，姓名只在唯一命中时兜底。 */
function buildProbeTargetActionScript(geekIds, geekName, marker) {
  return `
(function probeBossInteractionAction() {
  var wantedIds = ${JSON.stringify(geekIds)};
  var wantedName = ${JSON.stringify(geekName || "")};
  var marker = ${JSON.stringify(marker)};
  var markerAttr = ${JSON.stringify(TARGET_ATTRIBUTE)};
  var cardSelector = ${JSON.stringify(CARD_SELECTOR)};
  var geekSelector = ${JSON.stringify(CARD_GEEK_SELECTOR)};
  var continueSelector = ${JSON.stringify(CONTINUE_BUTTON_SELECTOR)};
  var greetSelector = ${JSON.stringify(GREET_BUTTON_SELECTOR)};

  function normId(value) {
    return String(value == null ? '' : value).replace(/~+$/, '');
  }
  function normText(value) {
    return String(value == null ? '' : value).replace(/\\s+/g, '').trim();
  }
  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
  }
  function documents() {
    var result = [{ doc: document, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({ doc: iframes[i].contentDocument, label: iframes[i].src || ('iframe[' + i + ']') });
        }
      } catch (error) {}
    }
    return result;
  }
  function readAction(card) {
    var continueButton = card.querySelector(continueSelector);
    if (isVisible(continueButton) && !continueButton.disabled && continueButton.getAttribute('aria-disabled') !== 'true') {
      return { element: continueButton, action: '继续沟通' };
    }
    var greetButton = card.querySelector(greetSelector);
    if (isVisible(greetButton) && !greetButton.disabled && greetButton.getAttribute('aria-disabled') !== 'true') {
      return { element: greetButton, action: '沟通' };
    }
    return null;
  }
  function markCard(card, matchBy, matchedId, frameLabel) {
    var action = readAction(card);
    var target = action ? action.element : card;
    target.setAttribute(markerAttr, marker);
    target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    return {
      candidateFound: true,
      actionFound: !!action,
      action: action ? action.action : '',
      selector: '[' + markerAttr + '="' + marker + '"]',
      matchBy: matchBy,
      matchedId: matchedId || '',
      foundIn: frameLabel
    };
  }

  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var oldTargets = docs[di].doc.querySelectorAll('[' + markerAttr + ']');
    for (var oi = 0; oi < oldTargets.length; oi++) oldTargets[oi].removeAttribute(markerAttr);
  }

  var wantedSet = {};
  for (var wi = 0; wi < wantedIds.length; wi++) {
    var wantedId = normId(wantedIds[wi]);
    if (wantedId) wantedSet[wantedId] = true;
  }

  var allCards = [];
  var sampleDomIds = [];
  for (var cdi = 0; cdi < docs.length; cdi++) {
    var cards = docs[cdi].doc.querySelectorAll(cardSelector);
    for (var ci = 0; ci < cards.length; ci++) {
      var geekElement = cards[ci].querySelector(geekSelector);
      var domId = geekElement && geekElement.getAttribute('data-geek') || '';
      var nameElement = cards[ci].querySelector('.card-inner .name-wrap .name');
      var name = normText(nameElement && nameElement.textContent);
      if (domId && sampleDomIds.length < 30) sampleDomIds.push(domId);
      allCards.push({ card: cards[ci], domId: domId, name: name, frame: docs[cdi].label });
      if (domId && wantedSet[normId(domId)]) {
        return markCard(cards[ci], 'id', domId, docs[cdi].label);
      }
    }
  }

  var wantedNameText = normText(wantedName);
  var nameMatches = wantedNameText
    ? allCards.filter(function(item) { return item.name === wantedNameText; })
    : [];
  if (nameMatches.length === 1) {
    return markCard(nameMatches[0].card, 'name', nameMatches[0].domId, nameMatches[0].frame);
  }
  if (nameMatches.length > 1) {
    return {
      candidateFound: false,
      error: 'NAME_AMBIGUOUS',
      nameMatchCount: nameMatches.length,
      totalCards: allCards.length,
      sampleDomIds: sampleDomIds
    };
  }
  return {
    candidateFound: false,
    error: 'CANDIDATE_NOT_FOUND',
    totalCards: allCards.length,
    sampleDomIds: sampleDomIds
  };
})();
`;
}

function buildScrollInteractionListScript() {
  return `
(function scrollBossInteractionList() {
  var selectors = ${JSON.stringify(LIST_SCROLL_SELECTORS)};
  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var style = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function documents() {
    var result = [{ doc: document, win: window, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({
            doc: iframes[i].contentDocument,
            win: iframes[i].contentWindow || window,
            label: iframes[i].src || ('iframe[' + i + ']')
          });
        }
      } catch (error) {}
    }
    return result;
  }
  var candidates = [];
  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    for (var si = 0; si < selectors.length; si++) {
      var nodes = docs[di].doc.querySelectorAll(selectors[si]);
      for (var ni = 0; ni < nodes.length; ni++) {
        if (!isVisible(nodes[ni])) continue;
        candidates.push({ node: nodes[ni], frame: docs[di].label });
      }
    }
  }
  for (var ci = 0; ci < candidates.length; ci++) {
    var item = candidates[ci].node;
    var style = (item.ownerDocument.defaultView || window).getComputedStyle(item);
    if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue;
    var before = item.scrollTop;
    var maxTop = Math.max(0, item.scrollHeight - item.clientHeight);
    var next = Math.min(maxTop, before + Math.max(240, item.clientHeight * 0.72));
    if (next <= before + 2) continue;
    item.scrollTo({ top: next, behavior: 'smooth' });
    return { progressed: true, before: Math.round(before), after: Math.round(next), foundIn: candidates[ci].frame };
  }
  for (var wdi = 0; wdi < docs.length; wdi++) {
    var scrollingElement = docs[wdi].doc.scrollingElement || docs[wdi].doc.documentElement;
    var documentBefore = docs[wdi].win.scrollY || scrollingElement.scrollTop || 0;
    var documentMax = Math.max(0, scrollingElement.scrollHeight - docs[wdi].win.innerHeight);
    var documentNext = Math.min(documentMax, documentBefore + Math.max(320, docs[wdi].win.innerHeight * 0.72));
    if (documentNext > documentBefore + 2) {
      docs[wdi].win.scrollTo({ top: documentNext, behavior: 'smooth' });
      return { progressed: true, before: Math.round(documentBefore), after: Math.round(documentNext), documentScroll: true, foundIn: docs[wdi].label };
    }
  }
  return { progressed: false, candidateCount: candidates.length };
})();
`;
}

async function waitForTargetAction(tabId, geekIds, geekName) {
  const startedAt = Date.now();
  let scrollRounds = 0;
  let lastProbe = null;

  while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
    const marker = createMarker("interaction-action");
    lastProbe = await evalOnTab(
      tabId,
      buildProbeTargetActionScript(geekIds, geekName, marker)
    );
    if (lastProbe?.candidateFound && lastProbe?.actionFound) {
      // scrollIntoView / 虚拟列表可能触发 Vue 重绘。等待一小段时间后重新定位，
      // 只有同一候选人、同一按钮连续两次稳定存在，才把 selector 交给 CDP。
      await sleep(TARGET_STABLE_WAIT_MS);
      const stableProbe = await probeTargetAction(
        tabId,
        geekIds,
        geekName,
        "stable-interaction-action"
      );
      if (
        stableProbe?.candidateFound &&
        stableProbe?.actionFound &&
        stableProbe?.action === lastProbe.action &&
        stableProbe?.matchedId === lastProbe.matchedId
      ) {
        return stableProbe;
      }
      lastProbe = stableProbe;
    }
    if (lastProbe?.error === "NAME_AMBIGUOUS") return lastProbe;

    if (!lastProbe?.candidateFound && scrollRounds < MAX_SCROLL_ROUNDS) {
      const scrollResult = await evalOnTab(
        tabId,
        buildScrollInteractionListScript()
      );
      if (scrollResult?.progressed) scrollRounds += 1;
    }
    await sleep(450);
  }
  return lastProbe;
}

async function probeTargetAction(tabId, geekIds, geekName, markerPrefix) {
  const marker = createMarker(markerPrefix);
  return evalOnTab(
    tabId,
    buildProbeTargetActionScript(geekIds, geekName, marker)
  );
}

async function closeGreetingDialogNowIfPresent(tabId) {
  const dialog = await findVisibleElement(
    tabId,
    GREETING_DIALOG_SELECTOR,
    "new-greeting-dialog"
  );
  if (dialog?.found) {
    const confirmed = await closeVisibleElement(
      tabId,
      GREETING_CONFIRM_SELECTOR,
      "new-greeting-confirm"
    );
    if (!confirmed) {
      throw new Error("首次沟通提示框已出现，但未找到“知道了”按钮");
    }
    return { appeared: true, closed: true };
  }
  return { appeared: false, closed: false };
}

/** 首次点击「沟通」后随机等待 1–3 秒，提示框存在才点击「知道了」。 */
async function closeGreetingDialogIfPresent(tabId) {
  const waitMs = randomBetween(
    GREETING_DIALOG_WAIT_MIN_MS,
    GREETING_DIALOG_WAIT_MAX_MS
  );
  await sleep(waitMs);
  const result = await closeGreetingDialogNowIfPresent(tabId);
  return { ...result, waitMs };
}

async function waitForChatDialogOpen(tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ACTION_VERIFY_TIMEOUT_MS) {
    const chatClose = await findVisibleElement(
      tabId,
      CHAT_CLOSE_SELECTOR,
      "opened-chat-close"
    );
    if (chatClose?.found) return true;
    await sleep(250);
  }
  return false;
}

async function waitForContinueAction(tabId, geekIds, geekName) {
  const startedAt = Date.now();
  let greetingDialogClosed = false;
  let lastProbe = null;

  while (Date.now() - startedAt < ACTION_VERIFY_TIMEOUT_MS) {
    // 提示框可能在随机等待结束后才出现，轮询继续沟通按钮时仍要顺手清理。
    const greetingDialog = await closeGreetingDialogNowIfPresent(tabId);
    greetingDialogClosed =
      greetingDialogClosed || Boolean(greetingDialog.closed);

    lastProbe = await probeTargetAction(
      tabId,
      geekIds,
      geekName,
      "wait-continue-action"
    );
    if (
      lastProbe?.candidateFound &&
      lastProbe?.actionFound &&
      lastProbe?.action === "继续沟通"
    ) {
      return { probe: lastProbe, greetingDialogClosed };
    }
    await sleep(250);
  }
  return { probe: lastProbe, greetingDialogClosed };
}

async function clickContinueAndVerify(
  tabId,
  initialContinueProbe,
  geekIds,
  geekName
) {
  let probe = initialContinueProbe;

  for (let attempt = 0; attempt <= MAX_ACTION_RETRIES; attempt += 1) {
    console.log("[bossInteractionGreet] 准备点击继续沟通:", {
      attempt: attempt + 1,
      action: probe?.action,
      matchBy: probe?.matchBy,
      matchedId: probe?.matchedId,
      foundIn: probe?.foundIn,
    });

    await clickOnTab(tabId, probe.selector);
    const chatOpened = await waitForChatDialogOpen(tabId);
    if (chatOpened) {
      return {
        ok: true,
        action: "继续沟通",
        attempt: attempt + 1,
        reason: "CHAT_DIALOG_OPENED",
      };
    }

    if (attempt >= MAX_ACTION_RETRIES) break;
    const continueState = await waitForContinueAction(
      tabId,
      geekIds,
      geekName
    );
    probe = continueState.probe;
    if (
      !probe?.candidateFound ||
      !probe?.actionFound ||
      probe?.action !== "继续沟通" ||
      !probe?.selector
    ) {
      break;
    }
  }

  return {
    ok: false,
    action: "继续沟通",
    message: "已点击“继续沟通”，但 BOSS 聊天窗口未打开，请重试",
  };
}

async function clickInitialGreetThenContinue(
  tabId,
  initialGreetProbe,
  geekIds,
  geekName
) {
  let greetProbe = initialGreetProbe;
  let greetingDialogClosed = false;

  for (let attempt = 0; attempt <= MAX_ACTION_RETRIES; attempt += 1) {
    console.log("[bossInteractionGreet] 准备点击首次沟通:", {
      attempt: attempt + 1,
      matchBy: greetProbe?.matchBy,
      matchedId: greetProbe?.matchedId,
      foundIn: greetProbe?.foundIn,
    });

    await clickOnTab(tabId, greetProbe.selector);
    const greetingDialog = await closeGreetingDialogIfPresent(tabId);
    greetingDialogClosed =
      greetingDialogClosed || Boolean(greetingDialog.closed);

    const continueState = await waitForContinueAction(
      tabId,
      geekIds,
      geekName
    );
    greetingDialogClosed =
      greetingDialogClosed || continueState.greetingDialogClosed;

    if (
      continueState.probe?.candidateFound &&
      continueState.probe?.actionFound &&
      continueState.probe?.action === "继续沟通" &&
      continueState.probe?.selector
    ) {
      const continueResult = await clickContinueAndVerify(
        tabId,
        continueState.probe,
        geekIds,
        geekName
      );
      return {
        ...continueResult,
        action: continueResult.ok ? "沟通并继续沟通" : continueResult.action,
        greetAttempt: attempt + 1,
        greetingDialogClosed,
        greetWaitMs: greetingDialog.waitMs,
      };
    }

    if (attempt >= MAX_ACTION_RETRIES) break;
    const refreshedProbe = await waitForTargetAction(
      tabId,
      geekIds,
      geekName
    );
    if (refreshedProbe?.action === "继续沟通") {
      const continueResult = await clickContinueAndVerify(
        tabId,
        refreshedProbe,
        geekIds,
        geekName
      );
      return {
        ...continueResult,
        action: continueResult.ok ? "沟通并继续沟通" : continueResult.action,
        greetAttempt: attempt + 1,
        greetingDialogClosed,
        greetWaitMs: greetingDialog.waitMs,
      };
    }
    if (
      refreshedProbe?.action !== "沟通" ||
      !refreshedProbe?.selector
    ) {
      break;
    }
    greetProbe = refreshedProbe;
  }

  return {
    ok: false,
    action: "沟通",
    message: "已点击“沟通”，但未出现“继续沟通”按钮，请重试",
    greetingDialogClosed,
  };
}

async function clickAndVerifyCommunication(
  tabId,
  initialProbe,
  geekIds,
  geekName
) {
  if (initialProbe.action === "沟通") {
    return clickInitialGreetThenContinue(
      tabId,
      initialProbe,
      geekIds,
      geekName
    );
  }
  return clickContinueAndVerify(
    tabId,
    initialProbe,
    geekIds,
    geekName
  );
}

/**
 * 在 BOSS 互动页定位候选人，并点击「沟通」或「继续沟通」。
 *
 * @param {{onProgress?:(stage:'searching'|'opening')=>void}} [options]
 * @returns {Promise<{ok:boolean, code?:string, message?:string, action?:string, tabId?:string}>}
 */
export async function greetBossInteractionGeek(resume, options = {}) {
  reportProgress(options, "searching");
  if (!isInElectronClient()) {
    return {
      ok: false,
      code: "NOT_IN_CLIENT",
      message: "该功能仅在 i 快招客户端可用",
    };
  }

  const geekIds = extractGeekIds(resume);
  const geekName = extractGeekName(resume);
  if (geekIds.length === 0 && !geekName) {
    return {
      ok: false,
      code: "NO_GEEK_ID",
      message: "无法识别该候选人的 ID 或姓名",
    };
  }

  let tabId;
  try {
    tabId = await prepareBossCollectedInteractionTab();
  } catch (error) {
    return {
      ok: false,
      code: "INTERACTION_PREPARE_FAILED",
      message: error?.message || "打开 BOSS 互动页面失败",
      tabId,
    };
  }

  let probe;
  try {
    probe = await waitForTargetAction(tabId, geekIds, geekName);
  } catch (error) {
    console.warn("[bossInteractionGreet] 定位互动按钮异常:", error);
    return {
      ok: false,
      code: "INTERACTION_READ_FAILED",
      message: "读取 BOSS 互动页面失败，请前往 BOSS 检查",
      tabId,
    };
  }

  if (!probe?.candidateFound) {
    console.warn("[bossInteractionGreet] 互动页未定位到候选人:", {
      geekIds,
      geekName,
      probe,
    });
    const ambiguous = probe?.error === "NAME_AMBIGUOUS";
    return {
      ok: false,
      code: ambiguous ? "NAME_AMBIGUOUS" : "GEEK_NOT_FOUND",
      message: ambiguous
        ? `BOSS 互动页面存在多个同名“${geekName}”，无法确定候选人`
        : "未在 BOSS 互动页面找到该候选人，请前往 BOSS 检查",
      tabId,
    };
  }

  if (!probe.actionFound || !probe.selector) {
    return {
      ok: false,
      code: "ACTION_NOT_FOUND",
      message: "已在 BOSS 互动页面找到候选人，但未找到沟通按钮",
      tabId,
    };
  }

  try {
    reportProgress(options, "opening");
    const clickResult = await clickAndVerifyCommunication(
      tabId,
      probe,
      geekIds,
      geekName
    );
    if (!clickResult.ok) {
      return {
        ok: false,
        code: "ACTION_NOT_CONFIRMED",
        message:
          clickResult.message ||
          "BOSS 沟通操作未完成，请检查互动页面后重试",
        tabId,
      };
    }
    const tabActivated = await activateBossTab(tabId);
    return {
      ok: true,
      action: clickResult.action,
      tabId,
      tabActivated,
      matchBy: probe.matchBy,
      greetingDialogClosed: Boolean(clickResult.greetingDialogClosed),
      attempt: clickResult.attempt,
      verificationReason: clickResult.reason,
    };
  } catch (error) {
    console.warn("[bossInteractionGreet] 点击互动按钮失败:", error);
    return {
      ok: false,
      code: "ACTION_CLICK_FAILED",
      message: error?.message || "BOSS 互动页面操作失败，请前往 BOSS 检查",
      tabId,
    };
  }
}

export default {
  greetBossInteractionGeek,
};
