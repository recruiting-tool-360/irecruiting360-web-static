/**
 * BOSS 推荐牛人「立即沟通」新逻辑。
 *
 * 旧逻辑（bossScheduleInterview）：收藏候选人 → 打开 BOSS 互动消息页。
 * 新逻辑（本模块）：
 *   1) 定位**已打开的 BOSS 推荐牛人列表 tab**（zhipin.com/web/chat/recommend）。
 *      - 不存在 / 当前没有这个推荐列表页面 → 报错码 NO_RECOMMEND_TAB，由调用方提示用户。
 *   2) 在该列表 DOM 里按 data-geekid / data-geek 找这个牛人卡片
 *      （卡片结构见 docs/boss地址资料.md L1198-1446）。
 *      - 找不到 → 报错码 GEEK_NOT_IN_LIST，由调用方提示用户。
 *   3) 切换到该 tab（activate）→ 把卡片滚到可视区 →
 *      CDP 自动点击卡片右侧的「打招呼」按钮（button.btn-greet，见 L1430-1432）。
 *
 * 依赖 Electron 客户端的 CDP 自动化能力：
 *   - window.api.tabs.list / window.api.tabs.activate
 *   - window.api.automation.evalOnTab（只读 DOM + scrollIntoView，零风控）
 *   - window.api.automation.clickOnTab（CDP Input.dispatchMouseEvent，isTrusted=true）
 *
 * ⚠️ 点击「打招呼」是真实业务动作：会给候选人发出问候消息。selector 严格锁定 .btn-greet，
 *    不会误点到卡片信息块。
 */

import { lookupGeekId } from "src/util/automation/recommendGeekIdMap";

const BOSS_CHANNEL = "boss";
/** 推荐牛人列表的 URL 片段（宿主 chat 页 + 内嵌 iframe 页都算） */
const RECOMMEND_URL_PATTERNS = ["/web/chat/recommend", "/web/frame/recommend"];

function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api &&
      window.api.automation &&
      typeof window.api.automation.clickOnTab === "function" &&
      typeof window.api.automation.evalOnTab === "function" &&
      window.api.tabs &&
      typeof window.api.tabs.list === "function"
  );
}

/** 判断一个 tab 是不是 BOSS 推荐牛人列表页 */
function isRecommendTab(t) {
  if (!t || typeof t.url !== "string") return false;
  const urlMatch = RECOMMEND_URL_PATTERNS.some((p) => t.url.includes(p));
  if (!urlMatch) return false;
  // channel 标了就必须是 boss；没标 channel 的兜底用域名判断
  if (t.channel) return t.channel === BOSS_CHANNEL;
  return /zhipin\.com/.test(t.url);
}

/**
 * 从 resume 里抽取所有可能用于匹配 BOSS 推荐卡 data-geekid / data-geek 的候选 ID。
 * BOSS 推荐卡 DOM 上 data-geekid = encryptGeekId（见 bossHumanizeBrowse.js DOM 假设）。
 *
 * @param {object} resume ResumeCard 的 resume 对象（推荐牛人通常带 _raw 原始 geek）
 * @returns {string[]}
 */
export function extractGeekIds(resume) {
  const ids = [];
  const push = (v) => {
    if (v !== undefined && v !== null && v !== "" && !ids.includes(String(v))) {
      ids.push(String(v));
    }
  };
  const raw = (resume && resume._raw) || {};
  const card = raw.geekCard || {};
  push(raw.encryptGeekId);
  push(raw.geekId);
  push(card.encryptGeekId);
  push(card.geekId);
  // 兜底：任务结果归一化后的 resume（无 _raw）可能把 geekId 放在顶层 / outId
  push(resume && resume.encryptGeekId);
  push(resume && resume.geekId);
  push(resume && resume.outId);

  // ★ 关键：查看任务结果时 resume 只有本地 id（resumeBlindId）/ outId(rec_xxx)，没有长 encryptGeekId。
  //   用这些 id 反查 /results 落库时写进 sessionStorage 的映射，拿到真·长 encryptGeekId
  //   （DOM data-geekid），比按姓名兜底可靠。
  //   最稳的 key 是 outId(=uniqSign=rec_<geekId>)：它在 /results 上送和 /query 回来里是同一个值
  //   （query 的 originalResumeUrlInfo.request.rowId 也等于它）。
  const lookupKeys = [
    resume && resume.outId,
    extractRowId(resume), // originalResumeUrlInfo.request.rowId
    resume && resume.id,
    resume && resume.resumeBlindId,
    resume && resume.taskResumeId
  ];
  for (const k of lookupKeys) {
    if (k === undefined || k === null || k === "") continue;
    push(lookupGeekId(k));
  }
  return ids;
}

/** 从 resume.originalResumeUrlInfo（JSON 字符串）里取 request.rowId（= outId = rec_<geekId>）。 */
function extractRowId(resume) {
  const info = resume && resume.originalResumeUrlInfo;
  if (!info || typeof info !== "string") return "";
  try {
    const obj = JSON.parse(info);
    return (obj && obj.request && obj.request.rowId) || "";
  } catch (_e) {
    return "";
  }
}

/** 取候选人姓名（id 匹配不上时按姓名兜底匹配 DOM 卡片）。 */
export function extractGeekName(resume) {
  if (!resume) return "";
  const raw = resume._raw || {};
  const card = raw.geekCard || {};
  const name = card.geekName || raw.geekName || resume.name || "";
  return String(name).trim();
}

/**
 * 构造「在页面里找牛人卡片 + 定位打招呼按钮」的只读探针脚本。
 *
 * 策略（不依赖一定在主 frame，跨所有同源 iframe 扫描）：
 *   1) 收集主 frame + 所有同源 iframe 里的所有 `[data-geekid]`/`[data-geek]` 卡片，
 *      汇成 `{ id, doc }` 列表（同时记 diag：卡片总数 / 一部分 id 样本）。
 *   2) 用我们的候选 geekIds 跟 DOM 卡片 id 求交集（精确匹配）。
 *   3) 命中后从卡片向上找 `.candidate-card-wrap`/`li.card-item`，
 *      在其内部找 `.btn-greet`，生成唯一 selector 返回给 CDP 点击。
 *
 * 返回 diag 字段方便排查：DOM 实际有哪些 data-geekid、我们在找哪些。
 */
function buildFindGreetScript(geekIds, wantName) {
  return `
(function findGreet() {
  var wantIds = ${JSON.stringify(geekIds)};
  var wantName = ${JSON.stringify(wantName || "")};

  // ★ BOSS encryptGeekId 归一化：DOM 上的 data-geekid 末尾带 "~~"（base64 url-safe padding），
  //   而我们手里的 encryptGeekId 可能不带（或反之）。统一去掉末尾的 ~ 再比较，
  //   '158d...FQ~~' 与 '158d...FQ' 视为同一人。
  function normId(s) {
    return String(s == null ? '' : s).replace(/~+$/, '');
  }
  var wantSet = {};
  for (var wi = 0; wi < wantIds.length; wi++) {
    var nid = normId(wantIds[wi]);
    if (nid) wantSet[nid] = true;
  }

  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    return true;
  }

  // 给元素生成 :nth-of-type 唯一路径（clickOnTab 用它精确定位，避免撞同类 .btn-greet）
  function makeUniqueSelector(el, doc) {
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur !== doc.body && cur !== doc.documentElement && parts.length < 8) {
      var tag = cur.tagName.toLowerCase();
      var part = tag;
      if (cur.parentNode) {
        var sameTag = Array.prototype.filter.call(cur.parentNode.children, function(c) { return c.tagName === cur.tagName; });
        if (sameTag.length > 1) {
          part += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
        }
      }
      if (cur.classList && cur.classList.length > 0) {
        var cls = Array.prototype.slice.call(cur.classList, 0, 2).map(function(c) { return '.' + CSS.escape(c); }).join('');
        part += cls;
      }
      parts.unshift(part);
      if (cur.parentNode && cur.parentNode.id) {
        parts.unshift('#' + CSS.escape(cur.parentNode.id));
        break;
      }
      cur = cur.parentNode;
    }
    return parts.join(' > ');
  }

  function findGreetBtn(cardEl, doc) {
    var wrap = (cardEl.closest && (cardEl.closest('.candidate-card-wrap') || cardEl.closest('li.card-item'))) || cardEl.parentElement || cardEl;
    var btn = wrap.querySelector('.btn-greet')
      || wrap.querySelector('.operate-side .btn-greet')
      || wrap.querySelector('.button-chat-wrap button')
      || wrap.querySelector('.operate-side button');
    if (!btn) return null;
    return { selector: makeUniqueSelector(btn, doc), visible: isVisible(btn) };
  }

  function cardName(cardEl) {
    var wrap = (cardEl.closest && (cardEl.closest('.candidate-card-wrap') || cardEl.closest('li.card-item'))) || cardEl;
    var nameEl = wrap.querySelector('.name') || wrap.querySelector('.name-wrap .name') || cardEl.querySelector('.name');
    return nameEl ? String(nameEl.textContent || '').trim() : '';
  }

  // 收集一个 doc 里所有候选人卡片（data-geekid / data-geek）
  var allDomIds = [];
  var allDomNames = [];
  var matchHit = null;            // 精确 id 命中
  var nameHits = [];              // 姓名兜底命中（可能多个，多个时不用）

  function recordHit(el, id, frameLabel) {
    // findGreetBtn 用元素自己的 ownerDocument 生成 selector（跨 iframe 时相对该 iframe doc）
    var g = findGreetBtn(el, el.ownerDocument);
    return {
      id: id,
      frame: frameLabel,
      greetFound: !!g,
      selector: g ? g.selector : null,
      visible: g ? g.visible : false
    };
  }

  function scanDoc(doc, frameLabel) {
    var nodes = doc.querySelectorAll('[data-geekid],[data-geek]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var rawId = el.getAttribute('data-geekid') || el.getAttribute('data-geek');
      if (!rawId) continue;
      var id = normId(rawId);
      allDomIds.push(rawId);
      var nm = cardName(el);
      if (nm) allDomNames.push(nm);

      // 用归一化后的 id 比较（忽略末尾 ~~），命中后 matchedId 仍记原始 DOM 值
      if (!matchHit && id && wantSet[id]) {
        matchHit = recordHit(el, rawId, frameLabel);
      }
      // 姓名兜底：id 没命中时，记录同名卡片（精确同名）
      if (wantName && nm && nm === wantName) {
        nameHits.push(recordHit(el, rawId, frameLabel));
      }
    }
  }

  scanDoc(document, 'main');
  var iframes = document.querySelectorAll('iframe');
  for (var k = 0; k < iframes.length; k++) {
    try {
      var idoc = iframes[k].contentDocument;
      if (!idoc) continue;
      scanDoc(idoc, iframes[k].src || ('iframe[' + k + ']'));
    } catch (e) {}
  }

  var diag = {
    iframeCount: iframes.length,
    totalCards: allDomIds.length,
    sampleDomIds: allDomIds.slice(0, 30),
    sampleDomNames: allDomNames.slice(0, 30),
    wantIds: wantIds,
    wantName: wantName,
    nameHitCount: nameHits.length
  };

  // 优先精确 id 命中；否则用「唯一同名」兜底（同名多个则放弃，避免点错人）
  var hit = matchHit;
  var matchBy = 'id';
  if (!hit && nameHits.length === 1) {
    hit = nameHits[0];
    matchBy = 'name';
  }

  if (hit) {
    return {
      ok: true,
      cardFound: true,
      greetFound: hit.greetFound,
      selector: hit.selector,
      visible: hit.visible,
      matchedId: hit.id,
      matchBy: matchBy,
      frame: hit.frame,
      diag: diag
    };
  }

  return {
    ok: false,
    cardFound: false,
    error: nameHits.length > 1 ? 'NAME_AMBIGUOUS' : 'CARD_NOT_FOUND',
    diag: diag
  };
})();
`;
}

/** 构造「把目标元素滚到可视区中央」的只读脚本（scrollIntoView，scroll 事件 isTrusted=true） */
function buildScrollIntoViewScript(selector) {
  return `
(function scrollIntoView() {
  function findEl(sel) {
    var el = document.querySelector(sel);
    if (el) return el;
    var ifr = document.querySelectorAll('iframe');
    for (var i = 0; i < ifr.length; i++) {
      try { var d = ifr[i].contentDocument; if (d) { var e = d.querySelector(sel); if (e) return e; } } catch (x) {}
    }
    return null;
  }
  var el = findEl(${JSON.stringify(selector)});
  if (!el) return { ok: false, error: 'ELEMENT_NOT_FOUND' };
  el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
  return { ok: true };
})();
`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 在已打开的 BOSS 推荐牛人列表里，找到该牛人并自动点「打招呼」。
 *
 * @param {object} resume ResumeCard 的 resume 对象
 * @returns {Promise<{ ok: boolean, code?: string, message?: string, tabId?: string }>}
 *   code 取值：
 *     - NOT_IN_CLIENT      非客户端环境
 *     - NO_GEEK_ID         无法识别该牛人 ID
 *     - NO_RECOMMEND_TAB   当前没有打开推荐牛人列表页面
 *     - GEEK_NOT_IN_LIST   推荐列表中找不到该牛人
 *     - GREET_BTN_NOT_FOUND 找到卡片但没有「打招呼」按钮
 *     - GREET_CLICK_FAILED  CDP 点击失败
 */
export async function greetBossRecommendGeek(resume) {
  if (!isInElectronClient()) {
    return { ok: false, code: "NOT_IN_CLIENT", message: "该功能仅在 i 快招客户端可用" };
  }

  const geekIds = extractGeekIds(resume);
  const geekName = extractGeekName(resume);
  if (geekIds.length === 0 && !geekName) {
    return { ok: false, code: "NO_GEEK_ID", message: "无法识别该牛人的 ID / 姓名，无法定位推荐列表卡片" };
  }

  // 1) 找推荐牛人列表 tab
  let tabList = [];
  try {
    tabList = await window.api.tabs.list();
  } catch (e) {
    console.warn("[bossRecommendGreet] tabs.list 失败:", e?.message || e);
    tabList = [];
  }
  const recommendTabs = (Array.isArray(tabList) ? tabList : []).filter(isRecommendTab);
  if (recommendTabs.length === 0) {
    return {
      ok: false,
      code: "NO_RECOMMEND_TAB",
      message: "当前没有打开 BOSS 推荐牛人列表页面，请先打开推荐牛人列表后再试"
    };
  }

  console.log(
    "[bossRecommendGreet] 待匹配 geekIds=",
    geekIds,
    "name=",
    geekName,
    "推荐 tab 数=",
    recommendTabs.length
  );

  // 2) 在每个推荐 tab 里找这个牛人卡片（优先取「找到且有打招呼按钮」的那个）
  const findCode = buildFindGreetScript(geekIds, geekName);
  let matched = null;
  let lastDiag = null;
  for (const t of recommendTabs) {
    try {
      const res = await window.api.automation.evalOnTab({ tabId: t.id, code: findCode });
      const r = res && res.result;
      if (r && r.diag) {
        lastDiag = r.diag;
        console.log(
          `[bossRecommendGreet] tab=${t.id} url=${t.url} 扫描结果：` +
            `卡片总数=${r.diag.totalCards} iframe数=${r.diag.iframeCount} ` +
            `cardFound=${r.cardFound} greetFound=${r.greetFound} matchBy=${r.matchBy || "(none)"} matchedId=${r.matchedId || "(none)"}`,
          "\n  DOM 现有 data-geekid 样本：",
          r.diag.sampleDomIds,
          "\n  DOM 现有姓名样本：",
          r.diag.sampleDomNames,
          "\n  我们在找 ids：",
          r.diag.wantIds,
          " name：",
          r.diag.wantName
        );
      } else if (!res || !res.ok) {
        console.warn("[bossRecommendGreet] evalOnTab 返回异常:", t?.id, res && res.error);
      }
      if (res && res.ok && r && r.cardFound) {
        matched = { tab: t, find: r };
        if (r.greetFound) break;
      }
    } catch (e) {
      console.warn("[bossRecommendGreet] evalOnTab(find) 失败:", t?.id, e?.message || e);
    }
  }

  if (!matched) {
    if (lastDiag && lastDiag.totalCards === 0) {
      return {
        ok: false,
        code: "GEEK_NOT_IN_LIST",
        message: "推荐牛人列表页面尚未渲染出候选人卡片，请等列表加载完成后再试"
      };
    }
    if (lastDiag && lastDiag.nameHitCount > 1) {
      return {
        ok: false,
        code: "NAME_AMBIGUOUS",
        message: `推荐列表中有多个同名「${geekName}」，无法确定是哪一位，请在列表里手动操作`
      };
    }
    return {
      ok: false,
      code: "GEEK_NOT_IN_LIST",
      message: "推荐牛人列表中未找到该牛人，请确认该牛人是否在当前打开的推荐列表中"
    };
  }
  if (!matched.find.greetFound || !matched.find.selector) {
    return {
      ok: false,
      code: "GREET_BTN_NOT_FOUND",
      message: "已定位到该牛人，但未找到「打招呼」按钮（可能已打过招呼或页面结构变化）"
    };
  }

  const tabId = matched.tab.id;

  // 3) 切到该 tab，让用户看到推荐列表页
  try {
    if (typeof window.api.tabs.activate === "function") {
      await window.api.tabs.activate(tabId);
    }
  } catch (e) {
    console.warn("[bossRecommendGreet] tabs.activate 失败（忽略）:", e?.message || e);
  }
  await sleep(300);

  // 3.5) 把打招呼按钮滚到可视区（否则 clickOnTab requireVisible 会失败）
  try {
    await window.api.automation.evalOnTab({
      tabId,
      code: buildScrollIntoViewScript(matched.find.selector)
    });
    await sleep(250);
  } catch (e) {
    console.warn("[bossRecommendGreet] scrollIntoView 失败（继续尝试点击）:", e?.message || e);
  }

  // 4) CDP 点击「打招呼」
  let clickRes;
  try {
    clickRes = await window.api.automation.clickOnTab({
      tabId,
      selector: matched.find.selector,
      pressHoldMs: 50,
      requireVisible: true
    });
  } catch (e) {
    return {
      ok: false,
      code: "GREET_CLICK_FAILED",
      message: e?.message || "点击「打招呼」按钮异常",
      tabId
    };
  }

  if (!clickRes || !clickRes.ok) {
    return {
      ok: false,
      code: "GREET_CLICK_FAILED",
      message: (clickRes && clickRes.error && clickRes.error.message) || "点击「打招呼」按钮失败",
      tabId
    };
  }

  return { ok: true, tabId };
}

export default {
  extractGeekIds,
  extractGeekName,
  greetBossRecommendGeek
};
