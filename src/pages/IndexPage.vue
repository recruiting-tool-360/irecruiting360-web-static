<template>
  <q-page class="q-pa-none" :class="{ 'index-page-embedded': embeddedMode }" ref="pageRef">
    <!-- 浮动操作面板：客户端嵌入式模式下隐藏，避免与 WorkspaceContainer 内的 ChatCard 重复 -->
    <floating-action-panel
      v-if="!embeddedMode"
      v-model:show-right-nav="showRightNav"
      @chat-message="handleChatMessage"
      :container-width="pageWidth"
      :container-height="pageHeight"
      :container-top="pageTop"
      :container-left="pageLeft"
      @mounted="handlePanelMounted"
    />

    <!--
      embeddedMode（客户端 / iHR 融合）：
        1:1 还原 ihraisaas/src/App.tsx 第 958-1020 行 的右侧工作台结构
        - WorkspaceContainer 提供大白卡片 + 共享 workspace-toolbar
        - 内部用 v-show 在 chat 视图（ChatCard 嵌入式）与 results 视图（AISearch）之间互斥切换
        - "启动聚合搜索"等动作可由 ChatCard emit 触发 view='results'，AISearch 内的"返回对话"按钮触发 view='chat'
    -->
    <template v-if="embeddedMode">
      <WorkspaceContainer
        :title="currentJobTitle"
        :code="currentJobCode"
        :auto-search-completed="autoSearchCompleted"
        :show-clear-chat="currentView === 'chat'"
        @clear-chat="handleClearChat"
      >
        <!-- chat 视图 -->
        <div v-show="currentView === 'chat'" class="workspace-view">
          <ChatCard
            ref="embeddedChatRef"
            embedded
            visible
            :expanded="true"
            :messages="[]"
            @aggregate="currentView = 'results'"
            @view-results="handleViewResults"
            @aggregate-search="handleAggregateSearch"
          />
        </div>

        <!--
          说明：
          - 点"查看结果"（test 按钮）→ ChatCard emit view-results → 切到 results 视图（不搜索）
          - 点"启动聚合搜索" → ChatCard 先 emit aggregate-search（后台触发真实搜索）
            再 mock 动画跑完后 emit view-results → 切到 results 视图（此时真实结果大概率已回来）
        -->

        <!--
          results 视图：
            1. 顶部 sub-header（返回对话按钮）
            2. 搜索条件区（JobSearchFilter，跟浏览器模式原有功能保持一致）
            3. 列表区（AISearch，现有不动）
        -->
        <div v-show="currentView === 'results'" class="workspace-view">
          <!--
            results 视图 sub-header（参考 ihraisaas Result/ResultMainHeader.tsx）：
              [返回对话] | [ 搜索牛人 ] [ 推荐牛人 ]
          -->
          <div class="results-sub-header">
            <button class="back-to-chat" type="button" @click="currentView = 'chat'">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              <span>返回对话</span>
            </button>
            <!--
              tab 切换器：只有"推荐牛人"tab 可见时（即本次任务同时有 SEARCH + RECOMMEND）
              才显示整组切换器。只有一个 tab 的话不显示，避免冗余 UI。
            -->
            <template v-if="recommendTabVisible">
              <div class="result-tab-divider" />
              <div class="result-tabs">
                <button
                  type="button"
                  class="result-tab"
                  :class="{ active: activeResultTab === 'search' }"
                  @click="activeResultTab = 'search'"
                >搜索牛人</button>
                <!--
                  推荐牛人 tab 显示条件（参考 recommendTabVisible computed）：
                    - BOSS 在 settings 启用
                    - 本次任务包含 RECOMMEND channel
                -->
                <button
                  type="button"
                  class="result-tab"
                  :class="{ active: activeResultTab === 'recommend' }"
                  @click="activeResultTab = 'recommend'"
                >推荐牛人</button>
              </div>
            </template>
          </div>

          <!--
            搜索牛人：现有 JobSearchFilter + AISearch
            推荐牛人：BOSS 推荐列表（来自 Vuex store.BossRecommendData，按 jobId 分桶），仅 BOSS 启用时渲染
          -->
          <div class="results-body">
            <div v-show="activeResultTab === 'search'" class="result-tab-pane">
              <!--
                "查看结果"和"聚合搜索完后自动到结果页"统一走 AISearch + JobSearchFilter +
                ResumeList 渲染——只有数据填充时机不同：
                  - 聚合搜索：各 channel 业务侧 fetch → channelDataSavePlus → ChannelConfig
                  - 查看结果：handleViewResults 直接拿 /search/task/results/query 灌 ChannelConfig
                两条路径 UI 完全一致，不再有独立的 TaskResultsView（已废弃）。
              -->
              <JobSearchFilter
                ref="jobSearchFilterRef"
                v-model:searchState="searchState"
                @search="searchJobList"
                @reset="resetSearchConnect"
              />
              <AISearch ref="aiSearchRef" v-model:search-state="searchState"></AISearch>
            </div>
            <div v-if="recommendTabVisible" v-show="activeResultTab === 'recommend'" class="result-tab-pane">
              <RecommendList
                :job-id="currentRecommendJobId"
                :bucket="currentRecommendBucket"
                :loading="!!currentRecommendBucket?.fetching"
                @retry="retryFetchRecommend"
                @refresh="retryFetchRecommend"
                @open-geek="onOpenGeek"
              />
            </div>
          </div>
        </div>
      </WorkspaceContainer>
    </template>

    <!-- 浏览器 + 插件模式：保持原有渲染 -->
    <template v-else>
      <div v-if="panelLoaded">
        <JobSearchFilter ref="jobSearchFilterRef" v-model:searchState="searchState" @search="searchJobList" @reset="resetSearchConnect" />
        <AISearch ref="aiSearchRef" v-model:search-state="searchState"></AISearch>
      </div>
      <div v-else class="full-width full-height flex flex-center column">
        <q-spinner color="primary" size="3em" />
        <div class="q-mt-md text-subtitle1 text-grey-8">加载中...</div>
      </div>
    </template>
  </q-page>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useStore } from 'vuex';
import JobSearchFilter from 'src/pages/search/JobSearchFilter.vue';
import notify from 'src/util/notify';
import {createSearchState} from "src/pjo/dto/request/SearchStateConfig";
import AISearch from "pages/search/AISearch.vue";
import FloatingActionPanel from 'src/components/common/FloatingActionPanel.vue';
import WorkspaceContainer from 'src/components/clients/WorkspaceContainer.vue';
import ChatCard from 'src/components/common/ChatCard.vue';
import {getCurrentConditionByChatId} from "src/api/chat/ChatApi";
import { runBossRecommend } from 'src/util/automation/bossRecommend';
import { openChannelUrl } from 'src/util/openChannelLoginUrl';
import { pluginAllUrls } from 'src/pluginSrc/config/PluginRequestManager';
import RecommendList from 'src/components/clients/RecommendList.vue';
const store = useStore();

/* ===== 客户端 / iHR 融合：嵌入式工作台模式 ===== */

/** 用户的 plan 是 PlanA → 启用嵌入式 WorkspaceContainer 布局 */
const visibleThirdSwitch = computed(() => store.getters.getUserInfo?.extendData?.plan || '');
const embeddedMode = computed(() => ['PlanA'].includes(visibleThirdSwitch.value));

/**
 * 嵌入式工作台视图状态：**按 chatId 分桶**记录每个职位独立的视图状态
 *
 *   - viewByChatId[chatId] = 'chat' | 'results'
 *   - activeResultTabByChatId[chatId] = 'search' | 'recommend'
 *
 * 用户诉求：在职位 A 搜索完看结果，切到职位 B 应该默认显示聊天（B 没搜过），
 * 再切回 A 还能看到结果页（保留 A 的视图）。
 *
 * 用 ref({}) 普通对象，computed getter/setter 让外部代码 `currentView = 'results'`
 * 这种赋值语义不变。getter 缺省时返回 'chat'。
 */
const viewByChatId = ref({});
const activeResultTabByChatId = ref({});

/**
 * 每个 chat 当前正在查看的任务结果 taskId。
 *
 * 问题：选 A → 查看结果（ALL.data 填充）→ 选 B（ALL.data 被 selectChat 清空）→ 选 A
 * → currentView='results'（viewByChatId 恢复）但 ALL.data 空了 → 空白。
 *
 * 修复：每次 handleViewResults 把 taskId 记到这里；watch chatId 变化时，
 * 如果切回的 chat 是 'results' 视图 AND ALL.data 为空 AND 有记录的 taskId
 * → 自动重新加载任务结果数据。
 */
const viewingTaskIdByChatId = ref({});


// 注意：computed getter/setter 里直接读 store getter，避免依赖下方还没定义的 latestChatIdComp
const currentView = computed({
  get() {
    const cid = store.getters.getLatestChatId;
    if (!cid) return 'chat';
    return viewByChatId.value[cid] || 'chat';
  },
  set(val) {
    const cid = store.getters.getLatestChatId;
    if (!cid) return;
    viewByChatId.value = { ...viewByChatId.value, [cid]: val };
  }
});

const activeResultTab = computed({
  get() {
    const cid = store.getters.getLatestChatId;
    if (!cid) return 'search';
    return activeResultTabByChatId.value[cid] || 'search';
  },
  set(val) {
    const cid = store.getters.getLatestChatId;
    if (!cid) return;
    activeResultTabByChatId.value = { ...activeResultTabByChatId.value, [cid]: val };
  }
});

/**
 * BOSS 是否启用（settings 里勾选）——推荐牛人功能依赖 BOSS
 * 判定逻辑跟 AIProfileActionPanel.vue 的 bossEnabled 完全一致
 */
const bossEnabled = computed(() => {
  const cfgList = store.getters.getUserChannelConfig || [];
  const cfg = Array.isArray(cfgList) ? cfgList.find((c) => c?.key === 'BOSS') : null;
  if (!cfg) return true; // 兼容：cfg 缺失时默认启用（避免 store 还没 hydrate 时整块 UI 闪烁）
  return cfg.enableConfig !== false;
});

/**
 * 推荐牛人 tab 是否显示——综合判定：
 *   1. BOSS 在 settings 里启用（推荐依赖 BOSS）
 *   2. **当前 chat 的最新任务里**确实有 RECOMMEND channel
 *      （= 用户这次启动聚合搜索时勾选了"推荐牛人"且 BOSS jobId 匹配）
 *
 * 旧版只看 bossEnabled → 用户没勾推荐时仍能看到 tab（误导）。
 * 现在 task.channels 里没有 RECOMMEND → tab 直接不渲染。
 */
const hasRecommendForCurrentChat = computed(() => {
  const cid = store.getters.getLatestChatId;
  if (!cid) return false;
  const getter = store.getters['SearchTasks/getLatestTaskByChat'];
  const t = typeof getter === 'function' ? getter(cid) : null;
  if (!t || !Array.isArray(t.channels)) return false;
  return t.channels.some((c) => c && c.businessChannel === 'RECOMMEND');
});

const recommendTabVisible = computed(() => bossEnabled.value && hasRecommendForCurrentChat.value);

// 推荐 tab 不可见时如果当前激活的是 recommend，自动回到 search（避免空白页）
watch(recommendTabVisible, (visible) => {
  if (!visible && activeResultTab.value === 'recommend') {
    activeResultTab.value = 'search';
  }
});

/**
 * 切换 chat 时，如果切回的 chat 处于"结果页"视图 AND ALL.data 为空（被 selectChat 清掉了）
 * AND 有记录的 taskId → 自动重新加载任务结果数据，避免空白。
 *
 * 复现路径：A 查看结果 → 选 B（ALL.data 被 selectChat 清空）→ 选 A → 结果页空白
 */
watch(
  () => store.getters.getLatestChatId,
  async (newChatId, oldChatId) => {
    if (!newChatId || newChatId === oldChatId) return;
    // 只在嵌入式模式（有 WorkspaceContainer）下处理
    if (!embeddedMode.value) return;
    // 切回的 chat 是否处于结果视图
    if ((viewByChatId.value[newChatId] || 'chat') !== 'results') return;
    // ALL.data 是否为空（已被清掉）
    const existing = store.getters.getChannelConfByAll?.data;
    if (Array.isArray(existing) && existing.length > 0) return;
    // 有没有记录的 taskId
    const savedTaskId = viewingTaskIdByChatId.value[newChatId];
    if (!savedTaskId) return;

    console.log(`[IndexPage] chatId 切到 ${newChatId}，结果页数据丢失，自动重载 taskId=${savedTaskId}`);
    // 复用 handleViewResults 的加载逻辑（不带 source 就走数据加载，不做 view 切换判断）
    // 直接构造一个带 taskId 的 payload 触发 API 加载
    await handleViewResults({ taskId: savedTaskId, source: 'task_completion_card', chatId: newChatId });
  }
);

/** 推荐 tab 当前展示的 BOSS jobId（在 handleAggregateSearch 里设进 store；这里只读取） */
const currentRecommendJobId = computed(() => store.getters.getCurrentRecommendJobId);
const currentRecommendBucket = computed(() => store.getters.getCurrentBossRecommend);

/** 上次拉推荐的入参，存起来供"刷新/重试"按钮复用 */
const lastRecommendArgs = ref(null);

async function retryFetchRecommend() {
  if (!lastRecommendArgs.value) {
    console.warn('[IndexPage] retryFetchRecommend: no last args, skip');
    return;
  }
  await doFetchRecommend(lastRecommendArgs.value);
}

/**
 * 推荐 tab 点击候选人卡片 → 新开 BOSS 详情 tab。
 *
 * 跟搜索 tab `bossHandleViewDetail` 走同一条客户端路径：
 *   openChannelUrl('boss', url)
 *     → recruitBridge.openSiteWindow IPC
 *     → tabManager.openOrActivateSiteTab('boss', url)
 *     → 新 tab（同 URL 已存在则复用 + activate）
 *
 * URL 拼法跟 src/pluginSrc/util/ChannelUrlUtil.js → bossUrl() 完全一致——
 * 只是搜索结果是从 resume.originalResumeUrlInfo 取 securityId，
 * 推荐结果直接从 geek.geekCard.securityId 取（BOSS 推荐 API 真实字段，
 * 详见 docs/boss地址资料.md L602）。
 */
function onOpenGeek(geek) {
  const c = geek?.geekCard || {};
  const name = c.geekName || geek?.geekName || '匿名';
  const securityId = c.securityId;
  if (!securityId) {
    console.warn('[IndexPage] open geek 失败：geek.geekCard.securityId 缺失', geek);
    return;
  }
  // 跟 ChannelUrlUtil.bossUrl 同款 URL 模板
  const url =
    pluginAllUrls.BOSS.geekDetailUrl +
    `?isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${securityId}`;
  console.log(`[IndexPage] open geek: name=${name} → ${url}`);
  // openChannelUrl 内部按 isElectronClient 判断走 IPC（新 tab）or window.open（新窗口）
  openChannelUrl('boss', url).catch((e) => {
    console.warn('[IndexPage] openChannelUrl(boss) 失败:', e?.message || e);
  });
}

async function doFetchRecommend(args) {
  const jobId = args?.encryptJobId;
  if (!jobId) return;

  // 串行化：如果同时勾了搜索 + 推荐，先 await 搜索完成再开始推荐，避免 BOSS 同账号
  // 同时跑"搜索 BOSS API"+"推荐 BOSS tab"双流量被风控识别为爬虫。
  // 详见 handleAggregateSearch 注释。
  if (args?.awaitBeforeStart && typeof args.awaitBeforeStart.then === 'function') {
    console.log('[IndexPage] doFetchRecommend 等搜索完成后再启动推荐...');
    try {
      await args.awaitBeforeStart;
    } catch (e) {
      // 搜索失败不阻塞推荐（用户至少能拿到推荐数据）
      console.warn('[IndexPage] 搜索 promise rejected，推荐流程继续:', e?.message || e);
    }
    console.log('[IndexPage] 搜索已完成 / 已超时，开始启动推荐流程');
  }

  store.commit('setCurrentRecommendJobId', jobId);
  store.commit('setBossRecommendFetching', { jobId, fetching: true });
  console.log('[IndexPage] runBossRecommend', args);

  // 蒙层：聚合搜索期间锁住所有招聘站 tab，提示"客户端执行中，请勿同步操作"。
  // 蒙层是主进程 WebContentsView，盖在 BOSS view 之上；用户切回主页 tab 不受影响。
  // 浏览器模式（非 Electron）下 window.api.automation 不存在，optional chain 兜底。
  try {
    await window?.api?.automation?.showOverlay?.({
      channelName: 'BOSS直聘'
    });
  } catch (e) {
    console.warn('[IndexPage] showOverlay failed (browser mode?):', e?.message || e);
  }

  // 阶段回调：让用户在 UI 上看到推进
  function onProgress(stage, payload) {
    if (stage === 'opened') {
      console.log('[IndexPage] BOSS 推荐 tab 已打开:', payload?.url);
    } else if (stage === 'dwell') {
      console.log(`[IndexPage] 拟人 dwell ${payload?.ms}ms 模拟用户加载后停留观察`);
    } else if (stage === 'verified') {
      console.log('[IndexPage] BOSS 推荐 verify 通过:', payload);
    } else if (stage === 'firstPage' && payload?.geekList?.length > 0) {
      // 先把首屏数据落进 store，让推荐 tab 立刻显示
      store.commit('setBossRecommendList', {
        jobId,
        geekList: payload.geekList,
        totalSize: payload.totalSize,
        hasMore: payload.hasMore,
        fetchedAt: Date.now()
      });
      // commit 完上面那次 mutation 会把 fetching 重置为 false（按 mutation 设计），
      // 但拟人操作还在跑，重新标记 fetching 让 UI 继续显示进度提示
      store.commit('setBossRecommendFetching', { jobId, fetching: true });
    } else if (stage === 'humanized') {
      console.log('[IndexPage] 拟人浏览完成:', payload);
    }
  }

  let res;
  try {
    res = await runBossRecommend({
      encryptJobId: jobId,
      targetCount: args?.targetCount || 10,
      humanizeOpts: args?.humanizeOpts || {},
      onProgress,
      stopAfter: args?.stopAfter
    });
  } finally {
    // 流程结束 / 失败都要关蒙层；放 finally 防止 throw 时蒙层卡住
    try {
      await window?.api?.automation?.hideOverlay?.();
    } catch (e) {
      console.warn('[IndexPage] hideOverlay failed:', e?.message || e);
    }
  }

  if (!res || !res.ok) {
    console.warn('[IndexPage] runBossRecommend failed:', res?.errorCode, res?.message);
    store.commit('setBossRecommendError', {
      jobId,
      error: { code: res?.errorCode, message: res?.message }
    });
    return;
  }
  // 用首屏 + humanize accumulated 的去重合并结果写回 store
  store.commit('setBossRecommendList', {
    jobId,
    geekList: res.geekList || [],
    totalSize: res.firstPage?.totalSize,
    hasMore: res.firstPage?.hasMore,
    fetchedAt: Date.now()
  });
  console.log(
    `[IndexPage] BOSS 推荐流程完成 jobId=${jobId} total=${(res.geekList || []).length} humanize=${JSON.stringify(res.humanize || res.humanizeError)}`
  );
}

/** 同步已就绪 badge（绿色），跟 ihraisaas selectedJob.isAutoSearchCompleted 一致；先 mock false */
const autoSearchCompleted = ref(false);

/** 当前选中的职位（用于 workspace-toolbar 左侧标题 + code badge） */
const latestChatIdComp = computed(() => store.getters.getLatestChatId);
const currentChatEntity = computed(() => {
  const id = latestChatIdComp.value;
  if (!id) return null;
  const getById = store.getters.getChatById;
  return typeof getById === 'function' ? getById(id) : null;
});
const currentJobTitle = computed(() => {
  const name = currentChatEntity.value?.name || '';
  if (!name) return '';
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : name.trim();
});
const currentJobCode = computed(() => {
  const name = currentChatEntity.value?.name || '';
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[2].trim() : '';
});

const embeddedChatRef = ref(null);

/**
 * 把 embedded ChatCard 的 ref commit 到 store，让其他组件（LeftMenu 等）
 * 通过 `store.getters.getChatCardRefValue` 拿到正确的实例
 * （浏览器模式下这个 ref 由 FloatingActionPanel commit，嵌入式模式由这里 commit）
 */
watch(embeddedChatRef, (ref) => {
  if (ref) {
    store.commit('changeChatCardRef', ref);
  }
}, { immediate: false });

function handleClearChat() {
  // 让 ChatCard 调自己的 handleNewChat / 清空逻辑
  // TODO: 待 ChatCard 暴露 clearMessages 后调；暂时只切回 chat 视图
  currentView.value = 'chat';
}

/**
 * 嵌入式模式：用户点"启动聚合搜索"时，ChatCard 会立刻 emit aggregate-search，
 * 让后端搜索和 mock 动画并发执行。本函数：
 *   1. 触发真实后端搜索（refreshAndSearchFN）—— 不切视图
 *   2. 如果用户勾选了"推荐牛人"且选了 matchedBossJobId，则打开 BOSS 推荐牛人 tab
 *      （src/util/automation/bossRecommend.js → window.api.automation.openOrActivate）
 *
 * 视图切换由后续的 `view-results` 事件在 mock 动画跑完后触发，避免在结果页里
 * 看到又一遍 loading。
 *
 * @param {{
 *   chatId: string,
 *   selectedModules?: { search?: boolean, recommend?: boolean },
 *   matchedBossJobId?: string|null,
 *   resumeCount?: number|null,
 *   content?: string
 * }} payload
 */
/**
 * 把"启动聚合搜索"事件转成任务化 store 的 create 请求。
 *
 * 跟旧业务流（refreshSearchCondition + executeSearch + doFetchRecommend）并行运行：
 *   - store create 成功：LeftMenu badge 随后端 SSE 推送变化
 *   - store create 失败（后端 API 未 ready / 网络错）：静默 catch，旧业务流不受影响
 *
 * 设计意图：让 Phase A 链路能渐进上线，不阻塞用户日常使用。
 */
/**
 * 真实聚合搜索执行器（可复用入口）：
 *   - 跑搜索：refreshSearchCondition + aiSearchRef.executeSearch（含 BOSS 递归翻页等）
 *   - 跑推荐：runBossRecommend（需要 BOSS encryptJobId）
 *
 * 用途：
 *   1. handleAggregateSearch 用户手动点击 → 调本函数
 *   2. SearchTasks actionRunner 收到后端 STEP_COMMAND → 调本函数（让后端 SSE 任务驱动也能跑真搜索）
 *
 * 状态：
 *   通过 store.aggregateSearchInFlight 防重入。已在跑时直接 return 'SKIPPED'。
 *
 * @param {object} opts
 * @param {string} opts.chatId
 * @param {object} [opts.selectedModules]    { search?: boolean, recommend?: boolean }，缺省都按 true
 * @param {string} [opts.matchedBossJobId]   推荐时需要的 BOSS encryptJobId
 * @param {number} [opts.resumeCount]        推荐想要的简历数
 * @returns {Promise<{ status: 'SUCCESS'|'SKIPPED'|'FAILED', message?: string }>}
 */
async function runRealAggregateSearch(opts) {
  // 注意：outer scope 有同名 `chatId` computed ref（=== getLatestChatId）
  // 这里用 effectiveChatId 避免阴影
  const effectiveChatId = opts?.chatId || chatId.value || '';
  if (!effectiveChatId) {
    return { status: 'FAILED', message: 'no chatId' };
  }
  if (store.getters.getAggregateSearchInFlight) {
    console.log('[IndexPage] runRealAggregateSearch SKIPPED: 已有聚合搜索在跑');
    return { status: 'SKIPPED', message: 'already in flight' };
  }
  const modules = opts?.selectedModules || {};
  const searchChecked = modules.search !== false;
  const recommendChecked = !!modules.recommend;
  const jobId = opts?.matchedBossJobId;

  store.commit('setAggregateSearchInFlight', true);
  try {
    // 搜索：跟 handleAggregateSearch 同步骤的"refreshSearchCondition + executeSearch"
    let searchPromise = null;
    if (searchChecked) {
      if (!jobSearchFilterRef.value || typeof jobSearchFilterRef.value.refreshSearchCondition !== 'function') {
        console.warn('[IndexPage] runRealAggregateSearch: jobSearchFilterRef 不可用');
      } else {
        searchPromise = (async () => {
          await jobSearchFilterRef.value.refreshSearchCondition(effectiveChatId);
          if (aiSearchRef.value && typeof aiSearchRef.value.executeSearch === 'function') {
            await aiSearchRef.value.executeSearch(searchState.value);
          }
        })();
      }
    }
    // 推荐：和 handleAggregateSearch 同步骤的 doFetchRecommend；await 搜索串行
    let recommendPromise = null;
    if (recommendChecked && jobId) {
      const targetCount = Number(opts?.resumeCount) > 0 ? Number(opts.resumeCount) : 10;
      const args = {
        encryptJobId: jobId,
        targetCount,
        stopAfter: 'firstPage',
        humanizeOpts: {},
        awaitBeforeStart: searchPromise
      };
      recommendPromise = doFetchRecommend(args);
    }
    if (searchPromise) await searchPromise;
    if (recommendPromise) await recommendPromise;
    console.log('[IndexPage] runRealAggregateSearch 完成 chatId=', effectiveChatId);
    return { status: 'SUCCESS' };
  } catch (e) {
    console.error('[IndexPage] runRealAggregateSearch 异常:', e?.message || e);
    return { status: 'FAILED', message: e?.message || String(e) };
  } finally {
    store.commit('setAggregateSearchInFlight', false);
  }
}

/**
 * 等 store.getters.getSearchConditionId 变成 truthy（首次启动聚合搜索时，
 * searchConditionId 要等 runRealAggregateSearch 内部 executeSearch 跑过一次才会被 commit）。
 *
 * 用 200ms 轮询而非 watch —— 在 setup 之外用 watch 可能触发 vue 警告，
 * 而且这里就是 setTimeout 配合 dispatchTaskStore fire-and-forget 调用，
 * 轮询更直白可控。超时返回 null。
 */
function waitForSearchConditionId(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const POLL_INTERVAL = 200;
    const check = () => {
      const id = store.getters.getSearchConditionId;
      if (id) {
        resolve(String(id));
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, POLL_INTERVAL);
    };
    check();
  });
}

async function dispatchTaskStore({ chatIdToSearch, searchChecked, recommendChecked, jobId, taskType = 'INITIAL', sourceTaskId = null, payload }) {
  // 立刻 set pendingCreate 标记，让业务侧 channelDataSavePlus → postBatchResultsToTaskChannel
  // 知道"任务正在 create 中"，需要短轮询等任务出现，而不是立刻当"任务化未启动"丢调用。
  // 注意：必须在 await 之前 set，不然下面任意 await 都会让搜索请求先到。
  if (chatIdToSearch) {
    store.commit('SearchTasks/setPendingCreate', chatIdToSearch);
  }
  try {
    const channels = [];
    // 关键：searchConditionId 只有在 runRealAggregateSearch 里 executeSearch 跑过一次后才会
    // 被 commit 到 store（首次启动时它是 null）。如果直接拿 null 发给后端，会得到
    // SYSTEM_005: "searchConditionId must be provided"。这里 watch 一下，等就绪再继续。
    const condId = await waitForSearchConditionId(30000);
    if (!condId) {
      console.warn(
        '[IndexPage] dispatchTaskStore: searchConditionId 30s 内未就绪（runRealAggregateSearch 可能失败），跳过任务创建'
      );
      return { ok: false, errorCode: 'NO_SEARCH_CONDITION', message: 'searchConditionId 未就绪' };
    }

    // 从 settings 读取启用的渠道，**判定逻辑跟 AISearch.vue 的 getChannelDisable / ResumeCard.vue
    // 的 getChannelDisable 完全一致**，确保搜索结果列表 tab 和任务卡片显示的渠道严格对齐：
    //
    //   - LIEPIN：永远视为禁用（项目里硬规则，没人会在任务里包含猎聘）
    //   - 其他渠道：在 cfgList 里没找到 → 视为未启用（严格，避免漏判误报）
    //              找到了 → 直接 truthy 判断 enableConfig
    //
    // 旧实现 `cfg.enableConfig !== false` 太宽松：undefined / null 也算启用，导致用户截图里
    // BOSS 在 settings 没勾的情况下仍被加进 channels —— 这里改严格。
    const cfgList = store.getters.getUserChannelConfig || [];
    const isEnabled = (key) => {
      if (key === 'LIEPIN') return false; // 跟 AISearch/ResumeCard 一致：LIEPIN 全局禁用
      if (!Array.isArray(cfgList) || cfgList.length === 0) {
        // settings 还没 hydrate（首次进入未拉到配置）→ 整张任务先不创建，避免随便发 BOSS
        console.warn('[IndexPage] dispatchTaskStore: userChannelConfig 为空，无法判定渠道启用状态');
        return false;
      }
      const cfg = cfgList.find((c) => c?.key === key);
      if (!cfg) return false;
      return !!cfg.enableConfig;
    };

    console.log(
      '[IndexPage] dispatchTaskStore: cfgList=',
      cfgList.map((c) => `${c?.key}:${c?.enableConfig === true ? 'on' : c?.enableConfig === false ? 'off' : 'undef'}`).join(',')
    );

    // 搜索：为每个启用的渠道生成一个 SEARCH channel。
    // 候选渠道白名单：BOSS / ZHILIAN / JOB51（LIEPIN 在 isEnabled 里直接 false 了，留着只为兼容）。
    if (searchChecked) {
      const candidateChannels = ['BOSS', 'ZHILIAN', 'JOB51'];
      for (const key of candidateChannels) {
        if (!isEnabled(key)) {
          console.log(`[IndexPage] dispatchTaskStore: 跳过 ${key}（未启用）`);
          continue;
        }
        channels.push({
          businessChannel: 'SEARCH',
          channelSubType: key,
          searchConditionId: condId
        });
      }
    }
    // 推荐：仅 BOSS 支持，且需要 BOSS 启用 + 用户勾了推荐 + 有 jobId。
    if (recommendChecked && jobId && isEnabled('BOSS')) {
      channels.push({
        businessChannel: 'RECOMMEND',
        channelSubType: 'BOSS',
        searchConditionId: condId,
        searchTaskConfig: JSON.stringify({
          relatedPositionValue: jobId,
          maxSearchCount: Number(payload?.resumeCount) > 0 ? Number(payload.resumeCount) : 10
        })
      });
    }
    if (channels.length === 0) {
      console.warn('[IndexPage] dispatchTaskStore: 无启用渠道，跳过任务创建');
      return { ok: false, errorCode: 'NO_ENABLED_CHANNEL', message: '没有启用的渠道' };
    }
    console.log(
      `[IndexPage] dispatchTaskStore: 实际下发渠道=${channels.map((c) => `${c.channelSubType}-${c.businessChannel}`).join(',')}`
    );
    // taskType:
    //   - 'INITIAL'  首次启动聚合搜索（默认）
    //   - 'RESTART'  来自 TaskCompletionCard "清空并重新搜索" 按钮
    //   - 'CONTINUE' 来自 TaskCompletionCard "保留并增量搜索" 按钮
    // 三者在前端的渠道组装逻辑完全一致，只是落库 search_task.task_type 不一样，
    // 后端基于 taskType 决定是否清空 visible 结果集 / 续在原 resultSet 上追加。
    //
    // sourceTaskId：只有 CONTINUE（保留增量搜索）才传，其他不传。
    const createPayload = {
      chatId: chatIdToSearch,
      positionId: store.getters.getLatestPositionId,
      taskType,
      triggerSource: 'USER_CLICK',
      channels
    };
    if (sourceTaskId && taskType === 'CONTINUE') {
      createPayload.sourceTaskId = sourceTaskId;
    }
    const res = await store.dispatch('SearchTasks/create', createPayload);
    if (res?.ok) {
      console.log(`[IndexPage] SearchTasks/create ok, taskId=${res.taskId}`);
    } else {
      console.warn('[IndexPage] SearchTasks/create 失败:', res?.errorCode, res?.message);
    }
    return res || { ok: false, errorCode: 'UNKNOWN', message: 'create 无返回值' };
  } catch (e) {
    console.warn('[IndexPage] SearchTasks/create 异常:', e?.message || e);
    return { ok: false, errorCode: 'EXCEPTION', message: e?.message || String(e) };
  } finally {
    // 无论成功/失败/异常，都清掉 pendingCreate 标记，避免桥接工具继续无意义等待
    if (chatIdToSearch) {
      store.commit('SearchTasks/clearPendingCreate', chatIdToSearch);
    }
  }
}

function handleAggregateSearch(payload) {
  const chatIdToSearch = payload?.chatId || chatId.value;
  if (!chatIdToSearch) {
    console.warn('[IndexPage] aggregate-search: 没拿到 chatId，跳过真实搜索');
    return;
  }
  // taskType: INITIAL（默认） | RESTART（清空并重新搜索） | CONTINUE（保留并增量搜索）
  // 由 ChatCard 在 TaskCompletionCard 按钮触发时显式带过来；普通"启动聚合搜索"按钮不传 → 走 INITIAL
  // 三者数据来源都灌到 ChannelConfig store，AISearch 统一渲染；后端基于 taskType
  // 决定是否清空 visible 结果集 / 续在原 resultSet 上追加（前端不用做对应清理）。
  const taskType = payload?.taskType || 'INITIAL';

  const modules = payload?.selectedModules || {};
  const searchChecked = modules.search !== false;
  const recommendChecked = !!modules.recommend;
  const jobId = payload?.matchedBossJobId;

  // ===== 拒绝重复点击 =====
  //
  // 同一职位（chatId）已有 RUNNING / WAITING / RESTING 任务时，提示用户等待。
  // 数据源：SearchTasks store 的 canCreateForChat getter（基于 taskStatus 判定）。
  // Phase A：仅在已成功创建过任务时才会拒绝；后端 API 未 ready 时 store 里没记录，
  // 这条判断自动放行，不影响旧业务流程。
  const canCreate = store.getters['SearchTasks/canCreateForChat'];
  if (typeof canCreate === 'function' && !canCreate(chatIdToSearch)) {
    // 判断具体原因（搜索阶段 / AI 评分阶段），给用户更精确的提示
    // 走 isAiAnalyzingForChat（带 latestChatId 护栏）跟 canCreateForChat 判定保持一致，
    // 避免全局 AI 信号串扰到非当前 chat 的 notify 文案。
    const latestTask = store.getters['SearchTasks/getLatestTaskByChat'](chatIdToSearch);
    const isAiAnalyzingPhase =
      latestTask?.taskStatus === 'COMPLETED' &&
      store.getters['SearchTasks/isAiAnalyzingForChat'](chatIdToSearch);
    if (isAiAnalyzingPhase) {
      console.warn('[IndexPage] aggregate-search 被拒绝：AI 分析还在跑');
      notify.warning('搜索已完成，AI 分析还在进行中，请等分析完成后再启动新任务');
    } else {
      console.warn('[IndexPage] aggregate-search 被拒绝：该职位已有任务在进行中');
      notify.warning('该职位已有搜索任务在进行中，请等待完成后再启动');
    }
    return;
  }

  // ===== 任务 store 创建（**主驱动入口**） =====
  //
  // 新模型：
  //   handleAggregateSearch → dispatchTaskStore → store.dispatch('SearchTasks/create')
  //     → enqueue → runTask 主动跑 aggregateSearchExecutor（= runRealAggregateSearch）
  //     → 跑完后对每个 channel 调 postSearchResults + postCommandResult
  //
  // 不再在这里直接调 runRealAggregateSearch（旧模型是并行跑两路，会造成 race condition：
  //   runTask 内 executor 被 inFlight 拒绝后立刻 postSearchResults，可能拿到不完整的
  //   ChannelConfig 数据）。让 runTask 独家驱动，时序更明确。
  //
  // 但 dispatchTaskStore 内部 waitForSearchConditionId 需要 searchConditionId 就绪——
  // 而 condId 来自 executeSearch 的 saveCondition。所以这里**先调一次 refreshSearchCondition
  // + executeSearch 直到 condId 出现**，让 dispatchTaskStore 不会卡死等条件。
  //
  // 简化做法：handleAggregateSearch 同步触发 runRealAggregateSearch（这次跑完会写 condId），
  // 同时 dispatchTaskStore 等 condId 出现后 create + enqueue。runTask 启动时 executor
  // 已经在跑 → inFlight=true → 返回 SKIPPED 但前一次的搜索结果已经入 ChannelConfig store
  // → runTask 跳过执行直接调接口落库。**仍有 race 但用 await inFlight 收敛**（下面）。
  // sourceTaskId：**只有 CONTINUE（保留增量搜索）才传**，其他 taskType 不传。
  //   - CONTINUE：告诉后端把新任务挂在原 resultSet 上追加结果
  //   - RESTART / INITIAL：不需要关联原任务，传了反而可能触发后端不期望的行为
  const sourceTaskId = (taskType === 'CONTINUE' && payload?.originalTaskId) ? payload.originalTaskId : null;

  dispatchTaskStore({ chatIdToSearch, searchChecked, recommendChecked, jobId, taskType, sourceTaskId, payload })
    .then((res) => {
      if (res && res.ok === false) {
        const silentCodes = ['NO_ENABLED_CHANNEL', 'ALREADY_RUNNING'];
        if (!silentCodes.includes(res.errorCode)) {
          notify.error(`任务创建失败：${res.message || res.errorCode || '未知错误'}`);
        }
      }
    })
    .catch((e) => console.warn('[IndexPage] dispatchTaskStore unexpected:', e?.message || e));

  // 提前拿 condId：dispatchTaskStore 内部等 condId 出现才会调 create。
  // 时机分两种：
  //   A) 没有其它任务在跑 → 直接 runRealAggregateSearch（含 executeSearch 真的去抓数据）。
  //   B) 有其它任务在跑 → 走轻量路径 prepareConditionOnly（只调 saveCondition 拿 condId，
  //      不清 ALL.data 不抓数据），新任务入队后等之前任务跑完，runTask 通过 executor
  //      再真正抓数据。这样不破坏正在跑任务的数据收集。
  const otherTaskRunning = store.state?.SearchTasks?.runningTaskId;
  if (otherTaskRunning) {
    console.log(`[IndexPage] 已有任务 ${otherTaskRunning} 在跑，走轻量路径只保存 condition，新任务入队等待`);
    if (aiSearchRef.value && typeof aiSearchRef.value.prepareConditionOnly === 'function') {
      aiSearchRef.value.prepareConditionOnly().catch((e) => {
        console.error('[IndexPage] prepareConditionOnly threw:', e);
      });
    }
  } else {
    runRealAggregateSearch({
      chatId: chatIdToSearch,
      selectedModules: { search: searchChecked, recommend: recommendChecked },
      matchedBossJobId: jobId,
      resumeCount: payload?.resumeCount
    }).catch((e) => {
      console.error('[IndexPage] runRealAggregateSearch threw:', e);
    });
  }

  if (recommendChecked && !jobId) {
    console.warn(
      '[IndexPage] aggregate-search: 勾选了推荐牛人但 matchedBossJobId 为空，跳过打开 BOSS 推荐页'
    );
  }

  // 3) 决定 results 视图默认 tab：
  //    - 只勾了推荐 → 默认 'recommend'
  //    - 其它情况 → 默认 'search'
  if (recommendChecked && !searchChecked) {
    activeResultTab.value = 'recommend';
  } else {
    activeResultTab.value = 'search';
  }
}

/**
 * ChatCard emit 'view-results' 时的处理。
 *
 * 有两个入口：
 *   1. test 按钮 / 任务自然完成切视图 → payload 可能为空 / 只含 chatId
 *      → 直接切到 results 视图，沿用当前 ChannelConfig 数据
 *   2. TaskCompletionCard "查看结果"按钮 → payload.source='task_completion_card'，
 *      含 taskId 等任务上下文 → 切视图 + 调 /search/task/results/query 拉任务级结果
 *
 * 任务级结果接口的优势：是任务持久化的视图，刷新页面 / 跨会话都能拿到，不依赖
 * channelConf 这种 runtime-only 的状态。
 *
 * @param {object} [payload]
 *   - source : 'task_completion_card' 表示来自任务完成卡片
 *   - taskId : 任务 ID（从 TaskCompletionCard 模板根 div 的 data-task-id 拿）
 *   - 其它任务上下文字段（chatId / taskChannelId 等）当前接口不需要，仅日志用
 */
async function handleViewResults(payload) {
  currentView.value = 'results';
  if (!payload || payload.source !== 'task_completion_card') {
    return;
  }

  // 任务跑期间禁止覆盖 ChannelConfig.ALL.data（会污染正在跑的 runTask 数据收集）。
  // 用户切到其它职位查看老结果时：聊天可以看，但点"查看结果"会改全局 store 灌新数据，
  // 这会让正在跑的 A 任务末尾读到错的数据 → 报 search_result_set_id 没值 → 任务失败。
  // 提示用户等任务跑完再看（loading 通知，不阻塞任务）。
  const runningTaskId = store.state?.SearchTasks?.runningTaskId;
  if (runningTaskId && String(runningTaskId) !== String(payload.taskId)) {
    console.warn(
      `[handleViewResults] 任务 ${runningTaskId} 正在跑，禁止加载其它任务结果 (${payload.taskId})，避免污染数据`
    );
    notify.warning?.('有任务正在进行中，请等任务完成后再查看其它结果');
    return;
  }
  console.log('[handleViewResults] ▶ 开始，payload=', payload);
  console.log('[handleViewResults] aiSearchRef.value=', aiSearchRef.value, 'hasResetFn=', typeof aiSearchRef.value?.resetToAggregateTab);

  // 重置到渠道聚合 tab（不管 store 里有没有数据都要做）
  await nextTick();
  if (aiSearchRef.value && typeof aiSearchRef.value.resetToAggregateTab === 'function') {
    console.log('[handleViewResults] 调用 resetToAggregateTab');
    aiSearchRef.value.resetToAggregateTab().catch(() => {});
  } else {
    console.warn('[handleViewResults] aiSearchRef 或 resetToAggregateTab 不可用！');
  }

  const taskId = payload.taskId;

  // 记住本 chat 当前查看的 taskId，供切回时自动重新加载
  const cid = store.getters.getLatestChatId;
  if (taskId && cid) {
    viewingTaskIdByChatId.value = { ...viewingTaskIdByChatId.value, [cid]: taskId };
  }

  // 优先用 store 里已有的数据（搜索刚完成时数据就在 channelConf.ALL.data）
  // 只有数据为空时才去查 API（例如用户切换了 chat 再回来点"查看结果"）
  const existingData = store.getters.getChannelConfByAll?.data;
  console.log('[handleViewResults] store ALL.data 条数=', existingData?.length ?? 'null');
  if (Array.isArray(existingData) && existingData.length > 0) {
    console.log('[handleViewResults] ✅ store 已有数据，直接用，跳过 API');
    return;
  }
  console.log('[handleViewResults] store 无数据，去查 API');

  if (!taskId) {
    console.warn('[handleViewResults] 缺少 taskId，无法调 /search/task/results/query');
    return;
  }

  try {
    const taskApiMod = await import('src/api/searchTaskApi');
    const taskApi = taskApiMod.default || taskApiMod;
    const resp = await taskApi.queryTaskResults(taskId);

    // 响应结构兼容三种后端常见形态，按优先级匹配：
    //   1) resp.data = { data: [...], totalCount }        ← 跟 §5.3.8 文档 list/total 类似但 key 不同
    //   2) resp.data = { list: [...], total: N }          ← §5.3.8 文档明确写的形态
    //   3) resp.data = [...]                              ← 后端直接返数组
    // 哪种命中走哪种；都不命中给 [] 兜底。
    const pageData = resp?.data;
    let rawList = [];
    let totalCount = 0;
    if (Array.isArray(pageData)) {
      rawList = pageData;
      totalCount = rawList.length;
    } else if (pageData && Array.isArray(pageData.data)) {
      rawList = pageData.data;
      totalCount = Number(pageData.totalCount) || Number(pageData.total) || rawList.length;
    } else if (pageData && Array.isArray(pageData.list)) {
      rawList = pageData.list;
      totalCount = Number(pageData.total) || Number(pageData.totalCount) || rawList.length;
    } else {
      console.warn(
        '[IndexPage] /search/task/results/query 响应结构未识别，pageData=',
        pageData
      );
    }

    // ===== 关键：normalize 成跟老 AISearch 路径完全一致的 resume 形态 =====
    //
    // 老路径（taskResumeBridge.js）落库的简历形态：
    //   { ...ResumeBlindVO字段, id: r.id || tr.resumeBlindId, resumeBlindId, taskResumeId,
    //     channel: '中文desc', channelSubType, searchConditionId, ... }
    //   `id` 是兜底成 resumeBlindId 的——业务侧 AI 评估 / 相似简历 / 分配职位等
    //   全部用 resume.id 当 resumeBlindId 传后端。
    //
    // 新路径 /search/task/results/query 后端响应有两种可能形态：
    //   1) 扁平：把 resumeBlind 字段全部摊到 item 顶层
    //   2) 嵌套：item.resumeBlind = { ...ResumeBlindVO字段 }
    //
    // 不管哪种，统一摊平 + 把 `id` 强制 fallback 成 `resumeBlindId`，这样 ResumeCard
    // 内部 `resume.id` 就等于 blindId，AI 评估 `resumeBlindIds: [props.resumeData.id]`
    // 才能命中后端的评分数据；否则会出现"未能获取评估数据"（接口拿不到分数明细）。
    // channelSubType → 中文 desc 映射，与 ChannelConfig store 的 .desc 字段保持一致
    // BossJobInfo / ZHILIANJobInfo / JOB51JobInfo 的 jobList 用
    //   `allDataConfig.value.data.filter(item => item.channel === channelConfig.value.desc)`
    // 来取数据，所以 channel 字段必须是中文 desc，不能是 'BOSS' / 'ZHILIAN' 等英文 key。
    const SUBTYPE_TO_DESC = {
      BOSS: 'boss直聘',
      ZHILIAN: '智联招聘',
      JOB51: '前程无忧',
      LIEPIN: '猎聘'
    };

    const list = rawList.map((item) => {
      const blind = item?.resumeBlind && typeof item.resumeBlind === 'object'
        ? item.resumeBlind
        : {};
      // 摊平时 item 顶层字段优先（扁平响应里它本身就是 blind 摊平结果）；
      // blind 仅在嵌套响应里补字段。
      const flat = { ...blind, ...item };
      const blindId =
        item.resumeBlindId || blind.resumeBlindId || blind.id || flat.id;
      const channelSubType =
        flat.channelSubType || blind.channelSubType || item.channelSubType;
      // channel 必须是中文 desc（如 'boss直聘'），fallback 到 channelSubType→desc 映射
      const channelDesc =
        flat.channel || blind.channel || SUBTYPE_TO_DESC[channelSubType] || channelSubType || '';
      return {
        ...flat,
        id: blindId,
        resumeBlindId: blindId,
        taskResumeId: item.taskResumeId || flat.taskResumeId,
        channel: channelDesc,
        channelSubType,
        searchConditionId: item.searchConditionId || flat.searchConditionId
      };
    });

    // 按 channelSubType 分组
    const grouped = { ALL: list, BOSS: [], ZHILIAN: [], JOB51: [], LIEPIN: [] };
    for (const item of list) {
      const k = item?.channelSubType;
      if (!k) continue;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(item);
    }
    console.log(
      `[IndexPage] /search/task/results/query ok | taskId=${taskId} totalCount=${totalCount} 分组=`,
      Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]))
    );

    // ===== 关键：把任务结果直接灌进 ChannelConfig store =====
    //
    // 这样"查看结果"和"聚合搜索完后自动到结果页" UI **完全一致**：都走 AISearch +
    // JobSearchFilter + ResumeList，区别只是数据填充时机：
    //   - 聚合搜索时：各 channel 业务侧 fetch + saveSearchPlus → channelDataSavePlus 灌入
    //   - 查看结果时：本函数从 /search/task/results/query 拉到后直接灌入
    //
    // ⚠️ 性能注意：只 commit **真正被消费**的数据，避免冗余 reactive 级联。
    //   - 「ALL.data」是 JobInfo（渠道聚合 tab）+ 所有 XXXJobInfo（BOSS/智联/51/猎聘 tab）
    //     filter 的源——他们都用 `allDataConfig.value.data.filter(item.channel===desc)`，
    //     不读 per-channel .data。所以 per-channel .data **不要 commit**（commit 一次会触发
    //     5 个 XXXJobInfo + 5 个 ResumeList 的 filteredResumes / inViewMap deep watch
    //     连锁反应 → 5×5 = 25 次冗余 reactive 工作 → tab 切换非常卡）。
    //   - 「per-channel dataSize」是 tab 右上角红色 badge `[20] [11] [9]` 用，**要** commit。
    //   - 不再用 TaskResultsView——同一套 AISearch 渲染才是单一事实源头。
    console.log('[handleViewResults] commit 前 ALL.data 条数=', store.getters.getChannelConfByAll?.data?.length);
    // ALL.data 是唯一数据源：BossJobInfo/ZHILIANJobInfo/JOB51JobInfo 都从 ALL.data.filter 取
    // 不再写 per-channel .data（会引入 stale 脏数据问题，见 handleAggregateSearch 注释）
    store.commit('changeChannelConfData', { key: 'ALL', value: list });
    store.commit('changeChannelConfDataSize', { key: 'ALL', value: list.length });
    // tab badge（红色数字）用 per-channel dataSize，但不写 .data
    for (const ch of ['BOSS', 'ZHILIAN', 'JOB51', 'LIEPIN']) {
      store.commit('changeChannelConfDataSize', { key: ch, value: (grouped[ch] || []).length });
    }
    console.log('[handleViewResults] commit 后 ALL.data 条数=', store.getters.getChannelConfByAll?.data?.length);

    // 把任务真正用的 searchConditionId 回填到 store——AI 评估 / 相似简历等接口要用
    const firstWithCondId = list.find((x) => x.searchConditionId);
    if (firstWithCondId?.searchConditionId) {
      store.commit('changeSearchConditionId', firstWithCondId.searchConditionId);
    }

    // ===== 关键：把 taskResumeId 映射同步到 SearchTasks.taskResumeIdMap =====
    //
    // 目的：让 scoreAutoUpdater 走新接口 /resume/queryTaskScoreList（需要 taskResumeIds）
    // 而不是老接口 queryScoreList（老接口对 score=null 没有 terminal 状态 →
    // 每 8s 轮询一次直到超时 50 次，约 7 分钟，造成无效请求循环）。
    //
    // 新接口返回 scoreStatus: 'SUCCESS'|'FAILED'|'NOT_SUPPORTED'|'WAITING'|'SCORING'，
    // FAILED / NOT_SUPPORTED 会被 scoreAutoUpdater 视为终态，从 pendingResumeIds 删掉，
    // 正确结束轮询。
    const taskResumeMappings = list
      .filter((item) => item.resumeBlindId && item.taskResumeId)
      .map((item) => ({ resumeBlindId: String(item.resumeBlindId), taskResumeId: String(item.taskResumeId) }));
    if (taskResumeMappings.length > 0) {
      store.commit('SearchTasks/patchTaskResumeIds', taskResumeMappings);
      console.log('[handleViewResults] patchTaskResumeIds', taskResumeMappings.length, '条映射');
    }

    console.log('[handleViewResults] ✅ 注入完成，list.length=', list.length, '各分组=', { BOSS: grouped.BOSS.length, ZHILIAN: grouped.ZHILIAN.length, JOB51: grouped.JOB51.length });

    // commit 完再等一帧，确认数据没被清掉
    await nextTick();
    console.log('[handleViewResults] nextTick 后 ALL.data 条数=', store.getters.getChannelConfByAll?.data?.length, '(如果变少说明有东西清掉了数据！)');

    // 数据已写入 store，resetToAggregateTab 在函数开头已经调过，无需再调
  } catch (e) {
    console.warn(
      '[IndexPage] /search/task/results/query failed:',
      e?.message || e,
      e?.response?.data
    );
  }
}

// 用户信息
const userInfo = computed(() => store.getters.getUserInfo);
// 搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//aiSearchRef
const aiSearchRefVal = computed(() => store.getters.getAiSearchRefValue);
//当前chat id
const chatId = computed(() => store.getters.getLatestChatId);


//固定条件搜索属性
let searchStateConfig =createSearchState();
const searchState = ref(searchStateConfig);

// 用于控制组件的加载顺序
const panelLoaded = ref(true);

// 处理浮动面板加载完成的事件
const handlePanelMounted = () => {
  console.log('FloatingActionPanel 已加载完成');
  // 适当延迟加载其他组件，确保浮动面板完全渲染
  setTimeout(() => {
    panelLoaded.value = true;
    // 在其他组件加载后更新一次尺寸
    setTimeout(updatePageSize, 100);
  }, 300);
};

// 搜索
const searchJobList = () => {
  console.log('searchJobList', searchState.value);
  // 调用AISearch组件的搜索方法
  if (aiSearchRef.value) {
    if(!aiSearchRefVal.value){
      //初始化ref
      store.commit('changeAiSearchRef', aiSearchRef.value);
    }
    aiSearchRef.value.executeSearch(searchState.value);
  }
};

// 重置搜索
const resetSearchConnect = () => {
  searchState.value = createSearchState();
  jobSearchFilterRef.value.resetCurrentWorkPlace();
  console.log('resetSearchConnect',searchState.value);
};

// 引用AISearch组件
const aiSearchRef = ref(null);
const jobSearchFilterRef = ref(null);

// 页面尺寸相关
const pageRef = ref(null);
const pageWidth = ref(0);
const pageHeight = ref(0);
const pageTop = ref(48); // Header 高度
const pageLeft = ref(280); // 左侧菜单宽度

// 右侧面板相关状态
const showRightNav = ref(false);

// 处理聊天消息
const handleChatMessage = (message) => {
  console.log('收到聊天消息:', message);
  // 在这里可以处理聊天消息，例如发送到后端或显示在界面上
};

// 更新页面尺寸
const updatePageSize = () => {
  if (pageRef.value) {
    const rect = pageRef.value.$el.getBoundingClientRect();
    pageWidth.value = rect.width;
    pageHeight.value = window.innerHeight - pageTop.value; // 使用窗口高度减去顶部位置
    pageTop.value = rect.top;
    pageLeft.value = rect.left;

    // console.log('页面尺寸更新:', {
    //   width: pageWidth.value,
    //   height: pageHeight.value,
    //   top: pageTop.value,
    //   left: pageLeft.value
    // });
  }
};

// 监听窗口大小变化
onMounted(() => {
  // 延迟执行以确保DOM完全加载
  if(jobSearchFilterRef.value){
    store.commit("changeJobSearchFilterRef",  jobSearchFilterRef.value)
  }
  window.addEventListener('resize', updatePageSize);

  // 任务化搜索初始化：严格按顺序执行
  //   1. cleanupZombies：清理本地持久化的"僵尸任务"（createdAt 超过 15 分钟还卡在 RUNNING/
  //      WAITING 的，标记为 STOPPED，避免 LeftMenu badge / ChatCard 卡片显示假状态）。
  //   2. cleanupOrphanRunningAndResume（用户指定的串行流程）：
  //      a) GET /search/task/queue                ← 拉队列
  //      b) 找 taskStatus=RUNNING 且不是本地 runningTaskId 的孤立任务
  //         → 对每个 channel 调 POST /finish { status:'FAILED' }（可能多次）
  //      c) 等所有 finish 完成后再调 GET /search/task/current 拉真正可执行任务
  store.dispatch('SearchTasks/cleanupZombies');
  void store.dispatch('SearchTasks/cleanupOrphanRunningAndResume');

  // 把"真实聚合搜索执行器"暴露到 store，让 SearchTasks actionRunner 在收到
  // 后端 STEP_COMMAND 时能"代用户"启动一次真实搜索。详见 runRealAggregateSearch 注释。
  store.commit('setAggregateSearchExecutor', runRealAggregateSearch);

  // ⚠️ BOSS Playwright 冒烟测试入口已下线（2026-05-18 17:33 实测被风控）。
  // 详见 docs/boss地址资料.md 反爬警告区。不要再加任何"调 Playwright 跑 BOSS"
  // 的 debug helper —— BOSS 检测的是 `--remote-debugging-port` Chromium 启动指纹本身，
  // 不是脚本动作。
  //
  // ✅ 新的 CDP 路径：window.__DEV_bossClickFilter('<encryptJobId>')
  // 走 webContents.debugger.sendCommand('Input.dispatchMouseEvent')，
  // 同进程 CDP、零端口暴露、isTrusted=true。详见 cdpInputDispatcher.ts。
  //
  // 三重守卫：
  //   1) import.meta.env.DEV         编译期常量，生产 build 整个分支被 tree-shake
  //   2) window.__IKUAIZHAO_NATIVE__  preload 注入；浏览器版不挂
  //   3) 动态 import bossClickFilterDebug   生产 bundle 不含该文件
  if (
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    window.__IKUAIZHAO_NATIVE__
  ) {
    void import('src/util/automation/bossClickFilterDebug')
      .then(({ testClickFilterOnce }) => {
        window.__DEV_bossClickFilter = testClickFilterOnce;
        console.log(
          '[IndexPage][dev-only] CDP 调试入口已挂载：window.__DEV_bossClickFilter(encryptJobId)。' +
            '走同进程 CDP Input.dispatchMouseEvent，不需要 ENABLE_REMOTE_DEBUG。' +
            '⚠️ 用没被风控过的 BOSS 账号测试！只点一次！'
        );
      })
      .catch((e) => {
        console.warn('[IndexPage][dev-only] bossClickFilterDebug 动态 import 失败:', e?.message || e);
      });
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updatePageSize);
});

// 处理 AISearch 组件发出的 update-search-state 事件
/*const updateSearchState = (newSearchState) => {
  console.log('接收到新的搜索条件:', newSearchState);
  // 更新当前的 searchState
  // searchState.value = newSearchState;

  // 如果需要，也可以调用 JobSearchFilter 组件的 setSearchState 方法
  if (jobSearchFilterRef.value) {
    jobSearchFilterRef.value.setSearchState(newSearchState);
  }
};*/
</script>

<style lang="scss">
.q-page {
  min-height: calc(100vh - 48px);
}

/* 嵌入式工作台模式（客户端 / PlanA）：q-page 撑满 q-page-container 高度 */
.index-page-embedded {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 工作台主体两种视图（chat / results）的容器 */
.workspace-view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* results 视图 sub-header：返回对话按钮 */
.results-sub-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
  z-index: 10;
}
.back-to-chat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: #14b8a6;
  cursor: pointer;
  border-radius: 6px;
  transition: opacity 0.15s, background 0.15s;
}
.back-to-chat:hover {
  opacity: 0.8;
  background: #f0fdfa;
}

/* sub-header 里的分隔竖线 */
.result-tab-divider {
  width: 1px;
  height: 16px;
  background: #e5e7eb;
}

/* 搜索牛人 / 推荐牛人 tab 切换器（1:1 对照 ihraisaas ResultMainHeader） */
.result-tabs {
  display: inline-flex;
  background: #f5f5f5;
  padding: 2px;
  border-radius: 8px;
}
.result-tab {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #737373;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
.result-tab:hover:not(.active) {
  color: #404040;
}
.result-tab.active {
  background: #fff;
  color: #14b8a6;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.results-body {
  flex: 1;
  overflow: hidden;
  /* 1:1 对照 ihraisaas/src/components/AIAssistant/ChatPanel.tsx 第 205 行 bg-[#fcfcfc] */
  background: #fcfcfc;
  position: relative;
}

/* 用 v-show 在 search/recommend 两个 pane 之间切换，保留 mount 状态 */
.result-tab-pane {
  height: 100%;
  overflow: auto;
}
</style>
