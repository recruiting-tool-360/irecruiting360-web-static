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
  const { channelKey, chatId, taskChannelId, errorMessage } = opts || {};
  if (!store || !channelKey) return;

  markChannelExpired(store, channelKey);

  // 停止当前 chat 的进行中任务（含 scoreUpdater / 解锁 BOSS tab）
  if (chatId) {
    try {
      await store.dispatch("SearchTasks/stopForChat", chatId);
    } catch (e) {
      console.warn("[channelLoginGuard] stopForChat 失败:", e?.message || e);
    }
  }

  // 通知后端：当前 channel 任务因登录失效失败（让后端推 task 状态机到 FAILED）
  if (taskChannelId) {
    try {
      const { postFinishChannel } = await import("src/api/searchTaskApi");
      await postFinishChannel(taskChannelId, {
        status: "FAILED",
        errorCode: "LOGIN_EXPIRED",
        errorMessage: errorMessage || `渠道「${CHANNEL_DISPLAY_NAME[channelKey] || channelKey}」登录失效`
      });
    } catch (e) {
      console.warn("[channelLoginGuard] postFinishChannel 上报失败:", e?.message || e);
    }
  }
}
