/**
 * 查看任务结果时的元信息判定。
 *
 * 搜索结果列表（5 个 channel + ALL 聚合）支持两种来源：
 *   - runtime（viewingTaskId 为空）：读 ChannelConfig.ALL，刚跑完的当前搜索
 *   - viewing（viewingTaskId 有值）：读 ViewingResults bucket，用户点某张完成卡"查看结果"
 *
 * "加载更多"只对**最新（刚结束）任务**有意义（loadMore 走当前搜索条件翻下一页）；
 * 历史任务结果是静态快照，不允许加载更多。本工具判定 viewingTaskId 是不是历史任务。
 */

/**
 * 当前查看的是否是「历史任务结果」（非当前 chat 的最新任务）。
 *
 * @param {object} store         vuex store
 * @param {string|number|null} viewingTaskId  channel 组件的 viewingTaskId prop
 * @returns {boolean} true=历史任务视图（应隐藏加载更多）；false=runtime / 最新任务（可加载更多）
 */
export function isHistoryTaskView(store, viewingTaskId) {
  if (!store || !viewingTaskId) return false; // 无 viewingTaskId = runtime 当前搜索
  const chatId = store.getters.getLatestChatId;
  const getter = store.getters["SearchTasks/getLatestTaskByChat"];
  const latest = typeof getter === "function" ? getter(chatId) : null;
  // 最新任务 id 跟 viewingTaskId 一致 → 不是历史；否则是历史
  return !(latest?.taskId && String(latest.taskId) === String(viewingTaskId));
}
