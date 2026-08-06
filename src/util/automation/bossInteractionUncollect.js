/**
 * “清空重新搜索”前清理上一次 BOSS 推荐任务产生的收藏。
 *
 * 安全边界：
 *   - 只处理原任务 results/query 中 businessChannel=RECOMMEND、channelSubType=BOSS 的结果；
 *   - 推荐结果只包含本次由 RPA 从“收藏”变为“已收藏”的候选人；
 *   - 只按 encryptGeekId 精确匹配，不按姓名盲点，避免误取消同名候选人；
 *   - 单个候选人失败后继续，绝不阻止新的 RESTART 任务创建。
 */

import { queryTaskResults } from "src/api/searchTaskApi";
import { lookupGeekId } from "src/util/automation/recommendGeekIdMap";
import { prepareBossCollectedInteractionTab } from "src/util/automation/bossInteractionGreet";

const CARD_SELECTOR =
  ".page-interaction #recommend-list ul.card-list > li.card-item";
const CARD_GEEK_SELECTOR = ".card-inner.new-geek-wrap[data-geek]";
const CANCEL_SELECTOR = ".tooltip-wrap.suitable .icon.iboss-close";
const LIST_SCROLL_SELECTORS = [
  ".page-interaction .recommend-list-wrap",
  ".page-interaction #recommend-list",
];
const TARGET_ATTRIBUTE = "data-ikz-uncollect-target";
const HOVER_ATTRIBUTE = "data-ikz-uncollect-hover";

const MAX_SCROLL_ROUNDS = 40;
const MAX_IDLE_ROUNDS = 6;
const REMOVE_VERIFY_TIMEOUT_MS = 5_000;
const UNCOLLECT_INTERVAL_MIN_MS = 1_000;
const UNCOLLECT_INTERVAL_MAX_MS = 3_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function waitBeforeNextUncollect(onProgress) {
  const waitMs = randomBetween(
    UNCOLLECT_INTERVAL_MIN_MS,
    UNCOLLECT_INTERVAL_MAX_MS
  );
  onProgress?.("interval", { waitMs });
  await sleep(waitMs);
}

function normalizeGeekId(value) {
  return String(value == null ? "" : value).trim().replace(/~+$/, "");
}

function isLikelyEncryptGeekId(value) {
  const normalized = normalizeGeekId(value);
  return (
    normalized.length >= 12 &&
    !/^\d+$/.test(normalized) &&
    !normalized.startsWith("rec_")
  );
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function readTaskResultList(response) {
  const pageData = response?.data;
  if (Array.isArray(pageData)) return pageData;
  if (pageData && Array.isArray(pageData.data)) return pageData.data;
  if (pageData && Array.isArray(pageData.list)) return pageData.list;
  return [];
}

function collectDirectGeekIds(item, flat, blind) {
  const raw = flat?._raw || item?._raw || {};
  const card = raw?.geekCard || flat?.geekCard || item?.geekCard || {};
  return [
    item?.encryptGeekId,
    flat?.encryptGeekId,
    blind?.encryptGeekId,
    raw?.encryptGeekId,
    card?.encryptGeekId,
  ].filter(isLikelyEncryptGeekId);
}

function collectLocalIds(item, flat, blind) {
  const originalInfo =
    parseJsonObject(item?.originalResumeUrlInfo) ||
    parseJsonObject(flat?.originalResumeUrlInfo) ||
    parseJsonObject(blind?.originalResumeUrlInfo);
  const request = originalInfo?.request || {};
  return [
    item?.outId,
    item?.channelResumeId,
    flat?.outId,
    blind?.outId,
    request?.rowId,
    item?.taskResumeId,
    flat?.taskResumeId,
    item?.resumeBlindId,
    blind?.resumeBlindId,
    blind?.id,
    flat?.id,
  ].filter((value) => value !== undefined && value !== null && value !== "");
}

async function loadTaskUncollectTargets(taskId) {
  const response = await queryTaskResults(taskId);
  const rawList = readTaskResultList(response);
  const recommendItems = rawList.filter((item) => {
    const blind = item?.resumeBlind && typeof item.resumeBlind === "object"
      ? item.resumeBlind
      : {};
    const businessChannel = item?.businessChannel || blind?.businessChannel;
    const channelSubType = item?.channelSubType || blind?.channelSubType;
    return (
      businessChannel === "RECOMMEND" &&
      channelSubType === "BOSS" &&
      item?.visibleInResultSet !== false
    );
  });

  const targets = [];
  const unresolved = [];
  const seen = new Set();

  for (const item of recommendItems) {
    const blind = item?.resumeBlind && typeof item.resumeBlind === "object"
      ? item.resumeBlind
      : {};
    const flat = { ...blind, ...item };
    const ids = collectDirectGeekIds(item, flat, blind);
    for (const localId of collectLocalIds(item, flat, blind)) {
      const mapped = lookupGeekId(localId);
      if (isLikelyEncryptGeekId(mapped)) ids.push(mapped);
    }

    const normalizedIds = Array.from(
      new Set(ids.map(normalizeGeekId).filter(Boolean))
    );
    const name = String(flat?.name || blind?.name || "").trim();
    if (normalizedIds.length === 0) {
      unresolved.push({
        name,
        taskResumeId: item?.taskResumeId || flat?.taskResumeId || "",
        reason: "ENCRYPT_GEEK_ID_UNRESOLVED",
      });
      continue;
    }

    const dedupeKey = normalizedIds[0];
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    targets.push({ geekIds: normalizedIds, name, key: dedupeKey });
  }

  return {
    totalRecommendResults: recommendItems.length,
    targets,
    unresolved,
  };
}

async function evalOnTab(tabId, code, awaitPromise = false) {
  const result = await window.api.automation.evalOnTab({
    tabId,
    code,
    awaitPromise,
  });
  if (!result?.ok) {
    throw new Error(
      result?.error?.message || result?.error?.code || "读取 BOSS 收藏列表失败"
    );
  }
  return result.result;
}

function createMarker(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildProbePendingTargetScript(pendingIds, marker) {
  return `
(function probeBossUncollectTarget() {
  var pendingIds = ${JSON.stringify(pendingIds)};
  var marker = ${JSON.stringify(marker)};
  var targetAttr = ${JSON.stringify(TARGET_ATTRIBUTE)};
  var hoverAttr = ${JSON.stringify(HOVER_ATTRIBUTE)};
  var cardSelector = ${JSON.stringify(CARD_SELECTOR)};
  var geekSelector = ${JSON.stringify(CARD_GEEK_SELECTOR)};
  var cancelSelector = ${JSON.stringify(CANCEL_SELECTOR)};

  function norm(value) { return String(value == null ? '' : value).replace(/~+$/, ''); }
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

  var wanted = {};
  for (var pi = 0; pi < pendingIds.length; pi++) wanted[norm(pendingIds[pi])] = true;
  var docs = documents();
  var sampleIds = [];
  var totalCards = 0;

  for (var di = 0; di < docs.length; di++) {
    var oldTargets = docs[di].doc.querySelectorAll('[' + targetAttr + '],[' + hoverAttr + ']');
    for (var oi = 0; oi < oldTargets.length; oi++) {
      oldTargets[oi].removeAttribute(targetAttr);
      oldTargets[oi].removeAttribute(hoverAttr);
    }

    var cards = docs[di].doc.querySelectorAll(cardSelector);
    totalCards += cards.length;
    for (var ci = 0; ci < cards.length; ci++) {
      var geekElement = cards[ci].querySelector(geekSelector);
      var domId = geekElement && geekElement.getAttribute('data-geek') || '';
      if (domId && sampleIds.length < 30) sampleIds.push(domId);
      if (!domId || !wanted[norm(domId)]) continue;

      var hoverTarget = cards[ci].querySelector('.candidate-card-wrap') || cards[ci];
      var cancelButton = cards[ci].querySelector(cancelSelector);
      cards[ci].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      hoverTarget.setAttribute(hoverAttr, marker);
      if (cancelButton) cancelButton.setAttribute(targetAttr, marker);
      return {
        found: true,
        cancelFound: !!cancelButton,
        matchedId: domId,
        normalizedMatchedId: norm(domId),
        targetSelector: '[' + targetAttr + '="' + marker + '"]',
        hoverSelector: '[' + hoverAttr + '="' + marker + '"]',
        foundIn: docs[di].label,
        totalCards: totalCards,
        sampleIds: sampleIds
      };
    }
  }
  return { found: false, totalCards: totalCards, sampleIds: sampleIds };
})();
`;
}

function buildScrollInteractionListScript() {
  return `
(function scrollBossUncollectList() {
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
          result.push({ doc: iframes[i].contentDocument, win: iframes[i].contentWindow || window, label: iframes[i].src || ('iframe[' + i + ']') });
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
        var item = nodes[ni];
        if (!isVisible(item)) continue;
        var style = (item.ownerDocument.defaultView || window).getComputedStyle(item);
        if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue;
        var before = item.scrollTop;
        var maxTop = Math.max(0, item.scrollHeight - item.clientHeight);
        var next = Math.min(maxTop, before + Math.max(240, item.clientHeight * 0.72));
        if (next <= before + 2) continue;
        item.scrollTo({ top: next, behavior: 'smooth' });
        return { progressed: true, before: Math.round(before), after: Math.round(next), foundIn: docs[di].label };
      }
    }
  }

  for (var wi = 0; wi < docs.length; wi++) {
    var scrollingElement = docs[wi].doc.scrollingElement || docs[wi].doc.documentElement;
    var beforeDoc = docs[wi].win.scrollY || scrollingElement.scrollTop || 0;
    var maxDoc = Math.max(0, scrollingElement.scrollHeight - docs[wi].win.innerHeight);
    var nextDoc = Math.min(maxDoc, beforeDoc + Math.max(320, docs[wi].win.innerHeight * 0.72));
    if (nextDoc > beforeDoc + 2) {
      docs[wi].win.scrollTo({ top: nextDoc, behavior: 'smooth' });
      return { progressed: true, before: Math.round(beforeDoc), after: Math.round(nextDoc), documentScroll: true, foundIn: docs[wi].label };
    }
  }
  return { progressed: false };
})();
`;
}

function buildWaitTargetRemovedScript(geekId, timeoutMs) {
  return `
(async function waitBossUncollectRemoved() {
  var wanted = ${JSON.stringify(normalizeGeekId(geekId))};
  var timeoutMs = ${Number(timeoutMs) || 0};
  var startedAt = Date.now();
  function norm(value) { return String(value == null ? '' : value).replace(/~+$/, ''); }
  function documents() {
    var result = [document];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try { if (iframes[i].contentDocument) result.push(iframes[i].contentDocument); } catch (error) {}
    }
    return result;
  }
  function exists() {
    var docs = documents();
    for (var di = 0; di < docs.length; di++) {
      var cards = docs[di].querySelectorAll(${JSON.stringify(CARD_GEEK_SELECTOR)});
      for (var ci = 0; ci < cards.length; ci++) {
        if (norm(cards[ci].getAttribute('data-geek')) === wanted) return true;
      }
    }
    return false;
  }
  while (Date.now() - startedAt < timeoutMs) {
    if (!exists()) return { removed: true, elapsedMs: Date.now() - startedAt };
    await new Promise(function(resolve) { setTimeout(resolve, 180); });
  }
  return { removed: !exists(), elapsedMs: Date.now() - startedAt };
})();
`;
}

function pendingGeekIds(targets) {
  return Array.from(new Set(targets.flatMap((target) => target.geekIds)));
}

/**
 * @returns {Promise<{
 *   ok:boolean,
 *   totalRecommendResults:number,
 *   targetCount:number,
 *   cancelled:number,
 *   alreadyMissing:number,
 *   unresolved:number,
 *   failed:number,
 *   errors:Array<object>
 * }>}
 */
export async function uncollectBossRecommendTask(taskId, opts = {}) {
  if (!taskId) {
    return {
      ok: true,
      totalRecommendResults: 0,
      targetCount: 0,
      cancelled: 0,
      alreadyMissing: 0,
      unresolved: 0,
      failed: 0,
      errors: [],
    };
  }
  if (
    typeof window === "undefined" ||
    !window.api?.automation?.evalOnTab ||
    !window.api?.automation?.clickOnTab
  ) {
    return {
      ok: false,
      totalRecommendResults: 0,
      targetCount: 0,
      cancelled: 0,
      alreadyMissing: 0,
      unresolved: 0,
      failed: 1,
      errors: [{ reason: "NOT_IN_CLIENT" }],
    };
  }

  const loaded = await loadTaskUncollectTargets(taskId);
  opts.onProgress?.("loaded", {
    totalRecommendResults: loaded.totalRecommendResults,
    targetCount: loaded.targets.length,
    unresolved: loaded.unresolved.length,
  });
  const errors = loaded.unresolved.map((item) => ({ ...item }));
  const pending = [...loaded.targets];
  let cancelled = 0;
  let alreadyMissing = 0;
  let failed = 0;
  let tabId = null;

  if (pending.length === 0) {
    return {
      ok: errors.length === 0,
      totalRecommendResults: loaded.totalRecommendResults,
      targetCount: 0,
      cancelled,
      alreadyMissing,
      unresolved: loaded.unresolved.length,
      failed,
      errors,
    };
  }

  try {
    tabId = await prepareBossCollectedInteractionTab();
    if (typeof window.api?.tabs?.setLocked === "function") {
      await window.api.tabs.setLocked({ id: tabId, locked: true });
    }

    let scrollRounds = 0;
    let idleRounds = 0;
    while (pending.length > 0 && scrollRounds < MAX_SCROLL_ROUNDS) {
      const marker = createMarker("uncollect");
      const probe = await evalOnTab(
        tabId,
        buildProbePendingTargetScript(pendingGeekIds(pending), marker)
      );

      if (probe?.found) {
        idleRounds = 0;
        const matchedId = normalizeGeekId(probe.normalizedMatchedId || probe.matchedId);
        const targetIndex = pending.findIndex((target) =>
          target.geekIds.some((id) => normalizeGeekId(id) === matchedId)
        );
        const target = targetIndex >= 0 ? pending[targetIndex] : null;
        if (!probe.cancelFound || !probe.targetSelector || !probe.hoverSelector) {
          failed += 1;
          errors.push({ geekId: matchedId, name: target?.name || "", reason: "CANCEL_BUTTON_NOT_FOUND" });
          if (targetIndex >= 0) pending.splice(targetIndex, 1);
          await waitBeforeNextUncollect(opts.onProgress);
          continue;
        }

        await sleep(280);
        const stableMarker = createMarker("uncollect-stable");
        const stable = await evalOnTab(
          tabId,
          buildProbePendingTargetScript(pendingGeekIds(pending), stableMarker)
        );
        if (!stable?.found || !stable?.cancelFound) continue;

        opts.onProgress?.("itemStart", {
          geekId: stable.normalizedMatchedId || stable.matchedId,
          name: target?.name || "",
          remaining: pending.length,
        });
        const clickResult = await window.api.automation.clickOnTab({
          tabId,
          selector: stable.targetSelector,
          hoverSelector: stable.hoverSelector,
          hoverWaitMs: 260,
          pressHoldMs: 70,
          requireVisible: true,
        });
        if (!clickResult?.ok) {
          failed += 1;
          errors.push({
            geekId: matchedId,
            name: target?.name || "",
            reason: clickResult?.error?.code || "CLICK_FAILED",
            message: clickResult?.error?.message || "",
          });
          if (targetIndex >= 0) pending.splice(targetIndex, 1);
          await waitBeforeNextUncollect(opts.onProgress);
          continue;
        }

        const removed = await evalOnTab(
          tabId,
          buildWaitTargetRemovedScript(stable.normalizedMatchedId || stable.matchedId, REMOVE_VERIFY_TIMEOUT_MS),
          true
        );
        if (removed?.removed) {
          cancelled += 1;
          opts.onProgress?.("itemDone", {
            geekId: matchedId,
            name: target?.name || "",
            remaining: Math.max(0, pending.length - 1),
          });
        } else {
          failed += 1;
          errors.push({ geekId: matchedId, name: target?.name || "", reason: "REMOVE_VERIFY_TIMEOUT" });
        }
        if (targetIndex >= 0) pending.splice(targetIndex, 1);
        await waitBeforeNextUncollect(opts.onProgress);
        continue;
      }

      const scrollResult = await evalOnTab(tabId, buildScrollInteractionListScript());
      if (scrollResult?.progressed) {
        scrollRounds += 1;
        idleRounds = 0;
        await sleep(520);
      } else {
        idleRounds += 1;
        if (idleRounds >= MAX_IDLE_ROUNDS) break;
        await sleep(800);
      }
    }

    // 扫完整个收藏列表仍找不到：通常表示用户已经手动取消，按“已清理”处理。
    alreadyMissing += pending.length;
    for (const target of pending) {
      errors.push({ geekId: target.key, name: target.name, reason: "NOT_FOUND_OR_ALREADY_UNCOLLECTED" });
    }
  } finally {
    if (tabId && typeof window.api?.tabs?.setLocked === "function") {
      try {
        await window.api.tabs.setLocked({ id: tabId, locked: false });
      } catch (_error) {
        // 解锁失败不阻止后续重启任务。
      }
    }
  }

  return {
    ok: failed === 0 && loaded.unresolved.length === 0,
    totalRecommendResults: loaded.totalRecommendResults,
    targetCount: loaded.targets.length,
    cancelled,
    alreadyMissing,
    unresolved: loaded.unresolved.length,
    failed,
    errors,
  };
}

export default uncollectBossRecommendTask;
