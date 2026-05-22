/**
 * redirectToLogin
 *
 * 统一封装"会话过期 / 用户信息异常 → 跳登录页"行为：
 *   - **浏览器模式**：照旧 `window.location.href = '/login'`（行为不变）
 *   - **Electron 客户端模式**：拦截跳转，改成打开 `IhrAuthModal` 弹框
 *     （store mutation `setIhrAuthModalVisible(true)`，IhrAuthModal 监听该 state 显示）
 *     用户在弹框里点"登录账号"会调 `window.api.ihrBridge.openManageLoginTab`
 *     用系统浏览器去 i 人事 manage 完成登录，登录完回客户端继续业务。
 *
 * 客户端里强制跳 `/login` 没意义：客户端就一个壳层 SPA，跳过去也是同一个 web app，
 * 而且会把用户当前的 BOSS / 推荐 tab 等会话上下文一起冲掉。统一走弹框流程更合适。
 *
 * 调用位置：
 *   - SseManager.logout / userInfoInit 异常分支
 *   - Header.logout / Logout.vue（用户主动退出）
 *   - 任何后续新增的"401 / 会话过期"拦截点
 */

import { isElectronClient } from "src/util/openChannelLoginUrl";

/**
 * 客户端模式打开 i 人事登录弹框；浏览器模式跳登录页。
 *
 * @param {Object} [opts]
 * @param {string} [opts.reason]        诊断标签，仅 log（如 'sse_logout' / 'user_info_failed'）
 * @param {boolean} [opts.forceLocation]  即使在客户端也强制走 `/login` 跳转
 *                                         （留作"完全退出客户端账号"的极端口子，默认 false）
 */
export function redirectToLogin(opts = {}) {
  const reason = opts?.reason || "unknown";
  const forceLocation = !!opts?.forceLocation;

  if (!forceLocation && isElectronClient()) {
    // 客户端模式：异步加载 store，避免顶层循环依赖
    void import("src/store")
      .then((m) => {
        const store = m.default || m;
        if (store && typeof store.commit === "function") {
          store.commit("setIhrAuthModalVisible", true);
          console.log(
            `[redirectToLogin] 客户端模式，拦截 /login 跳转 → 打开 IhrAuthModal (reason=${reason})`
          );
        } else {
          console.warn(
            `[redirectToLogin] store 不可用，降级跳 /login (reason=${reason})`
          );
          window.location.href = "/login";
        }
      })
      .catch((e) => {
        console.warn(
          `[redirectToLogin] 加载 store 异常，降级跳 /login (reason=${reason}):`,
          e?.message || e
        );
        window.location.href = "/login";
      });
    return;
  }

  // 浏览器模式（或 forceLocation）→ 直接跳
  console.log(
    `[redirectToLogin] 浏览器模式 / forceLocation=${forceLocation}，跳 /login (reason=${reason})`
  );
  window.location.href = "/login";
}

export default redirectToLogin;
