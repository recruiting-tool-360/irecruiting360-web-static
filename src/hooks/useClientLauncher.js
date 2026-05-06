/**
 * 唤起 i 快招客户端的 hook（用于 i 人事 iframe 内 / 主登录页）
 *
 * 探测策略（多信号融合）：
 *   1. 触发 deep link  ikuaizhao://<action>?d=<base64url>&v=1
 *   2. 监听 window blur / document.visibilitychange = 'hidden' （客户端被唤起后浏览器失焦）
 *   3. 监听 window.message 收到客户端启动后的回执（最可靠）
 *   4. 1.5s 内任一信号触发即视为成功；都没触发则视为客户端未安装
 *
 * 注意：iframe 内执行 location.href 在 Chrome 会被 third-party initiated navigation 拦截，
 *       所以一律用 anchor.click() 模拟用户手势触发协议。
 */

import { ref } from 'vue';
import { buildDeepLink } from 'src/util/deepLinkCodec';
import { isInsideEmbeddedWebview } from 'src/util/clientPlatform';

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

export function useClientLauncher() {
  const isLaunching = ref(false);
  /** @type {'idle'|'launching'|'success'|'missing'} */
  const status = ref('idle');

  /**
   * 触发 deep link 唤起客户端
   * @param {'sso'|'open-chat'|'import-resume'} action
   * @param {object} payload
   * @param {{ timeoutMs?: number }} opts
   * @returns {Promise<boolean>} 是否成功唤起（启发式判断）
   */
  function tryLaunch(action, payload, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 1500;

    return new Promise((resolve) => {
      isLaunching.value = true;
      status.value = 'launching';
      let settled = false;

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        cleanup();
        isLaunching.value = false;
        status.value = ok ? 'success' : 'missing';
        if (ok) recordClientLaunched();
        resolve(ok);
      };

      const onBlur = () => finish(true);
      const onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') finish(true);
      };
      const onMessage = (e) => {
        // 客户端启动后通过 e.data = { type: 'ikuaizhao:launched', ts } 回执
        if (e?.data && typeof e.data === 'object' && e.data.type === 'ikuaizhao:launched') {
          finish(true);
        }
      };

      function cleanup() {
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('message', onMessage);
        if (timer) clearTimeout(timer);
      }

      window.addEventListener('blur', onBlur);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('message', onMessage);

      const timer = setTimeout(() => finish(false), timeoutMs);

      // 钉钉/飞书等内置 webview 直接判失败
      if (isInsideEmbeddedWebview()) {
        finish(false);
        return;
      }

      // 用 anchor click 触发协议（在 iframe 内 / Chrome 上更稳，绕过 third-party initiated navigation 限制）
      try {
        const url = buildDeepLink(action, payload);
        const a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        a.target = '_self';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        console.error('[useClientLauncher] failed to dispatch deep link', e);
        finish(false);
      }
    });
  }

  return {
    isLaunching,
    status,
    tryLaunch
  };
}
