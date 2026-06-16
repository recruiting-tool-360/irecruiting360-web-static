/**
 * 客户端使用权限校验
 *
 * 在「客户端窗口聚焦 / 创建任务 / 选择职位」等时机调用
 *   GET candidate/AiManager/client/noauth/hasAuthority（经 window.api.ihrBridge.hasAuthority）
 * 判定当前用户是否还有 i 快招使用权限。无权限则：
 *   1. 清除当前用户登录态（store.commit('changeUserInfo', null)）
 *   2. 弹出登录弹框（redirectToLogin → 客户端模式打开 IhrAuthModal）
 *
 * 设计原则：
 *   - 仅 Electron 客户端模式生效（浏览器/插件模式没有 ihrBridge，直接放行）。
 *   - **只在拿到明确「无权限」信号时才踢登录**（接口 data=false / hasAuthority=false，
 *     或 errorCode=NOT_LOGGED_IN）。网络异常 / 解析不出结果 → 放行，避免误把正常用户踢下线。
 *   - 轻量节流：2s 内复用上一次在途请求，避免聚焦+选职位+创建任务连环触发时重复打接口。
 */

import { isElectronClient } from "src/util/openChannelLoginUrl";
import { redirectToLogin } from "src/util/redirectToLogin";

let _inFlight = null;
let _lastAt = 0;
const MIN_INTERVAL_MS = 2000;

/**
 * 解析 hasAuthority 接口返回，判断是否有权限。
 * @returns {boolean|null} true=有权限；false=明确无权限；null=结果不明确（不处理）
 */
function parseAuthorized(resp) {
  if (!resp) return null;
  // 接口失败：仅「未登录/令牌失效」当作需要重新登录；其它失败（网络等）不动
  if (resp.success === false) {
    return resp.errorCode === "NOT_LOGGED_IN" ? false : null;
  }
  const d = resp.data;
  if (d === true) return true;
  if (d === false) return false;
  if (d && typeof d === "object") {
    const v = d.hasAuthority ?? d.authority ?? d.hasAuth ?? d.result;
    if (v === true) return true;
    if (v === false) return false;
  }
  // success 但拿不到明确布尔 → 视为有权限（避免误踢）
  return true;
}

/**
 * 校验客户端使用权限；无权限则清登录态 + 弹登录框。
 *
 * @param {object} store  vuex store 实例
 * @param {object} [opts]
 * @param {string} [opts.reason]  诊断标签（如 'window_focus' / 'create_task' / 'select_job'）
 * @returns {Promise<boolean>}  true=有权限 / 放行；false=无权限（已触发登录）
 */
export async function ensureClientAuthority(store, opts = {}) {
  const reason = opts?.reason || "unknown";
  // 非客户端模式：没有 ihrBridge，直接放行
  if (!isElectronClient()) return true;
  const bridge = typeof window !== "undefined" ? window.api?.ihrBridge : null;
  if (!bridge || typeof bridge.hasAuthority !== "function") return true;

  // 2s 内复用在途请求，避免连环触发重复打接口
  const now = Date.now();
  if (_inFlight && now - _lastAt < MIN_INTERVAL_MS) {
    return _inFlight;
  }
  _lastAt = now;

  _inFlight = (async () => {
    let resp = null;
    try {
      resp = await bridge.hasAuthority();
    } catch (e) {
      console.warn(`[checkClientAuthority] hasAuthority 调用异常 (reason=${reason}):`, e?.message || e);
      return true; // 网络/调用异常 → 放行，不误踢
    }
    const authorized = parseAuthorized(resp);
    console.log(
      `[checkClientAuthority] hasAuthority(reason=${reason}) → authorized=${authorized}`,
      resp
    );
    if (authorized === false) {
      // 明确无权限：清登录态 + 弹登录框
      try {
        store?.commit?.("changeUserInfo", null);
      } catch (e) {
        console.warn("[checkClientAuthority] changeUserInfo(null) 失败:", e?.message || e);
      }
      redirectToLogin({ reason: `no_authority_${reason}` });
      return false;
    }
    return true;
  })();

  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
}

export default ensureClientAuthority;
