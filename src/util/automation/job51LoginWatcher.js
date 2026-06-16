/**
 * 51job(前程无忧) 登录态轮询监视（renderer）。
 *
 * 需求：每 10s 调一次 `https://ehirej.51job.com/user/personal/get_user_info`，
 *   成功（data.code==='200'）即登录有效 → 写 channelConf.JOB51.login。
 *   - 客户端启动时检查 51job 是否启用，启用才轮询；
 *   - 渠道设置里启用/禁用 51job → 起/停轮询。
 *
 * 跟 BOSS 不同：51job 这里就是按用户要求**主动调接口探测**（BOSS 是纯 URL 监视避免反爬）。
 * 只在 Electron 客户端有效；浏览器模式 noop（接口要 51job partition 的 header/cookie，走 ihrBridge/插件）。
 */

import * as Job51InfoManager from "src/pluginSrc/channels/Job51InfoManager";
import { pluginJob51ResultProcessor } from "src/pluginSrc/verifyes/PluginProcessor";
import {
  reportChannelOfflineIfTaskActive,
  clearChannelErrorForKey
} from "src/util/channelLoginGuard";
import { reAnalyzeFailedResumesForChannel } from "src/util/automation/reAnalyzeFailedResumes";

const POLL_MS = 10 * 1000;

let timer = null;
let inflight = false;
/** 上一次推送的登录态：null=未知，避免重复 commit（有变化才推 SPA / 更新 header） */
let lastLogin = null;
/** 取消订阅 recruitBridge 渠道状态事件（header 抓到时立刻补检一次，加快启动检测） */
let offChannelStatus = null;

/** 是否在 Electron 客户端里（插件能力由主进程 recruitBridge 提供） */
function isInElectronClient() {
  return Boolean(
    typeof window !== "undefined" &&
      window.api &&
      window.api.recruitBridge &&
      typeof window.api.recruitBridge.universalRequest === "function"
  );
}

/**
 * 51job 是否在用户「渠道设置」中**明确启用**。
 *
 * ⚠️ 严格口径：配置还没加载（list 为空）或配置里没有 JOB51 条目 → 一律视为「未启用」、不启动检测。
 *   原因：客户端启动时 initJob51LoginWatcher 可能早于渠道配置加载，旧逻辑「没配置→全启用」会导致
 *   只开了 BOSS 的情况下，启动阶段照样对 51job 发登录探测请求（get_user_info/check_admin_authority）。
 *   配置加载后由 AISearch 的 setJob51WatcherEnabled 再把真正启用的渠道拉起来。
 */
function isJob51Enabled(store) {
  const list = store.getters.getUserChannelConfig;
  if (!Array.isArray(list) || list.length === 0) return false; // 配置未加载 → 先不启动
  const entry = list.find((c) => c && c.key === "JOB51");
  return entry ? !!entry.enableConfig : false;
}

/** 更新 JOB51 登录态：有变化才 commit（分发到 SPA / 更新 header） */
function setLoginState(store, next) {
  if (next === lastLogin) return;
  const prev = lastLogin;
  lastLogin = next;
  console.log(`[job51LoginWatcher] loginState → ${next}`);
  store.commit("changeChannelConfLogin", { key: "JOB51", value: next });
  if (next) {
    store.commit("changeChannelConfDisable", { key: "JOB51", value: false });
    // 恢复登录 → 若 banner 是本渠道引起的，清掉
    clearChannelErrorForKey(store, "JOB51");
    // 失效→重新登录成功 → 重新分析之前被标「AI 分析异常」的简历
    if (prev === false) void reAnalyzeFailedResumesForChannel(store, "JOB51");
  } else {
    // 掉线 → 有进行中/正在分析的任务才弹顶部 banner（提示账号异常）
    reportChannelOfflineIfTaskActive(store, "JOB51");
  }
}

/**
 * 跑一次检测：用老方法 `job51UserStatus`（check_admin_authority + property/签名校验，
 * 跟 AISearch.checkChannelLoginStatus 同口径）判定登录态。
 * get_user_info 虽然 200 但响应结构跟 pluginJob51ResultProcessor 期望的不一致，判不出登录态，故改回老方法。
 */
async function checkOnce(store) {
  if (inflight) return;
  inflight = true;
  try {
    const resp = await Job51InfoManager.job51UserStatus();
    const ok = !!(resp && pluginJob51ResultProcessor(resp));
    setLoginState(store, ok);
  } catch (e) {
    console.warn("[job51LoginWatcher] 登录态检测失败 → 视为未登录:", e?.message || e);
    setLoginState(store, false);
  } finally {
    inflight = false;
  }
}

/**
 * 启动 51job 登录态轮询（10s/次）。幂等。
 * @param {import('vuex').Store} store
 */
export function startJob51LoginWatcher(store) {
  if (!isInElectronClient()) return;
  // 标记 JOB51 登录态由轮询监视接管：AISearch 的 checkAuth 轮询不再覆盖 JOB51。
  try {
    store.commit("setJob51LoginWatcherActive", true);
  } catch (e) {
    console.warn("[job51LoginWatcher] setJob51LoginWatcherActive(true) failed:", e?.message || e);
  }
  // 开启时立刻先检测一次（在执行轮询之前），不等第一个 10s tick
  void checkOnce(store);
  // ★ 订阅 recruitBridge 渠道状态事件：51job header（Accesstoken/Guid…）抓到后立刻补检一次，
  //   不用等 10s tick —— 启动时 header 要等 hydrate 窗口加载几秒才抓到，否则首次检测因没 header 失败。
  if (!offChannelStatus && window?.api?.recruitBridge?.onChannelStatusChanged) {
    offChannelStatus = window.api.recruitBridge.onChannelStatusChanged((data) => {
      if (data && data.channel === "JOB51") void checkOnce(store);
    });
  }
  if (timer) return; // 定时器已在跑，不重复起
  console.log("[job51LoginWatcher] start (10s poll get_user_info)");
  timer = setInterval(() => void checkOnce(store), POLL_MS);
}

/** 停止 51job 登录态轮询。 */
export function stopJob51LoginWatcher(store) {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[job51LoginWatcher] stop");
  }
  if (offChannelStatus) {
    try {
      offChannelStatus();
    } catch {
      /* ignore */
    }
    offChannelStatus = null;
  }
  lastLogin = null;
  try {
    store?.commit?.("setJob51LoginWatcherActive", false);
  } catch {
    /* ignore */
  }
}

/**
 * 运行时启用/禁用 51job 登录监视（渠道设置保存时调）。
 * @param {import('vuex').Store} store
 * @param {boolean} enabled
 */
export function setJob51WatcherEnabled(store, enabled) {
  if (enabled) startJob51LoginWatcher(store);
  else stopJob51LoginWatcher(store);
}

/**
 * 客户端启动入口：51job 启用才起轮询。返回清理函数（组件 unmount 调）。
 * @param {import('vuex').Store} store
 * @returns {() => void}
 */
export function initJob51LoginWatcher(store) {
  if (isInElectronClient() && isJob51Enabled(store)) {
    startJob51LoginWatcher(store);
  }
  return () => stopJob51LoginWatcher(store);
}

export default { startJob51LoginWatcher, stopJob51LoginWatcher, setJob51WatcherEnabled, initJob51LoginWatcher };
