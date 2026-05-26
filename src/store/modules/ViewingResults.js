/**
 * 查看历史 task 结果的隔离 store（按 taskId 分桶）。
 *
 * 设计意图：
 *   - 运行中的 task 会持续往 `ChannelConfig.ALL.data` 写入（业务侧 BossJobInfo /
 *     ZHILIANJobInfo / JOB51JobInfo / LIEPINJobInfo 等组件 fetch + push）。
 *   - 用户点 task_completion_card 的"查看结果"时，handleViewResults 会拉历史 task 的
 *     结果数据。如果直接写 ChannelConfig.ALL.data 就跟 runtime 抢同一块 store，
 *     互相覆盖 → 数据混乱（之前看到的"查 B 显示 A"bug）。
 *
 *   本 store 提供按 taskId 隔离的存储：
 *     - state.byTaskId: { [taskId]: { byChannel: {ALL,BOSS,ZHILIAN,JOB51,LIEPIN}, fetchedAt } }
 *     - state.currentViewingByChat: { [chatId]: taskId }  —— 标记每个 chat 当前在查看哪个 task
 *
 *   渲染层 (BossJobInfo.vue 等) 改用 getter `getEffectiveChannelConfByAll`：
 *     - 当前 chat 有 viewingTask → 返回 ViewingResults.byTaskId[viewingTask].byChannel.ALL 拼装
 *     - 否则 fallback 到 ChannelConfig.ALL.data
 *
 *   runtime task 继续写 ChannelConfig（业务侧无感），viewing 切到 task B 时只动 viewing store，
 *   runtime A 完全不受影响，两边互不干扰。
 *
 * 不持久化：runtime only。客户端重启后 viewing 状态自然清空，用户重新点"查看结果"再灌一次。
 */

const initialState = () => ({
  /**
   * 按 taskId 索引的查看缓存
   * 形态：{ [taskId]: { byChannel: { ALL: [...], BOSS: [...], ZHILIAN: [...], JOB51: [...], LIEPIN: [...] }, fetchedAt: number } }
   *
   * byChannel.ALL 是聚合，按 channel 分组则是 byChannel.BOSS / ZHILIAN / JOB51 / LIEPIN
   * 跟 ChannelConfig 的结构对应，方便 getter 直接 swap。
   */
  byTaskId: {},

  /**
   * 每个 chat 当前正在查看的 taskId
   * 形态：{ [chatId]: taskId | null }
   *
   * 由 handleViewResults 设置，currentView 切回 chat 视图 / 切别的 chat 时清空。
   * null 表示"非 viewing 模式"，渲染走 ChannelConfig 默认数据。
   */
  currentViewingByChat: {}
});

const state = initialState();

const mutations = {
  /**
   * 灌入某 taskId 的 viewing 数据。
   *
   * @param {object} payload
   * @param {string} payload.taskId
   * @param {object} payload.byChannel  { ALL: [...], BOSS: [...], ZHILIAN: [...], JOB51: [...], LIEPIN: [...] }
   */
  setViewingTaskResults(state, { taskId, byChannel }) {
    if (!taskId) return;
    state.byTaskId = {
      ...state.byTaskId,
      [taskId]: { byChannel: byChannel || {}, fetchedAt: Date.now() }
    };
  },

  /**
   * 标记某 chat 当前正在查看 taskId（开启 viewing 模式）
   * @param {object} payload
   * @param {string} payload.chatId
   * @param {string} payload.taskId
   */
  setCurrentViewingTask(state, { chatId, taskId }) {
    if (!chatId || !taskId) return;
    state.currentViewingByChat = { ...state.currentViewingByChat, [chatId]: taskId };
  },

  /**
   * 清除某 chat 的 viewing 模式（切回 chat 视图 / 切别的 chat / 关闭结果页）
   * 之后渲染层 fallback 回 ChannelConfig 默认数据
   */
  clearCurrentViewingTask(state, chatId) {
    if (!chatId) return;
    if (!state.currentViewingByChat[chatId]) return;
    const next = { ...state.currentViewingByChat };
    delete next[chatId];
    state.currentViewingByChat = next;
  },

  /**
   * 清掉某 taskId 的缓存（可选，主要用于内存清理）
   */
  clearViewingTaskResults(state, taskId) {
    if (!taskId) return;
    if (!state.byTaskId[taskId]) return;
    const next = { ...state.byTaskId };
    delete next[taskId];
    state.byTaskId = next;
  }
};

const getters = {
  /**
   * 当前 chat 正在查看的 task 的完整数据条目；非 viewing 时返回 null。
   */
  getCurrentViewingBucket: (state, getters, rootState, rootGetters) => {
    const cid = rootGetters && rootGetters.getLatestChatId;
    if (!cid) return null;
    const taskId = state.currentViewingByChat[cid];
    if (!taskId) return null;
    return state.byTaskId[taskId] || null;
  },

  /**
   * 当前 chat 正在查看的 taskId（无则 null）
   */
  getCurrentViewingTaskId: (state, getters, rootState, rootGetters) => {
    const cid = rootGetters && rootGetters.getLatestChatId;
    if (!cid) return null;
    return state.currentViewingByChat[cid] || null;
  },

  /**
   * ★ 渲染层统一入口：当前应该用来渲染的 "ALL 频道" 配置对象。
   *
   * 返回形态跟 ChannelConfig.getChannelConfByAll 完全兼容（{ data, desc, ... }），
   * 让 BossJobInfo / ZHILIANJobInfo 等组件的 `allDataConfig` computed 直接 swap 过来即可。
   *
   * 决策逻辑：
   *   - viewing 模式（getCurrentViewingBucket 有值）→ 用 viewing bucket 的 byChannel.ALL，
   *     desc 等字段从 ChannelConfig 借用（结构兼容）
   *   - 否则 fallback 到 ChannelConfig.channelConf.ALL（runtime 模式）
   *
   * ⚠️ 已不推荐使用：这个 getter 依赖 `getLatestChatId` + `currentViewingByChat[cid]`
   *    两层间接寻址，任何一处 chat 切换 / clearCurrentViewingTask 都会让它 fallback 到
   *    runtime（ChannelConfig.ALL）→ 已 viewing 的数据"消失"。
   *
   *    新方案：组件直接通过 prop 拿 viewingTaskId，调 `getViewingChannelConfByTaskIdAll`
   *    （见下方），完全绕开间接寻址。本 getter 保留只为兼容尚未迁移的调用方。
   */
  getEffectiveChannelConfByAll: (state, getters, rootState) => {
    const bucket = getters.getCurrentViewingBucket;
    const baseAll = rootState?.ChannelConfig?.channelConf?.ALL || { data: [], desc: 'ALL' };
    if (bucket && Array.isArray(bucket.byChannel?.ALL)) {
      return {
        ...baseAll,
        data: bucket.byChannel.ALL,
        dataSize: bucket.byChannel.ALL.length
      };
    }
    return baseAll;
  },

  /**
   * ★★ 推荐入口：按 taskId 直接取 viewing bucket 的 "ALL 频道" 配置（不依赖任何全局 state）。
   *
   * 组件用法（注入 prop 后）：
   *   const cfg = store.getters.getViewingChannelConfByTaskIdAll(props.viewingTaskId);
   *   if (cfg) {
   *     // viewing 模式：渲染 cfg.data
   *   } else {
   *     // 退到 runtime：store.getters.getChannelConfByAll
   *   }
   *
   * 跟 getEffectiveChannelConfByAll 的区别：
   *   - 不依赖 getLatestChatId / currentViewingByChat → chat 切换 / 别的 mutation 不会"擦掉" UI
   *   - taskId 由调用方（组件 props）决定 → 多 task 并存时各自取各自的 bucket，互不影响
   *   - 返回 null 表示"按这个 taskId 没找到 bucket"，让调用方决定如何 fallback
   *
   * @returns {(taskId: string|number) => {data, desc, dataSize, ...} | null}
   */
  getViewingChannelConfByTaskIdAll: (state, _getters, rootState) => (taskId) => {
    if (!taskId) return null;
    const bucket = state.byTaskId[taskId];
    if (!bucket || !Array.isArray(bucket.byChannel?.ALL)) return null;
    const baseAll = rootState?.ChannelConfig?.channelConf?.ALL || { data: [], desc: 'ALL' };
    return {
      ...baseAll,
      data: bucket.byChannel.ALL,
      dataSize: bucket.byChannel.ALL.length
    };
  }
};

export default {
  namespaced: false, // 跟 ChannelConfig 一致，全局 getter 直接可用
  state,
  mutations,
  getters
};
