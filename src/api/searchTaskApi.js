/**
 * 任务化搜索 HTTP API（对接 ihire-solution）
 *
 * 协议见 docs/05-api-contract.md §5.3、docs/10-frontend-task-sse-integration.md、
 *      docs/11-task-channel-execute-and-detail.md。
 *
 *   - POST /search/task/create                            创建任务
 *   - GET  /search/task/current                           查询当前任务（启动 / 重连用 / 任务完成后拉下一个）
 *   - GET  /search/task/queue                             查询任务队列 + 预计时间（进入主页 / 任务启动）
 *   - POST /search/taskChannel/{id}/execute               显式触发渠道任务执行
 *   - POST /search/taskChannel/{id}/finish                确认渠道任务结束（替代废弃的 commandResult）
 *   - POST /search/taskChannel/{id}/results               保存搜索结果落库（含 taskResumes 映射）
 *   - POST /resume/task/{taskResumeId}/detail             任务级简历详情保存
 *   - POST /resume/queryTaskScoreList                     任务级查分（替代 /resume/queryScoreList）
 *
 * 所有请求走 src/api/request.js 的 axios 实例，自动带 cookie satoken。
 */

import service from "src/api/request";

/**
 * 创建一个任务。
 *
 * @param {object} payload
 * @param {string} payload.chatId            职位会话 ID（必填）
 * @param {string} [payload.positionId]      IHR 职位 ID 快照
 * @param {'INITIAL'|'CONTINUE'|'RESTART'} payload.taskType
 * @param {string} [payload.sourceTaskId]    上游任务 ID（**CONTINUE / RESTART 必传**）。
 *   来源：TaskCompletionCard 模板根 div 的 `data-task-id`，由 ChatCard 通过
 *   aggregate-search payload.originalTaskId 透传过来。
 *   语义：
 *     - CONTINUE：新任务在上游任务的 resultSet 上**追加**（"保留并增量搜索"）
 *     - RESTART ：清掉上游任务的 visible 结果集，新任务从头来（"清空并重新搜索"）
 *     - INITIAL ：首次创建，不传
 * @param {'FIRST_OPEN'|'CHAT'|'USER_CLICK'|'SYSTEM'} [payload.triggerSource]
 * @param {Array<{
 *   businessChannel: 'SEARCH'|'RECOMMEND',
 *   channelSubType: 'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN',
 *   searchConditionId: string,
 *   searchTaskConfig?: string  // JSON 文本，透传给前端 actionRunner
 * }>} payload.channels
 * @returns {Promise<{ data: { taskId, taskStatus, resultSetId, channels: [...] } }>}
 */
export function createSearchTask(payload) {
  return service.post("/search/task/create", payload);
}

/**
 * 拉当前活跃任务（启动 / SSE 断线恢复 / 用户切回主页时用）。
 *
 * 返回规则：
 *   - 无任务：data=null
 *   - 有任务：结构同 createSearchTask 返回体
 *   - 排序口径：RUNNING > WAITING > RESTING，同状态按创建时间升序
 */
export function getCurrentSearchTask() {
  return service.get("/search/task/current");
}

/**
 * 查询当前用户的任务队列 + 预计时间（API 协议 §5.3.2.1）。
 *
 * 用途：客户端展示队列、预计开始时间、预计结束时间。
 * 调用时机：
 *   1. 应用进入主页时（初始化）
 *   2. 任务启动时（runTask 开头）
 *
 * 返回 data 形态：
 *   {
 *     totalCount: number,
 *     maxQueueCount: 20,
 *     queueFull: boolean,
 *     items: Array<{
 *       taskId, chatId, taskType, taskStatus,
 *       queuePosition, canExecuteNow, blockedReason, nextExecutableTime,
 *       estimatedDurationMinutes, estimatedStartTime, estimatedEndTime, channels
 *     }>
 *   }
 *   items 排序：RUNNING 优先，其次按排队顺序
 */
export function getTaskQueue() {
  return service.get("/search/task/queue");
}

/**
 * 显式触发某个渠道任务进入执行阶段。
 *
 * 调用时机：SearchTasks/runTask 启动后，对任务里**每个 channel** 调一次，告诉后端
 * "前端已经准备好执行这个 channel"。后端可能据此分配资源、启动 SSE 推送或排队等。
 *
 * 一般在 patchChannel(WAITING → RUNNING) 之后调，fire-and-forget 不阻塞主流程。
 *
 * @param {string|number} taskChannelId
 * @returns {Promise<{ data: { accepted?: boolean, taskChannelStatus?: string } }>}
 *   实际响应字段以后端定义为准
 */
export function postExecuteChannel(taskChannelId) {
  return service.post(`/search/taskChannel/${encodeURIComponent(taskChannelId)}/execute`);
}

/**
 * 回传 STEP_COMMAND 执行结果。
 *
 * status 取值：
 *   - RECEIVED / RUNNING  → 渠道保持 RUNNING
 *   - SUCCESS / SKIPPED   → 渠道推进到 COMPLETED
 *   - FAILED / TIMEOUT    → 渠道推进到 FAILED（需带 error）
 *
 * @param {string} taskChannelId
 * @param {object} payload
 *   - taskId / searchConditionId / commandType（必填，从 SSE.data.context 取）
 *   - instructionId / step                    （从 SSE.data.step 取）
 *   - status                                  （必填）
 *   - items / pageMeta / snapshot             （可选，调试 / 摘要）
 *   - error                                   （FAILED/TIMEOUT 时必填）
 */
export function postCommandResult(taskChannelId, payload) {
  return service.post(
    `/search/taskChannel/${encodeURIComponent(taskChannelId)}/commandResult`,
    payload
  );
}

/**
 * 确认渠道任务结束（API 协议 §5.3.5）—— 替代废弃的 commandResult。
 *
 * 在结果保存完成后**显式确认当前渠道任务结束**，或在登录失效/人机验证/账号异常等场景
 * 下异常终止任务。后端据此推进 task 状态机：
 *   - 若任务还有下一个渠道 → 返回 nextCommandExpected=true + nextTaskChannelId
 *   - 若整个任务都完成 → 后端发 TASK_DONE，task.taskStatus 推进到 COMPLETED
 *
 * @param {string|number} taskChannelId
 * @param {object} payload
 *   - status: 'COMPLETED' | 'FAILED' | 'STOPPED'  必填
 *   - errorCode: 'LOGIN_EXPIRED' | 'HUMAN_VERIFICATION_REQUIRED' | 'ACCOUNT_ABNORMAL' |
 *                'CHANNEL_PAGE_UNAVAILABLE' | 'USER_INTERRUPTED' | ...  （FAILED/STOPPED 时建议传）
 *   - errorMessage: string                                              （可选错误描述）
 * @returns {Promise<{ data: {
 *   accepted: boolean,
 *   nextCommandExpected: boolean,
 *   nextTaskChannelId?: string,
 *   taskId: string,
 *   taskChannelId: string,
 *   taskStatus: string,
 *   taskChannelStatus: string
 * }}>}
 */
export function postFinishChannel(taskChannelId, payload) {
  return service.post(
    `/search/taskChannel/${encodeURIComponent(taskChannelId)}/finish`,
    payload
  );
}

/**
 * 落库一批搜索结果。
 *
 * 规则：
 *   - finished=false：只保存一批，渠道仍在 RUNNING
 *   - finished=true ：渠道结果保存完毕（零结果时也可空 resultItems）
 *
 * @param {string} taskChannelId
 * @param {object} payload
 *   - chatId / taskId / searchConditionId / businessChannel / channelSubType（必填）
 *   - serializeChannel: 'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'
 *   - filterByRead    : boolean
 *   - finished        : boolean
 *   - resultItems     : Array<{ rawResume: {...} }>
 */
export function postSearchResults(taskChannelId, payload) {
  return service.post(`/search/taskChannel/${encodeURIComponent(taskChannelId)}/results`, payload);
}

/**
 * 任务级简历详情保存（在业务侧 saveResumeDetailPlus 之后调）。
 *
 * 协议：docs/05-api-contract.md §5.3.6
 *
 * @param {string|number} taskResumeId  来自 postSearchResults 返回的 taskResumes[i].taskResumeId
 *                                       注意：不是 resume.id，也不是 resumeBlindId
 * @param {object} payload
 *   - serializeChannel : 旧详情反序列化通道名（如 'BOSS' / 'ZHILIAN'）
 *   - channelSubType   : 平台子类型 'BOSS' | 'ZHILIAN' | 'JOB51' | 'LIEPIN'
 *   - content          : 原始详情内容（对应旧 saveResumeDetailPlus.content）
 *   - resume           : { id: resumeBlindId, outId: 平台简历 ID }
 * @returns {Promise<{ success: 'success' }>}  Response.success()，不返业务字段
 */
export function postTaskResumeDetail(taskResumeId, payload) {
  return service.post(`/resume/task/${encodeURIComponent(taskResumeId)}/detail`, payload);
}

/**
 * 按任务结果查分（替代旧 /resume/queryScoreList）。
 *
 * 协议：docs/05-api-contract.md §5.3.7
 *
 * 跟老接口的关键区别：
 *   - 参数：taskResumeIds 而不是 resumeBlindIds（必须先有 taskResumeId 映射）
 *   - 返回：data[].scoreStatus 字段（WAITING / SCORING / SUCCESS / FAILED / NOT_SUPPORTED）
 *     scoreStatus 比 score 字段更精确判定"是否要继续轮询"
 *
 * @param {Array<string|number>} taskResumeIds
 * @returns {Promise<{ data: Array<{
 *   taskResumeId, resumeBlindId, score, scoreJson,
 *   scoreStatus: 'WAITING' | 'SCORING' | 'SUCCESS' | 'FAILED' | 'NOT_SUPPORTED'
 * }>}>}
 */
export function postTaskScoreList(taskResumeIds) {
  return service.post("/resume/queryTaskScoreList", { taskResumeIds });
}

/**
 * 按任务 ID 查询任务级结果（任务完成卡片点"查看结果"时拉数据用）。
 *
 * 路径：POST /search/task/results/query
 *
 * @param {string|number} taskId  任务 ID（从 TaskCompletionCard 模板根 div 的
 *                                 data-task-id 拿）
 * @returns {Promise<{ data: { total: number, list: Array<...> } }>}
 *          list[] 形态：每条含 taskResumeId / taskId / taskChannelId /
 *          searchConditionId / businessChannel / channelSubType / duplicateFlag /
 *          visibleInResultSet / resumeBlind（ResumeBlindVO 投影）
 */
export function queryTaskResults(searchTaskId) {
  return service.post("/search/task/results/query", { searchTaskId });
}

export default {
  createSearchTask,
  getCurrentSearchTask,
  getTaskQueue,
  postExecuteChannel,
  postCommandResult,
  postFinishChannel,
  postSearchResults,
  postTaskResumeDetail,
  postTaskScoreList,
  queryTaskResults
};
