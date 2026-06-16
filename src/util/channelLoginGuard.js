/**
 * 渠道登录态统一封装 —— 给"任务执行前 recheck"和"运行时检测登录失效"共用一份。
 *
 * 业务背景：
 *   - 启动任务前：必须确保涉及的渠道 (BOSS / ZHILIAN / JOB51) 当前都登录有效，
 *     避免跑到一半才发现 cookie 过期，浪费用户时间 + 后端 task 状态机紊乱
 *   - 运行时检测：bossRecommend / channelSearchList 返回 LOGIN_EXPIRED 时，
 *     必须做三件事：
 *       1. dispatch SearchTasks/stopForChat 停掉当前 chat 的任务
 *       2. markChannelExpired(key) 写 store.channelError → 顶部红 banner + 红按钮
 *       3. postFinishChannel(taskChannelId, { errorCode: 'LOGIN_EXPIRED' }) 通知后端
 *
 * 详细 UI 设计：1:1 还原 ihraisaas/.../ClientStatusBanner.tsx 红色错误态。
 * 详细 vuex 数据：src/store/modules/ChannelConfig.js channelError state + mutations。
 */
import * as BossJobInfoManager from "src/pluginSrc/channels/BossJobInfoManager";
import * as ZhiLianJobInfoManager from "src/pluginSrc/channels/ZhiLianJobInfoManager";
import * as Job51InfoManager from "src/pluginSrc/channels/Job51InfoManager";
import * as LIEPINJobInfoManager from "src/pluginSrc/channels/LIEPINJobInfoManager";
import {
  pluginBossResultProcessor,
  pluginJob51ResultProcessor,
  pluginZhiLianResultProcessor,
  pluginLIEPINResultProcessor
} from "src/pluginSrc/verifyes/PluginProcessor";

/**
 * 渠道 storeKey 与"展示名"（ClientHeader 横幅 + channelConf.name 对齐）。
 * 注意大小写：channelConf 用 storeKey 索引，展示名是 `channelConf[key].name`。
 */
export const CHANNEL_DISPLAY_NAME = {
  BOSS: "boss直聘",
  ZHILIAN: "智联招聘",
  JOB51: "前程无忧",
  LIEPIN: "猎聘"
};

/**
 * 各渠道的"探针 + 业务结果校验"映射，跟 AISearch.checkChannelLoginStatus 一致。
 */
const CHECKERS = {
  BOSS: async () => {
    const res = await BossJobInfoManager.bossUserStatus();
    return !!(res && pluginBossResultProcessor(res));
  },
  ZHILIAN: async () => {
    const res = await ZhiLianJobInfoManager.zhiLianUserStatus();
    return !!(res && pluginZhiLianResultProcessor(res));
  },
  JOB51: async () => {
    const res = await Job51InfoManager.job51UserStatus();
    return !!(res && pluginJob51ResultProcessor(res));
  },
  LIEPIN: async () => {
    const res = await LIEPINJobInfoManager.liePinUserStatus();
    return !!(res && pluginLIEPINResultProcessor(res));
  }
};

/**
 * 单渠道实时 recheck，返回 true=已登录 / false=失败。
 * 同时把结果写回 store.channelConf[key].login，让 LoginRequiredPanel / ChannelHeader 同步反应。
 *
 * @param {object} store vuex store
 * @param {'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'} key
 */
export async function checkChannelLogin(store, key) {
  const checker = CHECKERS[key];
  if (!checker) return false;
  try {
    const ok = await checker();
    if (store) {
      store.commit("changeChannelConfLogin", { key, value: !!ok });
    }
    return !!ok;
  } catch (e) {
    console.warn(`[channelLoginGuard] ${key} 探针调用失败:`, e?.message || e);
    if (store) {
      store.commit("changeChannelConfLogin", { key, value: false });
    }
    return false;
  }
}

/**
 * 批量 recheck 多个渠道，并行执行。
 *
 * @param {object} store
 * @param {Array<'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'>} keys
 * @returns {Promise<{ allLoggedIn: boolean, failedKeys: string[], failedNames: string[] }>}
 */
export async function checkChannelLogins(store, keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return { allLoggedIn: true, failedKeys: [], failedNames: [] };
  }
  const results = await Promise.all(
    keys.map(async (k) => ({ key: k, ok: await checkChannelLogin(store, k) }))
  );
  const failed = results.filter((r) => !r.ok);
  return {
    allLoggedIn: failed.length === 0,
    failedKeys: failed.map((r) => r.key),
    failedNames: failed.map((r) => CHANNEL_DISPLAY_NAME[r.key] || r.key)
  };
}

/**
 * 标记一个渠道登录失效 —— 全局 banner + 渠道按钮变红 + 渠道 conf.login=false。
 *
 * @param {object} store
 * @param {'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'|string} keyOrName key 或展示名
 */
export function markChannelExpired(store, keyOrName) {
  if (!store) return;
  const name = CHANNEL_DISPLAY_NAME[keyOrName] || keyOrName;
  store.commit("setChannelError", name);
}

/**
 * 清除全局 channelError（"恢复任务"按钮 或 重新登录成功后）。
 */
export function clearChannelExpired(store) {
  if (!store) return;
  store.commit("clearChannelError");
}

/**
 * 渠道是否在用户「渠道设置」里启用。
 * 没配置（list 为空）→ 默认启用；有配置但没该渠道条目 → 视为未启用。
 * 用于：禁用的渠道不应弹「账号异常」banner（典型：只开了前程无忧，却提示 boss 账号异常）。
 */
function isChannelEnabledInConfig(store, channelKey) {
  try {
    const list = store?.getters?.getUserChannelConfig;
    if (!Array.isArray(list) || list.length === 0) return true;
    const e = list.find((c) => c && c.key === channelKey);
    return e ? !!e.enableConfig : false;
  } catch {
    return true;
  }
}

/**
 * 当前是否有"进行中 / 正在分析"的任务（决定渠道掉线要不要弹顶部 banner）。
 */
export function isAnyTaskActive(store) {
  if (!store) return false;
  try {
    if (store.state?.SearchTasks?.runningTaskId) return true;
    if (store.getters.getAiAnalyzingActive === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 渠道登录监视检测到某渠道掉线时调：**仅当有进行中/正在分析的任务时**才弹顶部 banner
 * （markChannelExpired）。没有任务时只更新渠道按钮登录态即可，不打扰用户。
 *
 * @param {object} store
 * @param {'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'} channelKey
 */
export function reportChannelOfflineIfTaskActive(store, channelKey) {
  if (!store || !channelKey) return;
  // ★ 渠道已禁用 → 不弹它的「账号异常」banner（如只开了前程无忧却提示 boss 账号异常）。
  if (!isChannelEnabledInConfig(store, channelKey)) return;
  if (!isAnyTaskActive(store)) return;
  markChannelExpired(store, channelKey);
}

/**
 * 渠道恢复登录时调：如果顶部 banner 正是这个渠道引起的，就清掉。
 */
export function clearChannelErrorForKey(store, channelKey) {
  if (!store || !channelKey) return;
  const name = CHANNEL_DISPLAY_NAME[channelKey] || channelKey;
  try {
    if (store.getters.getChannelError === name) store.commit("clearChannelError");
  } catch {
    /* ignore */
  }
}

/**
 * 渠道搜索接口**调用前**：实时探针检查该渠道登录态。
 *   - 已登录 → 返回 true，调用方继续跑搜索
 *   - 未登录 → 弹顶部 banner + 停当前任务（不 finish，等重新登录后 current 轮询重新触发），返回 false
 *
 * @param {object} store
 * @param {'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'} channelKey
 * @param {string} chatId 当前 chat（停任务用）
 * @returns {Promise<boolean>}
 */
export async function ensureChannelLoginBeforeSearch(store, channelKey, chatId) {
  if (!store || !channelKey) return true;
  const ok = await checkChannelLogin(store, channelKey);
  if (!ok) {
    console.warn(`[channelLoginGuard] ${channelKey} 搜索前检查未登录 → 弹 banner + 停任务`);
    await handleChannelLoginExpired(store, { channelKey, chatId });
  }
  return ok;
}

/**
 * 渠道搜索接口**调用失败**（含非网络的业务异常 / 返回空）后统一处理：
 *   - **先复核登录态**，只有「确为未登录」才弹顶部「渠道异常 / 恢复任务」banner + 停当前任务。
 *   - 仍登录（如 BOSS「发布职位后才能搜索牛人」这类业务异常 / 纯网络抖动 / 返回空）→
 *     **不弹 banner、不停任务**：header 异常态只反映登录状态，不被其它业务异常污染。
 *
 * ⚠️ 早期版本会在复核前先 `reportChannelOfflineIfTaskActive` 弹 banner，导致「发布职位后才能
 *    搜索牛人」等业务错误也弹出顶部「恢复任务」红条，误导用户以为登录异常。现已改为仅在
 *    确认未登录时才弹。
 *
 * @param {object} store
 * @param {'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'} channelKey
 * @param {string} chatId
 * @returns {Promise<boolean>} 复核后的登录态
 */
export async function handleChannelSearchFailure(store, channelKey, chatId) {
  if (!store || !channelKey) return true;
  const ok = await checkChannelLogin(store, channelKey);
  if (!ok) {
    console.warn(`[channelLoginGuard] ${channelKey} 搜索失败且复核未登录 → 弹 banner + 停任务`);
    // handleChannelLoginExpired 内部会 markChannelExpired（弹 banner）+ 停任务
    await handleChannelLoginExpired(store, { channelKey, chatId });
  } else {
    console.log(
      `[channelLoginGuard] ${channelKey} 搜索失败但仍登录（业务异常/网络抖动，非登录问题）→ 不弹 header banner`
    );
  }
  return ok;
}

/**
 * 综合处理"任务运行中检测到登录失效"事件。
 *
 * 三件事：
 *   1. markChannelExpired —— 顶部红 banner + 渠道按钮变红
 *   2. dispatch SearchTasks/stopForChat —— 停掉当前 chat 的进行中任务
 *   3. （可选）postFinishChannel 上报后端 LOGIN_EXPIRED —— 让后端推进 task 状态机
 *
 * @param {object} store
 * @param {object} opts
 * @param {string} opts.channelKey         'BOSS' / 'ZHILIAN' / 'JOB51' / 'LIEPIN'
 * @param {string} opts.chatId             当前 chat id（停止任务用）
 * @param {string|number} [opts.taskChannelId]  当前任务的 channelId，传了会调 postFinishChannel
 * @param {string} [opts.errorMessage]     给后端的错误描述
 */
export async function handleChannelLoginExpired(store, opts) {
  const { channelKey, chatId, taskChannelId } = opts || {};
  if (!store || !channelKey) return;
  // 渠道已禁用 → 不应因它弹 banner / 停任务（它本来就不参与搜索）
  if (!isChannelEnabledInConfig(store, channelKey)) return;

  markChannelExpired(store, channelKey);

  // ★ 任务进行中登录失效：**不立即 finish channel**。先把 channel 登记为「待 finish」，
  //   等用户重新登录 + AI 分析重新跑完后，再由 reAnalyzeFailedResumes → finishPendingChannelsForChannel
  //   调 postFinishChannel(COMPLETED)。避免把 channel 提前标 FAILED 丢掉数据。
  if (taskChannelId) {
    store.commit("SearchTasks/addPendingFinishChannel", { taskChannelId, channelKey, chatId });
  }

  // 暂停当前 chat 的进行中任务（停 scoreUpdater / 清队列 / 标未评分简历 -2 供重新分析 / 解锁 BOSS tab），
  // 但 **skipFinish**：不 finish channel（留到重新登录+AI跑完再 finish）。
  if (chatId) {
    try {
      await store.dispatch("SearchTasks/stopForChat", { chatId, skipFinish: true });
    } catch (e) {
      console.warn("[channelLoginGuard] stopForChat(skipFinish) 失败:", e?.message || e);
    }
  }
}
