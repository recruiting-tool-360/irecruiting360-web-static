/**
 * 唤起 i 快招客户端的 hook（用于 i 人事 iframe 内 / 主登录页）
 *
 * 探测策略（v2 — 2026-05-09 重写，确定性探测取代启发式）：
 *
 *   ┌─────────────┐   ① fetch /__ikuaizhao/health  ┌──────────────────────┐
 *   │ Browser     │ ───────────────────────────────>│ Electron client       │
 *   │ launcher    │ <─── 200 OK / connection error  │ (127.0.0.1:53531)     │
 *   └─────────────┘                                  └──────────────────────┘
 *           │ ② 200 → 客户端在跑 → 直接拉起 deep link 后立即 succeeded
 *           │ ② 失败 → 客户端没跑 → 触发 deep link
 *           │ ③ 触发后每 250ms 轮询 /health，命中即 succeeded
 *           │ ④ 超时（默认 8s）仍没拿到 200 → 视为 missing
 *
 *   旧策略（监听 window blur / visibility）的问题：
 *     - Chrome 系统对话框「要打开 X 吗？」打开期间浏览器并不会失焦，
 *       1.5s/8s 计时器跑赢用户读 dialog 的时间，导致首次必然误判 missing
 *     - 多窗口 / 分屏 / Spaces 场景 blur 漏发
 *     - 用户随便点了一下 dock 图标 blur 误发
 *   新策略基于真实的客户端 → 浏览器 反向通信，不再受这些 UI 时序干扰。
 *
 * 注意：iframe 内执行 location.href 在 Chrome 会被 third-party initiated navigation 拦截，
 *       所以一律用 anchor.click() 模拟用户手势触发协议。
 */

import { ref } from 'vue';
import { buildDeepLink } from 'src/util/deepLinkCodec';
import { isInsideEmbeddedWebview } from 'src/util/clientPlatform';

const DEFAULT_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 250;
const SINGLE_PROBE_TIMEOUT_MS = 800;

/**
 * Electron 客户端 health probe 端点。
 * 必须与 electron/src/main/probeServer.ts 里的 PROBE_PORT/PROBE_HEALTH_PATH 保持一致。
 *
 * 现代浏览器（Chrome 94+ / Safari 16+ / Firefox）允许 HTTPS 页面 fetch http://127.0.0.1，
 * 不会触发 mixed content 阻断（前提是 server 端开 CORS + Private Network Access 头）。
 */
const PROBE_URL = 'http://127.0.0.1:53531/__ikuaizhao/health';

const LS_USER_CHOICE_KEY = 'ikuaizhao:user-choice';
const LS_LAST_LAUNCHED_KEY = 'ikuaizhao:last-launched';

/**
 * 用户偏好：上一次选择的入口（'client' | 'web' | null）
 */
export function getUserChoice() {
  try {
    return localStorage.getItem(LS_USER_CHOICE_KEY) || null;
  } catch (_e) {
    return null;
  }
}

export function setUserChoice(choice) {
  try {
    if (choice) localStorage.setItem(LS_USER_CHOICE_KEY, choice);
    else localStorage.removeItem(LS_USER_CHOICE_KEY);
  } catch (_e) {
    /* ignore */
  }
}

export function recordClientLaunched() {
  try {
    localStorage.setItem(LS_LAST_LAUNCHED_KEY, String(Date.now()));
  } catch (_e) {
    /* ignore */
  }
}

export function getLastLaunchedAt() {
  try {
    const raw = localStorage.getItem(LS_LAST_LAUNCHED_KEY);
    return raw ? Number(raw) : 0;
  } catch (_e) {
    return 0;
  }
}

/**
 * 单次探测客户端是否在跑。
 * @returns 探测到的 health info（含 pid / version），未跑返回 null
 */
export async function probeClient() {
  if (typeof fetch !== 'function') return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SINGLE_PROBE_TIMEOUT_MS);
    const res = await fetch(PROBE_URL, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: ctrl.signal,
      // 不带 credentials 减少 preflight 复杂度
      credentials: 'omit',
      // ★ Chrome 142+ Local Network Access：HTTPS 公网页面访问 127.0.0.1（loopback）默认被拦
      //   （报「跨域/CORS」），必须显式声明目标地址空间为 loopback，否则会先被混合内容/LNA 拦截。
      //   声明后浏览器才会走 LNA 许可流程（首次弹一次「允许访问本地网络」，用户点允许即可）。
      //   老浏览器不认识这个 init 字段，会被忽略（安全）。
      targetAddressSpace: 'loopback'
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    // ECONNREFUSED / 超时 / CORS 拒绝 → 视为客户端未在跑
    return null;
  }
}

export function useClientLauncher() {
  const isLaunching = ref(false);
  /** @type {'idle'|'launching'|'success'|'missing'} */
  const status = ref('idle');

  /**
   * 触发 deep link 唤起客户端，并通过 health probe 轮询确定性探测启动结果
   *
   * @param {'sso'|'open-chat'|'import-resume'} action
   * @param {object} payload
   * @param {{ timeoutMs?: number, onTick?: (elapsedMs: number, hint?: string) => void }} opts
   *        - timeoutMs: 探测总超时（默认 8000ms）
   *        - onTick: 每 250ms 回调（已用 ms, UI 提示文案），用于读秒
   * @returns {{ promise: Promise<boolean>, cancel: () => void }}
   *        - promise: 是否成功唤起（确定性判断，不再有「我已打开」的歧义）
   *        - cancel:  用户主动取消等待，立刻 resolve(false)
   */
  function tryLaunch(action, payload, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const onTick = typeof opts.onTick === 'function' ? opts.onTick : null;

    let externalCancel = () => {};

    const promise = new Promise((resolve) => {
      isLaunching.value = true;
      status.value = 'launching';
      let settled = false;
      let pollTimer = null;
      let tickTimer = null;
      let overallTimer = null;

      const cleanup = () => {
        if (pollTimer) clearTimeout(pollTimer);
        if (tickTimer) clearInterval(tickTimer);
        if (overallTimer) clearTimeout(overallTimer);
      };

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        cleanup();
        isLaunching.value = false;
        status.value = ok ? 'success' : 'missing';
        if (ok) recordClientLaunched();
        resolve(ok);
      };

      externalCancel = () => finish(false);

      // 钉钉/飞书等内嵌 webview 直接判失败（无法唤起协议）
      if (isInsideEmbeddedWebview()) {
        finish(false);
        return;
      }

      const startedAt = Date.now();

      // ① 先做一次 pre-probe：如果客户端已在跑，直接拉起协议并立即 succeed
      //    （不需要等任何对话框 / blur / 轮询）
      void (async () => {
        const pre = await probeClient();

        if (pre) {
          // 客户端已经在跑：触发 deep link 让客户端把当前 deep link payload 处理掉，
          // 同时把窗口拉到前台。结果立刻判 success。
          dispatchDeepLink(action, payload);
          finish(true);
          return;
        }

        // ② 客户端没在跑：触发 deep link 拉起，然后开始轮询 /health
        if (settled) return;
        if (!dispatchDeepLink(action, payload)) {
          finish(false);
          return;
        }

        // 总超时
        overallTimer = setTimeout(() => {
          finish(false);
        }, timeoutMs);

        // UI 心跳
        if (onTick) {
          tickTimer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            if (elapsed >= timeoutMs) return;
            onTick(elapsed);
          }, POLL_INTERVAL_MS);
        }

        // 启动轮询循环：每 POLL_INTERVAL_MS 探测一次，命中 200 即成功
        const poll = async () => {
          if (settled) return;
          const info = await probeClient();
          if (settled) return;
          if (info) {
            finish(true);
            return;
          }
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        };
        // 第一次轮询稍微延后一点（让 macOS 冷启动 .app 有时间起 server）
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      })();
    });

    return {
      promise,
      cancel: () => externalCancel()
    };
  }

  return {
    isLaunching,
    status,
    tryLaunch
  };
}

/**
 * 触发 deep link（用 anchor.click() 绕过 Chrome 的 third-party initiated navigation 限制）
 * @returns 是否成功调度（仅捕获 build URL / DOM 异常，并不代表客户端真的起来了）
 */
function dispatchDeepLink(action, payload) {
  try {
    const url = buildDeepLink(action, payload);
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    a.target = '_self';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (e) {
    console.error('[useClientLauncher] failed to dispatch deep link', e);
    return false;
  }
}
