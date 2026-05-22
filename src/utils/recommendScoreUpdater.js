/**
 * 推荐通道 AI 评分轮询器（**完全独立**于 src/utils/scoreAutoUpdater.js）
 *
 * 为什么独立：
 *   `scoreAutoUpdater` 是单例，搜索通道 (JobInfo.vue) 在用它做 polling。
 *   如果推荐通道也调它的 start()，会重置搜索的 pendingResumeIds + 覆盖
 *   updateCallback → 搜索的分数轮询直接断了，AI 评分查询返回空。
 *
 *   推荐用独立实例 + 独立 setInterval + 独立 pendingResumeIds，
 *   跟搜索的 scoreAutoUpdater **零干扰**。
 *
 * 跟 scoreAutoUpdater 的关键差异：
 *   - **不** push AiScoringState 给 store（避免跟搜索的 AI 活跃信号冲突）。
 *     推荐通道的"卡片进度"由 SearchTasks/recommendClientPhase 单独驱动。
 *   - **不** 走 queryScoreList 老接口降级（推荐通道只走任务级 queryTaskScoreList）。
 *   - **不** 实现 onWaitingCallback（推荐的 detail 是一次性发完的，不需要重发逻辑）。
 *
 * 使用方式（IndexPage.doFetchRecommend）：
 *   import recommendScoreUpdater from 'src/utils/recommendScoreUpdater';
 *   recommendScoreUpdater.start({
 *     resumeBlindIds: ['xxx', 'yyy', ...],
 *     onUpdate: (items) => { ... patchBossRecommendGeek ... },
 *     onAllDone: () => console.log('推荐评分全部完成'),
 *     intervalMs: 8000,
 *     maxRetries: 50
 *   });
 */

/**
 * 调 /resume/queryTaskScoreList 拿任务级评分。
 *
 * 推荐通道的 taskResumeId 在 /results 返回后已经写入 store.SearchTasks.taskResumeIdMap，
 * 这里按 resumeBlindId 反查 taskResumeId → 调任务级查分接口。
 *
 * @param {string[]} blindIds
 * @returns {Promise<Array<{ taskResumeId, resumeBlindId, score, scoreStatus, ... }> | null>}
 */
async function fetchTaskScores(blindIds) {
  let store = null
  let taskApi = null
  try {
    const [storeMod, apiMod] = await Promise.all([
      import('src/store'),
      import('src/api/searchTaskApi')
    ])
    store = storeMod.default || storeMod
    taskApi = apiMod.default || apiMod
  } catch (e) {
    console.warn('[recommendScoreUpdater] lazy import 失败:', e?.message || e)
    return null
  }

  // blindId → taskResumeId 反查
  const taskResumeIds = []
  if (store && typeof store.getters?.['SearchTasks/getTaskResumeIdMap'] === 'function') {
    const map = store.getters['SearchTasks/getTaskResumeIdMap']() || {}
    for (const blindId of blindIds) {
      const t = map[String(blindId)]
      if (t) taskResumeIds.push(t)
    }
  }

  if (taskResumeIds.length === 0) {
    console.warn(
      `[recommendScoreUpdater] 没拿到 taskResumeIds（taskResumeIdMap 为空 / 映射没建？） blindIds=${blindIds.length}`
    )
    return null
  }

  if (!taskApi?.postTaskScoreList) {
    console.warn('[recommendScoreUpdater] taskApi.postTaskScoreList 不可用')
    return null
  }

  try {
    console.log(
      `[recommendScoreUpdater] queryTaskScoreList taskResumeIds=${taskResumeIds.length}/${blindIds.length}`
    )
    const resp = await taskApi.postTaskScoreList(taskResumeIds)
    const data = resp?.data
    if (Array.isArray(data)) return data
    return null
  } catch (e) {
    console.warn('[recommendScoreUpdater] postTaskScoreList 异常:', e?.message || e)
    return null
  }
}

/**
 * 推荐通道独立的评分轮询器
 */
class RecommendScoreUpdater {
  constructor() {
    this.timer = null
    this.intervalMs = 8000
    this.maxRetries = 50
    this.retryCount = 0
    this.noProgressCount = 0
    this.maxNoProgress = 15
    /** 待查询的 resumeBlindId 集合（终态后从中删掉） */
    this.pendingBlindIds = new Set()
    /** 超 maxRetries 后忽略的 ID（终态判定为 -2） */
    this.ignoredBlindIds = new Set()
    /** 拿到分数批次时回调：onUpdate(items, ctx) */
    this.onUpdate = null
    /** 所有 pending 清空后回调一次：onAllDone() */
    this.onAllDone = null
    /** 调试标签 */
    this.tag = ''
  }

  /**
   * 启动轮询。
   *
   * @param {Object} opts
   * @param {string[]} opts.resumeBlindIds  本批要查分的 resumeBlindIds
   * @param {Function} opts.onUpdate        (items, { pendingLeft }) => void
   *        items 是后端响应的整个 data 数组（含 WAITING / SUCCESS / FAILED ...）
   * @param {Function} [opts.onAllDone]    所有 pending 清空时调用一次
   * @param {number} [opts.intervalMs=8000]
   * @param {number} [opts.maxRetries=50]
   * @param {string} [opts.tag]             调试标签，比如 'jobId=xxx'
   */
  start(opts) {
    if (!opts || !Array.isArray(opts.resumeBlindIds) || typeof opts.onUpdate !== 'function') {
      console.error('[recommendScoreUpdater] start 缺少必要参数', opts)
      return false
    }
    // 启动新一轮前先清掉上一轮（推荐场景一般每次任务结束都已经清，但兜底）
    this.clearTimer()
    this.retryCount = 0
    this.noProgressCount = 0
    this.pendingBlindIds.clear()
    this.ignoredBlindIds.clear()

    for (const id of opts.resumeBlindIds) {
      if (id) this.pendingBlindIds.add(String(id))
    }
    this.onUpdate = opts.onUpdate
    this.onAllDone = typeof opts.onAllDone === 'function' ? opts.onAllDone : null
    this.intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 8000
    this.maxRetries = Number(opts.maxRetries) > 0 ? Number(opts.maxRetries) : 50
    this.tag = opts.tag || ''

    if (this.pendingBlindIds.size === 0) {
      console.log(`[recommendScoreUpdater] start: pending=0, skip (${this.tag})`)
      return false
    }

    console.log(
      `[recommendScoreUpdater] 启动 pending=${this.pendingBlindIds.size} interval=${this.intervalMs}ms (${this.tag})`
    )
    // 立刻跑一次 + 周期循环
    void this.queryOnce()
    this.timer = setInterval(() => {
      void this.queryOnce()
    }, this.intervalMs)
    return true
  }

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  stop() {
    this.clearTimer()
    this.pendingBlindIds.clear()
    this.ignoredBlindIds.clear()
    this.retryCount = 0
    this.noProgressCount = 0
    this.onUpdate = null
    this.onAllDone = null
    this.tag = ''
  }

  /**
   * 单轮查分。
   *   1. 调 queryTaskScoreList 拿当前 pending 的分数
   *   2. 遍历返回，把终态 (SUCCESS / FAILED / NOT_SUPPORTED / score>=0) 从 pending 删
   *   3. onUpdate(整个 data 数组, ctx) 让外部写回 store
   *   4. pending 清空 → onAllDone + 停 timer
   *   5. 超 maxRetries / 连续 maxNoProgress 次 0 进展 → 把残余标 -2 + 停 timer
   */
  async queryOnce() {
    if (this.pendingBlindIds.size === 0) {
      this.clearTimer()
      return
    }
    this.retryCount++

    if (this.retryCount > this.maxRetries) {
      console.log(
        `[recommendScoreUpdater] 已达 maxRetries=${this.maxRetries}，停止轮询 (${this.tag})` +
          ` 残余 pending=${this.pendingBlindIds.size}`
      )
      this.markPendingAsIgnored()
      this.clearTimer()
      this.fireAllDone()
      return
    }

    const blindIds = Array.from(this.pendingBlindIds)
    const data = await fetchTaskScores(blindIds)
    if (!Array.isArray(data)) {
      // 接口失败 → 视为本轮无进展（让 noProgressCount 累计，避免死循环）
      this.noProgressCount++
      this.checkNoProgressBreak()
      return
    }

    let removedThisRound = 0
    for (const item of data) {
      const id = item?.resumeBlindId
      if (!id) continue
      const isTerminal =
        item.scoreStatus === 'SUCCESS' ||
        item.scoreStatus === 'FAILED' ||
        item.scoreStatus === 'NOT_SUPPORTED' ||
        (typeof item.score === 'number' && item.score >= 0)
      if (isTerminal) {
        if (this.pendingBlindIds.has(String(id))) {
          this.pendingBlindIds.delete(String(id))
          removedThisRound++
        }
      }
    }

    if (removedThisRound > 0) this.noProgressCount = 0
    else this.noProgressCount++

    console.log(
      `[recommendScoreUpdater] 第${this.retryCount}轮 in=${data.length}` +
        ` 本轮终态=${removedThisRound} 剩余pending=${this.pendingBlindIds.size}` +
        ` noProgress=${this.noProgressCount}/${this.maxNoProgress} (${this.tag})`
    )

    // 把整批 data 抛给外部去 patch
    try {
      this.onUpdate(data, { pendingLeft: this.pendingBlindIds.size })
    } catch (e) {
      console.warn('[recommendScoreUpdater] onUpdate 回调异常（忽略）:', e?.message || e)
    }

    if (this.pendingBlindIds.size === 0) {
      console.log(`[recommendScoreUpdater] 全部终态，停止轮询 (${this.tag})`)
      this.clearTimer()
      this.fireAllDone()
      return
    }

    this.checkNoProgressBreak()
  }

  checkNoProgressBreak() {
    if (this.noProgressCount < this.maxNoProgress) return
    console.log(
      `[recommendScoreUpdater] 连续 ${this.maxNoProgress} 轮无进展，停止轮询 (${this.tag})` +
        ` 残余 pending=${this.pendingBlindIds.size}`
    )
    this.markPendingAsIgnored()
    this.clearTimer()
    this.fireAllDone()
  }

  markPendingAsIgnored() {
    // 残余 pending → 通过 onUpdate 推一次 "score=-2" 的合成数据让 UI 显示"AI 分析失败"
    if (this.pendingBlindIds.size === 0 || typeof this.onUpdate !== 'function') return
    const synthetic = []
    for (const id of this.pendingBlindIds) {
      this.ignoredBlindIds.add(id)
      synthetic.push({ resumeBlindId: id, score: -2, scoreStatus: 'TIMEOUT' })
    }
    this.pendingBlindIds.clear()
    try {
      this.onUpdate(synthetic, { pendingLeft: 0 })
    } catch (e) {
      console.warn('[recommendScoreUpdater] markPendingAsIgnored onUpdate 异常:', e?.message || e)
    }
  }

  fireAllDone() {
    if (typeof this.onAllDone === 'function') {
      try {
        this.onAllDone()
      } catch (e) {
        console.warn('[recommendScoreUpdater] onAllDone 异常:', e?.message || e)
      }
    }
  }
}

const recommendScoreUpdater = new RecommendScoreUpdater()
export default recommendScoreUpdater
export { RecommendScoreUpdater }
