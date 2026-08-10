/**
 * BOSS 升级权益弹窗检测。
 *
 * 推荐牛人打开详情（查看权益）与互动页发起沟通（沟通权益）会出现同一套弹窗 DOM，
 * 因此两个 RPA 流程统一复用这里的检测规则，避免后续结构变化时出现两套口径。
 *
 * 不使用动态 id="boss-dynamic-dialog-*"，只使用稳定结构 + 关键业务文案：
 *   - .dialog-wrap.active[data-type="boss-dialog"] .business-block-dialog
 *   - .vip2-layout / .payment-layout-v2
 *   - “每日沟通总量” + “VIP账号”或“商品需付”
 */

export const BOSS_ENTITLEMENT_REQUIRED = "BOSS_ENTITLEMENT_REQUIRED";

const DIALOG_SELECTOR =
  '.dialog-wrap.active[data-type="boss-dialog"] .business-block-dialog';
const BUSINESS_SELECTOR = ".vip2-layout, .payment-layout-v2";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDetectBossEntitlementDialogScript() {
  return `
(function detectBossEntitlementDialog() {
  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var win = el.ownerDocument.defaultView || window;
    var style = win.getComputedStyle(el);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0;
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
      } catch (error) {}
    }
    return result;
  }

  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var dialogs = docs[di].doc.querySelectorAll(${JSON.stringify(DIALOG_SELECTOR)});
    for (var i = 0; i < dialogs.length; i++) {
      var dialog = dialogs[i];
      if (!isVisible(dialog)) continue;
      var text = String(dialog.textContent || '').replace(/\\s+/g, ' ').trim();
      var hasBusinessLayout = !!dialog.querySelector(${JSON.stringify(BUSINESS_SELECTOR)});
      var matched = hasBusinessLayout &&
        text.indexOf('每日沟通总量') >= 0 &&
        (text.indexOf('VIP账号') >= 0 || text.indexOf('商品需付') >= 0);
      if (matched) {
        return {
          found: true,
          foundIn: docs[di].label,
          text: text.slice(0, 500)
        };
      }
    }
  }
  return { found: false };
})();
`;
}

/**
 * 检测 BOSS 升级权益弹窗。timeoutMs > 0 时按 pollMs 轮询，适合放在真实点击之后。
 */
export async function detectBossEntitlementDialog(
  tabId,
  { timeoutMs = 0, pollMs = 180 } = {}
) {
  if (
    !tabId ||
    typeof window === "undefined" ||
    typeof window.api?.automation?.evalOnTab !== "function"
  ) {
    return { found: false };
  }

  const startedAt = Date.now();
  let last = { found: false };
  do {
    const result = await window.api.automation.evalOnTab({
      tabId,
      code: buildDetectBossEntitlementDialogScript(),
    });
    if (!result?.ok) {
      throw new Error(
        result?.error?.message ||
          result?.error?.code ||
          "读取 BOSS 升级权益弹窗失败"
      );
    }
    last = result.result || { found: false };
    if (last.found) {
      return { ...last, elapsedMs: Date.now() - startedAt };
    }
    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(Math.min(pollMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  } while (Date.now() - startedAt <= timeoutMs);

  return { ...last, found: false, elapsedMs: Date.now() - startedAt };
}

export default {
  BOSS_ENTITLEMENT_REQUIRED,
  detectBossEntitlementDialog,
};
