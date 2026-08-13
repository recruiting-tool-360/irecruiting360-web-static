/**
 * BOSS 升级权益弹窗检测。
 *
 * 推荐牛人打开详情（查看权益）与互动页发起沟通（沟通权益）会弹出商业付费窗。
 * BOSS 目前至少两套灰度皮肤，查看 / 沟通共用同一套骨架，只是标题或顶栏文案不同。
 *
 * 新皮肤（v4）：
 *   .business-block-content + .title-text「查看权益不足 / 开聊权益不足」
 *   支付区 .prop-pay-order / .pay-qrcode-v1
 *
 * 旧皮肤（vip2）：
 *   .business-block-dialog + .vip2-layout + .payment-layout-v2
 *   对比表文案「每日沟通总量」+「VIP账号 / 商品需付」
 *   没有「权益不足」标题
 *
 * 不使用动态 id="boss-dynamic-dialog-*"。
 */

export const BOSS_ENTITLEMENT_REQUIRED = "BOSS_ENTITLEMENT_REQUIRED";

const DIALOG_SELECTOR = '.dialog-wrap.active[data-type="boss-dialog"]';

/** 新皮肤独有结构：标题区 / 新支付区。两边都有的 .business-block-wrap 不当判别条件。 */
const CURRENT_LAYOUT_SELECTOR = [
  ".business-block-content",
  ".business-block-header",
  ".title-text",
  ".prop-pay-order",
  ".pay-qrcode-v1",
].join(", ");

/** 旧皮肤独有结构：vip2 对比表 / 旧支付区。 */
const LEGACY_LAYOUT_SELECTOR = [
  ".business-block-dialog",
  ".vip2-layout",
  ".payment-layout-v2",
  ".rights-table-vip",
].join(", ");

const TITLE_SELECTOR =
  ".title-text, .business-block-header .header, .business-block-header h3";

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

  function normalize(text) {
    return String(text || '').replace(/\\s+/g, '');
  }

  function matchCurrent(dialog, title, compactText) {
    var hasLayout = !!dialog.querySelector(${JSON.stringify(CURRENT_LAYOUT_SELECTOR)});
    var hasCopy = title.indexOf('权益不足') >= 0 || compactText.indexOf('权益不足') >= 0;
    return hasLayout && hasCopy;
  }

  function matchLegacy(dialog, compactText) {
    var hasLayout = !!dialog.querySelector(${JSON.stringify(LEGACY_LAYOUT_SELECTOR)});
    var hasCopy = compactText.indexOf('每日沟通总量') >= 0 &&
      (compactText.indexOf('VIP账号') >= 0 || compactText.indexOf('商品需付') >= 0);
    return hasLayout && hasCopy;
  }

  var docs = documents();
  for (var di = 0; di < docs.length; di++) {
    var dialogs = docs[di].doc.querySelectorAll(${JSON.stringify(DIALOG_SELECTOR)});
    for (var i = 0; i < dialogs.length; i++) {
      var dialog = dialogs[i];
      if (!isVisible(dialog)) continue;

      var titleEl = dialog.querySelector(${JSON.stringify(TITLE_SELECTOR)});
      var title = normalize(titleEl && titleEl.textContent);
      var compactText = normalize(dialog.textContent);
      var rawText = String(dialog.textContent || '').replace(/\\s+/g, ' ').trim();

      if (matchCurrent(dialog, title, compactText)) {
        return {
          found: true,
          variant: 'current',
          foundIn: docs[di].label,
          text: rawText.slice(0, 500)
        };
      }

      if (matchLegacy(dialog, compactText)) {
        return {
          found: true,
          variant: 'legacy',
          foundIn: docs[di].label,
          text: rawText.slice(0, 500)
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
