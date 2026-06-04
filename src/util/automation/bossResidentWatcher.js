/**
 * BOSS 常驻登录态监视（renderer 侧接线）
 *
 * 与 main 进程 `electron/src/main/bossLoginWatcher.ts` 配套：
 *   - main 开一个常驻隐藏窗口加载 BOSS「我的职位列表」页，用导航 URL 判定登录态，
 *     登录时静默抓职位列表数据。
 *   - 本模块负责：在客户端模式 + BOSS 渠道启用时启动它，并把 main 推回来的
 *     登录态 / 职位列表事件落到 Vuex（channelConf.BOSS.login / BossData），
 *     登录从「失效→已登录」时弹一个成功通知。
 *
 * 只在 Electron 客户端有效；浏览器模式直接 noop。
 */

import { notifySuccess } from "src/util/notify";
import {
  reportChannelOfflineIfTaskActive,
  clearChannelErrorForKey
} from "src/util/channelLoginGuard";
import { reAnalyzeFailedResumesForChannel } from "src/util/automation/reAnalyzeFailedResumes";

/** 是否在 Electron 客户端里（preload 注入了 window.api.bossWatcher） */
function hasBossWatcherBridge() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api &&
      window.api.bossWatcher &&
      typeof window.api.bossWatcher.start === "function"
  );
}

/** BOSS 是否在用户「渠道设置」中启用（与 bossJobListAutoFetch 同口径） */
function isBossEnabled(store) {
  const list = store.getters.getUserChannelConfig;
  if (!Array.isArray(list) || list.length === 0) return true; // 没配置 → 全启用
  const entry = list.find((c) => c && c.key === "BOSS");
  return entry ? !!entry.enableConfig : true;
}

/** 当前 BOSS 登录态（channelConf.BOSS.login） */
function isBossLoggedIn(store) {
  const conf = store.getters.getChannelConf;
  return !!(conf && conf.BOSS && conf.BOSS.login === true);
}

/**
 * 启动 BOSS 登录态监视（renderer 接线）。
 *
 * 始终注册 onLoginStatus 监听（即使当前 BOSS 未启用），这样运行时再启用 BOSS（setBossWatcherEnabled）
 * 也能立刻收到登录态事件；仅当 BOSS 已启用时才真正让 main 起监视单例 tab。
 *
 * @param {import('vuex').Store} store
 * @returns {(() => void)} 清理函数（组件 unmount 时调用）
 */
export function startBossResidentWatcher(store) {
  if (!hasBossWatcherBridge()) {
    return () => {};
  }

  // 记录上一次登录态，用于「失效→已登录」只弹一次通知
  let lastLogin = isBossLoggedIn(store);
  // 首个事件视为「初始同步」，不弹通知（避免启动时本来就已登录也弹"登录成功"）
  let initialized = false;

  const offLogin = window.api.bossWatcher.onLoginStatus((data) => {
    const login = !!(data && data.login);
    // 同步到 channelConf（其它逻辑如 bindBossLoginListener / 渠道展示都读这个）
    try {
      store.commit("changeChannelConfLogin", { key: "BOSS", value: login });
    } catch (e) {
      console.warn("[bossResidentWatcher] commit changeChannelConfLogin failed:", e?.message || e);
    }
    // 失效 → 已登录：发通知（首个事件是初始同步，不弹，避免启动时误报）
    if (initialized && login && !lastLogin) {
      // notifySuccess('BOSS直聘 登录成功，正在更新职位列表')
    }
    // 掉线 → 有进行中/正在分析的任务才弹顶部 banner；恢复 → 清掉本渠道引起的 banner
    if (login) {
      clearChannelErrorForKey(store, "BOSS");
      // 失效→重新登录成功 → 重新分析之前被标「AI 分析异常」的简历
      if (initialized && lastLogin === false) {
        void reAnalyzeFailedResumesForChannel(store, "BOSS");
      }
    } else if (initialized) {
      reportChannelOfflineIfTaskActive(store, "BOSS");
    }
    lastLogin = login;
    initialized = true;
    console.log(`[bossResidentWatcher] loginStatus → ${login} (reason=${data?.reason})`);
  });

  // BOSS 已启用 → 启动 main 监视单例 tab
  if (isBossEnabled(store)) {
    setBossWatcherEnabled(store, true);
  }

  return () => {
    try {
      offLogin && offLogin();
    } catch {
      /* ignore */
    }
    try {
      store.commit("setBossLoginWatcherActive", false);
    } catch {
      /* ignore */
    }
    void window.api.bossWatcher.stop?.().catch(() => {});
  };
}

/**
 * 运行时启用/禁用 BOSS 登录监视（渠道设置保存时调）。
 *   - 启用：让 main 起 BOSS 单例监视 tab；置 bossLoginWatcherActive=true（AISearch checkAuth 不再覆盖）。
 *   - 禁用：让 main 销毁 BOSS 单例 tab；置 false。
 *
 * @param {import('vuex').Store} store
 * @param {boolean} enabled
 */
export function setBossWatcherEnabled(store, enabled) {
  if (!hasBossWatcherBridge()) return;
  try {
    store.commit("setBossLoginWatcherActive", !!enabled);
  } catch (e) {
    console.warn("[bossResidentWatcher] setBossLoginWatcherActive failed:", e?.message || e);
  }
  if (enabled) {
    void window.api.bossWatcher.start().catch((e) => {
      console.warn("[bossResidentWatcher] start failed:", e?.message || e);
    });
  } else {
    void window.api.bossWatcher.stop?.().catch((e) => {
      console.warn("[bossResidentWatcher] stop failed:", e?.message || e);
    });
  }
}

export default { startBossResidentWatcher, setBossWatcherEnabled };
