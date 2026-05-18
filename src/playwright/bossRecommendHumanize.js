/**
 * BOSS 推荐牛人 - 拟人浏览循环 (Playwright scriptCode)
 *
 * ── 真实页面架构（详见 docs/boss地址资料.md） ────────────────────────────
 *
 *   宿主页 https://www.zhipin.com/web/chat/recommend?jobid=<id>
 *     └── iframe https://www.zhipin.com/web/frame/recommend/?jobid=<id>&...
 *           ul.card-list
 *             li.card-item
 *               .card-inner[data-geekid]                       ← 点击热区
 *
 *   点击 .card-inner 时 iframe → window.parent.postMessage(...)，
 *   **宿主页**渲染候选人详情弹框（弹框 DOM 在宿主页 body 下，不在 iframe 内）。
 *
 * ── 拟人循环 ────────────────────────────────────────────────────────────
 *
 *   loop:
 *     1) 进 iframe，找下一张未访问的卡片
 *     2) scrollIntoView + hover + 鼠标微移 + dwell（在 iframe 上下文）
 *     3) 如果 click=true（默认 true）：
 *        a) click 卡片
 *        b) 在 **宿主页** 等候选人详情弹框出现（多个选择器 fallback）
 *        c) sleep(jitter(popupDwellMs)) 模拟阅读（默认 2-6s）
 *        d) 关弹框：关闭按钮 → ESC → 遮罩 三级兜底
 *        e) 短停顿，让 iframe 列表 active 状态恢复
 *     4) 处理计数 +1
 *     5) 处理完 iframe 内可见卡片 → scrollTo(bottom) on iframe 的 .recommend-list-wrap
 *     6) page.waitForResponse('/wapi/zpjob/rec/geek/list') 等下一页（page 级监听跨 frame 有效）
 *     7) 累计 accumulated，loop
 *   退出条件：processed >= targetCount / pagesLoaded >= maxPages / hasMore=false / 两轮没新卡片
 *
 * ── 不直接 fetch ────────────────────────────────────────────────────────
 * 不写 page.evaluate(fetch(...))。BOSS 自己会因滚动触发请求，监听就行。
 */

export const scriptCode = String.raw`
let host = '';
try { host = new URL(page.url()).hostname; } catch (_e) { host = ''; }
if (!host.endsWith('zhipin.com')) {
  const err = new Error('current tab is not on zhipin.com (got ' + host + ')');
  err.code = 'NOT_ON_BOSS_DOMAIN';
  throw err;
}

const c = ctx || {};
const targetCount = Math.max(1, Number(c.targetCount) || 10);
const dwellMin = Array.isArray(c.dwellMs) ? Number(c.dwellMs[0]) || 800 : 800;
const dwellMax = Array.isArray(c.dwellMs) ? Number(c.dwellMs[1]) || 2400 : 2400;
const pauseMin = Array.isArray(c.pauseMs) ? Number(c.pauseMs[0]) || 200 : 200;
const pauseMax = Array.isArray(c.pauseMs) ? Number(c.pauseMs[1]) || 600 : 600;
const popupDwellMin = Array.isArray(c.popupDwellMs) ? Number(c.popupDwellMs[0]) || 2000 : 2000;
const popupDwellMax = Array.isArray(c.popupDwellMs) ? Number(c.popupDwellMs[1]) || 6000 : 6000;
const maxPages = Math.max(1, Number(c.maxPages) || 10);
const pageWaitMs = Math.max(2000, Number(c.pageWaitMs) || 8000);
const enableClick = c.click === false ? false : true;  // 默认 true
const popupWaitMs = Math.max(500, Number(c.popupWaitMs) || 4000);
const iframePattern = c.iframePattern || '/web/frame/recommend';
const containerSel = (c.scrollContainer && String(c.scrollContainer)) || '.recommend-list-wrap';

// iframe 内的卡片选择器
const cardSelInFrame = 'li.card-item .card-inner[data-geekid]';

// 宿主页里可能的"候选人详情弹框"选择器（按优先级 fallback）
const popupSelectors = (Array.isArray(c.popupSelectors) && c.popupSelectors.length > 0)
  ? c.popupSelectors
  : [
      '.candidate-detail-dialog',
      '.geek-detail-dialog',
      '.candidate-detail-drawer',
      '.geek-detail-drawer',
      '[class*="candidate-detail-popup"]',
      '[class*="geek-detail-popup"]',
      '.boss-dialog',
      '.dialog-wrap.visible',
      '.popup-wrap.show'
    ];

// 关闭弹框的备选按钮选择器（在弹框容器内查找）
const closeSelectors = (Array.isArray(c.closeSelectors) && c.closeSelectors.length > 0)
  ? c.closeSelectors
  : [
      '.close',
      '.close-btn',
      '.icon-close',
      '.btn-close',
      '.dialog-close',
      '.popup-close',
      '[aria-label*="关闭"]',
      '[aria-label*="close"]',
      '[aria-label*="Close"]'
    ];

// 进 iframe（在宿主 chat 页里找推荐 iframe）
const frameSel = 'iframe[src*="' + iframePattern + '"]';
await page.locator(frameSel).first().waitFor({ state: 'attached', timeout: 10000 }).catch(function () {
  const err = new Error('recommend iframe not found: ' + frameSel);
  err.code = 'NO_IFRAME';
  throw err;
});
const frame = page.frameLocator(frameSel);

// 累计监听到的牛人（page 级订阅会包含 iframe 内的请求）
const accumulated = [];
const seenIds = new Set();
const offResponse = (function () {
  const handler = async function (r) {
    try {
      if (r.url().indexOf('/wapi/zpjob/rec/geek/list') === -1) return;
      if (r.status() !== 200) return;
      const body = await r.json().catch(function () { return null; });
      if (!body || Number(body.code) !== 0) return;
      const zp = body.zpData || {};
      const list = Array.isArray(zp.geekList) ? zp.geekList : [];
      let added = 0;
      for (const g of list) {
        const id = String(g.encryptGeekId || g.geekId || '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        accumulated.push(g);
        added += 1;
      }
      if (added > 0) log('captured page response: +' + added + ' new geeks (accumulated=' + accumulated.length + ')');
    } catch (_e) { /* ignore */ }
  };
  page.on('response', handler);
  return function () {
    try { page.off('response', handler); } catch (_e) { /* noop */ }
  };
})();

// 等 iframe 里首屏卡片至少出现一张
await frame.locator(cardSelInFrame).first().waitFor({ state: 'visible', timeout: 5000 }).catch(function () {
  offResponse();
  const err = new Error('no recommend cards visible in iframe after 5s');
  err.code = 'NO_CARDS';
  throw err;
});

// 弹框探测 + 关闭 helper（在宿主页层面操作）
async function detectPopup(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of popupSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 200 }).catch(function () { return false; })) {
          return el;
        }
      } catch (_e) { /* noop */ }
    }
    await sleep(150);
  }
  return null;
}

async function closePopup(popupEl) {
  // 1) 关闭按钮
  for (const sel of closeSelectors) {
    try {
      const btn = popupEl.locator(sel).first();
      if (await btn.isVisible({ timeout: 200 }).catch(function () { return false; })) {
        await btn.click({ timeout: 1500 }).catch(function () { /* noop */ });
        await sleep(jitter(200, 500));
        // 校验是否真关了
        const stillVisible = await popupEl.isVisible({ timeout: 300 }).catch(function () { return false; });
        if (!stillVisible) return 'close_button';
      }
    } catch (_e) { /* noop */ }
  }
  // 2) ESC
  try {
    await page.keyboard.press('Escape');
    await sleep(jitter(200, 500));
    const stillVisible = await popupEl.isVisible({ timeout: 300 }).catch(function () { return false; });
    if (!stillVisible) return 'escape';
  } catch (_e) { /* noop */ }
  // 3) 点遮罩
  for (const maskSel of ['.mask', '.modal-mask', '.overlay', '.dialog-mask']) {
    try {
      const mask = page.locator(maskSel).first();
      if (await mask.isVisible({ timeout: 200 }).catch(function () { return false; })) {
        await mask.click({ timeout: 1500, position: { x: 5, y: 5 } }).catch(function () {});
        await sleep(jitter(200, 500));
        const stillVisible = await popupEl.isVisible({ timeout: 300 }).catch(function () { return false; });
        if (!stillVisible) return 'mask';
      }
    } catch (_e) { /* noop */ }
  }
  return 'unclosed';
}

try {
  let processed = 0;
  let pagesLoaded = 0;
  let stoppedReason = 'target';
  const visitedIds = new Set();

  while (processed < targetCount) {
    // === 处理当前 iframe DOM 里 "未访问过" 的卡片 ===
    const cards = frame.locator(cardSelInFrame);
    const cardCount = await cards.count();
    let progressedThisRound = false;

    for (let i = 0; i < cardCount; i++) {
      if (processed >= targetCount) break;
      const el = cards.nth(i);
      const id = await el.getAttribute('data-geekid').catch(function () { return null; });
      if (!id) continue;
      if (visitedIds.has(id)) continue;
      visitedIds.add(id);

      // 1) 滚动 + hover + 微移
      try { await el.scrollIntoViewIfNeeded({ timeout: 2000 }); } catch (_e) { /* noop */ }
      await sleep(jitter(120, 280));

      try { await el.hover({ timeout: 2000 }); } catch (_e) { /* noop */ }
      try {
        const box = await el.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const steps = 1 + Math.floor(Math.random() * 3);
          for (let s = 0; s < steps; s++) {
            const dx = (Math.random() - 0.5) * 8;
            const dy = (Math.random() - 0.5) * 8;
            await page.mouse.move(cx + dx, cy + dy, { steps: 2 + Math.floor(Math.random() * 4) });
            await sleep(jitter(60, 180));
          }
        }
      } catch (_e) { /* noop */ }

      // 2) 点击卡片：iframe → 宿主 postMessage → 宿主弹框
      if (enableClick) {
        try { await el.click({ timeout: 2000 }); } catch (_e) {
          // 偶尔卡片 detach；记录后继续
          log('click failed on card ' + id + ', skip');
          await sleep(jitter(pauseMin, pauseMax));
          continue;
        }

        // 3) 等弹框出现（宿主页层面）
        const popupEl = await detectPopup(popupWaitMs);
        if (!popupEl) {
          log('popup not detected for card ' + id + ' after ' + popupWaitMs + 'ms');
          // 没弹框可能是 BOSS 改版 / 网络慢；按 ESC 兜底防止卡死，继续下一张
          try { await page.keyboard.press('Escape'); } catch (_e) { /* noop */ }
        } else {
          // 4) 真"看"几秒
          await sleep(jitter(popupDwellMin, popupDwellMax));
          // 5) 关弹框
          const closedBy = await closePopup(popupEl);
          log('popup for ' + id + ' closed by ' + closedBy);
          // 6) 关闭后小停顿，让 iframe 列表恢复 active 状态
          await sleep(jitter(300, 700));
        }
      } else {
        // 不点的话，更长的 dwell 模拟"细看"
        await sleep(jitter(dwellMin, dwellMax));
      }

      // 7) 卡片间停顿
      await sleep(jitter(pauseMin, pauseMax));

      processed += 1;
      progressedThisRound = true;
      if (processed % 5 === 0) log('processed=' + processed + '/' + targetCount);
    }

    if (processed >= targetCount) { stoppedReason = 'target'; break; }

    if (pagesLoaded >= maxPages) {
      log('reached maxPages=' + maxPages + ', stop');
      stoppedReason = 'max_pages';
      break;
    }

    // === 滚到 iframe 里的 .recommend-list-wrap 底部触发分页 ===
    let nextResponse = null;
    let waitErr = null;
    await Promise.all([
      page.waitForResponse(
        function (r) {
          return r.url().indexOf('/wapi/zpjob/rec/geek/list') !== -1 && r.status() === 200;
        },
        { timeout: pageWaitMs }
      ).then(function (r) { nextResponse = r; }).catch(function (e) { waitErr = e; }),
      (async function () {
        // 在 iframe 上下文滚动；frame.locator(...).evaluate 走的就是 iframe 内的 DOM
        const container = frame.locator(containerSel).first();
        try {
          await container.evaluate(function (el) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          });
        } catch (_e) {
          // fallback：滚 iframe 内的 window
          try {
            await frame.locator('body').evaluate(function () {
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            });
          } catch (__e) { /* noop */ }
        }
      })()
    ]);

    if (!nextResponse) {
      log('no next /rec/geek/list response in ' + pageWaitMs + 'ms (' + (waitErr && waitErr.message ? waitErr.message : 'timeout') + ')');
      const cardsNow = await frame.locator(cardSelInFrame).count().catch(function () { return cardCount; });
      if (cardsNow <= cardCount) {
        log('iframe DOM card count unchanged (' + cardsNow + '), assume end of list');
        stoppedReason = 'no_more';
        break;
      }
      progressedThisRound = true;
    } else {
      pagesLoaded += 1;
      log('page response captured, pagesLoaded=' + pagesLoaded);
      await sleep(jitter(600, 1400));
      try {
        const body = await nextResponse.json();
        const zp = body && body.zpData ? body.zpData : null;
        if (zp && zp.hasMore === false) {
          log('zpData.hasMore=false, will stop after this round');
        }
      } catch (_e) { /* noop */ }
    }

    if (!progressedThisRound) {
      log('no progress this round, stop');
      stoppedReason = 'no_progress';
      break;
    }
  }

  const finalDomCount = await frame.locator(cardSelInFrame).count().catch(function () { return 0; });
  log('humanize done processed=' + processed + ' pagesLoaded=' + pagesLoaded + ' domCount=' + finalDomCount + ' reason=' + stoppedReason);
  return {
    processed: processed,
    pagesLoaded: pagesLoaded,
    accumulated: accumulated,
    finalDomCount: finalDomCount,
    reachedTarget: processed >= targetCount,
    stoppedReason: stoppedReason
  };
} finally {
  offResponse();
}
`;

/** 包装 ctx */
export function buildCtx(params) {
  const p = params || {};
  return {
    jobId: p.jobId == null ? "" : String(p.jobId),
    targetCount: Math.max(1, Number(p.targetCount) || 10),
    dwellMs: Array.isArray(p.dwellMs) ? p.dwellMs : [800, 2400],
    pauseMs: Array.isArray(p.pauseMs) ? p.pauseMs : [200, 600],
    popupDwellMs: Array.isArray(p.popupDwellMs) ? p.popupDwellMs : [2000, 6000],
    maxPages: Math.max(1, Number(p.maxPages) || 10),
    pageWaitMs: Math.max(2000, Number(p.pageWaitMs) || 8000),
    popupWaitMs: Math.max(500, Number(p.popupWaitMs) || 4000),
    click: p.click === false ? false : true,
    iframePattern: p.iframePattern || "/web/frame/recommend",
    scrollContainer: p.scrollContainer || ".recommend-list-wrap",
    popupSelectors: Array.isArray(p.popupSelectors) ? p.popupSelectors : null,
    closeSelectors: Array.isArray(p.closeSelectors) ? p.closeSelectors : null
  };
}

export const meta = {
  name: "boss.recommendHumanize",
  channel: "boss",
  pageUrlPattern: "https://www.zhipin.com/web/chat/recommend",
  apiUrl: "https://www.zhipin.com/wapi/zpjob/rec/geek/list",
  description:
    "BOSS 宿主 chat 推荐 tab 拟人浏览循环：在 iframe[src*='/web/frame/recommend'] 内滚动 + hover + click 卡片；" +
    "click 后等宿主页弹候选人详情弹框，随机 2-6s 后关闭；卡片处理完滚到底部触发自然分页，" +
    "page 级监听 /wapi/zpjob/rec/geek/list 累计新增牛人。**绝不直接 fetch**。",
  ctxSchema: {
    type: "object",
    required: ["jobId", "targetCount"],
    properties: {
      jobId: { type: "string" },
      targetCount: { type: "number" },
      dwellMs: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      pauseMs: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      popupDwellMs: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      maxPages: { type: "number", default: 10 },
      pageWaitMs: { type: "number", default: 8000 },
      popupWaitMs: { type: "number", default: 4000 },
      click: { type: "boolean", default: true },
      iframePattern: { type: "string", default: "/web/frame/recommend" },
      scrollContainer: { type: "string", default: ".recommend-list-wrap" },
      popupSelectors: { type: "array", items: { type: "string" } },
      closeSelectors: { type: "array", items: { type: "string" } }
    }
  },
  errorCodes: ["NOT_ON_BOSS_DOMAIN", "BAD_REQUEST", "NO_IFRAME", "NO_CARDS"]
};

export default { scriptCode, buildCtx, meta };
