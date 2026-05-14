/**
 * PinnedJobs
 *
 * 左侧职位列表的置顶状态，按 chat.id 索引。持久化到 localStorage（见 store/index.js paths）。
 * 跟 ihraisaas/src/components/AIAssistant/JobList.tsx 的 isPinned 字段语义一致：
 *   - 置顶项排在列表最前
 *   - 列表项左侧 Pin 按钮可切换
 */
export default {
  state: () => ({
    pinnedJobIds: []
  }),

  mutations: {
    /** 切换某个职位的置顶状态（加/移） */
    togglePinJob(state, id) {
      if (!id) return;
      const idx = state.pinnedJobIds.indexOf(id);
      if (idx === -1) {
        state.pinnedJobIds.push(id);
      } else {
        state.pinnedJobIds.splice(idx, 1);
      }
    },
    /** 全部清空（暂未用到，留着备用） */
    clearPinnedJobs(state) {
      state.pinnedJobIds = [];
    }
  },

  getters: {
    getPinnedJobIds: (state) => state.pinnedJobIds,
    isJobPinned: (state) => (id) => state.pinnedJobIds.includes(id)
  }
};
