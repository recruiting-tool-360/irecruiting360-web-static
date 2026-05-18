/**
 * CDP Input 模拟点击 / 输入（同进程 CDP，零反爬指纹）
 *
 * 跟 `siteNetworkCapture.ts` 共用同一套 `webContents.debugger`：
 *   - 不开 `--remote-debugging-port`（2026-05-18 二次事故已实测：哪怕不连 Playwright，
 *     只要开了这个 switch，BOSS 反爬就识别。详见 docs/boss地址资料.md "二次事故"区）
 *   - 不连 WebSocket，不暴露 navigator.webdriver
 *   - `Input.dispatchMouseEvent` 发出的鼠标事件 `isTrusted=true`，从 BOSS 页面 JS
 *     的视角看跟用户真实点击**完全无差别**
 *
 * 元素定位策略：
 *   1) 主 frame 先 `document.querySelector(selector)`
 *   2) 找不到再扫所有同源 iframe（BOSS 推荐宿主页 + iframe 同 zhipin.com 域），
 *      `iframe.contentDocument.querySelector(selector)`
 *   3) 找到后用 `getBoundingClientRect()` + iframe 自身 offset 拿 viewport 绝对坐标
 *   4) 主进程用这个坐标发 `Input.dispatchMouseEvent` 三连：mouseMoved → mousePressed → mouseReleased
 *
 * 安全：本模块**只对外暴露 click**，不暴露 type / keypress 等，避免被滥用做密码输入之类。
 */

import type { Debugger, WebContents } from 'electron'

/** 鼠标按下到释放的默认 dwell（ms），50ms 接近真实人类点击 */
const DEFAULT_PRESS_HOLD_MS = 50

export interface ClickResult {
  ok: boolean
  data?: {
    x: number
    y: number
    width: number
    height: number
    /** 元素在哪个 frame 找到的：主页面 / iframe href substring */
    foundIn: 'mainFrame' | string
    elapsedMs: number
  }
  error?: {
    code:
      | 'BAD_REQUEST'
      | 'WC_DESTROYED'
      | 'CDP_NOT_ATTACHED'
      | 'ELEMENT_NOT_FOUND'
      | 'ELEMENT_NOT_VISIBLE'
      | 'DISPATCH_FAILED'
    message: string
  }
  /** 调试 log */
  logs: string[]
}

interface FindElementResult {
  found: boolean
  x?: number
  y?: number
  width?: number
  height?: number
  visible?: boolean
  /** 'mainFrame' 或 iframe src 关键字 */
  foundIn?: string
  /** 没找到时附带的诊断信息（看到了哪些匹配 / iframe） */
  diag?: string[]
}

/**
 * 用 `wc.executeJavaScript` 跑一段查找逻辑，返回元素的 viewport 绝对坐标。
 *
 * 这段 JS 在主 frame 跑，但能 recursive 进入**同源** iframe 找元素。
 * BOSS 推荐宿主 chat/recommend 跟内嵌 iframe /web/frame/recommend 同 zhipin.com 域，
 * `iframe.contentDocument` 可读 → 完美适配 BOSS 推荐场景。
 */
async function findElement(wc: WebContents, selector: string): Promise<FindElementResult> {
  // 用 JSON.stringify 让 selector 字符串安全嵌入（防止 ' " 之类导致语法错）
  const sel = JSON.stringify(selector)
  const script = `(function findElement_${Date.now()}() {
    var diag = [];
    function rectAbsolute(el, frame) {
      var r = el.getBoundingClientRect();
      var ox = 0, oy = 0;
      var f = frame;
      while (f && f.frameElement) {
        var fr = f.frameElement.getBoundingClientRect();
        ox += fr.left;
        oy += fr.top;
        try { f = f.parent; } catch (e) { break; }
      }
      var visible = (
        r.width > 0 && r.height > 0 &&
        r.bottom > 0 && r.top < (frame.innerHeight || window.innerHeight) &&
        r.right > 0 && r.left < (frame.innerWidth || window.innerWidth)
      );
      return { x: ox + r.left + r.width / 2, y: oy + r.top + r.height / 2, width: r.width, height: r.height, visible: visible };
    }
    // 1) 主 frame
    try {
      var el = document.querySelector(${sel});
      if (el) {
        var info = rectAbsolute(el, window);
        return Object.assign({ found: true, foundIn: 'mainFrame' }, info);
      }
      diag.push('mainFrame: querySelector(' + ${sel} + ') = null');
    } catch (e) {
      diag.push('mainFrame query err: ' + (e && e.message || e));
    }
    // 2) 同源 iframe（recursive 一层即可，BOSS 推荐就一层）
    var iframes = document.querySelectorAll('iframe');
    diag.push('iframes count = ' + iframes.length);
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      var src = iframe.src || iframe.getAttribute('src') || '';
      try {
        var idoc = iframe.contentDocument;
        if (!idoc) { diag.push('iframe[' + i + '] src=' + src + ' contentDocument=null (cross-origin?)'); continue; }
        var iel = idoc.querySelector(${sel});
        if (iel) {
          var info2 = rectAbsolute(iel, iframe.contentWindow || window);
          return Object.assign({ found: true, foundIn: src || ('iframe[' + i + ']') }, info2);
        }
        diag.push('iframe[' + i + '] src=' + src + ' querySelector = null');
      } catch (e) {
        diag.push('iframe[' + i + '] src=' + src + ' err: ' + (e && e.message || e));
      }
    }
    return { found: false, diag: diag };
  })()`
  try {
    const r = (await wc.executeJavaScript(script, true)) as FindElementResult
    return r || { found: false }
  } catch (e) {
    return {
      found: false,
      diag: [`executeJavaScript err: ${(e as Error).message}`]
    }
  }
}

/**
 * 在指定 webContents 上，模拟用户点击一个 CSS selector 命中的元素。
 *
 * @param wc       目标 webContents（一般是某个招聘站 tab 的 view.webContents）
 * @param selector CSS selector，主进程内部会扫主 frame + 同源 iframe
 * @param opts.pressHoldMs  按下到释放的间隔（ms），默认 50。太短可能被风控识别。
 * @param opts.requireVisible 默认 true：元素必须在 viewport 内才点。
 */
export async function dispatchClick(
  wc: WebContents,
  selector: string,
  opts?: { pressHoldMs?: number; requireVisible?: boolean }
): Promise<ClickResult> {
  const logs: string[] = []
  const log = (m: string): void => {
    logs.push(`[${new Date().toISOString()}] ${m}`)
    console.log(`[cdpInput] ${m}`)
  }

  if (!wc || wc.isDestroyed()) {
    return { ok: false, error: { code: 'WC_DESTROYED', message: 'webContents destroyed' }, logs }
  }
  if (typeof selector !== 'string' || !selector.trim()) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'selector required' }, logs }
  }

  const startedAt = Date.now()
  const pressHoldMs = opts?.pressHoldMs ?? DEFAULT_PRESS_HOLD_MS
  const requireVisible = opts?.requireVisible !== false

  // 1) debugger attach 检查。如果 siteNetworkCapture 已经 attach 过（招聘站 tab 创建时
  //    自动 attach），这里直接复用；否则现 attach 一次。
  let dbg: Debugger
  try {
    dbg = wc.debugger
    if (!dbg.isAttached()) {
      log('debugger not attached, attaching now')
      dbg.attach('1.3')
    }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'CDP_NOT_ATTACHED', message: (e as Error).message },
      logs
    }
  }

  // 2) 找元素 + 拿坐标
  log(`querying element: ${selector}`)
  const found = await findElement(wc, selector)
  if (!found.found) {
    return {
      ok: false,
      error: {
        code: 'ELEMENT_NOT_FOUND',
        message: `selector "${selector}" not found in mainFrame or same-origin iframes; diag: ${(
          found.diag || []
        ).join(' | ')}`
      },
      logs
    }
  }
  log(`found ${selector} in ${found.foundIn}, center=(${found.x},${found.y}) size=${found.width}x${found.height} visible=${found.visible}`)

  if (requireVisible && !found.visible) {
    return {
      ok: false,
      error: {
        code: 'ELEMENT_NOT_VISIBLE',
        message: `element found but not in viewport (x=${found.x}, y=${found.y})`
      },
      logs
    }
  }

  const x = Number(found.x)
  const y = Number(found.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return {
      ok: false,
      error: { code: 'ELEMENT_NOT_VISIBLE', message: `invalid coords x=${x} y=${y}` },
      logs
    }
  }

  // 3) 发 CDP Input 三连：mouseMoved → mousePressed → mouseReleased
  //    `Input.dispatchMouseEvent` 产生的事件 isTrusted=true，BOSS 视角下跟用户真实点击无差别。
  try {
    log(`dispatching Input.dispatchMouseEvent at (${x}, ${y})`)
    await dbg.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
      modifiers: 0
    })
    await dbg.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      modifiers: 0
    })
    // 模拟"按住"50ms，让 BOSS 风控看到的 timing 接近真实人类
    await new Promise((r) => setTimeout(r, pressHoldMs))
    await dbg.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      modifiers: 0
    })
    log('mouseReleased ok')
  } catch (e) {
    return {
      ok: false,
      error: { code: 'DISPATCH_FAILED', message: (e as Error).message },
      logs
    }
  }

  return {
    ok: true,
    data: {
      x,
      y,
      width: Number(found.width) || 0,
      height: Number(found.height) || 0,
      foundIn: found.foundIn || 'mainFrame',
      elapsedMs: Date.now() - startedAt
    },
    logs
  }
}
