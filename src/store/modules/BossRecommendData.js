/**
 * BossRecommendData
 *
 * 缓存 BOSS 推荐牛人列表 —— **按 encryptJobId 分桶**，每个职位维护自己的一份。
 *
 * 触发抓取：
 *   - 用户在 ChatPanel 点"启动聚合搜索" + 勾选"推荐牛人" → IndexPage.handleAggregateSearch
 *     调 src/util/automation/bossRecommend.js → fetchBossRecommendList(jobId)
 *
 * 数据结构：
 *   state.byJobId = {
 *     '<encryptJobId>': {
 *       jobId,
 *       geekList: [...],      // BOSS zpData.geekList 原样
 *       totalSize,
 *       hasMore,
 *       fetchedAt,
 *       fetching,
 *       error: null | { code, message }
 *     }
 *   }
 *
 * 持久化：byJobId 整个写入 localStorage（通过 vuex-persistedstate 在 src/store/index.js 注册）。
 * 用户重开客户端 → 上次的推荐列表立即可见，不用等接口。
 */
export default {
  state: () => ({
    /** Map<encryptJobId, BossRecommendBucket> 实际用 plain object */
    byJobId: {},
    /** 当前 results 视图选中的 jobId（用于推荐 tab 展示哪一份） */
    currentJobId: null
  }),

  mutations: {
    setBossRecommendList(state, { jobId, geekList, totalSize, hasMore, fetchedAt }) {
      if (!jobId) return
      const next = { ...state.byJobId }
      next[jobId] = {
        jobId,
        geekList: Array.isArray(geekList) ? geekList : [],
        totalSize: Number(totalSize) || (Array.isArray(geekList) ? geekList.length : 0),
        hasMore: !!hasMore,
        fetchedAt: fetchedAt || Date.now(),
        fetching: false,
        error: null
      }
      state.byJobId = next
    },
    setBossRecommendFetching(state, { jobId, fetching }) {
      if (!jobId) return
      const cur = state.byJobId[jobId] || { jobId, geekList: [], totalSize: 0, hasMore: false, fetchedAt: 0 }
      state.byJobId = { ...state.byJobId, [jobId]: { ...cur, fetching: !!fetching } }
    },
    setBossRecommendError(state, { jobId, error }) {
      if (!jobId) return
      const cur = state.byJobId[jobId] || { jobId, geekList: [], totalSize: 0, hasMore: false, fetchedAt: 0 }
      state.byJobId = {
        ...state.byJobId,
        [jobId]: {
          ...cur,
          fetching: false,
          error: error
            ? { code: String(error.code || 'UNKNOWN'), message: String(error.message || '') }
            : null
        }
      }
    },
    setCurrentRecommendJobId(state, jobId) {
      state.currentJobId = jobId || null
    },
    clearBossRecommendList(state, jobId) {
      if (jobId) {
        const next = { ...state.byJobId }
        delete next[jobId]
        state.byJobId = next
      } else {
        state.byJobId = {}
        state.currentJobId = null
      }
    }
  },

  getters: {
    /** 取某个职位的推荐 bucket（不存在返回 null） */
    getBossRecommendByJobId: (state) => (jobId) => {
      return jobId ? state.byJobId[jobId] || null : null
    },
    /** 当前选中职位的推荐 bucket */
    getCurrentBossRecommend(state) {
      const id = state.currentJobId
      return id ? state.byJobId[id] || null : null
    },
    getCurrentRecommendJobId(state) {
      return state.currentJobId
    }
  }
}
