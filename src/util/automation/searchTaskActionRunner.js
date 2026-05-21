/**
 * 任务化搜索 STEP_COMMAND 的前端执行器
 *
 * 后端通过 SSE 推送 `STEP_COMMAND` 时，附带 `actionList`，前端按 actionCode 分发执行。
 *
 * ⚠️ Phase A 状态：**只占位 + 模拟成功**。
 *   - 收到任何 actionCode 都 console.log 并立即返回 SUCCESS
 *   - 目的：让"创建任务 → SSE 收指令 → 回 commandResult → 后端推下一指令 / 切下一渠道"
 *     整条 SSE 协议链路先跑通
 *   - Phase B 再把 actionCode 一一对接到真实业务（BossJobInfoManager / bossRecommend.js /
 *     cdpInputDispatcher / siteNetworkCapture 等）
 *
 * actionCode 白名单（设计目标，详见 docs/10-frontend-task-sse-integration.md §6）：
 *   - OPEN_CHANNEL_PAGE       打开招聘站 tab
 *   - CHECK_LOGIN_STATUS      检查渠道登录态
 *   - FILL_SEARCH_CONDITION   填充搜索条件并搜索（旧 actionCode: boss.fillSearchCondition）
 *   - SUBMIT_SEARCH           提交搜索
 *   - COLLECT_VISIBLE_ITEMS   采集可见候选人
 *   - OPEN_RECOMMEND_PAGE     打开推荐牛人页（旧 actionCode: boss.openRecommend）
 *
 * 实际 SSE 里可能混现"白名单 actionCode"和"旧的 `<channel>.<step>` 形式"。
 * 这里两套都接，只是都暂时打 log + SUCCESS。
 */

/**
 * 串行执行 actionList。
 *
 * Phase A → B 过渡策略：
 *   - 整条 actionList 里只要出现"搜索 / 推荐 / 采集"性质的 actionCode，
 *     就**一次性**触发完整的"真实聚合搜索"流程（refreshSearchCondition + executeSearch +
 *     可选 doFetchRecommend）—— 通过 store getAggregateSearchExecutor 拿 IndexPage
 *     注入的执行器。等所有 channel 跑完才 resolve。
 *   - 这是简化方案：不严格按后端 STEP 一步一步映射到前端动作，而是"整条 STEP_COMMAND
 *     视为'启动一次聚合搜索'"。这样能让"后端 SSE 推 STEP → 前端真跑搜索 → 回 SUCCESS"链路
 *     立刻可用，等 Phase B 后端的 actionCode 字典稳定再做细粒度映射。
 *   - 非搜索类 actionCode（如 OPEN_CHANNEL_PAGE / CHECK_LOGIN_STATUS）保持占位 SUCCESS。
 *
 * @param {Array<{ actionCode: string, params?: object, ... }>} actionList
 * @param {{
 *   companyId?, searchConditionId, taskId, taskChannelId,
 *   businessChannel: 'SEARCH'|'RECOMMEND',
 *   channelSubType: 'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN',
 *   searchTaskConfig?: string
 * }} context  SSE message.data.context
 * @returns {Promise<{
 *   items: Array, pageMeta: object, snapshot: object,
 *   actionLogs: Array<{ actionCode, status, elapsedMs, message? }>
 * }>}
 */
export async function runActionList(actionList, context) {
  const actionLogs = [];
  const list = Array.isArray(actionList) ? actionList : [];
  console.log(
    `[searchTaskRunner] runActionList: ${list.length} actions, channel=${context?.channelSubType} business=${context?.businessChannel} taskChannelId=${context?.taskChannelId}`
  );

  // 1) 判定是否含"搜索 / 推荐"类动作
  const isSearchRelated = list.some((a) => isSearchAction(a?.actionCode));

  if (isSearchRelated) {
    const log = await runRealSearchOnce(context);
    actionLogs.push(log);
    if (log.status === 'FAILED') {
      throw Object.assign(new Error(log.message || 'real search failed'), {
        code: 'ACTION_FAILED',
        actionCode: 'AGGREGATE_SEARCH',
        actionLogs
      });
    }
    return { items: [], pageMeta: {}, snapshot: {}, actionLogs };
  }

  // 2) 非搜索类 actionList → 老占位流程（OPEN_CHANNEL_PAGE 等）
  for (const action of list) {
    const log = await runSingleActionStub(action, context);
    actionLogs.push(log);
    if (log.status !== 'SUCCESS') {
      throw Object.assign(new Error(log.message || `action ${log.actionCode} failed`), {
        code: 'ACTION_FAILED',
        actionCode: log.actionCode,
        actionLogs
      });
    }
  }
  return { items: [], pageMeta: {}, snapshot: {}, actionLogs };
}

/**
 * 判断 actionCode 是否触发"真实聚合搜索"路径。
 * 涵盖后端两套命名：
 *   - 设计目标白名单：FILL_SEARCH_CONDITION / SUBMIT_SEARCH / COLLECT_VISIBLE_ITEMS / OPEN_RECOMMEND_PAGE
 *   - 当前 ihire-solution 实际：boss.fillSearchCondition / boss.openRecommend / boss.collectXxx
 */
function isSearchAction(actionCode) {
  if (!actionCode || typeof actionCode !== 'string') return false;
  return /search|recommend|fill_?condition|submit_?search|collect_?visible|fillsearch|opensearch|openrecommend/i.test(
    actionCode
  );
}

/**
 * 调 IndexPage 注入的"真实聚合搜索 executor"跑一次。
 * executor 内部用 store.aggregateSearchInFlight 做防重入。
 */
async function runRealSearchOnce(context) {
  const startedAt = Date.now();
  // 动态 import 避免循环依赖（searchTaskActionRunner 不要静态依赖 store）
  let executor;
  let chatId = '';
  try {
    const { default: store } = await import('src/store');
    executor = store.getters.getAggregateSearchExecutor;
    chatId = store.getters.getLatestChatId || '';
  } catch (e) {
    return {
      actionCode: 'AGGREGATE_SEARCH',
      status: 'FAILED',
      elapsedMs: Date.now() - startedAt,
      message: 'load store failed: ' + (e?.message || e)
    };
  }
  if (typeof executor !== 'function') {
    return {
      actionCode: 'AGGREGATE_SEARCH',
      status: 'FAILED',
      elapsedMs: Date.now() - startedAt,
      message: 'aggregateSearchExecutor 未就绪（IndexPage 还没 mount？）'
    };
  }
  // selectedModules：按 context.businessChannel 推断；推荐分支没 jobId 时只跑 search
  const businessChannel = context?.businessChannel;
  const selectedModules = {
    search: businessChannel === 'SEARCH' || businessChannel == null,
    recommend: businessChannel === 'RECOMMEND'
  };
  console.log(
    `[searchTaskRunner] runRealSearchOnce → executor(chatId=${chatId}, modules=${JSON.stringify(selectedModules)})`
  );
  try {
    const res = await executor({
      chatId,
      selectedModules,
      // 推荐场景的 BOSS jobId 由 IndexPage 内部从 actionPanel 状态拿；SSE 触发的没这个上下文 —— 留空
      matchedBossJobId: null,
      resumeCount: null
    });
    const status = res?.status || 'SUCCESS';
    console.log(`[searchTaskRunner] runRealSearchOnce 完成: status=${status}`);
    return {
      actionCode: 'AGGREGATE_SEARCH',
      status: status === 'SUCCESS' || status === 'SKIPPED' ? 'SUCCESS' : 'FAILED',
      elapsedMs: Date.now() - startedAt,
      message: res?.message || ''
    };
  } catch (e) {
    return {
      actionCode: 'AGGREGATE_SEARCH',
      status: 'FAILED',
      elapsedMs: Date.now() - startedAt,
      message: e?.message || String(e)
    };
  }
}

/**
 * 非搜索类 action 的占位实现（保留 Phase A 行为）。
 * Phase B 接入参考：
 *   - 'OPEN_CHANNEL_PAGE' → window.api.automation.openOrActivate
 *   - 'CHECK_LOGIN_STATUS' → siteNetworkCapture 抓 /wapi/hunter/checkAuth
 */
async function runSingleActionStub(action) {
  const startedAt = Date.now();
  const actionCode = action?.actionCode || 'UNKNOWN';
  console.log(
    `[searchTaskRunner]   ▶ ${actionCode} (stub)`,
    action?.params ? { params: action.params } : ''
  );
  await new Promise((r) => setTimeout(r, 100));
  console.log(`[searchTaskRunner]   ✓ ${actionCode} stubbed-SUCCESS`);
  return {
    actionCode,
    status: 'SUCCESS',
    elapsedMs: Date.now() - startedAt,
    message: 'Phase A stub'
  };
}

export default { runActionList };
