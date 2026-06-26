/**
 * BOSS 推荐页 - 拟人浏览脚本（safe scroll + 选择性 CDP click）
 *
 * 输入：一组 geekId（顺序无要求，本脚本会按页面 DOM 顺序自然滚动 top→bottom）
 * 行为：
 *   - 随机 0-3 个 geek 「点击查看详情 → dwell → CDP 点关闭按钮」
 *   - 随机 4-10 个 geek 「滚到视野中央 → dwell 模拟看简历摘要 → 滑过」
 *   - item 之间留随机停顿，模拟真人滚动节奏
 *
 * 用法：
 *   import { humanizeBrowseGeeks } from 'src/util/automation/bossHumanizeBrowse';
 *   await humanizeBrowseGeeks(tabId, ['61e0cd...', '398616...', ...]);
 *
 * 配置：所有"几个 / 多久"都在文件顶部 CONFIG 里，**直接改常量即可**（不用改函数代码）。
 *
 * ===========================================
 *  风控基线
 * ===========================================
 *   - 滚动走 webContents.executeJavaScript → container.scrollTo({...})
 *     scroll 事件 isTrusted=true（浏览器实际滚动产生，不是 dispatchEvent），安全
 *   - 点击走 CDP webContents.debugger Input.dispatchMouseEvent（cdpInputDispatcher）
 *     isTrusted=true；CDP 同进程模式（无 --remote-debugging-port）
 *   - 节奏：每个 item 间留 0.8-2.2s 停顿，scroll 分 10-18 步随机间隔慢推
 *   - 严禁 `el.click()` / `dispatchEvent('click')` 等合成事件（isTrusted=false 一行 JS 识破）
 *
 * ===========================================
 *  DOM 假设（2026-05-24 BOSS 推荐页实测）
 * ===========================================
 *   - geek 列表在 BOSS 推荐宿主页内嵌的 /web/frame/recommend iframe 里
 *   - 结构：
 *     ul.recommend-list
 *       li.card-item
 *         div.candidate-card-wrap
 *           div.card-inner.common-wrap[data-geekid="<encryptGeekId>"][data-geek="<同>"]
 *             ← geekid 在**内部 div** 上（不是 li），attribute 名是 `data-geekid`
 *             ← **点击区域** = 这个 .card-inner.common-wrap（左侧候选人信息整块）
 *           div.operate-side
 *             [打招呼 button] ← ⚠️⚠️⚠️ 严禁点到这里！会真的给候选人发问候消息！
 *
 *   - 滚动容器候选：`#recommend-list` / `.recommend-list-wrap` / `.candidate-body`
 *     （SCROLL_CONTAINER_CANDIDATES 按优先级 fallback）
 *
 *   - 点开 geek 后 BOSS 弹一个全屏详情，关闭按钮 selector 见 CLOSE_BUTTON_CANDIDATES
 *
 * 同源 iframe 处理：scroll JS 内部自动扫主 frame + iframe.contentDocument 找元素；
 * click 直接 selector 传给 clickOnTab，cdpInputDispatcher 内部已支持跨 iframe。
 *
 * 安全：[data-geekid="..."] 命中的是 .card-inner.common-wrap（左侧块），
 * 不会命中 .operate-side（右侧打招呼按钮）。CDP 用元素中心坐标点击，安全。
 */

// ============================================================================
// CONFIG —— 所有"几个 / 多久"的常量，**业务方直接改这里**
// ============================================================================

const CONFIG = {
  // ===== 数量配置（用户最关心）=====
  /** 随机点击数量范围 [min, max]（含两端） */
  CLICK_COUNT_RANGE: [0, 3],
  /** 随机浏览数量范围 [min, max]（含两端） */
  BROWSE_COUNT_RANGE: [4, 10],

  // ===== 节奏配置 =====
  /** 滚到目标位置时分几步（拟人化关键，不是一次性 jump） */
  SCROLL_STEPS_RANGE: [10, 18],
  /** 滚动每一步之间的间隔（ms），随机区间 */
  SCROLL_STEP_INTERVAL_MS_RANGE: [60, 180],

  /** "浏览" 类型：滚到目标后停留多久（模拟看简历摘要） */
  BROWSE_DWELL_MS_RANGE: [1500, 4500],

  /** "点击" 类型：点开详情后停留多久（模拟看完整简历）。
   *  15-120s 是用户明确要求 —— 真人看完整简历 + 思考决策的时间窗，
   *  比早期 3-8s 更接近真人。代价：单个 click item 总耗时拉到 17-150s。 */
  CLICK_DETAIL_DWELL_MS_RANGE: [15000, 120000],
  /** 关闭详情后到下一个动作之间的停顿（模拟"看完合上"的过渡） */
  CLOSE_AFTER_DWELL_MS_RANGE: [600, 1500],

  /** item 与 item 之间的转场停顿（不管是 click 还是 browse 都有） */
  INTER_ITEM_PAUSE_MS_RANGE: [800, 2200],

  // ===== Selector 配置（DOM 改了改这里）=====
  /**
   * geek 列表项 selector 模板，{geekId} 会被替换成实际 id。
   *
   * 实测 DOM：`.card-inner.common-wrap[data-geekid="<encryptGeekId>"]`
   * 用 `[data-geekid=...]` 是因为：
   *   - 这个属性直接挂在"左侧候选人信息块"div 上（左半个卡片）
   *   - **不会命中 `.operate-side`**（右侧的"打招呼"按钮，点了会真的发问候！）
   *   - CDP 点击会用这个 div 的中心坐标，自然落在左侧块，安全
   */
  ITEM_SELECTOR_TEMPLATE: '[data-geekid="{geekId}"]',

  /**
   * 滚动容器候选 selector（按优先级），第一个命中的用。
   * 都没命中就 fallback 到 `document.scrollingElement`。
   *
   * 实测 BOSS 推荐 iframe 内的容器层级（从内到外）：
   *   ul.recommend-list → div.list-wrap → div.list-body → div.recommend-list-wrap#recommend-list
   *   → div.candidate-body → div.candidate-recommend
   *
   * `#recommend-list` 是用 id 锁的最稳的候选；其它兜底应对 BOSS 改 class 名。
   */
  SCROLL_CONTAINER_CANDIDATES: [
    "#recommend-list",
    ".recommend-list-wrap",
    ".candidate-body",
    ".candidate-recommend"
  ],

  /**
   * 关闭详情弹框的 button selector 候选（按优先级），第一个 visible 的用。
   *
   * 来源：旧 Playwright 路径 `src/playwright/bossRecommendHumanize.js` 实测列表
   * （那条路虽然下线了，但 selector 知识是有效的）。
   *
   * 命中策略（见下方 buildFindCloseButtonScript）：
   *   1) 扫所有候选 selector 找 visible 的元素
   *   2) **优先取右上角的**（X 关闭图标的典型位置）—— 按 viewport 中 (x, y) 打分：
   *      右上角分高（x 偏右、y 偏顶）→ 即便多个候选 visible，也能挑出真正的弹框 X
   *   3) 防御性 `:not(input):not(textarea)` 排除表单元素误中
   */
  CLOSE_BUTTON_CANDIDATES: [
    ".close",
    ".close-btn",
    ".icon-close",
    ".btn-close",
    ".dialog-close",
    ".popup-close",
    ".close-icon",
    '[aria-label*="关闭"]',
    '[aria-label*="close" i]' // i = case-insensitive，同时匹配 close/Close
  ]
};

// ============================================================================
// helpers
// ============================================================================

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api &&
      window.api.automation &&
      typeof window.api.automation.clickOnTab === "function" &&
      typeof window.api.automation.evalOnTab === "function"
  );
}

/**
 * 从 geekIds 里挑出本轮要操作的 plan：
 *   - 随机选 (clickCount + browseCount) 个不重复的 geek
 *   - 随机分配 click / browse 角色
 *   - 按 geekIds 原顺序排序（top→bottom 自然滚动方向）
 *
 * 如果 geekIds 数量不够（如只有 5 个但要点 3+浏览 7），按比例缩减。
 */
function buildPlan(geekIds, clickCount, browseCount) {
  let cc = Math.max(0, clickCount);
  let bc = Math.max(0, browseCount);
  let total = cc + bc;

  if (geekIds.length === 0 || total === 0) return [];

  if (geekIds.length < total) {
    // 不够分时按原比例缩
    const ratio = geekIds.length / total;
    cc = Math.floor(cc * ratio);
    bc = geekIds.length - cc;
    total = cc + bc;
    console.log(
      `[humanizeBrowse] geekIds (${geekIds.length}) 少于 plan 需求 (${clickCount}+${browseCount})，` +
        `按比例缩到 click=${cc} browse=${bc}`
    );
  }

  // 1) 在 [0, geekIds.length) 里随机选 total 个不重复 index
  const allIndices = geekIds.map((_, i) => i);
  const pickedIndices = shuffle(allIndices).slice(0, total);

  // 2) 随机分配角色
  const roles = shuffle([...Array(cc).fill("click"), ...Array(bc).fill("browse")]);

  // 3) 按 index 升序排（top→bottom）
  const plan = pickedIndices
    .map((idx, i) => ({
      geekId: geekIds[idx],
      originalIndex: idx,
      action: roles[i]
    }))
    .sort((a, b) => a.originalIndex - b.originalIndex);

  return plan;
}

// ============================================================================
// 注入到 page 上下文跑的 JS（safe scroll，纯只读 DOM + scrollTo）
// ============================================================================

/**
 * 构造"滚到目标 geek 元素 + 拟人分段慢推"的 JS 代码字符串。
 *
 * 在 page 上下文跑（webContents.executeJavaScript + awaitPromise=true），
 * 内部是一个 async IIFE，返回 `{ ok, scrolled, steps }` 或 `{ ok: false, error }`。
 *
 * 关键设计：
 *   - 自动跨 iframe 找元素（主 frame → 同源 iframe.contentDocument）
 *   - 用 container.scrollTo({ top, behavior: 'instant' }) 分段推 —— 浏览器实际滚动
 *     产生的 scroll 事件 isTrusted=true，BOSS lazy load / 反爬 listener 看到的跟真人一样
 *   - easeInOutCubic 缓动，前后慢中间快，比线性更像人手
 *   - 每步间隔随机化（jitter）
 */
function buildSmoothScrollScript(selector, scrollContainerCandidates, stepsRange, intervalRange) {
  // scrollContainerCandidates 留作未来兜底（当前实现不使用，但保留参数避免调用方改 API）
  void scrollContainerCandidates;
  return `
(async function smoothScrollTo() {
  function findEl(sel) {
    var el = document.querySelector(sel);
    if (el) return { el: el, frame: window };
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        var idoc = iframes[i].contentDocument;
        if (!idoc) continue;
        var inner = idoc.querySelector(sel);
        if (inner) return { el: inner, frame: iframes[i].contentWindow || window };
      } catch (e) {}
    }
    return null;
  }
  function findScrollableAncestor(elem) {
    var cur = elem.parentElement;
    while (cur && cur.tagName !== 'BODY' && cur.tagName !== 'HTML') {
      var view = cur.ownerDocument.defaultView || window;
      var style = view.getComputedStyle(cur);
      var canScroll = (cur.scrollHeight - cur.clientHeight > 5) && /auto|scroll/.test(style.overflowY);
      if (canScroll) return cur;
      cur = cur.parentElement;
    }
    return elem.ownerDocument.scrollingElement || elem.ownerDocument.documentElement;
  }

  var found = findEl(${JSON.stringify(selector)});
  if (!found) return { ok: false, error: 'ELEMENT_NOT_FOUND', selector: ${JSON.stringify(
    selector
  )} };

  // ★ 关键修复：用浏览器原生 scrollIntoView 让浏览器自己递归滚所有需要滚的祖先
  // container，保证 element 在 viewport 内 visible。比我们手算 container.scrollTo
  // 更准确（不需要猜哪个是 scroll container，能跨 iframe 处理坐标系）。
  // scroll 事件 isTrusted=true（浏览器实际滚动产生），跟真人滚动完全一致。
  found.el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

  // 拟人化"眼睛对准"小幅扰动：±20px 上下抖几次，模拟人手最后微调位置
  var STEPS_MIN = ${stepsRange[0]};
  var STEPS_MAX = ${stepsRange[1]};
  // 实际扰动步数取配置的 1/4（5-15 步随机 → 1-4 步），避免过度抖动
  var fullSteps = STEPS_MIN + Math.floor(Math.random() * (STEPS_MAX - STEPS_MIN + 1));
  var jitterSteps = Math.max(2, Math.floor(fullSteps / 4));
  var INT_MIN = ${intervalRange[0]};
  var INT_MAX = ${intervalRange[1]};

  var scroller = findScrollableAncestor(found.el);
  for (var i = 1; i <= jitterSteps; i++) {
    var dyPx = (Math.random() - 0.5) * 40;  // ±20px 上下抖
    scroller.scrollBy({ top: dyPx, behavior: 'instant' });
    var intervalMs = INT_MIN + Math.random() * (INT_MAX - INT_MIN);
    await new Promise(function(r) { setTimeout(r, intervalMs); });
  }

  // 最后再 scrollIntoView 一次"准确归位"，确保 visible
  found.el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

  // 返回元素当前在主 frame viewport 内的坐标（让上层能验证 visible）
  var finalRect = found.el.getBoundingClientRect();
  var ox = 0, oy = 0, f = found.frame;
  while (f && f.frameElement) {
    var fr = f.frameElement.getBoundingClientRect();
    ox += fr.left; oy += fr.top;
    try { f = f.parent; } catch (e) { break; }
  }
  return {
    ok: true,
    method: 'scrollIntoView+jitter',
    jitterSteps: jitterSteps,
    container: scroller.className || scroller.tagName,
    elInIframeViewport: { top: Math.round(finalRect.top), left: Math.round(finalRect.left) },
    elInMainViewport: { top: Math.round(oy + finalRect.top), left: Math.round(ox + finalRect.left) },
    iframeOffset: { x: Math.round(ox), y: Math.round(oy) },
    viewportSize: { w: Math.round(window.innerWidth), h: Math.round(window.innerHeight) }
  };
})();
`;
}

/**
 * 构造"找弹框关闭按钮 + 返回精确 CSS selector"的 JS。
 *
 * 在 page 上下文跑（webContents.executeJavaScript），过程：
 *   1) 扫候选 CSS class 找所有 visible 命中
 *   2) 用「右上角偏好」给每个候选打分（X 关闭图标的典型位置）：
 *      - score = (x / viewportWidth) * 0.6 + (1 - y / viewportHeight) * 0.4
 *      - 即：横坐标越靠右 + 纵坐标越靠顶 → 分数越高
 *      - 排除大尺寸元素（width > 80 || height > 80）—— 真关闭 icon 都很小
 *   3) 取分数最高的，**给它生成 nth-of-type 路径精确锁定**（避免 selector 撞同类元素）
 *      - 这样 renderer 后续用 CDP click 就能命中**就是那个** X，不会误点页面别处的 close
 *
 * 为什么不直接 page 上下文 click？—— page 内 `el.click()` 是 isTrusted=false 合成事件，
 * BOSS 一行 JS 就识破。必须走 CDP（Input.dispatchMouseEvent，isTrusted=true）。
 *
 * 跨 iframe：先扫主 frame，没命中再扫同源 iframe contentDocument。
 */
function buildFindCloseButtonScript(candidates) {
  return `
(function findCloseBtn() {
  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.width > 80 || r.height > 80) return false; // 真关闭 icon 都很小，排除大块元素
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    return true;
  }
  // 为元素生成 :nth-of-type 路径，从最近的有 id 的祖先（或 body）开始往下
  function makeUniqueSelector(el, doc) {
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur !== doc.body && cur !== doc.documentElement && parts.length < 6) {
      var tag = cur.tagName.toLowerCase();
      var part = tag;
      if (cur.parentNode) {
        var sameTagSiblings = Array.from(cur.parentNode.children).filter(function(c) { return c.tagName === cur.tagName; });
        if (sameTagSiblings.length > 1) {
          part += ':nth-of-type(' + (sameTagSiblings.indexOf(cur) + 1) + ')';
        }
      }
      if (cur.classList && cur.classList.length > 0) {
        var cls = Array.from(cur.classList).slice(0, 2).map(function(c) { return '.' + CSS.escape(c); }).join('');
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
  function scoreElement(el, frame) {
    // 右上角偏好：x 越靠右 / y 越靠顶 → 分数越高
    var r = el.getBoundingClientRect();
    var vw = (frame.innerWidth || frame.document.documentElement.clientWidth);
    var vh = (frame.innerHeight || frame.document.documentElement.clientHeight);
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    return (cx / vw) * 0.6 + (1 - cy / vh) * 0.4;
  }
  function tryDoc(doc, win) {
    var candidates = ${JSON.stringify(candidates)};
    var hits = [];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var els = doc.querySelectorAll(candidates[i]);
        for (var j = 0; j < els.length; j++) {
          if (isVisible(els[j])) {
            hits.push({ el: els[j], rawSelector: candidates[i], score: scoreElement(els[j], win) });
          }
        }
      } catch (e) {}
    }
    if (hits.length === 0) return null;
    // 取分数最高的（最靠右上角的）
    hits.sort(function(a, b) { return b.score - a.score; });
    var best = hits[0];
    var r = best.el.getBoundingClientRect();
    return {
      selector: makeUniqueSelector(best.el, doc),
      rawSelector: best.rawSelector,
      score: best.score,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      hitCount: hits.length
    };
  }
  var hit = tryDoc(document, window);
  if (hit) return { ok: true, foundIn: 'mainFrame', ...hit };
  var iframes = document.querySelectorAll('iframe');
  for (var k = 0; k < iframes.length; k++) {
    try {
      var idoc = iframes[k].contentDocument;
      if (!idoc) continue;
      var h = tryDoc(idoc, iframes[k].contentWindow || window);
      if (h) return { ok: true, foundIn: iframes[k].src || 'iframe[' + k + ']', ...h };
    } catch (e) {}
  }
  return { ok: false, error: 'NO_CLOSE_BUTTON_FOUND' };
})();
`;
}

// ============================================================================
// 高层操作：单 item
// ============================================================================

async function smoothScrollToGeek(tabId, geekId, config) {
  const selector = config.ITEM_SELECTOR_TEMPLATE.replace("{geekId}", geekId);
  const code = buildSmoothScrollScript(
    selector,
    config.SCROLL_CONTAINER_CANDIDATES,
    config.SCROLL_STEPS_RANGE,
    config.SCROLL_STEP_INTERVAL_MS_RANGE
  );
  const res = await window.api.automation.evalOnTab({ tabId, code, awaitPromise: true });
  if (!res?.ok) {
    throw new Error(`scrollTo eval failed: ${res?.error?.code} ${res?.error?.message}`);
  }
  if (!res.result?.ok) {
    throw new Error(`scrollTo: ${res.result?.error} (selector=${selector})`);
  }
  // 打日志：方便排查滚动后 element 是否真的在 viewport 内
  // 看 elInMainViewport.top 是否在 [0, viewportSize.h] 区间内 → 是的话 cdpInputDispatcher
  // 的 requireVisible 判断会通过；否则会 ELEMENT_NOT_VISIBLE
  const r = res.result;
  console.log(
    `[humanizeBrowse][scroll] geekId=${geekId.slice(0, 12)} method=${r.method} ` +
      `jitterSteps=${r.jitterSteps} container=${r.container} ` +
      `mainViewportTop=${r.elInMainViewport?.top} (viewportH=${r.viewportSize?.h}) ` +
      `iframeOffset=${JSON.stringify(r.iframeOffset)}`
  );
  return r;
}

/**
 * 构造"拟人化滚到容器底部"的 JS 代码字符串。
 *
 * 跟 buildSmoothScrollScript 唯一区别：目标位置是 `container.scrollHeight - clientHeight`
 * 而不是某个具体元素的中心。其它机制（找容器、扫 iframe、easeInOutCubic、step jitter）一致。
 *
 * 用途：触发 BOSS 自家 SPA 的 lazy load 监听 → 自动发下一页 /rec/geek/list 请求。
 * 因为是浏览器实际滚动产生的 scroll 事件 isTrusted=true，BOSS 看到跟真人滚到底完全一样。
 */
function buildSmoothScrollToBottomScript(
  scrollContainerCandidates,
  stepsRange,
  intervalRange,
  itemSelectorTemplate
) {
  return `
(async function smoothScrollToBottom() {
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  async function smoothScrollContainer(container, label) {
    var startScrollTop = container.scrollTop;
    var targetScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    var delta = targetScrollTop - startScrollTop;
    if (Math.abs(delta) < 5) {
      return { label: label, scrolled: 0, alreadyAtBottom: true, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
    }
    var STEPS_MIN = ${stepsRange[0]};
    var STEPS_MAX = ${stepsRange[1]};
    var steps = STEPS_MIN + Math.floor(Math.random() * (STEPS_MAX - STEPS_MIN + 1));
    var INT_MIN = ${intervalRange[0]};
    var INT_MAX = ${intervalRange[1]};
    for (var i = 1; i <= steps; i++) {
      var ratio = i / steps;
      var eased = easeInOutCubic(ratio);
      var newScroll = startScrollTop + delta * eased;
      container.scrollTo({ top: newScroll, behavior: 'instant' });
      var intervalMs = INT_MIN + Math.random() * (INT_MAX - INT_MIN);
      await new Promise(function(r) { setTimeout(r, intervalMs); });
    }
    return { label: label, scrolled: delta, steps: steps, finalScrollTop: container.scrollTop, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
  }

  // ★ BOSS 推荐 iframe 内部本身没有 overflow:auto，是主 frame 在滚 iframe 整体。
  // 单滚一个容器（不管哪个）BOSS 的 lazy load 监听都不一定能触发。
  // 多管齐下策略：
  //   1) 主 frame document.scrollingElement 滚到底（让 iframe 整体到底）
  //   2) iframe 内 candidates（#recommend-list / .recommend-list-wrap 等）逐个滚到底
  //      （即便 scrollHeight==clientHeight 也尝试 —— 某些 BOSS 实现可能依赖 scroll 事件本身）
  //   3) 把 iframe 内**最后一个 li.card-item** scrollIntoView（最常见的 lazy load 触发模式：
  //      sentinel 元素进入 viewport → IntersectionObserver 触发 fetch）
  //
  // 任意一种触发了 BOSS 自家发 /rec/geek/list 都算成功。

  var results = [];
  var candidates = ${JSON.stringify(scrollContainerCandidates)};
  var itemSelector = ${JSON.stringify(
    itemSelectorTemplate.replace("{geekId}", "*").replace('="*"', "")
  )};
  // itemSelector 去掉 {geekId} 后是 'li[data-geekid]' 或类似的形态，能 querySelectorAll 拿所有 li

  // 1) 主 frame 滚到底
  try {
    var mainContainer = document.scrollingElement || document.documentElement;
    results.push(await smoothScrollContainer(mainContainer, 'mainFrame.scrollingElement'));
  } catch (e) {
    results.push({ label: 'mainFrame.scrollingElement', error: e.message });
  }

  // 2) iframe 内 candidates 逐个滚到底
  var iframes = document.querySelectorAll('iframe');
  for (var ifi = 0; ifi < iframes.length; ifi++) {
    var iframe = iframes[ifi];
    var idoc = null;
    try { idoc = iframe.contentDocument; } catch (e) {}
    if (!idoc) continue;
    // iframe scrollingElement 自己
    try {
      var ic = idoc.scrollingElement || idoc.documentElement;
      results.push(await smoothScrollContainer(ic, 'iframe[' + ifi + '].scrollingElement'));
    } catch (e) {
      results.push({ label: 'iframe[' + ifi + '].scrollingElement', error: e.message });
    }
    // iframe 内 candidates
    for (var ci = 0; ci < candidates.length; ci++) {
      try {
        var c = idoc.querySelector(candidates[ci]);
        if (!c) continue;
        results.push(await smoothScrollContainer(c, 'iframe[' + ifi + '] ' + candidates[ci]));
      } catch (e) {
        results.push({ label: 'iframe[' + ifi + '] ' + candidates[ci], error: e.message });
      }
    }
    // 3) iframe 内**最后一个 li**（sentinel scrollIntoView 触发 IntersectionObserver lazy load）
    try {
      var allItems = idoc.querySelectorAll(itemSelector);
      if (allItems && allItems.length > 0) {
        var lastItem = allItems[allItems.length - 1];
        lastItem.scrollIntoView({ behavior: 'instant', block: 'end', inline: 'nearest' });
        results.push({
          label: 'iframe[' + ifi + '] lastItem.scrollIntoView',
          lastItemIndex: allItems.length - 1,
          totalItems: allItems.length,
          rect: lastItem.getBoundingClientRect ? (function(r){ return { top: Math.round(r.top), left: Math.round(r.left) }; })(lastItem.getBoundingClientRect()) : null
        });
        // 短停顿让 IntersectionObserver 触发
        await new Promise(function(r) { setTimeout(r, 300 + Math.random() * 400); });
      }
    } catch (e) {
      results.push({ label: 'iframe[' + ifi + '] lastItem.scrollIntoView', error: e.message });
    }
  }

  // ok 总是 true（即便单个步骤"已在底部"，也不算失败 —— 只要尝试过就让上层等响应）
  return {
    ok: true,
    method: 'multi-strategy',
    attempts: results
  };
})();
`;
}

/**
 * 拟人化滚到容器底部（导出给业务方调）。
 *
 * 用途：触发 BOSS 自家 SPA 的 lazy load → 自动发下一页 /rec/geek/list 请求。
 * 调用方负责用 siteNetwork.waitForResponse 等响应回来。
 *
 * @param {string} tabId
 * @param {object} [opts]
 * @param {Partial<typeof CONFIG>} [opts.config]
 * @returns {Promise<{ ok: boolean, scrolled: number, steps?: number, alreadyAtBottom?: boolean, container?: string }>}
 */
export async function smoothScrollToBottom(tabId, opts = {}) {
  if (!isInElectronClient()) {
    throw new Error("window.api.automation.evalOnTab 不可用");
  }
  const config = { ...CONFIG, ...(opts.config || {}) };
  const code = buildSmoothScrollToBottomScript(
    config.SCROLL_CONTAINER_CANDIDATES,
    config.SCROLL_STEPS_RANGE,
    config.SCROLL_STEP_INTERVAL_MS_RANGE,
    config.ITEM_SELECTOR_TEMPLATE
  );
  const res = await window.api.automation.evalOnTab({ tabId, code, awaitPromise: true });
  if (!res?.ok) {
    throw new Error(`smoothScrollToBottom eval failed: ${res?.error?.code} ${res?.error?.message}`);
  }
  if (!res.result?.ok) {
    throw new Error(`smoothScrollToBottom: ${res.result?.error || "UNKNOWN"}`);
  }
  // 详细日志：列出每一个尝试的容器和结果
  const r = res.result;
  console.log(`[humanizeBrowse][scrollToBottom] method=${r.method} attempts=${r.attempts.length}`);
  for (const a of r.attempts) {
    if (a.error) {
      console.log(`  [${a.label}] error=${a.error}`);
    } else if (a.scrolled !== undefined) {
      console.log(
        `  [${a.label}] scrolled=${a.scrolled} steps=${a.steps || 0} ` +
          `H=${a.scrollHeight}/${a.clientHeight} ${a.alreadyAtBottom ? "(已在底部)" : ""}`
      );
    } else if (a.lastItemIndex !== undefined) {
      console.log(
        `  [${a.label}] index=${a.lastItemIndex}/${a.totalItems} rect=${JSON.stringify(a.rect)}`
      );
    } else {
      console.log(`  [${a.label}] ${JSON.stringify(a)}`);
    }
  }
  return r;
}

async function cdpClickGeekItem(tabId, geekId, config) {
  const selector = config.ITEM_SELECTOR_TEMPLATE.replace("{geekId}", geekId);
  const res = await window.api.automation.clickOnTab({
    tabId,
    selector,
    pressHoldMs: 50,
    requireVisible: true
  });
  if (!res?.ok) {
    throw new Error(
      `clickGeek failed (${res?.error?.code}): ${res?.error?.message || ""} (selector=${selector})`
    );
  }
  return res.data;
}

/**
 * 找弹框关闭按钮 → CDP 点关闭。
 *
 * 两步走：
 *   1) evalOnTab 在 page 里扫 CLOSE_BUTTON_CANDIDATES 找第一个 visible 的，
 *      返回它的 selector（让 CDP 后续能精确定位）
 *   2) clickOnTab(selector) → CDP 真点（isTrusted=true）
 *
 * 找不到关闭按钮时 throw —— 上层捕获后会记 error 但不中断整个 plan。
 */
async function closeDetailPopup(tabId, config) {
  const findCode = buildFindCloseButtonScript(config.CLOSE_BUTTON_CANDIDATES);
  const findRes = await window.api.automation.evalOnTab({ tabId, code: findCode });
  if (!findRes?.ok) {
    throw new Error(`findCloseBtn eval failed: ${findRes?.error?.message || ""}`);
  }
  if (!findRes.result?.ok) {
    throw new Error(`findCloseBtn: ${findRes.result?.error || "UNKNOWN"}`);
  }
  const closeSelector = findRes.result.selector;
  console.log(
    `[humanizeBrowse] close button found: rawSel=${
      findRes.result.rawSelector
    } score=${findRes.result.score?.toFixed(3)} ` +
      `rect=${JSON.stringify(findRes.result.rect)} hitCount=${findRes.result.hitCount} ` +
      `in ${findRes.result.foundIn} → uniqueSel=${closeSelector}`
  );

  const clickRes = await window.api.automation.clickOnTab({
    tabId,
    selector: closeSelector,
    pressHoldMs: 50,
    requireVisible: true
  });
  if (!clickRes?.ok) {
    throw new Error(
      `close click failed (${clickRes?.error?.code}): ${clickRes?.error?.message || ""}`
    );
  }
  return clickRes.data;
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 拟人浏览 BOSS 推荐 geek 列表。
 *
 * @param {string} tabId       openBossRecommend 返回的 tabId
 * @param {string[]} geekIds   要参与本次浏览的 geek id 数组（顺序无要求，内部按页面 DOM 顺序滚）
 * @param {object} [opts]
 * @param {Partial<typeof CONFIG>} [opts.config]   覆盖默认 CONFIG（部分覆盖，未传字段保留默认）
 * @param {(stage, payload) => void} [opts.onProgress]  阶段回调（可选）
 *   - ('plan',       { plan: [{geekId, action}], clickCount, browseCount })
 *   - ('itemStart',  { geekId, action, index, total })
 *   - ('itemDone',   { geekId, action, index, total })
 *   - ('itemError',  { geekId, action, error })
 *   - ('done',       { executed: number, errors: number })
 * @returns {Promise<{
 *   ok: boolean,
 *   plan: Array<{ geekId, action, originalIndex }>,
 *   executed: Array<{ geekId, action, originalIndex }>,
 *   errors: Array<{ geekId, action, error }>,
 *   errorCode?: 'NOT_IN_CLIENT'|'BAD_REQUEST'|'EXCEPTION',
 *   message?: string
 * }>}
 */
export async function humanizeBrowseGeeks(tabId, geekIds, opts = {}) {
  if (!isInElectronClient()) {
    return {
      ok: false,
      errorCode: "NOT_IN_CLIENT",
      message: "window.api.automation.{clickOnTab,evalOnTab} 不可用（浏览器模式 / 旧版 preload）",
      plan: [],
      executed: [],
      errors: []
    };
  }
  if (!tabId || typeof tabId !== "string") {
    return {
      ok: false,
      errorCode: "BAD_REQUEST",
      message: "tabId required",
      plan: [],
      executed: [],
      errors: []
    };
  }
  if (!Array.isArray(geekIds) || geekIds.length === 0) {
    return {
      ok: false,
      errorCode: "BAD_REQUEST",
      message: "geekIds must be non-empty array",
      plan: [],
      executed: [],
      errors: []
    };
  }

  const config = { ...CONFIG, ...(opts.config || {}) };
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  // ★ 取消回调：用户手动停止任务后，每处理一个 geek 前 check，命中则立即中断本批拟人化。
  //   修复"手动停止后推荐 tab 仍在跑 scroll/click/dwell 脚本"。
  const shouldAbort = typeof opts.shouldAbort === "function" ? opts.shouldAbort : null;

  // 1) 随机决定本轮 click/browse 数量 + 选 geek + 排序
  const clickCount = randomInt(config.CLICK_COUNT_RANGE[0], config.CLICK_COUNT_RANGE[1]);
  const browseCount = randomInt(config.BROWSE_COUNT_RANGE[0], config.BROWSE_COUNT_RANGE[1]);
  const plan = buildPlan(geekIds, clickCount, browseCount);

  console.log(
    `[humanizeBrowse] geekIds.length=${geekIds.length} clickCount=${clickCount} ` +
      `browseCount=${browseCount} plan.length=${plan.length}`
  );
  console.log("[humanizeBrowse] plan:", plan.map((p) => `${p.action}:${p.geekId}`).join(", "));
  onProgress("plan", { plan, clickCount, browseCount });

  if (plan.length === 0) {
    onProgress("done", { executed: 0, errors: 0 });
    return { ok: true, plan: [], executed: [], errors: [] };
  }

  // 2) 按 plan 顺序执行
  const executed = [];
  const errors = [];
  let aborted = false;
  for (let i = 0; i < plan.length; i++) {
    // ★ 每个 geek 处理前先 check 用户是否已停止任务 → 立即中断，不再 scroll/click/dwell
    if (shouldAbort) {
      let stop = false;
      try {
        stop = await shouldAbort();
      } catch (e) {
        console.warn("[humanizeBrowse] shouldAbort 回调异常（忽略）:", e?.message || e);
      }
      if (stop) {
        console.log(
          `[humanizeBrowse] 检测到用户停止，中断剩余 plan（已执行 ${executed.length}/${plan.length}）`
        );
        aborted = true;
        break;
      }
    }
    const item = plan[i];
    const tag = `[${i + 1}/${plan.length}] ${item.action}:${item.geekId.slice(0, 12)}`;
    onProgress("itemStart", { ...item, index: i, total: plan.length });

    try {
      // 2a) 滚到目标位置（拟人分段慢推）
      console.log(`${tag} 滚动到目标位置`);
      await smoothScrollToGeek(tabId, item.geekId, config);

      if (item.action === "click") {
        // 2b) CDP click geek item
        console.log(`${tag} CDP click geek item → 等详情弹出`);
        await cdpClickGeekItem(tabId, item.geekId, config);

        // 2c) dwell 看简历
        const detailDwell = Math.floor(randomBetween(...config.CLICK_DETAIL_DWELL_MS_RANGE));
        console.log(`${tag} 看详情 ${detailDwell}ms`);
        await sleep(detailDwell);

        // 2d) 关闭弹框（找 close button selector → CDP 点）
        console.log(`${tag} 关闭详情弹框`);
        await closeDetailPopup(tabId, config);

        // 2e) 关闭后停顿
        const closeDwell = Math.floor(randomBetween(...config.CLOSE_AFTER_DWELL_MS_RANGE));
        await sleep(closeDwell);
      } else {
        // 2b') 浏览：只 dwell，不点
        const browseDwell = Math.floor(randomBetween(...config.BROWSE_DWELL_MS_RANGE));
        console.log(`${tag} dwell 浏览 ${browseDwell}ms`);
        await sleep(browseDwell);
      }

      executed.push(item);
      onProgress("itemDone", { ...item, index: i, total: plan.length });
    } catch (e) {
      const msg = e?.message || String(e);
      console.warn(`${tag} 失败:`, msg);
      errors.push({ ...item, error: msg });
      onProgress("itemError", { ...item, error: msg });
      // 单项失败不中断整个 plan，继续下一个
    }

    // 3) item 之间的转场停顿（最后一项后不停）
    if (i < plan.length - 1) {
      const interPause = Math.floor(randomBetween(...config.INTER_ITEM_PAUSE_MS_RANGE));
      await sleep(interPause);
    }
  }

  console.log(
    `[humanizeBrowse] DONE executed=${executed.length}/${plan.length} errors=${errors.length}` +
      `${aborted ? " (aborted by user stop)" : ""}`
  );
  onProgress("done", { executed: executed.length, errors: errors.length, aborted });

  if (!aborted && errors.length > 0 && errors.length === plan.length) {
    // 全部失败：只打控制台日志，便于排查 selector 失效（不弹 UI 通知打扰用户）
    console.warn(
      `[humanizeBrowse] ${plan.length} 项全部失败，可能 DOM selector 失效（CONFIG.ITEM_SELECTOR_TEMPLATE / CLOSE_BUTTON_CANDIDATES）`
    );
  }

  return { ok: true, plan, executed, errors, aborted };
}

// 导出 CONFIG 让外部能读默认值（如果不想完全覆盖，可以 { ...defaultConfig, BROWSE_DWELL_MS_RANGE: [...] }）
export const HUMANIZE_BROWSE_CONFIG = CONFIG;
