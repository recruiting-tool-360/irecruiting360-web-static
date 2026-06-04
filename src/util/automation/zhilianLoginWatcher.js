/**
 * 智联招聘 登录态轮询监视（renderer）—— 跟 51job 同款实现。
 *
 * 需求：每 10s 调一次 `ZhiLianJobInfoManager.zhiLianUserStatus()`（跟 AISearch.checkChannelLoginStatus
 *   同口径），成功即登录有效 → 写 channelConf.ZHILIAN.login（有变化才推，更新 header）。
 *   - 客户端启动时检查智联是否启用，启用才轮询；
 *   - 渠道设置里启用/禁用智联 → 起/停轮询。
 *
 * 只在 Electron 客户端有效；浏览器模式 noop（接口要智联 partition 的 header/cookie，走 ihrBridge/插件）。
 */

import * as ZhiLianJobInfoManager from "src/pluginSrc/channels/ZhiLianJobInfoManager";
import { pluginZhiLianResultProcessor } from "src/pluginSrc/verifyes/PluginProcessor";
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

/** 智联是否在用户「渠道设置」中启用（与 bossResidentWatcher / ClientHeader 同口径） */
function isZhilianEnabled(store) {
  const list = store.getters.getUserChannelConfig;
  if (!Array.isArray(list) || list.length === 0) return true; // 没配置 → 全启用
  const entry = list.find((c) => c && c.key === "ZHILIAN");
  return entry ? !!entry.enableConfig : true;
}

/** 更新 ZHILIAN 登录态：有变化才 commit（分发到 SPA / 更新 header） */
function setLoginState(store, next) {
  if (next === lastLogin) return;
  const prev = lastLogin;
  lastLogin = next;
  console.log(`[zhilianLoginWatcher] loginState → ${next}`);
  store.commit("changeChannelConfLogin", { key: "ZHILIAN", value: next });
  if (next) {
    store.commit("changeChannelConfDisable", { key: "ZHILIAN", value: false });
    clearChannelErrorForKey(store, "ZHILIAN");
    if (prev === false) void reAnalyzeFailedResumesForChannel(store, "ZHILIAN");
  } else {
    reportChannelOfflineIfTaskActive(store, "ZHILIAN");
  }
}

/** 跑一次检测：用 `zhiLianUserStatus` + `pluginZhiLianResultProcessor` 判定登录态 */
async function checkOnce(store) {
  if (inflight) return;
  inflight = true;
  try {
    const resp = await ZhiLianJobInfoManager.zhiLianUserStatus();
    const ok = !!(resp && pluginZhiLianResultProcessor(resp));
    setLoginState(store, ok);
  } catch (e) {
    console.warn("[zhilianLoginWatcher] 登录态检测失败 → 视为未登录:", e?.message || e);
    setLoginState(store, false);
  } finally {
    inflight = false;
  }
}

/**
 * 启动智联登录态轮询（10s/次）。幂等。
 * @param {import('vuex').Store} store
 */
export function startZhilianLoginWatcher(store) {
  if (!isInElectronClient()) return;
  // 标记 ZHILIAN 登录态由轮询监视接管：AISearch 的 checkAuth 轮询不再覆盖 ZHILIAN。
  try {
    store.commit("setZhilianLoginWatcherActive", true);
  } catch (e) {
    console.warn("[zhilianLoginWatcher] setZhilianLoginWatcherActive(true) failed:", e?.message || e);
  }
  // 开启时立刻先检测一次（在执行轮询之前），不等第一个 10s tick
  void checkOnce(store);
  // ★ 订阅 recruitBridge 渠道状态事件：智联 header 抓到后立刻补检一次，不用等 10s tick
  if (!offChannelStatus && window?.api?.recruitBridge?.onChannelStatusChanged) {
    offChannelStatus = window.api.recruitBridge.onChannelStatusChanged((data) => {
      if (data && data.channel === "ZHILIAN") void checkOnce(store);
    });
  }
  if (timer) return; // 定时器已在跑，不重复起
  console.log("[zhilianLoginWatcher] start (10s poll zhiLianUserStatus)");
  timer = setInterval(() => void checkOnce(store), POLL_MS);
}

/** 停止智联登录态轮询。 */
export function stopZhilianLoginWatcher(store) {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[zhilianLoginWatcher] stop");
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
    store?.commit?.("setZhilianLoginWatcherActive", false);
  } catch {
    /* ignore */
  }
}

/**
 * 运行时启用/禁用智联登录监视（渠道设置保存时调）。
 * @param {import('vuex').Store} store
 * @param {boolean} enabled
 */
export function setZhilianWatcherEnabled(store, enabled) {
  if (enabled) startZhilianLoginWatcher(store);
  else stopZhilianLoginWatcher(store);
}

/**
 * 客户端启动入口：智联启用才起轮询。返回清理函数（组件 unmount 调）。
 * @param {import('vuex').Store} store
 * @returns {() => void}
 */
export function initZhilianLoginWatcher(store) {
  if (isInElectronClient() && isZhilianEnabled(store)) {
    startZhilianLoginWatcher(store);
  }
  return () => stopZhilianLoginWatcher(store);
}

export default {
  startZhilianLoginWatcher,
  stopZhilianLoginWatcher,
  setZhilianWatcherEnabled,
  initZhilianLoginWatcher
};
