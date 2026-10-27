import {
  BOSS_ENTITLEMENT_REQUIRED,
  detectBossEntitlementDialog,
} from "src/util/automation/bossEntitlementDialog";

const FILTER_TRIGGER_SELECTOR =
  ".recommend-filter .filter-wrap, .recommend-filter .filter-label-wrap";
const FILTER_PANEL_SELECTOR = ".recommend-filter .filter-panel, .filter-panel";
const FILTER_GROUP_SELECTOR = ".filter-item";
const FILTER_OPTION_SELECTOR = ".option";
const FOLDED_SELECTOR = ".filter-panel .vip-folded, .vip-folded";
const CONFIRM_SELECTOR = ".btns .btn, button";
const LIST_URL_PATTERN = "/wapi/zpjob/rec/geek/list";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function ensureClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api?.automation?.evalOnTab &&
      window.api.automation.clickOnTab &&
      window.api.siteNetwork?.waitForResponse
  );
}

async function evalOnTab(tabId, code, awaitPromise = false) {
  const result = await window.api.automation.evalOnTab({
    tabId,
    code,
    awaitPromise,
  });
  if (!result?.ok) {
    throw new Error(
      `evalOnTab failed (${result?.error?.code || "UNKNOWN"}): ${
        result?.error?.message || ""
      }`
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
      `clickOnTab failed (${result?.error?.code || "UNKNOWN"}): ${
        result?.error?.message || ""
      }`
    );
  }
  return result.data;
}

function buildFindElementScript({
  selector,
  text,
  exactText = false,
  visibleOnly = true,
} = {}) {
  return `
(function findBossFilterElement() {
  var selector = ${JSON.stringify(selector || "")};
  var expected = String(${JSON.stringify(text || "")}).replace(/\\s+/g, '').trim();
  var exactText = ${exactText ? "true" : "false"};
  var visibleOnly = ${visibleOnly ? "true" : "false"};

  function compact(value) {
    return String(value == null ? '' : value).replace(/\\s+/g, '').trim();
  }

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0;
  }

  function escapeIdent(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) { return '\\\\' + ch; });
  }

  function makeUniqueSelector(el, doc) {
    if (el.id) return '#' + escapeIdent(el.id);
    var parts = [];
    var current = el;
    while (current && current !== doc.body && current !== doc.documentElement && parts.length < 10) {
      var part = current.tagName.toLowerCase();
      if (current.classList && current.classList.length) {
        part += Array.prototype.slice.call(current.classList, 0, 3)
          .map(function(name) { return '.' + escapeIdent(name); })
          .join('');
      }
      if (current.parentElement) {
        var siblings = Array.prototype.filter.call(
          current.parentElement.children,
          function(node) { return node.tagName === current.tagName; }
        );
        if (siblings.length > 1) {
          part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

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
      } catch (e) {}
    }
    return result;
  }

  function matchesText(el) {
    if (!expected) return true;
    var value = compact(el.textContent);
    return exactText ? value === expected : value.indexOf(expected) !== -1;
  }

  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di].doc;
    var elements;
    try { elements = doc.querySelectorAll(selector); } catch (e) { elements = []; }
    for (var ei = 0; ei < elements.length; ei++) {
      var element = elements[ei];
      if (visibleOnly && !isVisible(element)) continue;
      if (!matchesText(element)) continue;
      return {
        ok: true,
        selector: makeUniqueSelector(element, doc),
        foundIn: docs[di].label,
        active: /(^|\\s)active(\\s|$)/.test(element.className || ''),
        text: String(element.textContent || '').trim()
      };
    }
  }
  return { ok: false, error: 'ELEMENT_NOT_FOUND', selector: selector, text: expected };
})();
`;
}

function buildFindOptionScript(name, value) {
  return `
(function findBossFilterOption() {
  var groupName = String(${JSON.stringify(name)}).replace(/\\s+/g, '').trim();
  var optionValue = String(${JSON.stringify(value)}).replace(/\\s+/g, '').trim();
  var PANEL_SELECTOR = ${JSON.stringify(FILTER_PANEL_SELECTOR)};
  var GROUP_SELECTOR = ${JSON.stringify(FILTER_GROUP_SELECTOR)};
  var OPTION_SELECTOR = ${JSON.stringify(FILTER_OPTION_SELECTOR)};

  function compact(value) {
    return String(value == null ? '' : value).replace(/\\s+/g, '').trim();
  }
  function visible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var style = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0;
  }
  function escapeIdent(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) { return '\\\\' + ch; });
  }
  function makeSelector(el, doc) {
    if (el.id) return '#' + escapeIdent(el.id);
    var parts = [];
    var current = el;
    while (current && current !== doc.body && current !== doc.documentElement && parts.length < 10) {
      var part = current.tagName.toLowerCase();
      if (current.classList && current.classList.length) {
        part += Array.prototype.slice.call(current.classList, 0, 3)
          .map(function(name) { return '.' + escapeIdent(name); })
          .join('');
      }
      if (current.parentElement) {
        var siblings = Array.prototype.filter.call(
          current.parentElement.children,
          function(node) { return node.tagName === current.tagName; }
        );
        if (siblings.length > 1) {
          part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }
  function documents() {
    var result = [{ doc: document, label: 'mainFrame' }];
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          result.push({ doc: iframes[i].contentDocument, label: iframes[i].src || ('iframe[' + i + ']') });
        }
      } catch (e) {}
    }
    return result;
  }
  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di].doc;
    var panels = doc.querySelectorAll(PANEL_SELECTOR);
    for (var pi = panels.length - 1; pi >= 0; pi--) {
      var panel = panels[pi];
      if (!visible(panel)) continue;
      var groups = panel.querySelectorAll(GROUP_SELECTOR);
      var group = null;
      for (var gi = 0; gi < groups.length; gi++) {
        if (compact(groups[gi].textContent).indexOf(groupName) !== -1) {
          group = groups[gi];
          break;
        }
      }
      if (!group) {
        var names = panel.querySelectorAll('.name');
        for (var ni = 0; ni < names.length; ni++) {
          if (compact(names[ni].textContent).indexOf(groupName) !== -1) {
            group = names[ni].parentElement;
            break;
          }
        }
      }
      if (!group) continue;
      var options = group.querySelectorAll(OPTION_SELECTOR);
      for (var oi = 0; oi < options.length; oi++) {
        var option = options[oi];
        if (compact(option.textContent) !== optionValue) continue;
        return {
          ok: true,
          selector: makeSelector(option, doc),
          foundIn: docs[di].label,
          active: /(^|\\s)active(\\s|$)/.test(option.className || ''),
          text: String(option.textContent || '').trim()
        };
      }
      return { ok: false, error: 'OPTION_NOT_FOUND', group: name, value: value };
    }
  }
  return { ok: false, error: 'GROUP_NOT_FOUND', group: name, value: value };
})();
`;
}

function createFilterError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function findElement(tabId, options) {
  return evalOnTab(tabId, buildFindElementScript(options));
}

async function assertEntitlement(tabId) {
  const dialog = await detectBossEntitlementDialog(tabId);
  if (dialog?.found) {
    const error = createFilterError(
      "BOSS直聘筛选权益不足，任务已停止",
      BOSS_ENTITLEMENT_REQUIRED
    );
    error.dialogText = dialog.text;
    throw error;
  }
}

async function waitForVisibleElement(tabId, options, timeoutMs) {
  const startedAt = Date.now();
  let result = null;
  while (Date.now() - startedAt <= timeoutMs) {
    result = await findElement(tabId, options);
    if (result?.ok) return result;
    await sleep(180);
  }
  return result || { ok: false, error: "ELEMENT_NOT_FOUND" };
}

async function waitForFilterOption(tabId, name, value, timeoutMs) {
  const startedAt = Date.now();
  let result = null;
  while (Date.now() - startedAt <= timeoutMs) {
    result = await evalOnTab(tabId, buildFindOptionScript(name, value));
    if (result?.ok) return result;
    await sleep(180);
  }
  return result || { ok: false, error: "OPTION_NOT_FOUND" };
}

export async function applyBossRecommendFilters(tabId, filters, opts = {}) {
  if (!ensureClient()) {
    return {
      ok: false,
      errorCode: "NOT_IN_CLIENT",
      message: "BOSS 原生筛选能力不可用（需要最新 Electron preload）",
    };
  }
  if (!tabId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "tabId required" };
  }

  const wanted = (Array.isArray(filters) ? filters : []).filter(
    (item) => item?.value && item.value !== "不限"
  );
  const picked = [];
  const skipped = [];
  const waitListMs = Math.max(2_000, Number(opts.waitListMs) || 12_000);

  try {
    await assertEntitlement(tabId);

    const trigger = await waitForVisibleElement(
      tabId,
      { selector: FILTER_TRIGGER_SELECTOR },
      5_000
    );
    if (!trigger?.ok) {
      throw createFilterError(".filter-wrap trigger not visible", "OVERLAY_BLOCKED");
    }
    console.log(
      `[任务流程] [bossRecommend] 原生筛选：打开筛选面板 foundIn=${trigger.foundIn}`
    );
    await clickOnTab(tabId, trigger.selector);
    await sleep(randomBetween(250, 550));
    await assertEntitlement(tabId);

    const panel = await waitForVisibleElement(
      tabId,
      { selector: FILTER_PANEL_SELECTOR },
      5_000
    );
    if (!panel?.ok) {
      throw createFilterError(".filter-panel did not open", "OVERLAY_BLOCKED");
    }

    const folded = await findElement(tabId, { selector: FOLDED_SELECTOR });
    if (folded?.ok) {
      console.log("[任务流程] [bossRecommend] 原生筛选：展开更多选项");
      await clickOnTab(tabId, folded.selector);
      await sleep(randomBetween(250, 550));
      await assertEntitlement(tabId);
    }

    for (const item of wanted) {
      const detailedOption = await waitForFilterOption(
        tabId,
        item.name,
        item.value,
        5_000
      );
      if (!detailedOption?.ok) {
        const reason = detailedOption?.error === "GROUP_NOT_FOUND"
          ? "group_not_found"
          : "option_not_found";
        throw createFilterError(
          `BOSS 筛选${reason === "group_not_found" ? "分组" : "选项"}不存在: ${item.name}=${item.value}`,
          "FILTER_OPTION_NOT_FOUND"
        );
      }
      if (detailedOption.active) {
        skipped.push({ name: item.name, value: item.value, reason: "already_active" });
      } else {
        console.log(
          `[任务流程] [bossRecommend] 原生筛选：选择 ${item.name}=${item.value}`
        );
        await clickOnTab(tabId, detailedOption.selector);
        await sleep(randomBetween(180, 480));
        await assertEntitlement(tabId);
      }
      picked.push({ name: item.name, value: item.value });
    }

    await sleep(randomBetween(300, 700));
    await assertEntitlement(tabId);
    const confirm = await evalOnTab(
      tabId,
      buildFindElementScript({ selector: CONFIRM_SELECTOR, text: "确定", exactText: false })
    );
    if (!confirm?.ok) {
      throw createFilterError("BOSS 筛选确认按钮不存在", "OVERLAY_BLOCKED");
    }

    const sinceTs = Date.now();
    await window.api.siteNetwork.clearCache("boss");
    const waitPromise = window.api.siteNetwork.waitForResponse({
      siteKey: "boss",
      urlPattern: LIST_URL_PATTERN,
      timeoutMs: waitListMs,
      sinceTs,
    });
    await clickOnTab(tabId, confirm.selector);
    const response = await waitPromise;
    if (!response?.ok) {
      throw createFilterError(
        `BOSS 筛选确认后未收到推荐列表响应: ${response?.message || response?.code || "TIMEOUT"}`,
        response?.code || "TIMEOUT"
      );
    }

    const body = response.data?.bodyJson;
    const apiCode = Number(body?.code);
    if (!body || (apiCode !== 0 && !Number.isNaN(apiCode))) {
      throw createFilterError(
        body?.message || `BOSS 推荐列表接口返回异常 code=${apiCode}`,
        "API_ERROR"
      );
    }
    const zpData = body.zpData || null;
    return {
      ok: true,
      data: {
        picked,
        skipped,
        apiUrl: response.data.url,
        zpData,
        geekCount: Array.isArray(zpData?.geekList) ? zpData.geekList.length : 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: error?.code || "SCRIPT_ERROR",
      message: error?.message || String(error),
      data: { picked, skipped },
    };
  }
}

export default { applyBossRecommendFilters };

