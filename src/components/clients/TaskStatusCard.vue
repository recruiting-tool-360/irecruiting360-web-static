<!--
  TaskStatusCard.vue

  聚合搜索任务进度卡片（真实状态版，替代旧 mock）

  显示的步骤行**完全跟随 task.channels 动态生成**，跟搜索结果列表 tab 显示的渠道一致：
    - 搜索牛人卡片：[分析关键词] + 每个参与的 SEARCH channel 一行 + [汇总] + [完毕]
    - 推荐牛人卡片：[校对岗位 / 分析关键词 / 获取列表 / AI 匹配 / 汇总 / 完毕]（仅 BOSS-RECOMMEND）

  ❌ 旧版（已废弃）会硬编码三行 BOSS/智联/51job，即使任务里没有 BOSS 也会渲染"BOSS 检索"行
       灰色 skipped，看起来仍像"BOSS 在跑"——用户反馈"都没开 BOSS 为什么还有"，根因在此
  ✅ 新版每个步骤行都由 task.channels[i].channelSubType 决定，没启用的渠道完全不出现

  状态推进数据源（reactive，来自 SearchTasks store）：
    - 任务级 task.taskStatus：WAITING / RUNNING / COMPLETED / FAILED / STOPPED
    - 渠道级 channel.taskChannelStatus：WAITING / RUNNING / COMPLETED / FAILED
    - task.results.length / task.results.totalCount → 已抓取人数

  跟旧版 `pushAndAnimateExecutionLog`（定时器手动 1.2s 推进 step）的本质区别：
    - 旧版：mock，与真实搜索进度无关
    - 本卡片：steps[].status 由 task.channels[].taskChannelStatus 决定，reactive
-->
<template>
  <!--
    任务创建失败（forceStopped=true 由 ChatCard 的 pendingCreate watch 标记）：
    单独显示"任务创建失败，请重试"，让用户知道点了启动但没成功
  -->
  <ExecutionLog
    v-if="!task && forceStopped"
    :content="initContent"
    :steps="initSteps"
    :data="{ isStopped: false }"
  />

  <!--
    ★ 用户要求：排队中（taskStatus === 'WAITING'）不显示状态卡片，
       要等任务真正开始执行（RUNNING / RESTING / 终态）才插入卡片。
    本组件 v-show=false 时 ChatCard 里的 message bubble 看起来就是没东西 —
    这个气泡仍然挂在 internalMessages 里（pending binding / sessionStartedTaskIds
    等回填逻辑依赖它）；只是视觉上不出现，等 task 推进到 RUNNING 时就立刻显形。

    场景覆盖：
      - 没 taskId（占位刚 push、create 接口还没回）→ 不显示
      - task 存在但 taskStatus === WAITING（已 create 成功但在队列前面排队）→ 不显示
      - task 进入 RUNNING / RESTING（执行中 / 短歇）/ 终态 → 正常显示
  -->
  <template v-else-if="!task || task.taskStatus === 'WAITING'">
    <!-- 故意留空，让 ChatCard 的消息气泡视觉上不出现 -->
  </template>

  <!-- 搜索牛人流程卡 + 推荐牛人流程卡（按 kind 决定渲染哪一段） -->
  <div v-else class="task-status-card-wrap">
    <ExecutionLog
      v-if="showSearch"
      :content="searchCardContent"
      :steps="searchCardSteps"
      :data="cardData"
    />
    <ExecutionLog
      v-if="showRecommend"
      :content="recommendCardContent"
      :steps="recommendCardSteps"
      :data="cardData"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import ExecutionLog from 'src/components/clients/ExecutionLog.vue';

const props = defineProps({
  taskId: { type: [String, Number], default: '' },
  /** 任务创建失败时由 ChatCard 的 pendingCreate 监听器设置，直接显示失败态 */
  forceStopped: { type: Boolean, default: false },
  /**
   * 卡片渲染范围：
   *   - 'search'    只渲染"搜索牛人数据获取流程"段
   *   - 'recommend' 只渲染"推荐牛人数据获取流程"段
   *   - 'all'       同时渲染两段（向后兼容）
   * 默认 'all'。ChatCard 会按 selectedModules 给每段单独 push 一张占位卡片，
   * 让两个流程在视觉上是两个独立的聊天气泡（用户要求）。
   */
  kind: { type: String, default: 'all' }
});

const store = useStore();

const task = computed(() => {
  if (!props.taskId) return null;
  const getter = store.getters['SearchTasks/getTaskById'];
  if (typeof getter !== 'function') return null;
  return getter(props.taskId) || null;
});

const initContent = computed(() =>
  props.forceStopped ? '任务创建失败' : '正在初始化任务...'
);
const initSteps = computed(() =>
  props.forceStopped
    ? [{ title: '任务创建失败，请重试', status: 'skipped' }]
    : [{ title: '等待后端分配任务编号', status: 'processing' }]
);

/* ============== 工具：channel 状态映射 ============== */

const CHANNEL_LABEL = {
  BOSS: 'BOSS直聘',
  ZHILIAN: '智联招聘',
  JOB51: '前程无忧',
  LIEPIN: '猎聘'
};

/** ExecutionLog step.status 枚举：complete / processing / pending / skipped */
function statusForChannel(c) {
  if (!c) return 'pending';
  switch (c.taskChannelStatus) {
    case 'COMPLETED': return 'complete';
    case 'FAILED': return 'skipped';
    case 'STOPPED': return 'skipped';
    case 'SKIPPED': return 'skipped'; // 后端未返回该渠道（Phase A 限制），视觉同 skipped
    case 'RUNNING': return 'processing';
    case 'WAITING':
    case 'RESTING':
    default:
      return 'pending';
  }
}

function findChannel(channels, subType) {
  return (channels || []).find((c) => c.channelSubType === subType) || null;
}

function isChannelDone(c) {
  if (!c) return false;
  return (
    c.taskChannelStatus === 'COMPLETED' ||
    c.taskChannelStatus === 'FAILED' ||
    c.taskChannelStatus === 'STOPPED' ||
    c.taskChannelStatus === 'SKIPPED'
  );
}

function channelLabel(channelSubType) {
  return CHANNEL_LABEL[channelSubType] || channelSubType || '未知渠道';
}

/* ============== 按业务类型拆分 channels ============== */

const searchChannels = computed(() =>
  (task.value?.channels || []).filter((c) => c.businessChannel === 'SEARCH')
);
const recommendChannels = computed(() =>
  (task.value?.channels || []).filter((c) => c.businessChannel === 'RECOMMEND')
);
const hasSearch = computed(() => searchChannels.value.length > 0);
const hasRecommend = computed(() => recommendChannels.value.length > 0);

const showSearch = computed(() => hasSearch.value && (props.kind === 'search' || props.kind === 'all'));
const showRecommend = computed(() => hasRecommend.value && (props.kind === 'recommend' || props.kind === 'all'));

/* ============== 总人数（"已抓取 N 数据"步骤用） ============== */

const totalResultsCount = computed(() => {
  const t = task.value;
  if (!t) return 0;
  // store 里 results 是数组（pushResults 累积）；如果未来后端单独 push totalCount 字段也兼容
  if (typeof t.totalResultsCount === 'number') return t.totalResultsCount;
  if (Array.isArray(t.results)) return t.results.length;
  return 0;
});

/* ============== AI 分析状态（评分 + 任务队列合并信号） ============== */

/**
 * 是否有 AI 分析任务在跑：
 *   - scoreAutoUpdater 在轮询分数
 *   - OR AsyncTaskQueueManager 的"AI 任务状态监视器"队列里还有任务
 *
 * 任意一个 active 都视为"AI 分析进行中"。两个都歇了才算分析完成。
 *
 * ⚠️ aiScoringActive 是**全局**信号，跨 chat 串扰（任意一个 chat 的 AI 在跑都 true）。
 *    本卡片自身判定步骤推进时**必须**用 aiActiveForThisTask（带 chat 维度），
 *    见下方 isAiAnalyzingForChat getter 用法。
 */
const aiScoringActive = computed(() => !!store.getters.getAiAnalyzingActive);
const aiScoringEverStarted = computed(() => {
  return aiScoringActive.value || (store.getters.getAiAnalyzingPending || 0) > 0;
});

/**
 * 本任务是否处于 AI 分析阶段。
 *
 * 现实约束：
 *   - channel.taskChannelStatus 在 runTask 末尾才 patch COMPLETED（AI 评分之后），
 *     所以"channels 全 done"这个判定**永远在 AI 评分阶段拿不到 true**。
 *   - 必须靠 AI queue / scoreUpdater 的实时活跃信号（isAiAnalyzingForChat）。
 *
 * 判定：
 *   - task.taskStatus 在活跃状态（RUNNING/WAITING/RESTING/COMPLETED）
 *   - AND 本 task 的 chat 上有 AI 在跑（isAiAnalyzingForChat 已经按 runningTask.chatId
 *     精准绑定，不会被别的任务串扰）
 *
 * task WAITING (排队中) + 没启动 runTask → 全局 AI 不会绑到这个 chat → false ✓
 * task RUNNING + AI queue active 推 chatId=本 chat → true ✓
 */
const aiActiveForThisTask = computed(() => {
  const t = task.value;
  if (!t?.chatId) return false;
  // task 已经异常停止 → 不再认为 AI 在跑
  if (t.taskStatus === 'FAILED' || t.taskStatus === 'STOPPED') return false;
  const getter = store.getters['SearchTasks/isAiAnalyzingForChat'];
  return typeof getter === 'function' ? !!getter(t.chatId) : false;
});

/**
 * 视觉版 channel status：
 *   - 真实状态 != processing → 直接用真实状态（complete/skipped 不动）
 *   - 真实状态 == processing 但 AI 已经在跑 → 视觉提前推进到 complete
 *     （因为 runTask 的时序保证："AI 在跑" ⇒ "数据抓取阶段一定结束"）
 */
function visualStatusForChannel(c) {
  const real = statusForChannel(c);
  if (real === 'processing' && aiActiveForThisTask.value) {
    return 'complete';
  }
  return real;
}

const cardData = computed(() => ({
  isStopped:
    task.value?.taskStatus === 'STOPPED' ||
    task.value?.taskStatus === 'FAILED'
}));

/* ============== 搜索完成判定（与推荐解耦） ============== */

/**
 * ★ 搜索卡完成度**不能**等整任务收敛：同一个任务里搜索 + 推荐两个渠道，推荐还在跑会让
 *   task.taskStatus 一直 RUNNING，导致"搜索其实做完了，搜索卡的汇总/AI评分/完毕却一直 pending"，
 *   跟推荐流程相互"冲突"（用户反馈）。
 *
 *   判定独立信号：
 *     - 整任务 COMPLETED → 搜索当然完成
 *     - 任务里有推荐渠道、且推荐流程已经开始（recommendClientPhase >= OPENING）
 *       → runRealAggregateSearch 是「先搜索 + 搜索 AI，再启动推荐」的串行流程，
 *         推荐一旦开始就代表搜索（含搜索 AI 评分）已跑完 → 搜索卡可独立判完成。
 */
const searchDone = computed(() => {
  const t = task.value;
  if (!t) return false;
  if (t.taskStatus === 'COMPLETED') return true;
  if (!hasRecommend.value) return false; // 纯搜索任务：没收敛就是没完成
  const rank = {
    IDLE: 0, WAITING: 1, OPENING: 2, SELECTING: 3, SELECTED: 4,
    FETCHING: 5, FETCHED: 6, SAVED: 7, SCORING: 8, DONE: 9
  }[recommendClientPhase.value] || 0;
  return rank >= 2; // 推荐已开始 = 搜索已跑完
});

/* ============== 搜索牛人流程卡 ============== */

const searchCardContent = computed(() => {
  const t = task.value;
  if (!t) return '搜索牛人数据获取流程';
  // 标题文案优先看 task 整体状态，避免"全 FAILED 也被算成已完成"的误导
  if (t.taskStatus === 'FAILED') return '搜索牛人流程异常停止';
  if (t.taskStatus === 'STOPPED') return '搜索牛人流程已停止';
  if (searchDone.value) {
    // 搜索整体完成（含"推荐已开始 ⇒ 搜索 AI 已跑完"）→ 不再显示"评分中"
    return '搜索牛人流程已完成';
  }
  // 任务 RUNNING + 本任务搜索 AI 还在评分 → "评分中"
  if (aiActiveForThisTask.value) return '搜索完成，正在 AI 评分中...';
  // RUNNING / WAITING / RESTING → 默认"进行中"文案
  return '搜索牛人数据获取流程';
});

/**
 * 搜索卡步骤生成（动态：跟随 task.channels）：
 *
 *   [0] 正在分析画像关键词...        → 任意 search channel 已 RUNNING/终态 → complete
 *   [1..N] 正在并发检索 <平台名>... → 每个参与的 SEARCH channel 一行（按 task 顺序）
 *                                       status 跟 channel.taskChannelStatus 一一对应
 *   [N+1] 已抓取全渠道 X 符合条件...  → 所有 search channel 终态 → complete + 真实 X
 *   [N+2] 搜索牛人流程执行完毕       → 同上
 *
 * 没启用的渠道根本不会出现在 task.channels 里（dispatchTaskStore 已按 settings 过滤），
 * 所以这里也不会渲染出该渠道的行 —— 跟搜索结果列表 tab 显示的渠道完全一致。
 */
const searchCardSteps = computed(() => {
  const t = task.value;
  if (!t) return [];

  const channels = searchChannels.value;

  // 任务刚创建、channels 数组还没下发时的占位
  if (channels.length === 0) {
    return [{ title: '正在准备搜索任务...', status: 'processing' }];
  }

  // 每个参与的渠道一行（按 task.channels 顺序）
  //
  // ⚠️ 用 visualStatusForChannel（而不是 statusForChannel）：
  //    channel.taskChannelStatus 实际由 runTask 末尾才 patch COMPLETED（runTask 时序：
  //    抓数据 → 等 AI 分析 → postCommandResult → patchChannel COMPLETED），中间"等 AI 分析"
  //    阶段最长 10 分钟，channel 一直 RUNNING。用户已经感知到"完成卡片出来 + AI 评分中"，
  //    UI 还在显示"BOSS 数据抓取中..."——visualStatusForChannel 在 AI active 时把
  //    RUNNING 提前标 complete，对齐用户感知。
  // 末尾几步：失败看整任务；成功看 searchDone（与推荐解耦，见 searchDone 注释）
  const isTaskFailed = t.taskStatus === 'FAILED' || t.taskStatus === 'STOPPED';
  const done = searchDone.value;

  // 每个参与的渠道一行。搜索整体已完成（done）→ 渠道行收尾为 complete（推荐还在跑也不影响搜索卡）。
  const channelSteps = channels.map((c) => {
    let st = visualStatusForChannel(c);
    if (done && st !== 'skipped') st = 'complete';
    return {
      title: `正在并发检索 ${channelLabel(c.channelSubType)} 平台的实时人才数据...`,
      status: st
    };
  });

  // step[0] "分析关键词"：只要 task 已经创建就视为完成
  const anyStarted = true;

  // 渠道（视觉上）是否全 done：包括"AI 活跃下的提前推进"。这决定了"汇总"步是否可以推进。
  const allChannelsVisuallyDone = channels.every((c) => {
    const st = visualStatusForChannel(c);
    return st === 'complete' || st === 'skipped';
  });

  // "汇总各渠道结果" / "已抓取全渠道 N..."
  let summaryStatus = 'pending';
  let summaryTitle = '正在汇总各渠道结果...';
  if (done) {
    summaryStatus = 'complete';
    summaryTitle = `已抓取全渠道 ${totalResultsCount.value} 符合条件人才数据`;
  } else if (isTaskFailed) {
    summaryStatus = 'skipped';
    summaryTitle = '搜索流程异常停止，结果未完整';
  } else if (allChannelsVisuallyDone) {
    summaryStatus = 'complete';
    summaryTitle = `已抓取全渠道 ${totalResultsCount.value} 符合条件人才数据`;
  }

  // "正在 AI 评分与画像匹配..."
  //   - 搜索完成（含"推荐已开始 ⇒ 搜索 AI 已跑完"）→ complete
  //   - 任务失败 → skipped
  //   - 搜索 AI 还在跑（本任务）→ processing
  let aiScoreStatus = 'pending';
  if (done) {
    aiScoreStatus = 'complete';
  } else if (isTaskFailed) {
    aiScoreStatus = 'skipped';
  } else if (aiActiveForThisTask.value) {
    aiScoreStatus = 'processing';
  }

  // "执行完毕"：搜索完成才 complete（与推荐无关）
  const finishStatus = done ? 'complete' : isTaskFailed ? 'skipped' : 'pending';

  return [
    { title: '正在分析画像关键词...', status: anyStarted ? 'complete' : 'pending' },
    ...channelSteps,
    { title: summaryTitle, status: summaryStatus },
    { title: '正在 AI 评分与画像匹配...', status: aiScoreStatus },
    { title: '搜索牛人流程执行完毕', status: finishStatus }
  ];
});

/* ============== 推荐牛人流程卡 ============== */

const recommendCardContent = computed(() => {
  const t = task.value;
  if (!t) return '推荐牛人数据获取流程';
  const bossRec = findChannel(recommendChannels.value, 'BOSS');
  if (!bossRec) return '推荐牛人数据获取流程';
  if (bossRec.taskChannelStatus === 'COMPLETED') return '推荐牛人流程已完成';
  if (bossRec.taskChannelStatus === 'FAILED') return '推荐牛人流程异常停止';
  if (bossRec.taskChannelStatus === 'STOPPED') return '推荐牛人流程已停止';
  return '推荐牛人数据获取流程';
});

/**
 * 推荐卡 6 步骤的真实状态推导（粒度受限：推荐只有一个 channel = BOSS-RECOMMEND）：
 *
 *   阶段 0 (channel.status === WAITING/null)：
 *     → step[0..5] 全部 pending
 *
 *   阶段 1 (channel.status === RUNNING)：
 *     → step[0..2] complete，step[3] processing，step[4..5] pending
 *     （视觉上让前面几个步骤显示已经执行过，跟 ihraisaas mock 节奏对齐）
 *
 *   阶段 2 (channel.status === COMPLETED)：
 *     → step[0..5] 全部 complete，"已抓取 N" 展示真实总数
 *
 *   阶段 3 (channel.status === FAILED)：
 *     → step[0..2] complete，step[3..5] skipped（灰色）
 *
 *   注：未来如果后端 SSE STEP_COMMAND 推送了细粒度的 stepIndex / actionLog，可以在这里改成
 *       根据 t.currentStepIndex 精确推进每一个 step。当前只有 channel 级状态信号。
 */
/**
 * 推荐卡 6 步骤的客户端真实进度推导（核心：用 SearchTasks/getRecommendClientPhase
 * 而不是 channel.taskChannelStatus，跟后端 SSE 解耦）。
 *
 * 原因：后端通常一开始就把所有 channel（包括 RECOMMEND）标成 RUNNING，但 RECOMMEND
 * 客户端实际还没启动（等搜索 AI 完成）。如果用 channelStatus 推进，会出现"推荐还没
 * 开始，AI 行就 processing"的假象。
 *
 * phase → step 映射（每步从 pending → processing → complete）：
 *   step 0 (校对 BOSS 关联职位)     : OPENING/SELECTING 时 processing，SELECTED+ complete
 *   step 1 (分析画像关键词)         : SELECTED 时 processing，FETCHING+ complete
 *   step 2 (获取推荐候选人列表)     : FETCHING 时 processing，FETCHED+ complete
 *   step 3 (AI 语义匹配初筛)        : SCORING 时 processing，DONE 时 complete
 *   step 4 (汇总推荐结果)           : SCORING 时 processing，DONE 时 complete
 *   step 5 (执行完毕)               : DONE 时 complete
 *
 * channel.taskChannelStatus 仅作为兜底：
 *   - COMPLETED → 所有步骤强制 complete（防止 client phase 没正确更新时卡住）
 *   - FAILED/STOPPED → 前 3 步 complete，后面 skipped
 */
const recommendClientPhase = computed(() => {
  const t = task.value;
  if (!t?.taskId) return 'IDLE';
  const getter = store.getters['SearchTasks/getRecommendClientPhase'];
  return typeof getter === 'function' ? getter(t.taskId) : 'IDLE';
});

const recommendCardSteps = computed(() => {
  const t = task.value;
  if (!t) return [];

  const bossRec = findChannel(recommendChannels.value, 'BOSS');
  if (!bossRec) return [];

  const phase = recommendClientPhase.value;
  const st = bossRec.taskChannelStatus;
  const isChannelDone = st === 'COMPLETED';
  const isChannelFailed = st === 'FAILED' || st === 'STOPPED' || phase === 'FAILED';

  // phase 等级：把 select 流程拆出来，对应 step 0 / step 1 的细分推进
  //   IDLE=0 / WAITING=1 / OPENING=2 / SELECTING=3 / SELECTED=4 /
  //   FETCHING=5 / FETCHED=6 / SAVED=7 / SCORING=8 / DONE=9
  // 兼容旧 phase 名：没 SELECTING/SELECTED 的老数据走 OPENING(2) / FETCHING(5) 路径
  const phaseRank = {
    IDLE: 0, WAITING: 1, OPENING: 2, SELECTING: 3, SELECTED: 4,
    FETCHING: 5, FETCHED: 6, SAVED: 7, SCORING: 8, DONE: 9
  }[phase] || 0;

  function s(idx) {
    if (isChannelDone || phase === 'DONE') return 'complete';
    if (isChannelFailed) return idx <= 2 ? 'complete' : 'skipped';

    if (idx === 0) {
      // 校对岗位：OPENING/SELECTING 时 processing，SELECTED+ complete
      if (phaseRank >= 4) return 'complete';
      if (phaseRank >= 2) return 'processing';
      return 'pending';
    }
    if (idx === 1) {
      // 分析关键词：SELECTED 时 processing，FETCHING+ complete
      if (phaseRank >= 5) return 'complete';
      if (phaseRank >= 4) return 'processing';
      return 'pending';
    }
    if (idx === 2) {
      // 获取候选人列表：FETCHING 时 processing，FETCHED+ complete
      if (phaseRank >= 6) return 'complete';
      if (phaseRank >= 5) return 'processing';
      return 'pending';
    }
    if (idx === 3) {
      // AI 语义匹配：SCORING 时 processing，DONE 时 complete
      if (phaseRank >= 9) return 'complete';
      if (phaseRank >= 8) return 'processing';
      return 'pending';
    }
    if (idx === 4) {
      // 汇总：SCORING 时 processing，DONE complete
      if (phaseRank >= 9) return 'complete';
      if (phaseRank >= 8) return 'processing';
      return 'pending';
    }
    // step 5：完毕，只有 DONE 才 complete
    return 'pending';
  }

  const summaryTitle = (isChannelDone || phase === 'DONE')
    ? `已抓取全渠道 ${totalResultsCount.value} 符合条件人才数据`
    : isChannelFailed
      ? '推荐结果获取失败'
      : '正在汇总推荐结果...';

  return [
    { title: '正在校对 BOSS直聘 关联职位特征...', status: s(0) },
    { title: '正在分析画像关键词...', status: s(1) },
    { title: '正在获取平台实时推荐候选人列表...', status: s(2) },
    { title: '正在完成 AI 语义匹配初筛...', status: s(3) },
    { title: summaryTitle, status: s(4) },
    { title: '推荐牛人流程执行完毕', status: s(5) }
  ];
});
</script>

<style scoped>
.task-status-card-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
