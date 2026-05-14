/**
 * BossData
 *
 * 保存 BOSS 我的职位列表（通过 Electron 隐藏窗口 `captureFromHiddenView` 静默抓回来），
 * 供主页 / AI 选择职位等场景直接读用，避免每次都重新打开 BOSS 页面。
 *
 * 触发抓取：
 *   - 主页 mount 时：`ensureBossJobList(store)` 会按节流策略决定抓不抓
 *   - BOSS 登录态从 false → true 时：bindBossLoginListener 监听后自动调一次
 *
 * 持久化：jobList / lastFetchedAt 通过 vuex-persistedstate 写到 localStorage，
 * 浏览器关掉再开，列表立即可见（用户不用等再次抓取）。
 */
export default {
  state: () => ({
    /** 上次抓回来的职位数据 zpData.data 数组（原样保留 BOSS 接口字段） */
    jobList: [],
    /** 上次抓取时的 zpData.totalSize（接口口径，可能 > jobList.length 因为只抓了一页） */
    totalSize: 0,
    /** 上次成功抓取的时间戳（ms）。0 = 从未成功过。 */
    lastFetchedAt: 0,
    /** 正在抓取中（节流/UI 状态） */
    fetching: false,
    /** 上次失败的错误码 + 信息（成功后清空） */
    lastError: null
  }),

  mutations: {
    setBossJobList(state, { data, totalSize, fetchedAt }) {
      state.jobList = Array.isArray(data) ? data : []
      state.totalSize = Number(totalSize) || state.jobList.length
      state.lastFetchedAt = fetchedAt || Date.now()
      state.lastError = null
    },
    setBossJobListFetching(state, val) {
      state.fetching = !!val
    },
    setBossJobListError(state, err) {
      state.lastError = err
        ? { code: String(err.code || 'UNKNOWN'), message: String(err.message || '') }
        : null
    },
    /** 清空（用户退出登录 / 切账号时调） */
    clearBossJobList(state) {
      state.jobList = []
      state.totalSize = 0
      state.lastFetchedAt = 0
      state.fetching = false
      state.lastError = null
    }
  },

  getters: {
    getBossJobList(state) {
      return state.jobList
    },
    getBossJobListMeta(state) {
      return {
        totalSize: state.totalSize,
        lastFetchedAt: state.lastFetchedAt,
        fetching: state.fetching,
        lastError: state.lastError
      }
    }
  }
}
