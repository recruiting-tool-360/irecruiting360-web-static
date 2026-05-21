import { queryScoreList } from 'src/api/jobList/JobListApi';

/**
 * 把 AI 评分状态推到 Vuex（lazy 引入，避免 utils → store 循环依赖）。
 * TaskStatusCard 监听 getters.getAiScoringActive / getAiScoringPending 决定
 * "正在 AI 评分与匹配..."这一行 step 的状态。
 */
/**
 * @param {boolean} active
 * @param {number}  pending
 * @param {string}  [chatId] 当前评分绑定的 chatId（active=true 时必传，false 时会被忽略）。
 *   解决"AI 评分在 chat A 跑 + 用户切到 chat B → chat B 被全局信号误判进行中"的串扰 bug，
 *   见 store/AiSerachConfig.js aiScoringChatId 注释。
 */
function pushAiScoringStateToStore(active, pending, chatId) {
  // dynamic import：第一次调用才解析 store 模块，规避顶层循环引用
  import('src/store').then((m) => {
    try {
      const store = m.default || m;
      if (store && typeof store.commit === 'function') {
        store.commit('setAiScoringState', { active, pending, chatId });
      }
    } catch (_e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

/**
 * 双路径查分：优先任务级 /resume/queryTaskScoreList，降级老 /resume/queryScoreList。
 *
 * 策略：
 *   1. lazy 引入 store + searchTaskApi（避免循环依赖）
 *   2. 用 store.SearchTasks.taskResumeIdMap 把本批 pending blindIds 翻译成 taskResumeIds
 *   3. taskResumeIds 非空 → 调 postTaskScoreList；失败时降级
 *   4. taskResumeIds 为空（任务化未启动 / 映射未建）→ 直接走老接口
 *
 * 返回数据**统一对外形态**（含 resumeBlindId）：
 *   - 任务级返回：[{ taskResumeId, resumeBlindId, score, scoreStatus, scoreJson }, ...]
 *   - 老接口返回：[{ resumeBlindId, score, ... }, ...]
 *
 * 调用方按 item.resumeBlindId 反查 jobList 更新即可。
 */
async function fetchScoresWithFallback(blindIds, channelKey, searchId) {
  // 1) 拿 store + taskApi
  let store = null;
  let taskApi = null;
  try {
    const [storeMod, apiMod] = await Promise.all([
      import('src/store'),
      import('src/api/searchTaskApi')
    ]);
    store = storeMod.default || storeMod;
    taskApi = apiMod.default || apiMod;
  } catch (_e) {
    // lazy import 失败 → 直接走老接口
  }

  // 2) 收集 taskResumeIds（blindId → taskResumeId 反查）
  let taskResumeIds = [];
  if (store && typeof store.getters?.['SearchTasks/getTaskResumeIdMap'] === 'function') {
    const map = store.getters['SearchTasks/getTaskResumeIdMap']() || {};
    for (const blindId of blindIds) {
      const t = map[String(blindId)];
      if (t) taskResumeIds.push(t);
    }
  }

  // 3) 任务级查分（taskResumeIds 非空时优先走）
  if (taskResumeIds.length > 0 && taskApi?.postTaskScoreList) {
    try {
      console.log(`[scoreAutoUpdater] 用任务级查分 taskResumeIds=${taskResumeIds.length}/${blindIds.length}`);
      const resp = await taskApi.postTaskScoreList(taskResumeIds);
      const data = resp?.data;
      if (Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      console.warn('[scoreAutoUpdater] postTaskScoreList 失败，降级到老接口:', e?.message || e);
    }
  } else {
    console.log(
      `[scoreAutoUpdater] taskResumeIds 不足（${taskResumeIds.length}/${blindIds.length}），走老接口 queryScoreList`
    );
  }

  // 4) 降级老接口
  try {
    const { data } = await queryScoreList({
      resumeBlindIds: blindIds,
      channel: channelKey,
      searchId
    });
    return Array.isArray(data) ? data : null;
  } catch (e) {
    console.warn('[scoreAutoUpdater] queryScoreList 也失败:', e?.message || e);
    return null;
  }
}

/**
 * 分数自动更新器 - 定时查询简历评分并更新数据
 */
class ScoreAutoUpdater {
  constructor() {
    this.timer = null;
    this.interval = 8000; // 5秒查询一次
    this.maxRetries = 50; // 最大查询次数
    this.retryCount = 0;
    this.noProgressCount = 0; // 连续无进展次数（连续 N 次0条得分，视为 AI 分析已中断，停止轮询）
    this.pendingResumeIds = new Set(); // 待查询的简历ID集合
    this.ignoredResumeIds = new Set(); // 超过最大查询次数后忽略的ID
    this.channelKey = ''; // 当前渠道
    this.searchId = ''; // 搜索ID
    this.chatId = '';   // 绑定的 chatId（push AI 状态时携带，给 isAiAnalyzingForChat 用）
    this.updateCallback = null; // 数据更新回调
    /**
     * WAITING 状态回调：当查分接口返回 scoreStatus='WAITING' 时调用，让外部（JobInfo 等）
     * 根据 resumeBlindId 找到原始简历数据，重新提交 /resume/task/{taskResumeId}/detail。
     *
     * 回调签名：onWaitingCallback(items: Array<{ resumeBlindId, taskResumeId }>)
     *
     * WAITING 含义（doc §5.3.7）："没有详情快照且没有分数" → postTaskResumeDetail 从来没调过。
     * 重新提交后 AI 才能开始打分 → scoreStatus 会从 WAITING → SCORING → SUCCESS。
     */
    this.onWaitingCallback = null;
  }

  /**
   * 启动自动更新
   * @param {Array} resumeList 简历列表
   * @param {string} channelKey 渠道标识
   * @param {string} searchId 搜索ID
   * @param {Function} updateCallback 数据更新后的回调函数
   * @param {string} [chatId] 触发本轮评分的 chatId。强烈推荐传——AI 评分活跃信号要绑定到
   *   具体 chat，否则用户切其它职位时会出现"两个职位同时进行中"的串扰（见 AiSerachConfig
   *   aiScoringChatId 注释）。不传时降级用 latestChatId 快照（fallback，可能不准）。
   * @returns {boolean} 是否启动成功
   */
  start(resumeList, channelKey, searchId, updateCallback, chatId) {
    if (!resumeList || !channelKey || !searchId || !updateCallback) {
      console.error('缺少必要参数，无法启动分数自动更新', {
        resumeList: !!resumeList,
        channelKey,
        searchId,
        updateCallback: !!updateCallback
      });
      return false;
    }

    // 先清除定时器，但不清空数据
    this.clearTimer();

    // 重置状态计数器
    this.retryCount = 0;
    this.noProgressCount = 0;
    this.pendingResumeIds.clear();
    this.ignoredResumeIds.clear();

    // 设置参数
    this.channelKey = channelKey;
    this.searchId = searchId;
    this.chatId = chatId || '';
    this.updateCallback = updateCallback;
    this.onWaitingCallback = null; // 每次 start 重置，由外部在 start 后单独设置

    console.log('准备收集需要查询分数的简历', resumeList.length);

    // 筛选出没有分数的简历ID
    this.collectResumesWithoutScore(resumeList);

    // 如果没有需要查询的ID，直接返回
    if (this.pendingResumeIds.size === 0) {
      console.log('所有简历都已有分数，无需启动自动更新');
      return false;
    }

    // 启动定时器
    this.startTimer();
    console.log(`已启动分数自动更新，待查询${this.pendingResumeIds.size}条简历`, Array.from(this.pendingResumeIds));
    return true;
  }

  /**
   * 仅清除定时器，不清空数据
   */
  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('已清除定时器');
    }
    // 推到 store：active = (timer 在跑 && 还有 pending)；这里 timer 刚清，active=false
    pushAiScoringStateToStore(false, this.pendingResumeIds.size, this.chatId);
  }

  /**
   * 停止自动更新并清空所有数据
   */
  stop() {
    this.clearTimer();

    // 清空所有状态
    this.retryCount = 0;
    this.pendingResumeIds.clear();
    this.ignoredResumeIds.clear();

    // 清空参数
    this.channelKey = '';
    this.searchId = '';
    this.chatId = '';
    this.updateCallback = null;

    pushAiScoringStateToStore(false, 0);
    console.log('分数自动更新器已完全重置');
  }

  /**
   * 收集没有分数的简历ID
   * @param {Array} resumeList 简历列表
   */
  collectResumesWithoutScore(resumeList) {
    console.log('开始收集无分数简历ID，列表长度:', resumeList.length);

    // 添加遍历记录，记录每个简历的ID和分数状态
    let withScoreCount = 0;
    let withoutScoreCount = 0;

    resumeList.forEach(resume => {
      // 确保简历对象有效
      if (!resume || typeof resume !== 'object') {
        console.warn('无效的简历对象:', resume);
        return;
      }

      // 打印简历ID和分数，便于调试
      // console.log(`简历ID: ${resume.id}, 分数: ${resume.score}`);

      // 检查分数状态：
      // 1. 需要查询的情况：score为null/undefined或score小于0但不等于-2
      // 2. 不需要查询的情况：score为有效值(>=0)或score等于-2(表示无法获取渠道信息)
      if (resume.score === null || resume.score === undefined || 
         (typeof resume.score === 'number' && resume.score < 0 && resume.score !== -2)) {
        if (resume.id) {
          this.pendingResumeIds.add(resume.id);
          withoutScoreCount++;
          // console.log(`添加到待查询列表: ${resume.id}`);
        } else {
          console.warn('简历缺少ID:', resume);
        }
      } else {
        // score >= 0 或 score === -2 的情况，都视为已有有效分数
        withScoreCount++;
      }
    });

    console.log(`简历分析完成: 有分数=${withScoreCount}, 无分数=${withoutScoreCount}, 待查询IDs=${Array.from(this.pendingResumeIds)}`);
    return withoutScoreCount;
  }

  /**
   * 启动定时器
   */
  startTimer() {
    // 仅清除定时器，不清空数据
    this.clearTimer();

    // 检查是否有待查询的ID
    if (this.pendingResumeIds.size === 0) {
      console.log('没有需要查询的简历ID，不启动定时器');
      return;
    }

    console.log(`启动定时器前检查: 待查询ID数量=${this.pendingResumeIds.size}`);

    // 立即执行一次查询
    this.queryScores();

    // 设置定时器
    this.timer = setInterval(() => {
      this.queryScores();
    }, this.interval);

    console.log('定时器已启动');
    // active=true：定时器已启动 + 有 pending；chatId 让 store 记录"这一路 AI 是为谁跑"
    pushAiScoringStateToStore(true, this.pendingResumeIds.size, this.chatId);
  }

  /**
   * 查询分数
   */
  async queryScores() {
    // 检查是否有待查询ID
    if (this.pendingResumeIds.size === 0) {
      console.log('没有需要查询的简历ID，停止查询');
      this.clearTimer(); // 只清除定时器，不清空数据
      return;
    }

    this.retryCount++;

    // 如果超过最大重试次数，将不再查询未获取到分数的简历
    if (this.retryCount > this.maxRetries) {
      console.log(`已达到最大查询次数(${this.maxRetries})，停止查询`);
      this.clearTimer(); // 只清除定时器，不清空数据
      return;
    }

    try {
      // 转换Set为数组
      const ids = Array.from(this.pendingResumeIds);

      console.log(`正在进行第${this.retryCount}次查询，查询${ids.length}条简历分数`);

      // === 升级路径：任务级查分 ===
      //
      // 协议见 docs/05-api-contract.md §5.3.7。新接口 /resume/queryTaskScoreList
      // 用 taskResumeIds[] 替代旧的 resumeBlindIds[]，并返回 scoreStatus 字段。
      //
      // 策略（双路径）：
      //   1. 收集本批 pending blindIds 对应的 taskResumeIds（store.taskResumeIdMap）
      //   2. 有 taskResumeIds → 用 postTaskScoreList 拿任务级分数
      //   3. taskResumeIds 为空（任务化未启动 / 映射未建立）→ 降级走老 queryScoreList
      //
      // 详细决策见 docs/11-task-channel-execute-and-detail.md §0.2。
      const data = await fetchScoresWithFallback(ids, this.channelKey, this.searchId);
      console.log('API返回结果:', data);

      // 处理返回的分数
      if (data && Array.isArray(data) && data.length > 0) {
        // 更新已获取到分数的简历
        const updatedIds = new Set();

        data.forEach(item => {
          // 处理API返回的每个分数数据
          //
          // 终止轮询判定（任意一条满足都视为"该条不再查询"）：
          //   - 任务级返回：scoreStatus ∈ { SUCCESS, FAILED, NOT_SUPPORTED } → 终态
          //   - 老接口返回：score !== null（包括 -2 不可获取也算终态）
          const isTerminal =
            (typeof item.scoreStatus === 'string' &&
              (item.scoreStatus === 'SUCCESS' ||
                item.scoreStatus === 'FAILED' ||
                item.scoreStatus === 'NOT_SUPPORTED')) ||
            (item.score !== null && item.score !== undefined);
          if (item.resumeBlindId && isTerminal) {
            updatedIds.add(item.resumeBlindId);
            console.log(
              `获取到分数: ID=${item.resumeBlindId}, 分数=${item.score}${item.scoreStatus ? `, status=${item.scoreStatus}` : ''}`
            );
          }
        });

        // 从待查询集合中移除已有分数的ID
        updatedIds.forEach(id => {
          this.pendingResumeIds.delete(id);
        });

        // 调用回调函数更新数据
        if (this.updateCallback && updatedIds.size > 0) {
          this.updateCallback(data);
        }

        console.log(`本次查询成功获取${updatedIds.size}条分数，还有${this.pendingResumeIds.size}条待查询`);

        // ===== WAITING 重提交：第一次查到 scoreStatus=WAITING 时通知外部重提交 detail =====
        //
        // scoreStatus='WAITING' 表示 postTaskResumeDetail 从来没提交过（没有详情快照）。
        // 需要重新抓简历 HTML 并调 /resume/task/{taskResumeId}/detail，AI 才能开始打分。
        // 只在第 1 次查询时触发（retryCount=1），避免重复提交浪费。
        if (this.retryCount === 1 && this.onWaitingCallback) {
          const waitingItems = data
            .filter((item) => item.scoreStatus === 'WAITING' && item.resumeBlindId && item.taskResumeId)
            .map((item) => ({ resumeBlindId: item.resumeBlindId, taskResumeId: item.taskResumeId }));
          if (waitingItems.length > 0) {
            console.log(`[scoreAutoUpdater] 检测到 ${waitingItems.length} 条 WAITING，触发 onWaitingCallback 重提交 detail`);
            try { this.onWaitingCallback(waitingItems); } catch (_e) { /* ignore */ }
          }
        }

        // ===== 连续无进展检测 =====
        // 如果 AI 分析在上次会话关闭时未完成，这些简历会长期停在 WAITING/SCORING，
        // scoreStatus 永远不是终态，导致无限轮询。超过阈值时主动停止。
        if (updatedIds.size === 0) {
          this.noProgressCount++;
          const MAX_NO_PROGRESS = 15; // 15 × 8s ≈ 120s，连续 2 分钟无进展即停止
          if (this.noProgressCount >= MAX_NO_PROGRESS) {
            console.warn(
              `[scoreAutoUpdater] 连续 ${MAX_NO_PROGRESS} 次无进展，疑似 AI 分析已中断，停止轮询`,
              '剩余待查:', this.pendingResumeIds.size
            );
            this.clearTimer();
            return;
          }
        } else {
          this.noProgressCount = 0; // 有进展就重置计数
        }

        // 推到 store：pending 数量 + active 状态（timer 还在 + 有 pending）
        pushAiScoringStateToStore(
          this.pendingResumeIds.size > 0 && !!this.timer,
          this.pendingResumeIds.size,
          this.chatId
        );

        // 如果所有ID都已获取分数，停止定时器
        if (this.pendingResumeIds.size === 0) {
          console.log('所有简历都已获取到分数或确认无法获取渠道信息，停止查询');
          this.clearTimer(); // 只清除定时器，不清空数据
        }
      } else {
        console.log('本次查询未获取到新分数');
      }
    } catch (error) {
      console.error('查询分数时出错:', error);
    }
  }

  /**
   * 当新简历加入时，更新查询列表
   * @param {Array} newResumeList 新的简历列表
   */
  updateResumeList(newResumeList) {
    if (!newResumeList || !Array.isArray(newResumeList)) {
      console.warn('无效的简历列表传入updateResumeList:', newResumeList);
      return;
    }

    console.log(`更新简历列表: 新列表长度=${newResumeList.length}, 当前待查询=${this.pendingResumeIds.size}`);

    // 收集新的无分数简历ID
    const newIdsCount = this.collectResumesWithoutScore(newResumeList);

    // 如果定时器已停止且有新的简历需要查询，则重新启动
    if (!this.timer && this.pendingResumeIds.size > 0) {
      console.log(`发现${this.pendingResumeIds.size}条新简历需要查询分数，重新启动查询`);
      this.startTimer();
    } else {
      console.log(`当前定时器状态: ${this.timer ? '运行中' : '已停止'}, 待查询简历数: ${this.pendingResumeIds.size}`);
    }
  }
}

// 创建单例
const scoreUpdater = new ScoreAutoUpdater();

export default scoreUpdater;
