/**
 * 任务化搜索 store —— 任务 / 队列 / SSE / 状态 全闭环
 *
 * 闭环范围：
 *   1. createSearchTask 创建任务（HTTP）→ 落本地状态 + 入队
 *   2. 队列 FIFO 串行执行（同时只跑一个任务，避免反爬同 IP 多账号并发）
 *   3. 拿队首 → 建任务 SSE → 监听 STEP_COMMAND → 调 actionRunner → POST commandResult
 *   4. POST results 落库（Phase A 是 empty resultItems + finished=true 快速跳过）
 *   5. 任务结束（TASK_DONE / TASK_FAILED / 所有 channel 走完）→ disconnect SSE → 跑下一队首
 *
 * 状态映射（后端 → ihraisaas UI badge）：
 *   后端 taskChannelStatus     UI aggregateStatus
 *   RUNNING                    processing    "进行中..."
 *   WAITING                    queued        "排队中"
 *   RESTING                    resting       "排队中（小憩）"
 *   COMPLETED                  completed     "已完成"
 *   FAILED                     stopped(!manual) "异常停止"
 *   STOPPED                    stopped(manual) （无 badge）
 *
 * UI 取数：
 *   - LeftMenu 每个职位行 → `getJobAggregateStatus(chatId)` 算出 UI 状态 + 队列位置
 *   - ChatCard 查结果      → `getResultsByTaskId(taskId)` 拿采集到的候选人列表
 */

import taskApi from "src/api/searchTaskApi";
import taskSse from "src/api/taskSse";
import { runActionList } from "src/util/automation/searchTaskActionRunner";

// ---------- 类型 / 常量 ----------

/** 后端协议状态 */
export const TASK_STATUS = {
  WAITING: "WAITING",
  RUNNING: "RUNNING",
  RESTING: "RESTING",
  COMPLETED: "COMPLETED",
  STOPPED: "STOPPED",
  FAILED: "FAILED"
};

/** UI 聚合状态（对照 ihraisaas JobList.aggregateStatus） */
export const UI_STATUS = {
  IDLE: "idle",
  PROCESSING: "processing", // 蓝 spinner + "进行中..."
  QUEUED: "queued", // 橙 clock + "排队中"
  RESTING: "resting", // 橙文字 "排队中"
  COMPLETED: "completed", // 绿 check + "已完成"
  STOPPED: "stopped" // 红 alert pulse + "异常停止"（仅非 manual 时显示）
};

/** 后端 commandType */
const CMD = {
  TASK_CONTEXT: "TASK_CONTEXT",
  CHANNEL_CONTEXT: "CHANNEL_CONTEXT",
  STEP_COMMAND: "STEP_COMMAND",
  CHANNEL_DONE: "CHANNEL_DONE",
  CHANNEL_FAILED: "CHANNEL_FAILED",
  TASK_DONE: "TASK_DONE",
  TASK_FAILED: "TASK_FAILED"
};

// ---------- state ----------

const initialState = () => ({
  /**
   * 任务字典：taskId → task。
   * task: {
   *   taskId, resultSetId, chatId, positionId,
   *   taskType, taskStatus, createdAt, finishedAt,
   *   isManualStopped,           // 手动停止时 stopped 不显示红 badge
   *   channels: [{
   *     taskChannelId, businessChannel, channelSubType,
   *     searchConditionId, searchTaskConfig,
   *     taskChannelStatus, finishedAt
   *   }],
   *   results: [],               // 聚合所有 channel 的 results 落库返回
   *   error: { code, message } | null
   * }
   */
  tasksById: {},

  /** chatId → [taskId, taskId, ...]（按创建时间倒序，最新在前） */
  chatTaskIdx: {},

  /** 队列（FIFO）：等待跑的 taskId 列表 */
  queue: [],

  /** 当前正在跑的 taskId。null 表示空闲 */
  runningTaskId: null,

  /**
   * 后端任务队列（来自 GET /search/task/queue）+ 元信息。
   * 调用时机：
   *   1. 应用进入主页（resumeFromCurrent / onMounted）
   *   2. 任务启动时（runTask 开头）
   *
   * 形态参考 docs/05-api-contract.md §5.3.2.1：
   *   { totalCount, maxQueueCount, queueFull, items: [...], fetchedAt }
   * null 表示尚未拉取。
   */
  taskQueue: null,

  /** 当前活跃的 SSE 上下文（runtime only，不持久化） */
  activeSseContext: null,

  /**
   * resumeBlindId → taskResumeId 的映射（runtime only，**不持久化**）。
   *
   * 数据来源：postSearchResults 的响应 data.taskResumes[i]，由
   *   commit('PATCH_TASK_RESUME_IDS', taskResumes) 批量写入。
   *
   * 用途：
   *   - 业务侧 saveResumeDetailPlus 之后调任务级 /detail 时，需要 taskResumeId 作为 path 参数
   *   - scoreAutoUpdater 升级到 queryTaskScoreList 时，需要 taskResumeIds[] 作为请求体
   *
   * 不持久化的理由：任务周期内有效，刷新后丢失则自动降级到旧业务接口（不影响业务）。
   * 详见 docs/11-task-channel-execute-and-detail.md §0.3。
   */
  taskResumeIdMap: {},

  /**
   * chatId → boolean：标识"该 chat 的任务正在 create 调用中（还没拿到 taskId 写入 store）"。
   *
   * 用途：业务侧 channelDataSavePlus → postBatchResultsToTaskChannel 调用时，会在 store 里
   * 查找该 chat 的活跃 taskChannel。如果 create 调用还在路上（dispatchTaskStore 还在 await
   * waitForSearchConditionId），桥接工具会找不到任务而误判为"任务化未启动"丢调用。
   *
   * IndexPage.dispatchTaskStore 启动时 set，create 成功/失败/异常时 clear。桥接工具看到
   * pendingCreate[chatId]=true 时会短轮询等任务出现。
   */
  pendingCreate: {},

  /**
   * 待补发的任务级 /detail 调用缓存（**当前未使用，预留**）。
   *
   * 当前时序：SEARCH 渠道一次性 finished=true，channelDataSavePlus 调 /results(finished=true)
   * 立刻建好 taskResumeIdMap，后续 saveResumeDetailPlus → 配对调 /detail 立刻就能反查到。
   *
   * 预留场景：未来推荐渠道（RECOMMEND）分页加载时，若需要"AI 分析全部跑完后再统一发 /detail"，
   * 可以复用这个缓存：业务侧 enqueuePendingDetail，runTask 末尾 dequeue 补发。
   *
   * 不持久化（runtime only）。
   */
  pendingDetailPayloads: {},

  /**
   * 推荐渠道的**客户端真实阶段**：跟后端 SSE 推的 channel.taskChannelStatus 解耦。
   *
   * 为什么需要：后端通常在任务开始时就把所有 channel（包括 RECOMMEND）一并标为 RUNNING，
   * 但 RECOMMEND 客户端实际还没启动（要等搜索 AI 跑完才会开打开 BOSS 推荐 tab）。
   * 直接读 taskChannelStatus 会让 TaskStatusCard 的"推荐 AI 匹配"行提前 processing 起来，
   * 用户截图反馈"推荐还没开始状态就更新了"。
   *
   * 结构：Map<taskId, { phase, ts }>
   *   - phase：'IDLE' | 'WAITING' | 'OPENING' | 'FETCHING' | 'FETCHED' | 'SAVED' | 'SCORING' | 'DONE' | 'FAILED'
   *     - IDLE     还没启动
   *     - WAITING  在 await 搜索 AI 跑完（推荐排队中，对应 UI: pending）
   *     - OPENING  打开 BOSS 推荐 tab + dwell
   *     - FETCHING 抓首屏 + humanize（对应 UI 第 0-2 行 processing）
   *     - FETCHED  geekList 已拿到
   *     - SAVED    /results 落库已成功
   *     - SCORING  AI 评分进行中（对应 UI 第 3 行 processing）
   *     - DONE     全部完成
   *     - FAILED   异常
   *
   * 不持久化（runtime only）。
   */
  recommendClientPhase: {},

  /**
   * 用户主动停止的 taskId 集合。
   * 形态：`{ [taskId]: true }`（不用 Set 是为了 vuex devtools / persistedstate 友好）。
   *
   * 用途：业务侧（bossRecommend humanize 循环 / runRealAggregateSearch 等长流程）
   * 在每轮工作前 check `state.userStoppedTaskIds[taskId] === true` → 立刻 break，
   * 让用户点"停止"按钮后能尽快终止还在跑的拟人浏览/分页加载。
   *
   * 写入：mutation `markTaskUserStopped` (action `stopForChat` 调)
   * 清理：mutation `clearTaskUserStopped`（任务完全 finalize 后调，避免内存累积）
   */
  userStoppedTaskIds: {}
});

const state = initialState();

// ---------- 常量 ----------

/**
 * 渠道中文 desc → channelSubType 反查表。
 *
 * channelConf store 里每个渠道的 `desc` 是中文显示名（"boss直聘" / "智联招聘" 等），
 * 业务模块（CannelManager / JobInfoManager）大多用这个 desc 做参数；任务化接口
 * 需要的是 channelSubType（"BOSS" / "ZHILIAN" 等）。
 *
 * 该表用在 getter `getActiveTaskChannelByDesc` 里，让业务侧不必关心命名差异。
 * 后续新增渠道时同步加映射。
 */
export const DESC_TO_SUBTYPE = {
  boss直聘: "BOSS",
  智联招聘: "ZHILIAN",
  前程无忧: "JOB51",
  猎聘: "LIEPIN"
};

// ---------- helpers ----------

function pushTaskIdToChat(state, chatId, taskId) {
  if (!chatId) return;
  const arr = state.chatTaskIdx[chatId] || [];
  if (!arr.includes(taskId)) {
    state.chatTaskIdx = {
      ...state.chatTaskIdx,
      [chatId]: [taskId, ...arr]
    };
  }
}

function reduceTaskStatus(channels) {
  // 任务级状态聚合规则（部分失败容忍版）：
  //
  //   - 无 channel              → WAITING
  //   - 任一 RUNNING            → RUNNING
  //   - 还有 WAITING 未启动     → RUNNING（混杂态，整体仍在跑）
  //   - 全部进入终态：
  //       至少一个 COMPLETED   → COMPLETED（即使有其他 channel FAILED 也算成功完成）
  //       全部 FAILED          → FAILED（真正彻底失败）
  //       全部 STOPPED         → STOPPED
  //       其它混合（如 COMPLETED + STOPPED）→ COMPLETED（有数据可看就算成功）
  //
  // 设计动机：
  //   旧版"任一 FAILED → FAILED"会让"AI 分析失败 / 单个 channel 抓取失败"把整个任务
  //   标记为异常停止，前端用户看到红色"已停止"卡片，体验很差。但其实其他 channel 已
  //   经把搜索结果保存下来了，这些数据完全可用 —— 把这种"部分失败"视为 COMPLETED，
  //   用户能正常查看已抓到的人才数据。失败的 channel 单独在卡片里显示 skipped(灰)。
  if (!channels?.length) return TASK_STATUS.WAITING;
  const statuses = channels.map((c) => c.taskChannelStatus);
  const set = new Set(statuses);
  // 还有 channel 在跑 → 整体 RUNNING
  if (set.has(TASK_STATUS.RUNNING)) return TASK_STATUS.RUNNING;
  // 还有未启动渠道（非 SKIPPED 的等待中）→ 整体 RUNNING 或 WAITING
  const hasWaiting = set.has(TASK_STATUS.WAITING) || set.has(TASK_STATUS.RESTING);
  if (hasWaiting) {
    // 全部是 WAITING/RESTING（无 SKIPPED 等终态混入）→ WAITING；否则混杂 → RUNNING
    const onlyWaiting = statuses.every(
      (s) => s === TASK_STATUS.WAITING || s === TASK_STATUS.RESTING
    );
    return onlyWaiting ? TASK_STATUS.WAITING : TASK_STATUS.RUNNING;
  }
  // 全部终态：至少一个 COMPLETED 就算 COMPLETED（容忍部分 FAILED / SKIPPED）
  if (set.has(TASK_STATUS.COMPLETED)) return TASK_STATUS.COMPLETED;
  // 全 SKIPPED（后端啥都没认）→ 视为 STOPPED，提示用户后端不支持
  if (statuses.every((s) => s === "SKIPPED")) return TASK_STATUS.STOPPED;
  if (set.size === 1 && set.has(TASK_STATUS.STOPPED)) return TASK_STATUS.STOPPED;
  if (set.size === 1 && set.has(TASK_STATUS.FAILED)) return TASK_STATUS.FAILED;
  // 混合（FAILED + STOPPED + SKIPPED 等无 COMPLETED）→ FAILED（确实没数据）
  return TASK_STATUS.FAILED;
}

// ---------- mutations ----------

const mutations = {
  /** 整条任务写入 / 覆盖（创建 + getCurrent 都用这条） */
  setTask(state, task) {
    if (!task?.taskId) return;
    state.tasksById = { ...state.tasksById, [task.taskId]: { ...task } };
    pushTaskIdToChat(state, task.chatId, task.taskId);
  },

  /** 更新任务级状态（commandResult 返回 / SSE TASK_DONE 时同步） */
  patchTask(state, { taskId, patch }) {
    const t = state.tasksById[taskId];
    if (!t) return;
    state.tasksById = {
      ...state.tasksById,
      [taskId]: { ...t, ...patch }
    };
  },

  /** 更新某个 channel 的状态 */
  patchChannel(state, { taskId, taskChannelId, patch }) {
    const t = state.tasksById[taskId];
    if (!t) return;
    const channels = (t.channels || []).map((c) =>
      c.taskChannelId === taskChannelId ? { ...c, ...patch } : c
    );
    const next = { ...t, channels, taskStatus: reduceTaskStatus(channels) };
    state.tasksById = { ...state.tasksById, [taskId]: next };
  },

  /** 把任务追加到队列末尾 */
  enqueue(state, taskId) {
    if (!state.queue.includes(taskId) && state.runningTaskId !== taskId) {
      state.queue = [...state.queue, taskId];
    }
  },

  /** 从队列移除（runNext 取队首时 + 手动 cancel 时用） */
  dequeue(state, taskId) {
    state.queue = state.queue.filter((id) => id !== taskId);
  },

  setRunning(state, taskId) {
    state.runningTaskId = taskId;
  },

  setSseContext(state, ctx) {
    state.activeSseContext = ctx; // { taskId, taskChannelId } 或 null
  },

  /** 缓存 /search/task/queue 的最新返回 */
  setTaskQueue(state, queueData) {
    state.taskQueue = queueData ? { ...queueData, fetchedAt: Date.now() } : null;
  },

  /** 追加这次回传的 items 到任务结果列表 */
  appendResults(state, { taskId, items }) {
    const t = state.tasksById[taskId];
    if (!t) return;
    state.tasksById = {
      ...state.tasksById,
      [taskId]: {
        ...t,
        results: [...(t.results || []), ...(items || [])]
      }
    };
  },

  /** 标记任务结束（COMPLETED / FAILED / STOPPED） */
  finishTask(state, { taskId, taskStatus, error, isManualStopped }) {
    const t = state.tasksById[taskId];
    if (!t) return;
    state.tasksById = {
      ...state.tasksById,
      [taskId]: {
        ...t,
        taskStatus,
        finishedAt: Date.now(),
        isManualStopped: !!isManualStopped,
        error: error || null
      }
    };
  },

  /**
   * 单条写入 resumeBlindId → taskResumeId 映射。
   * 大多数情况用 patchTaskResumeIds 批量喂入更方便。
   */
  setTaskResumeId(state, { resumeBlindId, taskResumeId }) {
    if (!resumeBlindId || !taskResumeId) return;
    state.taskResumeIdMap = {
      ...state.taskResumeIdMap,
      [String(resumeBlindId)]: String(taskResumeId)
    };
  },

  /**
   * 批量喂入 postSearchResults 的响应 data.taskResumes[]。
   * 每条至少含 { resumeBlindId, taskResumeId }，其它字段忽略。
   */
  patchTaskResumeIds(state, taskResumes) {
    if (!Array.isArray(taskResumes) || taskResumes.length === 0) return;
    const next = { ...state.taskResumeIdMap };
    for (const r of taskResumes) {
      if (r && r.resumeBlindId && r.taskResumeId) {
        next[String(r.resumeBlindId)] = String(r.taskResumeId);
      }
    }
    state.taskResumeIdMap = next;
  },

  /** 任务终态时清理映射（避免长会话内存累积） */
  clearTaskResumeIds(state) {
    state.taskResumeIdMap = {};
  },

  /** 标记 chat 的 create 调用进行中 */
  setPendingCreate(state, chatId) {
    if (!chatId) return;
    state.pendingCreate = { ...state.pendingCreate, [chatId]: true };
  },

  /** create 完成（成功或失败）时清理 pending 标记 */
  clearPendingCreate(state, chatId) {
    if (!chatId) return;
    if (!state.pendingCreate[chatId]) return;
    const next = { ...state.pendingCreate };
    delete next[chatId];
    state.pendingCreate = next;
  },

  /**
   * 设置推荐渠道的客户端真实阶段。
   * @param {{ taskId, phase }} entry  phase ∈ IDLE/WAITING/OPENING/FETCHING/FETCHED/SAVED/SCORING/DONE/FAILED
   */
  setRecommendClientPhase(state, entry) {
    if (!entry || !entry.taskId || !entry.phase) return;
    state.recommendClientPhase = {
      ...state.recommendClientPhase,
      [entry.taskId]: { phase: entry.phase, ts: Date.now() }
    };
  },
  clearRecommendClientPhase(state, taskId) {
    if (!taskId) return;
    if (!state.recommendClientPhase[taskId]) return;
    const next = { ...state.recommendClientPhase };
    delete next[taskId];
    state.recommendClientPhase = next;
  },

  /**
   * 标记某 taskId 为"用户主动停止"。
   *
   * 同时做两件事：
   *   1) 写 state.userStoppedTaskIds[taskId] = true（让长流程检测后 break）
   *   2) 把 task.taskStatus 改 STOPPED + isManualStopped=true
   *      （isManualStopped 控制 LeftMenu 不显示红色 STOPPED badge，因为不是异常停止）
   */
  markTaskUserStopped(state, { taskId }) {
    if (!taskId) return;
    state.userStoppedTaskIds = { ...state.userStoppedTaskIds, [String(taskId)]: true };
    const t = state.tasksById?.[taskId];
    if (t) {
      state.tasksById = {
        ...state.tasksById,
        [taskId]: { ...t, taskStatus: TASK_STATUS.STOPPED, isManualStopped: true }
      };
    }
  },
  /** 清理 userStoppedTaskIds 里某个 taskId（finalize 后或者下一次开新任务时） */
  clearTaskUserStopped(state, taskId) {
    if (!taskId) return;
    if (!state.userStoppedTaskIds?.[taskId]) return;
    const next = { ...state.userStoppedTaskIds };
    delete next[taskId];
    state.userStoppedTaskIds = next;
  },

  /**
   * 业务侧 saveResumeDetailPlus 后，缓存一条 detail payload 等 runTask 末尾补发。
   * @param {{ chatId, channelSubType, payload }} entry  payload 形态见 postTaskResumeDetail 入参
   */
  enqueuePendingDetail(state, entry) {
    if (!entry || !entry.chatId || !entry.channelSubType || !entry.payload) return;
    const cur = state.pendingDetailPayloads[entry.chatId] || {};
    const list = Array.isArray(cur[entry.channelSubType]) ? cur[entry.channelSubType] : [];
    state.pendingDetailPayloads = {
      ...state.pendingDetailPayloads,
      [entry.chatId]: {
        ...cur,
        [entry.channelSubType]: [...list, entry.payload]
      }
    };
  },

  /** runTask 末尾补发完后清理 */
  clearPendingDetailsForChat(state, chatId) {
    if (!chatId) return;
    if (!state.pendingDetailPayloads[chatId]) return;
    const next = { ...state.pendingDetailPayloads };
    delete next[chatId];
    state.pendingDetailPayloads = next;
  }
};

// ---------- getters ----------

const getters = {
  getTaskById: (state) => (taskId) => state.tasksById[taskId] || null,
  getResultsByTaskId: (state) => (taskId) => state.tasksById[taskId]?.results || [],

  /** 拿某个 chat（职位）最新的任务 */
  getLatestTaskByChat: (state) => (chatId) => {
    const ids = state.chatTaskIdx[chatId] || [];
    for (const id of ids) {
      const t = state.tasksById[id];
      if (t) return t;
    }
    return null;
  },

  /**
   * 当前是否处于"chat=chatId 的 AI 分析阶段"——精准 per-chat 判定，解决跨 chat 串扰。
   *
   * 背景：
   *   `getAiAnalyzingActive` = `aiScoringActive || aiTaskQueueActive` 是**全局单值**，
   *   不告诉你"AI 在为哪个 chat 跑"。
   *
   *   旧版用 `latestChatId === chatId` 做守卫，但 latestChatId 会被用户切换 chat
   *   改变——scoreAutoUpdater 不会因为切 chat 立刻停（评分轮询是异步任务），结果：
   *     chat A 评分中 → 切到 chat B（latestChatId 变 B）→ AI 信号还是 active →
   *     isAiAnalyzingForChat(B) = true → 出现"chat B 莫名进行中"的串扰假象。
   *
   *   新版直接读 `getAiAnalyzingChatId`——AI 信号是为哪个 chat 跑的，由两路推送源
   *   (scoreAutoUpdater.start / AsyncTaskQueueManager) 在 active=true 时快照 chatId
   *   写入 store，是这一路 AI 的"真主人"。getAiAnalyzingChatId === chatId 才算
   *   "AI 在为本 chat 跑"。
   */
  isAiAnalyzingForChat: (state, gtrs, rootState, rootGetters) => (chatId) => {
    if (!chatId || !rootGetters) return false;
    if (rootGetters.getAiAnalyzingActive !== true) return false;
    const aiChatId = rootGetters.getAiAnalyzingChatId;
    if (aiChatId) return aiChatId === chatId;
    // fallback：chatId 没拿到（旧版 scoreUpdater 调用没传 chatId 时降级）→ 回到
    // latestChatId 守卫，行为退化为旧版（不完美但比"全局直读"准）
    return rootGetters.getLatestChatId === chatId;
  },

  /**
   * 计算职位行的 UI 聚合状态（给 LeftMenu badge 用）。
   * @returns {{ status, queuePosition }} queuePosition 从 1 开始；不在队列时为 0
   *
   * AI 评分纳入 "进行中" 判断：task 已经 COMPLETED 但 scoreAutoUpdater 还在拉分数 →
   * 仍然显示"进行中"，跟 canCreateForChat 拒绝新建的判定保持一致，避免用户看到
   * "已完成" badge 后又被 notify "任务还在进行中"的矛盾体验。
   *
   * 注意只对**当前 chat（latestChatId）**生效——见 isAiAnalyzingForChat 注释，
   * 不然会有"多个 job 同时进行中"的串扰 bug（不同 chat 的全局 AI 信号互相污染）。
   */
  getJobAggregateStatus: (state, gtrs, rootState, rootGetters) => (chatId) => {
    const t = gtrs.getLatestTaskByChat(chatId);
    if (!t) return { status: UI_STATUS.IDLE, queuePosition: 0, task: null };

    // 1) 正在跑
    if (state.runningTaskId === t.taskId) {
      return { status: UI_STATUS.PROCESSING, queuePosition: 0, task: t };
    }
    // 2) 在本地 runtime 队列里（本会话主动创建并 enqueue 的任务）
    const queueIdx = state.queue.indexOf(t.taskId);
    if (queueIdx >= 0) {
      return {
        status: UI_STATUS.QUEUED,
        queuePosition: queueIdx + 1, // 1-based 给用户看
        task: t
      };
    }
    // 2.5) **后端 /search/task/queue 里活着**的任务（不在本地 runtime queue/runningTaskId）。
    //
    // 场景：客户端重启后 fetchTaskQueue 把后端排队任务 hydrate 进 tasksById，但本地 runtime
    // queue 是干净的；如果只看 state.queue 这些任务会落到兜底 IDLE → LeftMenu badge 不显示。
    // 这里直接看 task.taskStatus + 后端给的 queuePosition / blockedReason 推断 UI 状态。
    const queueItem = (Array.isArray(state.taskQueue?.items) ? state.taskQueue.items : []).find(
      (it) => it && String(it.taskId) === String(t.taskId)
    );
    const isAliveOnBackend =
      queueItem ||
      t.taskStatus === TASK_STATUS.WAITING ||
      t.taskStatus === TASK_STATUS.RESTING ||
      t.taskStatus === TASK_STATUS.RUNNING;
    if (
      isAliveOnBackend &&
      t.taskStatus !== TASK_STATUS.COMPLETED &&
      t.taskStatus !== TASK_STATUS.FAILED &&
      t.taskStatus !== TASK_STATUS.STOPPED
    ) {
      // RUNNING 但不是本地 runningTaskId → 显示为 processing（其它 chat 看也合理）
      if (t.taskStatus === TASK_STATUS.RUNNING) {
        return { status: UI_STATUS.PROCESSING, queuePosition: 0, task: t };
      }
      // RESTING → UI 上视为 resting（橙色 clock）
      if (t.taskStatus === TASK_STATUS.RESTING) {
        return {
          status: UI_STATUS.RESTING,
          queuePosition: Number(queueItem?.queuePosition) || Number(t.queuePosition) || 0,
          task: t
        };
      }
      // WAITING（或者 queueItem 存在但 taskStatus 缺失）→ 排队中
      return {
        status: UI_STATUS.QUEUED,
        queuePosition: Number(queueItem?.queuePosition) || Number(t.queuePosition) || 0,
        task: t
      };
    }
    // 3) 终态：COMPLETED / FAILED / STOPPED
    if (t.taskStatus === TASK_STATUS.COMPLETED) {
      // 任务收敛但 AI 分析还在跑（评分 OR 任务队列）→ 仍按"进行中"对外展示
      // ⚠️ 必须用 isAiAnalyzingForChat（带 latestChatId 护栏），不能直接读 getAiAnalyzingActive：
      // 否则其它已 COMPLETED 的 chat 也会被 AI 全局信号"误打"成"进行中"。
      if (gtrs.isAiAnalyzingForChat(chatId)) {
        return { status: UI_STATUS.PROCESSING, queuePosition: 0, task: t };
      }
      return { status: UI_STATUS.COMPLETED, queuePosition: 0, task: t };
    }
    if (t.taskStatus === TASK_STATUS.FAILED) {
      return { status: UI_STATUS.STOPPED, queuePosition: 0, task: t };
    }
    if (t.taskStatus === TASK_STATUS.STOPPED) {
      // 手动停止：UI 上不显示红色"异常停止"badge，恢复 idle
      return { status: UI_STATUS.IDLE, queuePosition: 0, task: t };
    }
    // 4) 兜底
    return { status: UI_STATUS.IDLE, queuePosition: 0, task: t };
  },

  /**
   * 是否还能为某 chat 创建新任务。判定规则：
   *
   *   1. 该 chat 最新任务 taskStatus = RUNNING/WAITING/RESTING → 拒绝（活着的任务）
   *   2. 该 chat 最新任务 COMPLETED 但**本 chat 的** AI 评分还在轮询 → 拒绝
   *      （task.taskStatus 早就 COMPLETED 了，但 scoreAutoUpdater 还在后台拉分数；
   *        如果允许新建任务，旧任务的评分 + 新任务的搜索会混在同一个 jobList 里）
   *   3. 已结束任务（COMPLETED 且 评分完成 / FAILED / STOPPED）→ 允许
   *
   * 注：AI 全局信号需要走 isAiAnalyzingForChat（带 latestChatId 护栏）——见 getter 注释。
   * 直接读 rootGetters.getAiAnalyzingActive 会让"chat A 评分中"误拒"chat B 创建任务"。
   */
  canCreateForChat: (state, gtrs) => (chatId) => {
    const t = gtrs.getLatestTaskByChat(chatId);
    if (!t) return true;
    if (
      t.taskStatus === TASK_STATUS.RUNNING ||
      t.taskStatus === TASK_STATUS.WAITING ||
      t.taskStatus === TASK_STATUS.RESTING
    ) {
      return false;
    }
    // 任务收敛 COMPLETED 了，但**本 chat 的** AI 分析（评分 + 任务队列）还在跑 → 也算"未真正完成"
    if (t.taskStatus === TASK_STATUS.COMPLETED && gtrs.isAiAnalyzingForChat(chatId)) {
      return false;
    }
    return true;
  },

  /**
   * 反查某条简历的 taskResumeId（用于业务侧调任务级 /detail 时拼 path）。
   *
   * @returns {(resumeBlindId: string) => string | null}
   */
  getTaskResumeId: (state) => (resumeBlindId) => {
    if (!resumeBlindId) return null;
    return state.taskResumeIdMap[String(resumeBlindId)] || null;
  },

  /** 整张映射表（scoreAutoUpdater 用来收集 taskResumeIds[]） */
  getTaskResumeIdMap: (state) => () => state.taskResumeIdMap || {},

  /** chat 是否正在 create 调用中（用于业务侧桥接工具判断要不要短轮询等任务出现） */
  isPendingCreate: (state) => (chatId) => !!state.pendingCreate?.[chatId],

  /** 拿某 chat 某渠道的待补发 detail payload 列表（runTask 末尾用） */
  getPendingDetailsForChannel: (state) => (chatId, channelSubType) => {
    const byChat = state.pendingDetailPayloads?.[chatId];
    if (!byChat) return [];
    return Array.isArray(byChat[channelSubType]) ? byChat[channelSubType] : [];
  },

  /**
   * 按 chatId + channelDesc 反查活跃 taskChannel（用于业务侧 lazy import 配对调用）。
   *
   * channelDesc 是中文显示名（"boss直聘" / "智联招聘" 等，来自 ChannelConfig.channelConf[X].desc），
   * 通过 DESC_TO_SUBTYPE 转成 channelSubType，再到任务 channels 里找 SEARCH channel。
   *
   * 当 chat 没有活跃任务 / 任务里没有该渠道 → 返回 null（业务侧静默跳过任务级调用）。
   *
   * @returns {(chatId: string, channelDesc: string) => channel | null}
   */
  /**
   * 推荐渠道的客户端真实阶段 getter（taskId → phase 字符串，没设过返回 'IDLE'）。
   * 用于 TaskStatusCard 推荐卡 6 步进度推导，跟后端 SSE channel.taskChannelStatus 解耦。
   */
  getRecommendClientPhase: (state) => (taskId) => {
    if (!taskId) return "IDLE";
    return state.recommendClientPhase?.[taskId]?.phase || "IDLE";
  },

  getActiveTaskChannelByDesc:
    (state, gtrs) =>
    (chatId, channelDesc, businessChannel = "SEARCH") => {
      const subType = DESC_TO_SUBTYPE[channelDesc];
      if (!subType || !chatId) return null;
      const t = gtrs.getLatestTaskByChat(chatId);
      if (!t || !Array.isArray(t.channels)) return null;
      return (
        t.channels.find(
          (c) => c.businessChannel === businessChannel && c.channelSubType === subType
        ) || null
      );
    }
};

// ---------- actions ----------

const actions = {
  /**
   * 拉取当前用户的任务队列（GET /search/task/queue）。
   *
   * 调用时机（用户确认）：
   *   1. 应用进入主页时（IndexPage onMounted / resumeFromCurrent 之后）
   *   2. 任务启动时（runTask 开头，刷新队列拿到最新预计时间）
   *
   * 失败静默 console.warn，不阻塞主流程。
   */
  async fetchTaskQueue({ commit, state }) {
    try {
      const resp = await taskApi.getTaskQueue();
      const data = resp?.data || null;
      commit("setTaskQueue", data);

      // ⚠️ 关键：把 queue items 也 commit 到 tasksById，让 LeftMenu / ChatCard 等
      // 用 getLatestTaskByChat 的组件能立即显示排队中的任务。
      //
      // 场景：客户端重启后 tasksById 是 vuex-persistedstate 恢复的（含旧状态），
      // 但后端排队的最新任务（可能是这次或上次在别处创建的）只在 /search/task/queue 响应里。
      // 不 hydrate 进 tasksById → LeftMenu badge 不显示、ChatCard 也找不到 task → 排队的任务
      // 用户感知不到。
      //
      // 跟 enqueue 隔离：这里只更新 tasksById（数据源同步），**不动 runtime queue**——
      // runtime queue 由 create / runNext 维护，是"本客户端这次会话内的执行队列"，跟后端
      // 全局排队是两个层面。
      const items = Array.isArray(data?.items) ? data.items : [];
      let hydrated = 0;
      for (const item of items) {
        if (!item?.taskId || !item?.chatId) continue;
        const existing = state.tasksById?.[item.taskId];

        // ⚠️ taskStatus 不能简单用 queue 的覆盖本地：
        //   场景：本地任务正在 runTask 里跑（taskStatus=RUNNING + 各 channel 已 patch 成 RUNNING），
        //   后端 queue 里 taskStatus 可能短暂还是 WAITING（按 estimatedStartTime 调度）。
        //   如果直接覆盖会把 RUNNING 退回 WAITING → TaskStatusCard 看 channel WAITING → 步骤
        //   不推进 → UI 上"BOSS 检索"那行又变灰。
        //   保护策略：本地比后端"更前进"时保留本地。
        const STATUS_RANK = {
          WAITING: 0,
          RESTING: 1,
          RUNNING: 2,
          COMPLETED: 3,
          FAILED: 3,
          STOPPED: 3
        };
        const localRank = STATUS_RANK[existing?.taskStatus] ?? -1;
        const remoteRank = STATUS_RANK[item.taskStatus] ?? -1;
        const taskStatus =
          localRank > remoteRank ? existing.taskStatus : item.taskStatus || existing?.taskStatus;

        // channels 也用同样策略 merge：按 taskChannelId 对应，保留本地"更前进"的 status
        let mergedChannels;
        if (Array.isArray(item.channels) && item.channels.length > 0) {
          const existingChannelsById = {};
          if (Array.isArray(existing?.channels)) {
            for (const eCh of existing.channels) {
              if (eCh?.taskChannelId) existingChannelsById[eCh.taskChannelId] = eCh;
            }
          }
          mergedChannels = item.channels.map((qCh) => {
            const eCh = existingChannelsById[qCh?.taskChannelId];
            if (!eCh) return qCh;
            const lr = STATUS_RANK[eCh.taskChannelStatus] ?? -1;
            const rr = STATUS_RANK[qCh.taskChannelStatus] ?? -1;
            return {
              ...qCh,
              ...eCh,
              // 状态取"更前进"的
              taskChannelStatus:
                lr > rr ? eCh.taskChannelStatus : qCh.taskChannelStatus || eCh.taskChannelStatus
            };
          });
        } else {
          mergedChannels = existing?.channels || [];
        }

        // 保留本地已经累积的字段（results / totalResultsCount / createdAt 等业务字段），
        // 用后端 queue items 里的字段覆盖"调度类"字段 (queuePosition / blockedReason / 预计时间)
        const merged = {
          ...(existing || {}),
          taskId: String(item.taskId),
          chatId: String(item.chatId),
          taskType: item.taskType || existing?.taskType,
          taskStatus,
          resultRoundNo: item.resultRoundNo ?? existing?.resultRoundNo,
          canExecuteNow:
            typeof item.canExecuteNow === "boolean" ? item.canExecuteNow : existing?.canExecuteNow,
          blockedReason: item.blockedReason || existing?.blockedReason,
          nextExecutableTime: item.nextExecutableTime || existing?.nextExecutableTime,
          queuePosition: item.queuePosition ?? existing?.queuePosition,
          estimatedDurationMinutes:
            item.estimatedDurationMinutes ?? existing?.estimatedDurationMinutes,
          estimatedStartTime: item.estimatedStartTime || existing?.estimatedStartTime,
          estimatedEndTime: item.estimatedEndTime || existing?.estimatedEndTime,
          channels: mergedChannels,
          // 没 createdAt 就拿 estimatedStartTime 兜底，让 ChatCard pendingTaskBinding 判断 freshness 有依据
          createdAt:
            existing?.createdAt ||
            (item.estimatedStartTime ? new Date(item.estimatedStartTime).getTime() : Date.now())
        };
        commit("setTask", merged);
        hydrated++;
      }
      console.log(
        `[SearchTasks] fetchTaskQueue ok: totalCount=${data?.totalCount} queueFull=${data?.queueFull}` +
          ` items=${items.length} hydratedToTasksById=${hydrated}`
      );

      // ★ 自动启停 CurrentTaskPoller（每次 fetchTaskQueue 完成都判断一次）。
      //
      // 为什么放这里：之前只在 IndexPage.onMounted 跑一次检查，
      //   - vite HMR 后 IndexPage 已 mount 不会重跑 → 改完代码必须刷新页面才能生效
      //   - 一个任务跑完调 fetchTaskQueue 后，如果 queue 里还有别人的任务但本地空 → 应该接着轮询
      // 放在 fetchTaskQueue 末尾就覆盖了所有 queue 更新时机，无需依赖具体调用方。
      //
      // 触发条件：totalCount > 0（后端有任务）AND 本地无活跃任务（runningTaskId / queue 都空）
      // poller.start 幂等：已 running 时直接跳过；拿到 current task 后会自动 stop。
      try {
        const totalCount = Number(data?.totalCount) || 0;
        const hasActiveLocal =
          !!state.runningTaskId || (Array.isArray(state.queue) ? state.queue.length > 0 : false);
        if (totalCount > 0 && !hasActiveLocal) {
          // 拿真 store 实例（poller 用 store.dispatch('SearchTasks/resumeFromCurrent') 带 namespace）
          const [pollerMod, storeMod] = await Promise.all([
            import("src/util/automation/currentTaskPoller"),
            import("src/store")
          ]);
          const poller = pollerMod.default || pollerMod;
          const realStore = storeMod.default || storeMod;
          if (!poller.isRunning()) {
            poller.start({ store: realStore, taskApi, intervalMs: 10_000, maxTicks: 360 });
            console.log(
              `[SearchTasks] fetchTaskQueue: 后端 queue 非空 (totalCount=${totalCount}) 本地无活跃任务 → 启动 CurrentTaskPoller (10s/tick)`
            );
          }
        }
      } catch (e) {
        console.warn(
          "[SearchTasks] fetchTaskQueue: 启动 CurrentTaskPoller 失败（忽略）:",
          e?.message || e
        );
      }

      return data;
    } catch (e) {
      console.warn("[SearchTasks] fetchTaskQueue failed:", e?.message || e);
      return null;
    }
  },

  /**
   * 进入客户端时清理"孤立的 RUNNING 任务"——
   *
   * 场景：上次客户端关闭时某个任务还在 RUNNING，但前端 runTask 没机会跑完。
   *   - 后端 task.taskStatus 还是 RUNNING（没收到 finish 信号）
   *   - 本地 store 里 runningTaskId 可能为 null（刷新丢了）或者已经是别的任务
   *   - 这种孤立的 RUNNING 任务会阻塞后端队列调度
   *
   * 清理方案（用户确认）：
   *   1. GET /search/task/queue 拿到所有未结束任务
   *   2. 遍历 items 找 taskStatus === 'RUNNING'
   *   3. 对每个孤立的 RUNNING task：
   *      - 如果 task.taskId !== store.runningTaskId（本地不在跑这个）
   *      - 对其每个 channel 调 POST /finish { status: 'FAILED' } 标记为失败
   *   4. 等所有 finish 调用完成后，再调 resumeFromCurrent 拿真正可执行的任务
   *
   * 顺序很重要：先 queue → 清理 → 等 finish 完成 → 再 current
   */
  async cleanupOrphanRunningAndResume({ state, dispatch }) {
    try {
      const queueData = await dispatch("fetchTaskQueue");
      if (queueData?.items?.length) {
        const runningTaskId = state.runningTaskId;
        // 找出孤立 RUNNING 任务（后端在跑但本地不是同一个）
        const orphanTasks = queueData.items.filter(
          (t) => t.taskStatus === "RUNNING" && String(t.taskId) !== String(runningTaskId || "")
        );
        if (orphanTasks.length > 0) {
          console.log(
            `[SearchTasks] cleanupOrphan: 发现 ${orphanTasks.length} 个孤立 RUNNING 任务，将标 FAILED`,
            orphanTasks.map((t) => t.taskId)
          );
          // 串行调 finish，每个 channel 一次
          for (const t of orphanTasks) {
            const channels = Array.isArray(t.channels) ? t.channels : [];
            for (const ch of channels) {
              if (!ch.taskChannelId) continue;
              try {
                await taskApi.postFinishChannel(ch.taskChannelId, {
                  status: "FAILED",
                  errorCode: "USER_INTERRUPTED",
                  errorMessage: "客户端重启时清理孤立 RUNNING 任务"
                });
                console.log(
                  `[SearchTasks] cleanupOrphan: finish FAILED ok taskId=${t.taskId} channelId=${ch.taskChannelId}`
                );
              } catch (e) {
                console.warn(
                  `[SearchTasks] cleanupOrphan: finish failed taskId=${t.taskId} channelId=${ch.taskChannelId}:`,
                  e?.message || e
                );
              }
            }
          }
          // ★ 调完 finish 后再拉一次 queue，让 state.taskQueue.items 同步成最新
          // （刚 FAILED 的那批 task 在 queue 里应该消失了）
          try {
            await dispatch("fetchTaskQueue");
            console.log(
              "[SearchTasks] cleanupOrphan: finish 后 fetchTaskQueue ok（已同步后端最新 queue）"
            );
          } catch (e) {
            console.warn(
              "[SearchTasks] cleanupOrphan: finish 后 fetchTaskQueue 失败（忽略）:",
              e?.message || e
            );
          }
        } else {
          console.log("[SearchTasks] cleanupOrphan: 无孤立 RUNNING 任务");
        }
      }
    } catch (e) {
      console.warn("[SearchTasks] cleanupOrphan: 异常但不阻塞:", e?.message || e);
    }
    // 不管清理结果如何，最后都要拉 current 拿真正可执行的任务
    return dispatch("resumeFromCurrent");
  },

  /**
   * 用户主动停止某个 chat 当前的活跃任务（点 chatCard 上的红色"停止"按钮触发）。
   *
   * 流程：
   *   1) 找该 chat 最新 task；若状态不在 RUNNING/WAITING/RESTING 直接返回
   *   2) 标记本地 task.taskStatus=STOPPED + isManualStopped=true（不显示红 badge）
   *      同时记 state.userStoppedTaskIds[taskId]=true 让 humanize 循环 / 各 polling
   *      能检测到后立即 abort（业务侧自己加 check）
   *   3) 对所有未完成 channel 调 postFinishChannel(STOPPED, USER_STOPPED)
   *   4) 停 scoreAutoUpdater + recommendScoreUpdater（轮询的评分查询也停）
   *
   * 返回：`{ ok, stoppedChannels, errors, message? }`
   */
  async stopForChat({ state, commit, getters, dispatch }, chatId) {
    if (!chatId) return { ok: false, message: "chatId required" };

    const task = getters.getLatestTaskByChat(chatId);
    if (!task) {
      return { ok: false, message: "当前职位没有进行中的任务" };
    }
    // ★ STOPPABLE 判定：跟 canCreateForChat 的"任务进行中"语义对齐（防止 UI 显示"进行中"
    //   但点停止却被拒绝的 inconsistency bug）
    //   - RUNNING / WAITING / RESTING：任务本身在跑，要停（调 finishChannel + 停 scoreUpdater）
    //   - COMPLETED + AI 分析中（评分轮询还在跑）：任务收敛了但用户感知还在"进行中"
    //     → 也要支持停（不调 finishChannel，channels 都 final 了；只停 scoreUpdater）
    const STOPPABLE_RUNNING = [TASK_STATUS.RUNNING, TASK_STATUS.WAITING, TASK_STATUS.RESTING];
    const isTaskAlive = STOPPABLE_RUNNING.includes(task.taskStatus);
    const isScoringActive =
      task.taskStatus === TASK_STATUS.COMPLETED &&
      typeof getters.isAiAnalyzingForChat === "function" &&
      getters.isAiAnalyzingForChat(chatId) === true;
    if (!isTaskAlive && !isScoringActive) {
      return {
        ok: false,
        message: `任务 ${task.taskId} 当前状态 ${task.taskStatus}，无需停止`
      };
    }

    const taskId = task.taskId;
    console.log(
      `[SearchTasks/stopForChat] 用户主动停止 taskId=${taskId} chatId=${chatId}` +
        ` isTaskAlive=${isTaskAlive} isScoringActive=${isScoringActive}`
    );

    // 1) 立刻标记本地状态 + abort 标志位
    //    放在调接口之前，让 humanize 循环 / runRealAggregateSearch 能尽快检测后 break
    commit("markTaskUserStopped", { taskId });

    // 2) 立刻把 task 从本地 runtime queue / runningTaskId 移除
    //    否则 LeftMenu 的 getAggregateStatus 优先看这两个 state，会一直显示"进行中/排队中"
    commit("dequeue", taskId);
    if (state.runningTaskId === taskId) {
      commit("setRunning", null);
      console.log(`[SearchTasks/stopForChat] 释放 runningTaskId（原本 = ${taskId}）`);
    }

    // 3) 调 finishChannel：仅在 isTaskAlive 时调（有未结束的 channel）
    //    isScoringActive only 场景：channels 都 final 了，不用再调 finish
    //
    // ★ "停止 N 个渠道" 的用户视角：channelSubType 维度（BOSS / 智联 / 51）。
    //   一个招聘平台同时有 SEARCH + RECOMMEND 两条 channel record 时，仍算 1 个渠道。
    //   实现：finishChannel 仍按每条 record 单独调；统计用 Set 去重 channelSubType。
    const channels = Array.isArray(task.channels) ? task.channels : [];
    const finalStatuses = ["COMPLETED", "FAILED", "STOPPED"];
    const stoppedSubTypes = new Set();
    const errors = [];
    if (isTaskAlive) {
      for (const ch of channels) {
        if (!ch.taskChannelId) continue;
        if (finalStatuses.includes(ch.taskChannelStatus)) continue;
        try {
          await taskApi.postFinishChannel(ch.taskChannelId, {
            status: "STOPPED",
            errorCode: "USER_STOPPED",
            errorMessage: "用户主动停止任务"
          });
          console.log(
            `[SearchTasks/stopForChat] finish STOPPED ok channel=${ch.channelSubType}-${ch.businessChannel} channelId=${ch.taskChannelId}`
          );
          if (ch.channelSubType) stoppedSubTypes.add(ch.channelSubType);
        } catch (e) {
          errors.push({ taskChannelId: ch.taskChannelId, message: e?.message || String(e) });
          console.warn(
            `[SearchTasks/stopForChat] finish STOPPED failed channelId=${ch.taskChannelId}:`,
            e?.message || e
          );
        }
      }
    } else {
      console.log(
        "[SearchTasks/stopForChat] 任务本身已 COMPLETED，跳过 finishChannel（仅停 scoreUpdater 评分轮询）"
      );
    }
    const stoppedChannels = stoppedSubTypes.size;

    // 4) 停搜索 + 推荐两套 scoreUpdater 轮询（评分 polling 不再发新请求）
    try {
      const [sa, rsa] = await Promise.all([
        import("src/utils/scoreAutoUpdater"),
        import("src/utils/recommendScoreUpdater")
      ]);
      (sa.default || sa)?.stop?.();
      (rsa.default || rsa)?.stop?.();
      console.log("[SearchTasks/stopForChat] scoreAutoUpdater + recommendScoreUpdater 已停");
    } catch (e) {
      console.warn("[SearchTasks/stopForChat] 停 scoreUpdater 失败（忽略）:", e?.message || e);
    }

    // 5) 重新拉后端 queue，让 state.taskQueue.items 同步成最新（剔掉刚 finish 的任务）
    //    否则 LeftMenu 的 getAggregateStatus 看到 queueItem 还在 → 仍然显示"排队中"
    try {
      await dispatch("fetchTaskQueue");
      console.log("[SearchTasks/stopForChat] fetchTaskQueue ok（已同步后端 queue 最新状态）");
    } catch (e) {
      console.warn(
        "[SearchTasks/stopForChat] fetchTaskQueue 失败（忽略，本地 state 已自己清）:",
        e?.message || e
      );
    }

    // 6) 解锁 BOSS 推荐 tab（用户停任务后 X 按钮重新出现，可以手动关 tab）
    //    bossRecommend.js 模块级 state 记录了当前锁定的 tabId，幂等：没锁过就 no-op
    try {
      const { unlockRecommendTab } = await import("src/util/automation/bossRecommend");
      await unlockRecommendTab();
      console.log("[SearchTasks/stopForChat] unlockRecommendTab ok");
    } catch (e) {
      console.warn("[SearchTasks/stopForChat] unlockRecommendTab 失败（忽略）:", e?.message || e);
    }

    // ⚠️ 注意：humanize+pagination 循环（在 src/util/automation/bossRecommend.js）
    // 还在 IndexPage runRealAggregateSearch 的 await 链里跑，本 action 无法直接打断，
    // 但 humanize 内部每轮顶部会 check state.userStoppedTaskIds[taskId] 主动 break。
    // 即便没 break 干净，task 已 STOPPED → 后端拒绝后续 /results /detail 调用，不会污染数据。
    return {
      ok: true,
      taskId,
      stoppedChannels,
      errors,
      message:
        isScoringActive && !isTaskAlive
          ? "已停止 AI 评分轮询"
          : `已停止任务 (${stoppedChannels} 个渠道)${
              errors.length ? `，${errors.length} 个失败` : ""
            }`
    };
  },

  /**
   * 创建任务 → 入队 → 触发 processQueue。
   *
   * @returns {Promise<{ ok: boolean, taskId?: string, errorCode?: string, message?: string }>}
   */
  async create({ commit, getters, dispatch }, payload) {
    const chatId = payload?.chatId;
    if (!chatId) {
      return { ok: false, errorCode: "BAD_REQUEST", message: "chatId required" };
    }
    // 拒绝重复点击：该 chat 已有进行 / 排队中任务时不创建新任务
    if (!getters.canCreateForChat(chatId)) {
      return {
        ok: false,
        errorCode: "ALREADY_RUNNING",
        message: "该职位已有任务在进行中，请等待完成后再启动新任务"
      };
    }

    console.log("[SearchTasks] create → POST /search/task/create", payload);
    let resp;
    try {
      resp = await taskApi.createSearchTask(payload);
    } catch (e) {
      console.error("[SearchTasks] createSearchTask HTTP failed:", e?.message || e);
      return { ok: false, errorCode: "HTTP_ERROR", message: e?.message || String(e) };
    }
    const data = resp?.data || resp;
    console.log(
      `[SearchTasks] create response: taskId=${data?.taskId} taskStatus=${
        data?.taskStatus
      } 后端返回 channels=${data?.channels?.length || 0}`,
      "后端 channels=",
      (data?.channels || []).map((c) => `${c.channelSubType}-${c.businessChannel}`).join(",")
    );
    if (!data?.taskId) {
      return {
        ok: false,
        errorCode: "BAD_RESPONSE",
        message: "createSearchTask 返回缺少 taskId"
      };
    }

    // ===== channels 合并策略：以前端传入的 payload.channels 为准 =====
    //
    // 背景：后端 Phase A 接口可能没完整支持多渠道（实测返回 channels 只含 BOSS），
    // 如果直接用后端返回的 channels 写 task.channels，会出现"用户开启了 51job/智联，
    // 但卡片只显示 BOSS"的诡异 UI。
    //
    // 正确语义：前端把用户**实际希望跑的渠道**传给后端，task.channels 就该是这些渠道。
    // 后端返回的 channels 用来补充每个 channel 的 taskChannelId（SSE 推送时 patch 用），
    // 后端没返回的渠道 taskChannelId 留 null，taskChannelStatus 标为 SKIPPED（视觉同 skipped）。
    const reqChannels = Array.isArray(payload?.channels) ? payload.channels : [];
    const respChannels = Array.isArray(data?.channels) ? data.channels : [];
    const mergedChannels = reqChannels.map((reqCh) => {
      const matched = respChannels.find(
        (bc) =>
          bc.businessChannel === reqCh.businessChannel && bc.channelSubType === reqCh.channelSubType
      );
      if (matched) {
        return {
          taskChannelId: matched.taskChannelId,
          businessChannel: matched.businessChannel,
          channelSubType: matched.channelSubType,
          searchConditionId: matched.searchConditionId || reqCh.searchConditionId,
          searchTaskConfig: matched.searchTaskConfig || reqCh.searchTaskConfig,
          taskChannelStatus: matched.taskChannelStatus || TASK_STATUS.WAITING,
          finishedAt: null
        };
      }
      // 后端没返回这个渠道 → 标 SKIPPED，UI 仍显示该行（避免用户看到"开了的渠道不见了"）
      console.warn(
        `[SearchTasks] create: 后端未返回 ${reqCh.channelSubType}-${reqCh.businessChannel}，标记为 SKIPPED`
      );
      return {
        taskChannelId: null,
        businessChannel: reqCh.businessChannel,
        channelSubType: reqCh.channelSubType,
        searchConditionId: reqCh.searchConditionId,
        searchTaskConfig: reqCh.searchTaskConfig,
        taskChannelStatus: "SKIPPED",
        finishedAt: null
      };
    });

    const task = {
      taskId: data.taskId,
      resultSetId: data.resultSetId,
      chatId,
      positionId: payload.positionId,
      taskType: data.taskType || payload.taskType,
      taskStatus: data.taskStatus || TASK_STATUS.WAITING,
      createdAt: Date.now(),
      finishedAt: null,
      isManualStopped: false,
      channels: mergedChannels,
      results: [],
      error: null,
      // ★ searchRequestData：caller（IndexPage.dispatchTaskStore）传过来的 prepareConditionOnly 结果。
      //   runTask 启动 executor(runRealAggregateSearch) 时把这个透回去，让 executeSearch
      //   跳过重复 saveCondition（同一次任务只 saveCondition 一次，省一个 API 调用）。
      //   后端不需要这个字段，纯前端缓存。
      searchRequestData: payload?.searchRequestData || null
    };
    console.log(
      `[SearchTasks] create: 最终 task.channels=`,
      mergedChannels
        .map((c) => `${c.channelSubType}-${c.businessChannel}(${c.taskChannelStatus})`)
        .join(",")
    );
    commit("setTask", task);

    // ★ 用户要求：创建后**不立刻执行**，由 current 接口驱动启动。
    //
    // 流程拆分（创建 ≠ 执行）：
    //   1) create 只把 task 落本地 store（让 UI 立刻显示"已创建"，badge 出来）
    //   2) 立刻 fetchTaskQueue：拿后端最新队列状态 + 自动启动 CurrentTaskPoller（10s/tick）
    //   3) 立刻 dispatch resumeFromCurrent：尝试拉一次 current，
    //      - 后端已就绪（taskStatus=WAITING）→ 进入 enqueue + processQueue → runTask 执行
    //      - 还没就绪（current 返回 null，比如在等工作时间窗）→ 不执行，等 poller 接管
    //   4) 真正"执行总方法"是 runTask（由 processQueue 调），resumeFromCurrent 末尾已有
    //      taskStatus ∈ {WAITING, RUNNING, RESTING} 才入队的判断逻辑（详见该 action 末尾）
    //
    // 这样：
    //   - 后端立即可执行：create → ~100ms 内开始执行（resumeFromCurrent 命中）
    //   - 后端排队中：create → UI 显示"排队中" → poller 10s 一次 → 命中后立刻执行
    //   - 完全由 current 接口决定何时执行，create 不再自作主张入队
    void dispatch("fetchTaskQueue");
    void dispatch("resumeFromCurrent");
    return { ok: true, taskId: task.taskId };
  },

  /**
   * 处理队列：取队首 → 调 runTask 执行。已有 running 时直接返回。
   *
   * ⚠️ runTask 是「真正执行任务的总方法」。所有入口都通过这里：
   *   - resumeFromCurrent 拉到 current task + taskStatus=WAITING/RUNNING/RESTING → 入队
   *   - currentTaskPoller 轮询命中 → dispatch resumeFromCurrent → 入队
   *   - create 后立刻调一次 resumeFromCurrent（同上）
   *   - runTask 跑完 → 调 resumeFromCurrent 拉下一个 → 入队
   */
  async processQueue({ state, dispatch }) {
    if (state.runningTaskId) return;
    const next = state.queue[0];
    if (!next) return;
    await dispatch("runTask", next);
  },

  /**
   * 跑一个任务（**主动驱动版**，不依赖 SSE 推 STEP_COMMAND）：
   *
   *   1. 旁路连一个 SSE（让后端知道 client online，**但不等它推指令**）
   *   2. 直接调 aggregateSearchExecutor 跑真聚合搜索（refreshSearchCondition + executeSearch）
   *   3. 跑完后**对任务的每个 channel** 主动调：
   *        - POST /search/taskChannel/{taskChannelId}/results   （落库该渠道简历）
   *        - POST /search/taskChannel/{taskChannelId}/commandResult { status: 'SUCCESS' }
   *      然后 patch channel 状态、整体 finishTask(COMPLETED)
   *   4. 失败时给每个 channel 调 commandResult({status:'FAILED'})，标 task FAILED
   *
   * 设计动机：
   *   SSE 是后端推送指令的通道，但**调接口跟 SSE 没关系**——前端聚合搜索本来就有自己
   *   的执行入口（runRealAggregateSearch），跑完后直接调 results / commandResult 落库
   *   就行，不必等后端推 STEP_COMMAND 才动作（很多场景后端只推 CHANNEL_CONTEXT 就停了，
   *   等 STEP_COMMAND 死等会让任务永远卡 RUNNING）。
   *   现在的实现把执行权拉回前端，SSE 仅作可观测旁路（log + 心跳）。
   */
  async runTask({ state, commit, dispatch, rootState, rootGetters }, taskId) {
    const task = state.tasksById[taskId];
    if (!task || !task.channels?.length) {
      commit("dequeue", taskId);
      return;
    }
    commit("dequeue", taskId);
    commit("setRunning", taskId);
    commit("patchTask", { taskId, patch: { taskStatus: TASK_STATUS.RUNNING } });
    // 任务启动时拉一次队列（拿最新预计时间）—— fire and forget，不阻塞主流程
    void dispatch("fetchTaskQueue");

    // ===== 整个执行体包 try/finally —— 任何异常都要清 runningTaskId =====
    // 否则 runningTaskId 永远停在这个 taskId 上 → LeftMenu getJobAggregateStatus
    // 把所有 chat 的 latestTask.taskId 跟 runningTaskId 比较 → 一旦 chat A 的 task 跟
    // 这个停滞的 runningTaskId 偶然相等（其实是 A 之前那次任务的 taskId 还在 store 里），
    // A 就会被误判成"进行中" → 多个职位全部显示"进行中..."。
    try {
      // 关键 UX：把所有"活跃"channel（WAITING）立刻 patch 为 RUNNING，
      // 这样 TaskStatusCard 在搜索期间就能显示 channel 行 processing 脉冲（青色加粗），
      // step[0] "正在分析画像关键词" 也会从 pending 切到 complete（anyStarted 检测靠这个）。
      // 否则搜索完毕前所有 step 都 pending，跑完一下子全部 ✓，用户体验"跳过中间状态"。
      for (const ch of task.channels) {
        if (ch.taskChannelId && ch.taskChannelStatus === TASK_STATUS.WAITING) {
          commit("patchChannel", {
            taskId,
            taskChannelId: ch.taskChannelId,
            patch: { taskChannelStatus: TASK_STATUS.RUNNING }
          });
        }
      }

      // 显式触发 channel 的后端执行（POST /search/taskChannel/{tcId}/execute）。
      //   - fire-and-forget：失败仅 console.warn，不阻塞后续聚合搜索
      //   - 已经终态的 channel 跳过（比如 SKIPPED）
      //
      // ⚠️ 串行策略（用户要求）：BOSS 的 SEARCH 和 RECOMMEND **不能同时 execute**。
      //   SEARCH 先 execute → 业务跑搜索 + AI 分析全部完成 → 才 execute RECOMMEND。
      //   因此这里**只 execute SEARCH 渠道**；BOSS-RECOMMEND 的 execute 推迟到
      //   IndexPage.doFetchRecommend 里"等完搜索 AI 之后、真正打开 tab 之前"再调，
      //   见 doFetchRecommend 里 setPhase('OPENING') 那段。
      for (const ch of task.channels) {
        if (!ch.taskChannelId) continue;
        if (
          ch.taskChannelStatus === TASK_STATUS.COMPLETED ||
          ch.taskChannelStatus === TASK_STATUS.FAILED ||
          ch.taskChannelStatus === "SKIPPED"
        ) {
          continue;
        }
        // 推迟 RECOMMEND 渠道的 execute（要等搜索 AI 完成）
        if (ch.businessChannel === "RECOMMEND") {
          console.log(
            `[SearchTasks] runTask: 跳过 RECOMMEND execute (推迟到 doFetchRecommend 启动时调)` +
              ` channel=${ch.channelSubType}-${ch.businessChannel} taskChannelId=${ch.taskChannelId}`
          );
          continue;
        }
        taskApi
          .postExecuteChannel(ch.taskChannelId)
          .then(() =>
            console.log(
              `[SearchTasks] runTask: postExecuteChannel ok channel=${ch.channelSubType}-${ch.businessChannel} taskChannelId=${ch.taskChannelId}`
            )
          )
          .catch((e) =>
            console.warn(
              `[SearchTasks] runTask: postExecuteChannel failed channel=${ch.channelSubType}:`,
              e?.message || e
            )
          );
      }

      const firstChannel = task.channels[0];
      commit("setSseContext", {
        taskId,
        taskChannelId: firstChannel.taskChannelId
      });

      // 1) 旁路连 SSE：不阻塞主流程，连不上也继续跑
      void taskSse
        .connect({ taskChannelId: firstChannel.taskChannelId })
        .then(() =>
          console.log(
            `[SearchTasks] taskSse 旁路连接成功 taskChannelId=${firstChannel.taskChannelId}`
          )
        )
        .catch((e) =>
          console.warn("[SearchTasks] taskSse 旁路连接失败（不影响主流程）:", e?.message || e)
        );

      let runFailed = false;
      let runError = null;

      // 提到 try 外面：catch 和 AI 等待块都要用 hasRecommend 来推 recommendClientPhase
      const hasSearch = task.channels.some((c) => c.businessChannel === "SEARCH");
      const hasRecommend = task.channels.some((c) => c.businessChannel === "RECOMMEND");

      try {
        // 2) 直接调 aggregateSearchExecutor 跑真聚合搜索
        const executor = rootGetters && rootGetters.getAggregateSearchExecutor;
        if (typeof executor !== "function") {
          throw new Error("aggregateSearchExecutor 未就绪（IndexPage 还没 mount？）");
        }
        console.log(
          `[SearchTasks] runTask: 主动执行聚合搜索 taskId=${taskId} chatId=${task.chatId}`
        );

        // ===== 解析 RECOMMEND BOSS channel 的 searchTaskConfig =====
        // 创建任务时 dispatchTaskStore 把 jobId / 简历数封进 RECOMMEND channel 的
        // searchTaskConfig（JSON 文本）。这里反序列化抽出来传给 executor，否则推荐流程
        // 不会启动（runRealAggregateSearch 的 if (recommendChecked && jobId) 永远 false）。
        let matchedBossJobId = null;
        let recommendResumeCount = null;
        const recBossCh = task.channels.find(
          (c) => c.businessChannel === "RECOMMEND" && c.channelSubType === "BOSS"
        );
        if (recBossCh?.searchTaskConfig) {
          try {
            const cfg =
              typeof recBossCh.searchTaskConfig === "string"
                ? JSON.parse(recBossCh.searchTaskConfig)
                : recBossCh.searchTaskConfig;
            matchedBossJobId = cfg?.relatedPositionValue || null;
            if (Number.isFinite(Number(cfg?.maxResumeCount))) {
              recommendResumeCount = Number(cfg.maxResumeCount);
            }
          } catch (e) {
            console.warn(
              `[SearchTasks] runTask: RECOMMEND searchTaskConfig 解析失败`,
              recBossCh.searchTaskConfig,
              e?.message || e
            );
          }
        }
        // ===== searchRequestData 准备 =====
        //
        // 优先级（按命中代价从低到高）：
        //   1. task.searchRequestData（主动启动场景：handleAggregateSearch 创建时已缓存到 task 上）
        //   2. 本地 localStorage 缓存（saveCondition 时按 condId 写入；详见 src/util/searchConditionCache.js）
        //   3. 后端反查接口 GET /search/getCondition?searchConditionId=xxx（永远不会失败的兜底，
        //      覆盖跨 client / 清浏览器缓存 / 跨设备等场景）
        //   4. 都不行 → null → executor 内 saveCondition 兜底（理论上走不到，留作 last resort）
        //
        // 写策略：从后端反查命中后，回写一份到本地缓存 + task.searchRequestData，
        //         下次同 task 跑 / 同 condId 跑都能直接命中第 1/2 层，避免再调后端。
        let searchRequestDataForExec = task.searchRequestData || null;
        if (!searchRequestDataForExec && hasSearch) {
          const searchCh = task.channels.find(
            (c) => c.businessChannel === "SEARCH" && c.searchConditionId
          );
          if (searchCh) {
            const condId = searchCh.searchConditionId;

            // 2) 先试本地缓存（同步 + 快）
            try {
              const cacheMod = await import("src/util/searchConditionCache");
              const cached = cacheMod.getConditionCache(condId);
              if (cached) {
                searchRequestDataForExec = cached;
                console.log(
                  `[SearchTasks] runTask: 命中本地 condition 缓存 condId=${condId}` +
                    ` channels=${cached.channelSearchConditions?.length || 0}（跳过 saveCondition）`
                );
              }
            } catch (e) {
              console.warn(
                "[SearchTasks] runTask: 读本地 condition 缓存失败（继续尝试后端接口）:",
                e?.message || e
              );
            }

            // 3) 本地缓存未命中 → 调后端反查接口（最可靠兜底）
            if (!searchRequestDataForExec) {
              try {
                const { getCondition } = await import("src/api/search/SearchApi");
                const resp = await getCondition(condId);
                const data = resp?.data;
                if (data && Array.isArray(data.channelSearchConditions)) {
                  // 跟 executeSearch saveCondition 分支保持结构一致，补 config 占位
                  if (!Array.isArray(data.config)) {
                    data.config = data.channelSearchConditions.map((item) => ({
                      channelDataTotal: 0,
                      channelPage: 0,
                      channelCountSize: 0,
                      totalPage: 0,
                      channelKey: item.channel
                    }));
                  }
                  searchRequestDataForExec = data;
                  // 命中后端 → 回写本地缓存，下次同 condId 跑直接命中第 2 层
                  try {
                    const cacheMod = await import("src/util/searchConditionCache");
                    cacheMod.setConditionCache(condId, data);
                  } catch (_e) {
                    /* 缓存写入失败不阻塞主流程 */
                  }
                  console.log(
                    `[SearchTasks] runTask: 后端 getCondition 反查命中 condId=${condId}` +
                      ` channels=${data.channelSearchConditions.length}（跳过 saveCondition）`
                  );
                } else {
                  console.warn(
                    `[SearchTasks] runTask: getCondition 响应缺 channelSearchConditions condId=${condId}（executor 内兜底 saveCondition）`
                  );
                }
              } catch (e) {
                console.warn(
                  `[SearchTasks] runTask: 调 getCondition 失败 condId=${condId}（executor 内兜底 saveCondition）:`,
                  e?.message || e
                );
              }
            }

            // 4) 任何一层命中都回写 task.searchRequestData，下次同 task 跑（极少见）直接走第 1 层
            if (searchRequestDataForExec) {
              commit("patchTask", {
                taskId,
                patch: { searchRequestData: searchRequestDataForExec }
              });
            }
          }
        }

        console.log(
          `[SearchTasks] runTask: 调 executor search=${hasSearch} recommend=${hasRecommend}` +
            ` jobId=${matchedBossJobId || "(none)"} resumeCount=${recommendResumeCount}` +
            ` hasSearchRequestData=${!!searchRequestDataForExec}`
        );

        const execRes = await executor({
          chatId: task.chatId,
          selectedModules: { search: hasSearch, recommend: hasRecommend },
          matchedBossJobId,
          resumeCount: recommendResumeCount,
          // 透回 prepareConditionOnly / 缓存命中拿到的 data，让 executeSearch
          // 跳过重复 saveCondition（节省一个 API 调用 + 保证条件 id 跟 channel 绑定一致）
          searchRequestData: searchRequestDataForExec
        });
        if (execRes && execRes.status === "FAILED") {
          runFailed = true;
          runError = { code: "EXECUTOR_FAILED", message: execRes.message || "聚合搜索失败" };
        } else if (execRes && execRes.status === "SKIPPED") {
          // SKIPPED 表示 aggregateSearchInFlight=true（前一次 executor 还在跑）
          // 这种情况下 ChannelConfig 可能正在被填充，等 inFlight 变 false 再继续，
          // 否则下面调 postSearchResults 拿到的可能是空 / 不完整数据
          //
          // ⚠️ 节奏说明：2026-05-24 把上限从 60s 延长到 20 分钟。
          // 原因：runRealAggregateSearch 在 try 内调 doFetchRecommend，doFetchRecommend
          // 内部跑 runBossRecommend（含 humanize+pagination 循环，可能 10+ 分钟），
          // 这期间 inFlight 一直 true。旧版 60s 远远不够 → 这里超时跳出后 runTask
          // 继续往下走 finish，把还在跑的 humanize 流程提前中断。
          // 新版 20 分钟兜底，跟下面推荐 phase 等待一致（注意：inFlight 一旦释放就立刻
          // break，正常情况下不会真等满 20 分钟，只有异常死锁才会触发这个上限）。
          console.log(
            `[SearchTasks] runTask: executor SKIPPED（前一次还在跑），等 inFlight 释放...`
          );
          const POLL_INTERVAL_MS = 500;
          const MAX_WAIT_MS = 20 * 60_000; // 20 分钟兜底
          const startWait = Date.now();
          while (Date.now() - startWait < MAX_WAIT_MS) {
            const stillRunning = rootGetters && rootGetters.getAggregateSearchInFlight === true;
            if (!stillRunning) break;
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          }
          console.log(
            `[SearchTasks] runTask: inFlight 释放 / 超时，等待耗时 ${Date.now() - startWait}ms`
          );
        }
      } catch (e) {
        console.error("[SearchTasks] runTask 执行聚合搜索异常:", e?.message || e);
        runFailed = true;
        runError = { code: "RUN_ERROR", message: e?.message || String(e) };
        if (hasRecommend) {
          commit("setRecommendClientPhase", { taskId, phase: "FAILED" });
        }
      }

      // ===== 3) 等 AI 分析全部完成再 finalize（关键时序） =====
      //
      // 必须等所有 AsyncTaskQueue 简历详情解析 + scoreAutoUpdater 评分查询都跑完，再 finalize
      // 任务（finishTask + clearTaskResumeIds）。否则 detail 调用会读到空 map → SKIP。
      //
      // ⚠️ 不能依赖 rootGetters.getAiAnalyzingActive：
      //    AsyncTaskQueueManager 推送状态用 dynamic import('src/store')，是异步的（microtask）。
      //    runTask 在 aggregateSearchExecutor 之后立刻进入这个循环时，状态推送 callback 还没跑，
      //    store.aiTaskQueueActive 还是 false → 立刻 break → finishTask 清空 taskResumeIdMap →
      //    AsyncTaskQueue 之后处理的 detail 全部 SKIP。
      //
      //    修复：**直接查单例的内部状态**（manager.queueStatus.totalTasks + scoreUpdater.pendingResumeIds.size）。
      //    这些是同步写入的 reactive object，永远是真实状态。
      //
      // 同时加 **最小等待 2s**：给 scoreAutoUpdater 启动（被 Vue watcher 触发，next tick 才跑）留时间。
      if (!runFailed) {
        const MAX_WAIT_AI_MS = 10 * 60 * 1000;
        const MIN_WAIT_AI_MS = 2000; // 给异步状态推送 settle 时间
        const AI_POLL_INTERVAL = 1000;
        const startAiWait = Date.now();

        // lazy 拿单例，避免顶层循环依赖
        let queueManager = null;
        let scoreUpdater = null;
        let recommendScoreUpdater = null;
        try {
          const [qm, su, rsu] = await Promise.all([
            import("src/pluginSrc/util/AsyncTaskQueueManager"),
            import("src/utils/scoreAutoUpdater"),
            import("src/utils/recommendScoreUpdater")
          ]);
          queueManager = qm.asyncTaskQueueManager;
          scoreUpdater = su.default || su;
          recommendScoreUpdater = rsu.default || rsu;
        } catch (e) {
          console.warn(
            "[SearchTasks] runTask: 加载 queueManager/scoreUpdater/recommendScoreUpdater 失败:",
            e?.message || e
          );
        }

        console.log(`[SearchTasks] runTask: 等 AI 分析（搜索 + 推荐通道）全部跑完再 finalize...`);
        while (Date.now() - startAiWait < MAX_WAIT_AI_MS) {
          // 直接查各单例内部状态，规避 store 异步推送的时序问题
          const queueBusy = (queueManager?.queueStatus?.totalTasks || 0) > 0;
          // 搜索通道 scoreAutoUpdater 的轮询
          const scoreBusy =
            !!scoreUpdater?.timer && (scoreUpdater?.pendingResumeIds?.size || 0) > 0;
          // ★ 推荐通道独立的 recommendScoreUpdater 轮询（之前漏了，导致 runTask 不等推荐 AI 完成就 finish）
          const recommendBusy =
            !!recommendScoreUpdater?.timer &&
            (recommendScoreUpdater?.pendingBlindIds?.size || 0) > 0;
          const aiStoreActive = rootGetters && rootGetters.getAiAnalyzingActive === true; // 兜底
          const stillAnalyzing = queueBusy || scoreBusy || recommendBusy || aiStoreActive;
          const elapsed = Date.now() - startAiWait;

          if (!stillAnalyzing && elapsed >= MIN_WAIT_AI_MS) break;
          await new Promise((r) => setTimeout(r, AI_POLL_INTERVAL));
        }
        const aiWaitMs = Date.now() - startAiWait;
        console.log(
          `[SearchTasks] runTask: AI 分析等待结束 耗时=${aiWaitMs}ms` +
            ` queueTotal=${queueManager?.queueStatus?.totalTasks || 0}` +
            ` searchPending=${scoreUpdater?.pendingResumeIds?.size || 0}` +
            ` recommendPending=${recommendScoreUpdater?.pendingBlindIds?.size || 0}` +
            ` aiStoreActive=${rootGetters && rootGetters.getAiAnalyzingActive === true}`
        );
        // 推荐渠道：AI 评分 + 详情都跑完 → 标 DONE，TaskStatusCard 推荐卡进入"完毕"
        if (hasRecommend) {
          commit("setRecommendClientPhase", { taskId, phase: "DONE" });
        }
      }

      // 4) 不论成功失败，都要给每个 channel 调接口（成功 → SUCCESS + results；失败 → FAILED）
      //    从 ChannelConfig 拿该渠道实际抓到的简历数据落库
      //
      //   ⚠️ 数据实际位置：所有渠道组件（BossJobInfo / ZHILIANJobInfo / JOB51JobInfo / LIEPINJobInfo）
      //   都把抓到的简历写到 `channelConf['ALL'].data`（聚合），单渠道 `channelConf['BOSS'].data`
      //   等都是空的。所以按 channelSubType 过滤 ALL 里 `item.channel === <渠道 desc>` 的项
      //   （desc 就是 channelConf[channelSubType].desc，比如 "boss直聘" / "智联招聘" / "前程无忧"）。
      //
      //   ⚠️⚠️ 关键 snapshot：rootState.ChannelConfig 是全局共享对象，用户在任务跑的过程中
      //   切其它职位、点"查看结果"看老数据等任何操作都会改写它。这里**先 snapshot 一份**
      //   再使用，让 runTask 不受 UI 操作影响。不然会出现"任务跑到一半被切走 → ALL.data
      //   被清/被覆盖 → runTask 落库时拿到 0 条 → 后端报 search_result_set_id 没值 → 任务失败"。
      const channelConfMap = rootState?.ChannelConfig?.channelConf || {};
      const allChannelData = Array.isArray(channelConfMap["ALL"]?.data)
        ? [...channelConfMap["ALL"].data] // snapshot 浅拷贝 array，避免后续被 UI 清掉
        : [];
      let totalCollected = 0; // 累加各 channel 抓到的简历数，最后写入 task.totalResultsCount
      for (const ch of task.channels) {
        if (!ch.taskChannelId) {
          console.warn(
            `[SearchTasks] runTask: channel ${ch.channelSubType} 缺少 taskChannelId，跳过`
          );
          continue;
        }
        // 已经是终态的不重复处理（比如 SKIPPED）
        if (
          ch.taskChannelStatus === TASK_STATUS.COMPLETED ||
          ch.taskChannelStatus === TASK_STATUS.FAILED ||
          ch.taskChannelStatus === "SKIPPED"
        ) {
          console.log(
            `[SearchTasks] runTask: channel ${ch.channelSubType} 已终态 ${ch.taskChannelStatus}，跳过接口调用`
          );
          continue;
        }

        // 按 channelSubType 的 desc 在 ALL 数据里过滤出该渠道的简历**条数**（仅用于
        // task.totalResultsCount 统计；resultItems 业务侧已分批上报，runTask 末尾不再重发）
        const channelDesc = channelConfMap[ch.channelSubType]?.desc;
        let channelCount = 0;
        if (ch.businessChannel === "RECOMMEND" && ch.channelSubType === "BOSS") {
          // RECOMMEND/BOSS 的 geek 数据存在 BossRecommendData，不在 ChannelConfig.ALL.data 里。
          // 按 channel.searchTaskConfig 里的 relatedPositionValue（=jobId）反查 BossRecommendData。
          let jobIdForCount = null;
          try {
            const cfg =
              typeof ch.searchTaskConfig === "string"
                ? JSON.parse(ch.searchTaskConfig)
                : ch.searchTaskConfig;
            jobIdForCount = cfg?.relatedPositionValue || null;
          } catch (_e) {
            /* ignore */
          }
          const recBucket = jobIdForCount
            ? rootState?.BossRecommendData?.byJobId?.[jobIdForCount]
            : null;
          channelCount = Array.isArray(recBucket?.geekList) ? recBucket.geekList.length : 0;
          totalCollected += channelCount;
          console.log(
            `[SearchTasks] runTask: channel ${
              ch.channelSubType
            }-RECOMMEND 推荐拿到 ${channelCount} 条 (jobId=${jobIdForCount || "(none)"})`
          );
        } else {
          channelCount = channelDesc
            ? allChannelData.filter((item) => item && item.channel === channelDesc).length
            : 0;
          totalCollected += channelCount;
          console.log(
            `[SearchTasks] runTask: channel ${ch.channelSubType}-SEARCH(desc=${channelDesc}) 抓到 ${channelCount} 条（ALL 总计 ${allChannelData.length}）`
          );
        }

        // ===== runTask 末尾收尾：调 /finish 接口（替代废弃的 /commandResult） =====
        //
        // 协议 §5.3.5：在结果保存完成后**显式确认当前渠道任务结束**。
        //   - status='COMPLETED' → 正常完成
        //   - status='FAILED' / 'STOPPED' → 异常停止（需带 errorCode）
        // 后端返回 nextCommandExpected + nextTaskChannelId 推进任务状态机。
        //
        // /results(finished=true) 已经在业务侧 channelDataSavePlus 调过了。/detail 也是
        // 业务侧 saveResumeDetailPlus 之后立刻配对调的。runTask 等到 AI 分析完成后才到这里，
        // 调一次 /finish 标记 channel 结束。
        const finishPayload = !runFailed
          ? { status: "COMPLETED" }
          : {
              status: "FAILED",
              errorCode: runError?.code || "UNKNOWN",
              errorMessage: runError?.message || "聚合搜索失败"
            };

        // ★ 推荐通道独立保险：finish 推荐前**再等一次推荐 AI 评分完成**。
        //
        // 背景：runTask 顶层 AI wait loop 已经检查了 recommendScoreUpdater，但实际跑下来
        // 可能时序漂移（IndexPage runRealAggregateSearch fire-and-forget 跟 runTask
        // executor SKIPPED polling 是两条并行流程，AI wait loop 可能在 doFetchRecommend
        // 启动 recommendScoreUpdater **之前**就退出了，此时 recommendScoreUpdater.timer=null
        // → 看起来 "AI 已经完成"，但实际推荐流程压根没启动 → 这里给推荐 channel 调 finish
        // 是错的，应该等推荐真正跑完）。
        //
        // 这里加 per-channel 保险：finish RECOMMEND 之前再 polling 一次 recommendScoreUpdater，
        // **既要等 timer 启动**（推荐流程开始），**也要等 pending 清零**（评分跑完）。
        // 最长 10 分钟兜底，避免推荐通道异常时永远卡死。
        if (ch.businessChannel === "RECOMMEND" && ch.channelSubType === "BOSS" && !runFailed) {
          try {
            const rsuMod = await import("src/utils/recommendScoreUpdater");
            const rsu = rsuMod.default || rsuMod;
            if (rsu) {
              // ⚠️ 节奏说明（2026-05-24 改）：
              //
              // 旧版用「60s 内没看到 scoreUpdater active 就放弃」当兜底，原因是早期
              // doFetchRecommend 不带 humanize 几秒内就跑到 recommendScoreUpdater.start()。
              //
              // 现在加了 humanize+pagination 循环（每轮 70-230s，N 轮可能 10+ 分钟），
              // scoreUpdater 必须等 humanize 全部跑完才能启动。60s 窗口远远不够 →
              // runTask 误判推荐异常 → 提前 finish → 中断 humanize → 数据丢失。
              //
              // 新版改用 recommendClientPhase 状态机驱动：
              //   - phase=DONE   → humanize 完成 + scoreUpdater 完成 → break
              //   - phase=FAILED → 推荐流程失败 → break
              //   - phase 30s 内一直 IDLE → 真没启动（doFetchRecommend 异常/没调）→ break
              //   - 其它中间态（WAITING/OPENING/SELECTING/SELECTED/FETCHING/FETCHED/SAVED/SCORING）→ 继续等
              //   - 总上限 20 分钟兜底（humanize 极端情况 + AI 评分 60 条简历）
              const REC_WAIT_MAX_MS = 20 * 60 * 1000; // 20 分钟硬兜底
              const REC_POLL_MS = 1000;
              const REC_NO_PHASE_GRACE_MS = 30 * 1000; // 30s 没看到任何 phase 推进 = 真没启动
              const recStart = Date.now();
              let seenActiveAi = false;
              let seenAnyPhase = false;
              const phaseHistory = []; // 调试用，记 phase 变化轨迹
              let lastPhase = null;
              console.log(
                `[SearchTasks] runTask: finish RECOMMEND/BOSS 前等推荐 phase 终态 (channelId=${ch.taskChannelId}, taskId=${taskId})`
              );
              while (Date.now() - recStart < REC_WAIT_MAX_MS) {
                const timerOn = !!rsu.timer;
                const pending = rsu.pendingBlindIds?.size || 0;
                const phase = state.recommendClientPhase?.[taskId]?.phase || "IDLE";
                const elapsed = Date.now() - recStart;

                if (timerOn || pending > 0) seenActiveAi = true;
                if (phase && phase !== "IDLE") seenAnyPhase = true;
                if (phase !== lastPhase) {
                  phaseHistory.push(`${elapsed}ms:${phase}`);
                  lastPhase = phase;
                }

                // 终态判定
                if (phase === "FAILED") {
                  console.warn(
                    `[SearchTasks] runTask: 推荐 phase=FAILED (耗时 ${elapsed}ms) → finish`
                  );
                  break;
                }
                if (phase === "DONE" && !timerOn && pending === 0) {
                  // phase=DONE 表示 doFetchRecommend 业务流程跑完（含 humanize + /results + /detail）
                  // 同时 scoreUpdater 已停（timer null + pending 0）→ AI 评分也跑完 → 真正可 finish
                  break;
                }

                // 兜底：30s 内 phase 一直 IDLE → 推荐根本没启动（doFetchRecommend 异常或没调）
                if (!seenAnyPhase && elapsed >= REC_NO_PHASE_GRACE_MS) {
                  console.warn(
                    `[SearchTasks] runTask: 推荐 phase 30s 内一直 IDLE，doFetchRecommend 可能异常，跳过等待 → finish`
                  );
                  break;
                }

                await new Promise((r) => setTimeout(r, REC_POLL_MS));
              }
              const recWaitMs = Date.now() - recStart;
              console.log(
                `[SearchTasks] runTask: 推荐 phase 等待结束 耗时=${recWaitMs}ms ` +
                  `final phase=${state.recommendClientPhase?.[taskId]?.phase || "IDLE"} ` +
                  `seenActiveAi=${seenActiveAi} seenAnyPhase=${seenAnyPhase} ` +
                  `timer=${!!rsu.timer} pending=${rsu.pendingBlindIds?.size || 0} ` +
                  `轨迹=[${phaseHistory.join(" → ")}]`
              );
            }
          } catch (e) {
            console.warn(
              "[SearchTasks] runTask: 加载 recommendScoreUpdater 失败，跳过等待:",
              e?.message || e
            );
          }
        }

        try {
          await taskApi.postFinishChannel(ch.taskChannelId, finishPayload);
          console.log(
            `[SearchTasks] runTask: postFinishChannel ${finishPayload.status} channel=${ch.channelSubType}`
          );
          commit("patchChannel", {
            taskId,
            taskChannelId: ch.taskChannelId,
            patch: {
              taskChannelStatus: !runFailed ? TASK_STATUS.COMPLETED : TASK_STATUS.FAILED,
              finishedAt: Date.now()
            }
          });
        } catch (err) {
          console.warn(
            `[SearchTasks] runTask: postFinishChannel ${finishPayload.status} failed channel=${ch.channelSubType}:`,
            err?.message || err
          );
          // 失败也 patch 本地状态，避免 UI 卡死
          commit("patchChannel", {
            taskId,
            taskChannelId: ch.taskChannelId,
            patch: {
              taskChannelStatus: !runFailed ? TASK_STATUS.COMPLETED : TASK_STATUS.FAILED,
              finishedAt: Date.now()
            }
          });
        }
      }

      // 5) 整体收敛 task：写入 totalResultsCount 让 TaskStatusCard 的"已抓取全渠道 N..."能显示真实数量
      commit("patchTask", {
        taskId,
        patch: { totalResultsCount: totalCollected }
      });
      const finalTask = state.tasksById[taskId];
      commit("finishTask", {
        taskId,
        taskStatus:
          finalTask?.taskStatus || (runFailed ? TASK_STATUS.FAILED : TASK_STATUS.COMPLETED),
        error: runFailed ? runError : null
      });
      console.log(
        `[SearchTasks] runTask: 任务收敛 taskId=${taskId} status=${state.tasksById[taskId]?.taskStatus} totalCollected=${totalCollected}`
      );

      // 6) 清理 SSE + 队列状态 + taskResumeIdMap
      taskSse.disconnect();
      commit("setSseContext", null);
      commit("setRunning", null);
      // 任务终态后清理 taskResumeIdMap + pendingDetailPayloads（runtime only）
      commit("clearTaskResumeIds");
      if (task?.chatId) {
        commit("clearPendingDetailsForChat", task.chatId);
      }
      // ★ 任务终态后刷新后端 queue（这批 channel 都 finish 了 → queue 里应该不再有它）
      // 同时为 LeftMenu 等用 state.taskQueue.items 渲染的组件提供最新数据。
      // 失败容忍：异常不阻塞后面的 resumeFromCurrent
      try {
        await dispatch("fetchTaskQueue");
        console.log(`[SearchTasks] runTask: finish 后 fetchTaskQueue ok（taskId=${taskId}）`);
      } catch (e) {
        console.warn(
          `[SearchTasks] runTask: finish 后 fetchTaskQueue 失败（忽略）:`,
          e?.message || e
        );
      }
      // 任务结束后调 /search/task/current 拉下一个待执行任务（替代本地 processQueue）
      // 后端按 RUNNING > WAITING > RESTING + create_time 排序，前端不再维护本地排队
      void dispatch("resumeFromCurrent");
    } catch (err) {
      // ===== finally 保护：无论怎么挂掉，都要清 runningTaskId =====
      console.error(
        `[SearchTasks] runTask 未捕获异常 taskId=${taskId}：清理 runningTaskId 避免卡死`,
        err?.message || err
      );
      // 把任务标 FAILED，避免持续显示进行中
      try {
        commit("finishTask", {
          taskId,
          taskStatus: TASK_STATUS.FAILED,
          error: { code: "UNCAUGHT", message: err?.message || String(err) }
        });
      } catch (_e) {
        /* ignore */
      }
      try {
        taskSse.disconnect();
      } catch (_e) {
        /* ignore */
      }
      try {
        commit("setSseContext", null);
      } catch (_e) {
        /* ignore */
      }
      commit("setRunning", null);
      try {
        commit("clearTaskResumeIds");
      } catch (_e) {
        /* ignore */
      }
      if (task?.chatId) {
        try {
          commit("clearPendingDetailsForChat", task.chatId);
        } catch (_e) {
          /* ignore */
        }
      }
      // 即使异常也要拉下一个，避免队列卡死
      try {
        void dispatch("resumeFromCurrent");
      } catch (_e) {
        /* ignore */
      }
    }
  },

  /**
   * 建立任务 SSE 并接管所有事件直到任务终态。
   * 用 promise 包裹，让 runTask 能 await 等到任务结束。
   */
  async attachSseAndRun({ state, commit, rootState }, { taskId, taskChannelId }) {
    console.log(
      `[SearchTasks] attachSseAndRun: taskId=${taskId} taskChannelId=${taskChannelId} → taskSse.connect`
    );
    await taskSse.connect({ taskChannelId });
    console.log(
      `[SearchTasks] taskSse.connect resolved for taskChannelId=${taskChannelId}, registering listeners`
    );

    return new Promise((resolve, reject) => {
      let settled = false;
      /**
       * 兼容模式兜底计时器：
       *   - 后端文档协议是「STEP_COMMAND 来了才执行」，但当前后端版本有时只推到
       *     CHANNEL_CONTEXT 就停了（未推 STEP_COMMAND）→ 前端死等。
       *   - 这里在 CHANNEL_CONTEXT 收到后开一个 3s 定时器，超时还没收到 STEP_COMMAND
       *     就**主动触发一次聚合搜索**，跑完手动 postCommandResult({status:'SUCCESS'})
       *     让后端能继续 task 状态机。
       *   - 如果 STEP_COMMAND 之后真来了，立刻 clearTimeout，走标准流程。
       *   - 重复触发由 store.aggregateSearchInFlight 防重入。
       */
      let stepCommandFallbackTimer = null;
      let lastContext = null;
      const clearFallback = (reason) => {
        if (stepCommandFallbackTimer) {
          clearTimeout(stepCommandFallbackTimer);
          stepCommandFallbackTimer = null;
          console.log(`[SearchTasks] step-command fallback cleared (${reason})`);
        }
      };
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        clearFallback("attach finish");
        offMsg();
        offErr();
        fn();
      };

      /**
       * 从 ChannelConfig store 拉某个渠道当前的简历列表，组装成协议要求的 resultItems 格式。
       *   - 数据源：state.ChannelConfig.channelConf[channelSubType].data
       *     由 AISearch.executeSearch → 各 channel 组件 channelSearch 回写
       *   - resultItems 格式：[{ rawResume: <原始简历> }]（协议 §8 raw 透传）
       *
       * 调用 postSearchResults 把结果落库到任务后端（finished=true 表示该渠道结果保存完毕）。
       * 失败仅 console.warn，不抛出（落库失败不阻塞 commandResult 流程）。
       */
      const postChannelResultsToServer = async (
        {
          taskChannelId,
          channelSubType,
          businessChannel,
          searchConditionId,
          taskId: ctxTaskId,
          chatId: ctxChatId
        },
        finished
      ) => {
        if (!taskChannelId || !channelSubType) {
          console.warn(
            "[SearchTasks] postChannelResultsToServer: 缺少 taskChannelId 或 channelSubType，跳过"
          );
          return;
        }
        const channelConfMap = rootState?.ChannelConfig?.channelConf || {};
        const channelData = Array.isArray(channelConfMap[channelSubType]?.data)
          ? channelConfMap[channelSubType].data
          : [];
        const resultItems = channelData.map((r) => ({ rawResume: r }));
        // serializeChannel：旧 ihire 反序列化通道名（中文 desc），不是 channelSubType。
        // 后端 SYSTEM_005 "Invalid serializeChannel: BOSS" 就是这里之前误传 channelSubType 导致的。
        const channelDesc = channelConfMap[channelSubType]?.desc || channelSubType;
        const payload = {
          chatId: ctxChatId || state.tasksById[ctxTaskId]?.chatId || "",
          taskId: ctxTaskId,
          searchConditionId,
          businessChannel,
          channelSubType,
          serializeChannel: channelDesc,
          filterByRead: false,
          finished: !!finished,
          resultItems
        };
        try {
          const resp = await taskApi.postSearchResults(taskChannelId, payload);
          const respData = resp?.data || resp;
          console.log(
            `[SearchTasks] postSearchResults ok: channel=${channelSubType} finished=${!!finished} items=${
              resultItems.length
            } taskChannelStatus=${respData?.taskChannelStatus || "-"}`
          );
        } catch (err) {
          console.warn(
            `[SearchTasks] postSearchResults failed (channel=${channelSubType}):`,
            err?.message || err
          );
        }
      };

      /**
       * 兼容模式：后端只推 CHANNEL_CONTEXT 不推 STEP_COMMAND 时，前端主动跑搜索。
       *
       * 做的事跟 STEP_COMMAND 分支一致：
       *   1. POST commandResult status=RUNNING
       *   2. runActionList（actionRunner 检测出 SEARCH 关键字 → 调 executor 真跑）
       *   3. POST commandResult status=SUCCESS（含 items/pageMeta/snapshot）
       *   4. **POST /results 把渠道实际抓到的简历落库**（fix: 之前漏调）
       *   5. 任务流后续由后端决定（推下一 CHANNEL_CONTEXT / TASK_DONE）
       */
      const runFallbackChannelExecution = async (ctx) => {
        if (settled) return;
        if (!ctx?.taskChannelId) {
          console.warn("[SearchTasks] fallback: context.taskChannelId 缺失，跳过");
          return;
        }
        const stepBase = {
          taskId: ctx.taskId,
          searchConditionId: ctx.searchConditionId,
          commandType: "STEP_COMMAND",
          instructionId: null,
          step: { stepCode: "fallback.aggregateSearch", stepName: "前端兼容触发聚合搜索" }
        };
        try {
          await taskApi.postCommandResult(ctx.taskChannelId, { ...stepBase, status: "RUNNING" });
        } catch (e) {
          console.warn("[SearchTasks] fallback post RUNNING failed:", e?.message || e);
        }
        try {
          // 没有 actionList → 注入一个虚拟 action 让 runActionList 识别为"搜索类"
          const virtualActions = [
            { actionCode: "AGGREGATE_SEARCH", params: { reason: "channel-context-fallback" } }
          ];
          const runRes = await runActionList(virtualActions, ctx);

          // ① 先把当前 channel 的搜索结果落库到任务后端（finished=true）
          //    注意：fix 之前漏调 postSearchResults，导致搜索结果没保存到 task 后端 / resultSet
          await postChannelResultsToServer(
            {
              taskChannelId: ctx.taskChannelId,
              channelSubType: ctx.channelSubType,
              businessChannel: ctx.businessChannel,
              searchConditionId: ctx.searchConditionId,
              taskId: ctx.taskId,
              chatId: state.tasksById[taskId]?.chatId
            },
            true
          );

          // ② 再 commandResult 回 SUCCESS，让后端推进 channel 状态
          await taskApi.postCommandResult(ctx.taskChannelId, {
            ...stepBase,
            status: "SUCCESS",
            items: runRes.items,
            pageMeta: runRes.pageMeta,
            snapshot: runRes.snapshot
          });
          commit("patchChannel", {
            taskId,
            taskChannelId: ctx.taskChannelId,
            patch: { taskChannelStatus: TASK_STATUS.COMPLETED, finishedAt: Date.now() }
          });

          // 关键：runRealAggregateSearch 在 IndexPage 里**一次性跑完所有启用渠道**的搜索，
          // 不会按 channel 一个个跑。所以这次 fallback 跑完后，任务里其它还在 WAITING/RUNNING
          // 的 channel 也应该一起标 COMPLETED —— 否则状态卡片会出现"一个 ✓ + 另一个永远转圈"。
          // 同时给后端补发 SKIPPED（协议 §6：SKIPPED 推进到 COMPLETED），让后端能正常收敛 task。
          // 每个兄弟 channel 也对应调一次 postSearchResults，把该渠道的简历落库。
          const taskNow = state.tasksById[taskId];
          const siblingChannels = (taskNow?.channels || []).filter(
            (c) =>
              c.taskChannelId &&
              c.taskChannelId !== ctx.taskChannelId &&
              (c.taskChannelStatus === TASK_STATUS.WAITING ||
                c.taskChannelStatus === TASK_STATUS.RUNNING ||
                !c.taskChannelStatus)
          );
          for (const sib of siblingChannels) {
            // 兄弟 channel 也落库该渠道实际抓到的简历（aggregateSearch 一次跑了所有启用渠道）
            await postChannelResultsToServer(
              {
                taskChannelId: sib.taskChannelId,
                channelSubType: sib.channelSubType,
                businessChannel: sib.businessChannel,
                searchConditionId: sib.searchConditionId,
                taskId: ctx.taskId,
                chatId: state.tasksById[taskId]?.chatId
              },
              true
            );
            commit("patchChannel", {
              taskId,
              taskChannelId: sib.taskChannelId,
              patch: { taskChannelStatus: TASK_STATUS.COMPLETED, finishedAt: Date.now() }
            });
            try {
              await taskApi.postCommandResult(sib.taskChannelId, {
                taskId: ctx.taskId,
                searchConditionId: sib.searchConditionId,
                commandType: "STEP_COMMAND",
                instructionId: null,
                step: {
                  stepCode: "fallback.aggregateSearch.sibling",
                  stepName: "已合并到上一次聚合搜索批次中执行完毕"
                },
                status: "SKIPPED"
              });
              console.log(
                `[SearchTasks] fallback: 兄弟 channel ${sib.channelSubType}-${sib.businessChannel} 已合并完成，向后端发 SKIPPED`
              );
            } catch (err) {
              console.warn(
                `[SearchTasks] fallback: 兄弟 channel ${sib.channelSubType} 发 SKIPPED 失败:`,
                err?.message || err
              );
            }
          }
          console.log(
            "[SearchTasks] fallback execution 完成 → postSearchResults + SUCCESS commandResult posted"
          );

          // 关键收尾：fallback 一次跑完所有渠道（patch 兄弟 channel COMPLETED + 后端 SKIPPED），
          // 此时 task.taskStatus 已经被 reduceTaskStatus 推进到 COMPLETED。但 attachSseAndRun
          // 还在等 SSE 推 TASK_DONE 才 resolve（settled=true）→ 后端如果不推，state.runningTaskId
          // 永远占着，LeftMenu 永远显示"进行中"。这里主动收敛：
          //   - 标 task 整体收敛（finishTask）
          //   - finish(resolve) 让 runTask 进 finally，setRunning(null)
          const taskAfterPatch = state.tasksById[taskId];
          const allTerminal =
            taskAfterPatch?.channels?.every(
              (c) =>
                c.taskChannelStatus === TASK_STATUS.COMPLETED ||
                c.taskChannelStatus === TASK_STATUS.FAILED ||
                c.taskChannelStatus === TASK_STATUS.STOPPED ||
                c.taskChannelStatus === "SKIPPED"
            ) || false;
          if (allTerminal) {
            const reducedStatus = taskAfterPatch.taskStatus; // patchChannel 已经 reduce 过
            commit("finishTask", {
              taskId,
              taskStatus: reducedStatus || TASK_STATUS.COMPLETED
            });
            console.log(
              `[SearchTasks] fallback execution 主动收敛任务 → ${reducedStatus}, finish attachSseAndRun`
            );
            finish(resolve);
          }
        } catch (e) {
          console.error("[SearchTasks] fallback execution failed:", e?.message || e);
          try {
            await taskApi.postCommandResult(ctx.taskChannelId, {
              ...stepBase,
              status: "FAILED",
              error: {
                code: e?.code || "FALLBACK_EXECUTE_FAILED",
                message: e?.message || "前端兼容触发搜索失败",
                retryable: false
              }
            });
          } catch (_) {
            /* ignore */
          }
          commit("patchChannel", {
            taskId,
            taskChannelId: ctx.taskChannelId,
            patch: { taskChannelStatus: TASK_STATUS.FAILED, finishedAt: Date.now() }
          });
          // 失败也要主动 finish，避免任务挂着
          const taskAfterFail = state.tasksById[taskId];
          const allTerminal =
            taskAfterFail?.channels?.every(
              (c) =>
                c.taskChannelStatus === TASK_STATUS.COMPLETED ||
                c.taskChannelStatus === TASK_STATUS.FAILED ||
                c.taskChannelStatus === TASK_STATUS.STOPPED ||
                c.taskChannelStatus === "SKIPPED"
            ) || false;
          if (allTerminal) {
            commit("finishTask", {
              taskId,
              taskStatus: taskAfterFail?.taskStatus || TASK_STATUS.FAILED,
              error: { code: e?.code || "FALLBACK_FAILED", message: e?.message || String(e) }
            });
            finish(resolve);
          }
        }
      };

      const offMsg = taskSse.on("message", async (sseMessage) => {
        const data = sseMessage?.data || {};
        const context = data.context || {};
        const commandType = data.commandType;
        console.log(
          `[SearchTasks] SSE ${commandType} taskChannelId=${context.taskChannelId} step=${
            data.step?.stepCode || "-"
          }`
        );

        try {
          switch (commandType) {
            case CMD.TASK_CONTEXT:
            case CMD.CHANNEL_CONTEXT:
              // 上下文，无需主动回传；记录最新 context（如 channel 切换）
              if (context.taskChannelId) {
                commit("setSseContext", {
                  taskId,
                  taskChannelId: context.taskChannelId
                });
              }
              lastContext = context;
              // 兼容模式：3s 内若没收到 STEP_COMMAND，主动触发执行 + 回传
              if (commandType === CMD.CHANNEL_CONTEXT && context.taskChannelId) {
                clearFallback("re-arm");
                stepCommandFallbackTimer = setTimeout(async () => {
                  console.log(
                    "[SearchTasks] 兼容模式触发：CHANNEL_CONTEXT 后 3s 未收到 STEP_COMMAND，主动启动搜索"
                  );
                  await runFallbackChannelExecution(lastContext);
                }, 3000);
              }
              return;

            case CMD.STEP_COMMAND: {
              // 收到正式 STEP_COMMAND，撤掉兜底计时器（避免双触发）
              clearFallback("STEP_COMMAND received");
              const endpoint = data.resultPolicy?.resultEndpoint;
              const stepBase = {
                taskId: context.taskId,
                searchConditionId: context.searchConditionId,
                commandType,
                instructionId: data.step?.instructionId,
                step: data.step
              };
              // 先回 RUNNING（让后端 / UI 立刻看到"在跑"）
              try {
                await taskApi.postCommandResult(context.taskChannelId, {
                  ...stepBase,
                  status: "RUNNING"
                });
              } catch (e) {
                console.warn("[SearchTasks] post RUNNING failed:", e?.message || e);
              }

              try {
                const runRes = await runActionList(data.actionList || [], context);
                // 落库 items：
                //   - runRes.items 是 actionRunner 返回的（当前 Phase A 主要走 aggregateSearch
                //     执行器，items 是空数组——简历数据写到 ChannelConfig store 里了，不在 runRes）
                //   - 这里先尝试用 runRes.items（如果非空），再 fallback 到从 ChannelConfig
                //     拿当前 channel 的数据，确保 postSearchResults 一定能调到（之前漏调的根因）
                const stepItems = Array.isArray(runRes.items) ? runRes.items : [];
                if (stepItems.length > 0) {
                  // serializeChannel 用中文 desc（旧 ihire 反序列化通道名），不是 channelSubType
                  const ctxChannelDesc =
                    rootState?.ChannelConfig?.channelConf?.[context.channelSubType]?.desc ||
                    context.channelSubType;
                  await taskApi
                    .postSearchResults(context.taskChannelId, {
                      chatId: state.tasksById[taskId]?.chatId,
                      taskId: context.taskId,
                      searchConditionId: context.searchConditionId,
                      businessChannel: context.businessChannel,
                      channelSubType: context.channelSubType,
                      serializeChannel: ctxChannelDesc,
                      filterByRead: false,
                      finished: false,
                      resultItems: stepItems
                    })
                    .catch((e) =>
                      console.warn("[SearchTasks] postSearchResults err:", e?.message || e)
                    );
                  commit("appendResults", { taskId, items: stepItems });
                } else {
                  // 兜底：用 ChannelConfig 里该渠道的简历数据落库（finished=true 收尾）
                  await postChannelResultsToServer(
                    {
                      taskChannelId: context.taskChannelId,
                      channelSubType: context.channelSubType,
                      businessChannel: context.businessChannel,
                      searchConditionId: context.searchConditionId,
                      taskId: context.taskId,
                      chatId: state.tasksById[taskId]?.chatId
                    },
                    true
                  );
                }
                const ackRes = await taskApi.postCommandResult(context.taskChannelId, {
                  ...stepBase,
                  status: "SUCCESS",
                  items: runRes.items,
                  pageMeta: runRes.pageMeta,
                  snapshot: runRes.snapshot
                });
                const ackData = ackRes?.data || ackRes;
                console.log(
                  `[SearchTasks] commandResult ack: taskChannelStatus=${ackData?.taskChannelStatus} taskStatus=${ackData?.taskStatus} nextExpected=${ackData?.nextCommandExpected}`
                );
                if (ackData?.taskChannelStatus) {
                  commit("patchChannel", {
                    taskId,
                    taskChannelId: context.taskChannelId,
                    patch: { taskChannelStatus: ackData.taskChannelStatus }
                  });
                }
                // 如果后端 ack 显示 task 已经收敛（taskStatus 终态）且不再有后续指令，
                // 主动 finish 让 attachSseAndRun resolve（避免后端不推 TASK_DONE 时前端永远等）
                const ackTaskStatus = ackData?.taskStatus;
                const isAckTaskTerminal =
                  ackTaskStatus === TASK_STATUS.COMPLETED ||
                  ackTaskStatus === TASK_STATUS.FAILED ||
                  ackTaskStatus === TASK_STATUS.STOPPED;
                if (isAckTaskTerminal && ackData?.nextCommandExpected === false) {
                  commit("finishTask", { taskId, taskStatus: ackTaskStatus });
                  console.log(
                    `[SearchTasks] ack 显示 task 已终态 ${ackTaskStatus} 且无后续指令 → finish attachSseAndRun`
                  );
                  finish(resolve);
                }
              } catch (e) {
                console.error("[SearchTasks] action run failed:", e?.message || e);
                await taskApi
                  .postCommandResult(context.taskChannelId, {
                    ...stepBase,
                    status: e?.timeout ? "TIMEOUT" : "FAILED",
                    error: {
                      code: e?.code || "FRONTEND_EXECUTE_FAILED",
                      message: e?.message || "前端执行步骤失败",
                      retryable: Boolean(e?.retryable)
                    }
                  })
                  .catch(() => undefined);
              }
              return;
            }

            case CMD.CHANNEL_DONE:
              commit("patchChannel", {
                taskId,
                taskChannelId: context.taskChannelId,
                patch: {
                  taskChannelStatus: TASK_STATUS.COMPLETED,
                  finishedAt: Date.now()
                }
              });
              // 渠道完成可能后端立刻推下一渠道 CONTEXT，所以这里不 finish task
              return;

            case CMD.CHANNEL_FAILED:
              commit("patchChannel", {
                taskId,
                taskChannelId: context.taskChannelId,
                patch: {
                  taskChannelStatus: TASK_STATUS.FAILED,
                  finishedAt: Date.now()
                }
              });
              return;

            case CMD.TASK_DONE:
              commit("finishTask", {
                taskId,
                taskStatus: TASK_STATUS.COMPLETED
              });
              finish(resolve);
              return;

            case CMD.TASK_FAILED:
              commit("finishTask", {
                taskId,
                taskStatus: TASK_STATUS.FAILED,
                error: data?.error || { code: "TASK_FAILED" }
              });
              finish(resolve); // resolve 让 runTask finally 触发 processQueue
              return;

            default:
              console.log(`[SearchTasks] ignored commandType=${commandType}`);
          }
        } catch (e) {
          console.error("[SearchTasks] SSE handler unexpected error:", e);
        }
      });

      const offErr = taskSse.on("error", (info) => {
        console.warn("[SearchTasks] SSE error:", info);
        // SSE 错误不立即终止任务（可能只是网络抖动），交给上层用户决定。
        // Phase A：保守做法——SSE error 视为任务失败结束。
        commit("finishTask", {
          taskId,
          taskStatus: TASK_STATUS.FAILED,
          error: { code: "SSE_ERROR", message: "SSE connection lost" }
        });
        finish(reject.bind(null, new Error("SSE error")));
      });
    });
  },

  /**
   * 手动取消（用户主动停）。Phase A：本地标记 STOPPED，不调后端 stop 接口（接口待补）。
   */
  async cancel({ state, commit }, taskId) {
    const t = state.tasksById[taskId];
    if (!t) return;
    if (state.runningTaskId === taskId) {
      taskSse.disconnect();
      commit("setRunning", null);
      commit("setSseContext", null);
    }
    commit("dequeue", taskId);
    commit("finishTask", {
      taskId,
      taskStatus: TASK_STATUS.STOPPED,
      isManualStopped: true
    });
  },

  /**
   * 清理"僵尸任务"：本地持久化里 taskStatus 还是 RUNNING/WAITING/RESTING，但实际后端早结束了。
   *
   * 判定规则（满足任一即标为 STOPPED）：
   *   1. createdAt 超过 15 分钟 — SSE 没正常关闭就被刷新/关闭打断的
   *   2. channels 里含 settings 当前未启用的渠道 — 任务是修复 dispatchTaskStore 前创建的，
   *      channels 硬编码包含 BOSS（即使用户没启用 BOSS），状态卡死 RUNNING 永远不会变
   *
   * 影响：清理掉的僵尸任务，LeftMenu badge 不再"进行中"，ChatCard 不再回放 task_status 卡片。
   * 启动时由 IndexPage onMounted → store.dispatch('SearchTasks/cleanupZombies') 触发一次。
   */
  cleanupZombies({ state, commit, rootGetters }) {
    const ZOMBIE_THRESHOLD_MS = 15 * 60 * 1000;
    const now = Date.now();
    const ALIVE_STATUSES = [TASK_STATUS.RUNNING, TASK_STATUS.WAITING, TASK_STATUS.RESTING];

    // 当前 settings 启用的渠道集合（跟 IndexPage.dispatchTaskStore 判定一致）
    const cfgList = (rootGetters && rootGetters.getUserChannelConfig) || [];
    const enabledSet = new Set();
    if (Array.isArray(cfgList) && cfgList.length > 0) {
      for (const c of cfgList) {
        if (c?.key && c.key !== "LIEPIN" && !!c.enableConfig) {
          enabledSet.add(c.key);
        }
      }
    }
    // settings 还没 hydrate → enabledSet 为空 → 跳过规则 2（避免误杀）
    const checkConfigMismatch = enabledSet.size > 0;

    // ★ 豁免集合：后端 queue items 里的任务一定还活着（比如 OUT_OF_WORK_PERIOD
    // 等待工作时间窗口的任务可能等几小时），不能用 15min 阈值标僵尸。
    // state.taskQueue 由 fetchTaskQueue 维护，IndexPage 已经保证 cleanupZombies 跑前
    // 先调 cleanupOrphanRunningAndResume（含 fetchTaskQueue）→ state.taskQueue 已就绪。
    const exemptTaskIds = new Set();
    const queueItems = Array.isArray(state.taskQueue?.items) ? state.taskQueue.items : [];
    for (const it of queueItems) {
      if (it?.taskId) exemptTaskIds.add(String(it.taskId));
    }

    const zombies = [];
    for (const taskId of Object.keys(state.tasksById)) {
      const t = state.tasksById[taskId];
      if (!t || !ALIVE_STATUSES.includes(t.taskStatus)) continue;

      // 后端 queue 还有这条 → 不当僵尸
      if (exemptTaskIds.has(String(taskId))) continue;

      const createdAt = Number(t.createdAt) || 0;
      const isOld = createdAt > 0 && now - createdAt > ZOMBIE_THRESHOLD_MS;

      let hasOrphanChannel = false;
      if (checkConfigMismatch && Array.isArray(t.channels)) {
        for (const ch of t.channels) {
          if (ch?.channelSubType && !enabledSet.has(ch.channelSubType)) {
            hasOrphanChannel = true;
            break;
          }
        }
      }

      if (isOld || hasOrphanChannel) {
        zombies.push({ taskId, reason: isOld ? "timeout" : "config-mismatch" });
      }
    }
    console.log(
      `[SearchTasks] cleanupZombies: 扫描 tasksById=${Object.keys(state.tasksById).length}` +
        ` 豁免(queue里活着)=${exemptTaskIds.size} 判定僵尸=${zombies.length}`
    );
    if (zombies.length === 0) return;
    console.warn(
      `[SearchTasks] cleanupZombies: 标记 ${zombies.length} 个僵尸任务为 STOPPED:`,
      zombies
    );
    for (const { taskId, reason } of zombies) {
      commit("finishTask", {
        taskId,
        taskStatus: TASK_STATUS.STOPPED,
        error: {
          code: reason === "timeout" ? "ZOMBIE_TIMEOUT" : "ZOMBIE_CONFIG_MISMATCH",
          message:
            reason === "timeout"
              ? "本地任务超时未完成，已自动停止"
              : "任务包含已禁用的渠道（设置变更或旧版本残留），已自动停止"
        },
        isManualStopped: false
      });
    }
  },

  /**
   * 启动 / 重连时调一次，拉当前服务端任务恢复本地状态。
   *
   * 渠道剔除规则：
   *   - 后端返回的 channels 里如果有"当前 settings 未启用"的渠道，必须主动通知后端
   *     `postCommandResult(status=FAILED)` 把它推进到 CHANNEL_FAILED，前端本地也剔除掉
   *   - 剔除后启用渠道为 0 → 任务整体没法跑，给后端补发"全部 channel FAILED"
   *     让后端自然收敛到 TASK_FAILED；前端不入 store，不显示卡片
   *   - 剔除后还有启用渠道 → 写入 store + enqueue，让 attachSseAndRun 等 SSE 推 STEP_COMMAND
   *
   * 设计动机：
   *   场景：用户之前用 BOSS 启过任务、后端那边 RUNNING 状态没结束；后来改 settings 关掉
   *   BOSS、开了 ZHILIAN/JOB51。再次进入页面，current 拉回的任务 channels=[BOSS-SEARCH]，
   *   前端无法执行（用户没启用 BOSS）。光在前端"丢弃"治标不治本，后端那边的任务永远卡住。
   *   主动 CHANNEL_FAILED → 后端能正常收敛任务状态。
   */
  async resumeFromCurrent({ state, commit, dispatch, rootGetters }) {
    try {
      const resp = await taskApi.getCurrentSearchTask();
      const data = resp?.data || resp;
      if (!data || !data.taskId) return;

      // 幂等保护：同一 taskId 上一次已经被标终态（FAILED / COMPLETED / STOPPED），不再重复处理
      // —— 否则后端没收敛 task 状态时，每次进页面都会重新发一遍 CHANNEL_FAILED，无意义浪费
      const existing = state.tasksById[data.taskId];
      if (existing) {
        const terminalStatuses = [TASK_STATUS.FAILED, TASK_STATUS.COMPLETED, TASK_STATUS.STOPPED];
        if (terminalStatuses.includes(existing.taskStatus)) {
          console.log(
            `[SearchTasks] resumeFromCurrent: taskId=${data.taskId} 本地已是终态 ${existing.taskStatus}，跳过`
          );
          return;
        }
      }

      // 当前 settings 启用的渠道集合（跟 IndexPage.dispatchTaskStore / cleanupZombies 一致）
      const cfgList = (rootGetters && rootGetters.getUserChannelConfig) || [];
      const enabledKeys = Array.isArray(cfgList)
        ? cfgList.filter((c) => c?.key && c.key !== "LIEPIN" && !!c?.enableConfig).map((c) => c.key)
        : [];
      const enabledSet = new Set(enabledKeys);
      const settingsHydrated = enabledSet.size > 0;

      const respChannels = Array.isArray(data.channels) ? data.channels : [];
      console.log(
        `[SearchTasks] resumeFromCurrent: 后端返回 taskId=${data.taskId} channels=${
          respChannels.map((c) => `${c.channelSubType}-${c.businessChannel}`).join(",") || "(空)"
        }, settings 启用=${enabledKeys.join(",") || "(未 hydrate)"}`
      );

      // 拆分：保留 vs 剔除（settings 没 hydrate 时全保留，避免误剔）
      const keptChannels = [];
      const removedChannels = [];
      for (const c of respChannels) {
        if (settingsHydrated && c.channelSubType && !enabledSet.has(c.channelSubType)) {
          removedChannels.push(c);
        } else {
          keptChannels.push(c);
        }
      }

      // 已经终态的 channel 不用再发 FAILED（避免后端报"已结束"错误）
      const isAlive = (status) =>
        status === TASK_STATUS.WAITING ||
        status === TASK_STATUS.RUNNING ||
        status === TASK_STATUS.RESTING ||
        !status;

      // ① 通知后端：被剔除的 channel → CHANNEL_FAILED（reason=CHANNEL_DISABLED）
      for (const c of removedChannels) {
        if (!c.taskChannelId) continue;
        if (!isAlive(c.taskChannelStatus)) continue;
        try {
          await taskApi.postCommandResult(c.taskChannelId, {
            taskId: data.taskId,
            searchConditionId: c.searchConditionId,
            commandType: "STEP_COMMAND",
            instructionId: null,
            step: { stepCode: "channel.disabled", stepName: "渠道已禁用" },
            status: "FAILED",
            error: {
              code: "CHANNEL_DISABLED",
              message: "该渠道已在客户端设置中禁用",
              retryable: false
            }
          });
          console.log(
            `[SearchTasks] resumeFromCurrent: 已剔除 ${c.channelSubType}-${c.businessChannel}（taskChannelId=${c.taskChannelId}），CHANNEL_FAILED 已通知后端`
          );
        } catch (e) {
          console.warn(
            `[SearchTasks] resumeFromCurrent: 通知 CHANNEL_FAILED 失败 (${c.channelSubType}):`,
            e?.message || e
          );
        }
      }

      // ② 剔除后没剩余启用渠道 → 旧任务整体失败 + 用前端启用渠道自动重建新任务
      //
      //   - 所有 channel 已通过 ① postCommandResult(FAILED) 通知后端 CHANNEL_FAILED
      //   - 后端 reduce 会收敛旧任务 taskStatus = FAILED
      //   - 前端同步入 store + 标 taskStatus=FAILED（让 UI 有失败记录可查）
      //   - 然后用当前 settings 启用的渠道 **重建一个新任务**，让用户的搜索流程不被卡断
      if (keptChannels.length === 0) {
        console.warn(
          `[SearchTasks] resumeFromCurrent: 所有 channels 都被剔除 → 旧任务标 FAILED (taskId=${data.taskId})`
        );
        const failedChannels = respChannels.map((c) => ({
          taskChannelId: c.taskChannelId,
          businessChannel: c.businessChannel,
          channelSubType: c.channelSubType,
          searchConditionId: c.searchConditionId,
          searchTaskConfig: c.searchTaskConfig,
          taskChannelStatus: TASK_STATUS.FAILED,
          finishedAt: Date.now()
        }));
        const failedTask = {
          taskId: data.taskId,
          resultSetId: data.resultSetId,
          chatId: data.chatId,
          positionId: data.positionId,
          taskType: data.taskType,
          taskStatus: TASK_STATUS.FAILED,
          createdAt: data.createdAt || Date.now(),
          finishedAt: Date.now(),
          isManualStopped: false,
          channels: failedChannels,
          results: [],
          error: {
            code: "ALL_CHANNELS_DISABLED",
            message: "任务的所有渠道在客户端设置中已被禁用，任务已停止"
          }
        };
        commit("setTask", failedTask);

        // ③ 用前端当前启用的渠道**自动重建一个新任务**（按用户期望"不用 current 的渠道"）
        const newChannels = enabledKeys.map((key) => ({
          businessChannel: "SEARCH",
          channelSubType: key,
          searchConditionId: String(respChannels[0]?.searchConditionId || "")
        }));
        if (data.chatId && newChannels.length > 0) {
          console.log(
            `[SearchTasks] resumeFromCurrent: 用前端启用渠道重建新任务 chatId=${
              data.chatId
            } channels=${enabledKeys.join(",")}`
          );
          // fire-and-forget：create 内部失败会 console.warn，不阻塞 resumeFromCurrent
          void dispatch("create", {
            chatId: data.chatId,
            positionId: data.positionId,
            taskType: "INITIAL",
            triggerSource: "SYSTEM",
            channels: newChannels
          });
        } else {
          console.warn("[SearchTasks] resumeFromCurrent: 重建跳过（chatId 缺失或启用渠道为空）");
        }
        return;
      }

      // ③ 剩余启用渠道 → 入 store + 入队让 SSE 跑
      const mappedChannels = keptChannels.map((c) => ({
        taskChannelId: c.taskChannelId,
        businessChannel: c.businessChannel,
        channelSubType: c.channelSubType,
        searchConditionId: c.searchConditionId,
        searchTaskConfig: c.searchTaskConfig,
        taskChannelStatus: c.taskChannelStatus || TASK_STATUS.WAITING,
        finishedAt: null
      }));

      const task = {
        taskId: data.taskId,
        resultSetId: data.resultSetId,
        chatId: data.chatId,
        positionId: data.positionId,
        taskType: data.taskType,
        taskStatus: data.taskStatus,
        createdAt: data.createdAt || Date.now(),
        finishedAt: null,
        isManualStopped: false,
        channels: mappedChannels,
        results: [],
        error: null
      };
      commit("setTask", task);

      const hasAliveChannel = mappedChannels.some((c) => isAlive(c.taskChannelStatus));
      if (
        hasAliveChannel &&
        (task.taskStatus === TASK_STATUS.WAITING ||
          task.taskStatus === TASK_STATUS.RUNNING ||
          task.taskStatus === TASK_STATUS.RESTING)
      ) {
        console.log(
          `[SearchTasks] resumeFromCurrent: 入队 taskId=${task.taskId}，等 SSE 推 STEP_COMMAND（兼容模式 3s 兜底自动触发聚合搜索）`
        );
        commit("enqueue", task.taskId);
        void dispatch("processQueue");
      } else {
        console.log("[SearchTasks] resumeFromCurrent: 任务无可执行渠道或已终态，不连 SSE");
      }
    } catch (e) {
      console.warn("[SearchTasks] resumeFromCurrent failed:", e?.message || e);
    }
  }
};

/**
 * 跟其它模块（chatList 等）不同，本模块用 namespaced=true：
 *   - 内部 action / mutation / getter 名字短，可读性好（不需要 `setSearchTask` 这种冗长前缀）
 *   - 外部调用方式：
 *       store.dispatch('SearchTasks/create', payload)
 *       store.getters['SearchTasks/getJobAggregateStatus'](chatId)
 *       store.commit('SearchTasks/setTask', task)
 *   - 跟现有 vuex-persistedstate paths 配合：`SearchTasks.tasksById` 等
 */
export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
};
