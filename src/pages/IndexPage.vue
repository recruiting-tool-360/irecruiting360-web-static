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
        :clear-chat-disabled="clearChatDisabled"
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
            @profile-skills-edit="onProfileSkillsEdit"
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
            <button class="back-to-chat" type="button" @click="handleBackToChat">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              <span>返回对话</span>
            </button>
            <!--
              tab 切换器：只要有搜索牛人 / 推荐牛人任意一个就显示（用户要求：只有一个也要显示）。
              每个按钮按各自 pane 可见性单独 v-if，所以只有一个时只显示对应的那个 tab。
            -->
            <template v-if="showResultTabs">
              <div class="result-tab-divider" />
              <div class="result-tabs">
                <button
                  v-if="searchPaneVisible"
                  type="button"
                  class="result-tab"
                  :class="{ active: activeResultTab === 'search' }"
                  @click="activeResultTab = 'search'"
                >
                  搜索牛人
                </button>
                <button
                  v-if="recommendPaneVisible"
                  type="button"
                  class="result-tab"
                  :class="{ active: activeResultTab === 'recommend' }"
                  @click="activeResultTab = 'recommend'"
                >
                  推荐牛人
                </button>
              </div>
            </template>
          </div>

          <!--
            搜索牛人 pane：仅在任务包含 SEARCH 时渲染
            推荐牛人 pane：仅在任务包含 RECOMMEND 且 BOSS 启用时渲染
            （只有一个时 tab 不显示，但对应 pane 仍会显示，因为 activeResultTab 已自动校正）
          -->
          <div class="results-body">
            <!--
              ⚠️ 注意：两个 pane 都用 v-show 而不是 v-if 控制可见性。
              用 v-if 会让 AISearch / JobSearchFilter 在"没任务"时直接不挂载，aiSearchRef
              和 jobSearchFilterRef 都是 null，handleAggregateSearch 调
              aiSearchRef.prepareConditionOnly() 会失败 → 拿不到 condId → 整个任务创建链路
              全部卡死（searchConditionId 30s 内未就绪 → 跳过任务创建）。

              v-show 保证组件**永远挂载**，仅根据 visible 切换显示/隐藏。RecommendList 自己
              有空态处理（"暂无推荐牛人"），所以推荐 pane 没任务时挂载也无害。
            -->
            <div v-show="searchPaneVisible && activeResultTab === 'search'" class="result-tab-pane">
              <JobSearchFilter
                v-show="showResultsSearchFilter"
                ref="jobSearchFilterRef"
                v-model:searchState="searchState"
                @search="searchJobList"
                @reset="resetSearchConnect"
              />
              <!--
                :viewing-task-id 让 AISearch 透传给 5 个 channel 组件，按 taskId 直读
                ViewingResults bucket。currentViewingTaskId 为 null 时各组件 fallback runtime。

                ★ :key 强制销毁 + 重新挂载：
                  - 用户从 task A 切到 task B 时，旧 AISearch 实例直接销毁，新实例按 B 的 prop
                    挂载。避免 reactive 过渡期闪一下上一个 task 的数据（用户明确反馈过）。
                  - 'runtime' key 用于「返回对话后清掉 viewingTaskId」场景，保持一个稳定 key
                    给 runtime 模式（chat 视图下 aiSearchRef 仍指向有效实例，prepareConditionOnly
                    可调用，不破坏 handleAggregateSearch 链路）。
              -->
              <AISearch
                ref="aiSearchRef"
                :key="`aisearch-${currentViewingTaskId || 'runtime'}`"
                v-model:search-state="searchState"
                :viewing-task-id="currentViewingTaskId"
              ></AISearch>
            </div>
            <div
              v-show="recommendPaneVisible && activeResultTab === 'recommend'"
              class="result-tab-pane"
            >
              <RecommendList
                :job-id="currentRecommendJobId"
                :bucket="currentRecommendBucket"
                :loading="!!currentRecommendBucket?.fetching"
                @retry="retryFetchRecommend"
                @refresh="retryFetchRecommend"
              />
            </div>
          </div>
        </div>

        <!--
          全局「回到顶部」浮动按钮（嵌入式模式专用）
          - 浏览器模式由 FloatingActionPanel 提供同样功能（window.scrollTo）
          - 嵌入式模式下没有 window 级滚动，需要手动找当前 view 的滚动容器
          - 容器选择：chat → .chat-content；results → 当前可见的 .result-tab-pane
          - 滚动距离 ≥ 200px 才显示，避免顶部就出现冗余按钮
        -->
        <button
          v-show="showScrollTopBtn"
          type="button"
          class="workspace-scroll-top"
          title="回到顶部"
          @click="handleScrollToTop"
        >
          <q-icon name="arrow_upward" size="20px" />
        </button>
      </WorkspaceContainer>

      <!--
        清空对话确认弹框（1:1 还原 ihraisaas isChatClearConfirmOpen 设计）
        触发：WorkspaceContainer 顶部「清空当前对话」按钮 → handleClearChat
        确认：调 ChatCard.clearCurrentChat（保留 chatId，本地+后端都清；接口 GET /ihire/chat/clearChatHistory）
      -->
      <ClearChatConfirmModal v-model="clearChatConfirmVisible" @confirm="confirmClearChat" />
    </template>

    <!-- 浏览器 + 插件模式：保持原有渲染 -->
    <template v-else>
      <div v-if="panelLoaded">
        <JobSearchFilter
          ref="jobSearchFilterRef"
          v-model:searchState="searchState"
          @search="searchJobList"
          @reset="resetSearchConnect"
        />
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
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useStore } from "vuex";
import JobSearchFilter from "src/pages/search/JobSearchFilter.vue";
import notify from "src/util/notify";
import { Notify } from "quasar";
import { createSearchState } from "src/pjo/dto/request/SearchStateConfig";
import AISearch from "pages/search/AISearch.vue";
import FloatingActionPanel from "src/components/common/FloatingActionPanel.vue";
import WorkspaceContainer from "src/components/clients/WorkspaceContainer.vue";
import ChatCard from "src/components/common/ChatCard.vue";
import { getCurrentConditionByChatId } from "src/api/chat/ChatApi";
import { runBossRecommend, unlockRecommendTab } from "src/util/automation/bossRecommend";
import { sealScoreBatch, waitForScoreBatchCompleted } from "src/util/scoringBatch";
import { SCORE_BATCH_SIZE } from "src/config/searchTaskConfig";
import { buildSearchTaskChannels, pickBossFilters } from "src/util/searchTaskPayloadBuilder";
import { extractBossFilters, normalizeBossJobId } from "src/util/bossSearchFilters";
import ClearChatConfirmModal from "src/components/clients/ClearChatConfirmModal.vue";
import { isElectronClient } from "src/util/openChannelLoginUrl";
import {
  CHANNEL_DISPLAY_NAME,
  markChannelExpired,
  clearChannelExpired,
  handleChannelLoginExpired
} from "src/util/channelLoginGuard";
import { ensureClientAuthority } from "src/util/checkClientAuthority";
import RecommendList from "src/components/clients/RecommendList.vue";
import { isHistoryTaskView } from "src/util/viewingTaskMeta";
const store = useStore();

// 推荐通道的 BOSS 详情（zpData）已经拿到，直接复用「分配职位」同一套 HTML 模板。

/* ===== 客户端 / iHR 融合：嵌入式工作台模式 ===== */

/** 用户的 plan 是 PlanA → 启用嵌入式 WorkspaceContainer 布局 */
const visibleThirdSwitch = computed(() => store.getters.getUserInfo?.extendData?.plan || "");
const embeddedMode = computed(() => ["PlanA"].includes(visibleThirdSwitch.value));

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

/**
 * 当前 chat 正在查看的 taskId（reactive）—— 透传给 AISearch 当 prop，
 * 让 5 个 channel 组件按 taskId 直读 ViewingResults.byTaskId[taskId]。
 *
 * 跟旧 `getEffectiveChannelConfByAll` 的间接寻址相比：
 *   - chat 没切（latestChatId 不变）+ viewingTaskIdByChatId[cid] 没改 → prop 稳定
 *     → 子组件 computed 不重算 → UI 不会"闪一下消失"
 *   - 切到别的 chat 自然换 taskId（或 null）→ 自动渲染对应 task 数据
 *   - 不再依赖 store currentViewingByChat，clearCurrentViewingTask 不会扰动 UI
 */
const currentViewingTaskId = computed(() => {
  const cid = store.getters.getLatestChatId;
  if (!cid) return null;
  return viewingTaskIdByChatId.value[cid] || null;
});

// 查看结果搜索列表：只有"当前（刚结束）搜索结果"（可加载更多）才显示顶部搜索条件栏；
// 历史任务结果是静态快照（无加载更多）→ 隐藏顶部搜索栏。
// 注意：用 v-show 不用 v-if —— JobSearchFilter 必须保持挂载（jobSearchFilterRef 给任务创建链路用）。
const showResultsSearchFilter = computed(
  () => !isHistoryTaskView(store, currentViewingTaskId.value)
);

/**
 * 记录"上次实际灌进 ChannelConfig.ALL.data 的 taskId"，给 handleViewResults 的
 * "store 已有数据就跳过 API"缓存判定用。
 *
 * 必须按 taskId 区分，否则点了任务 A 再点任务 B 时，B 会复用 A 的数据 → 数据错乱。
 */
const lastViewedTaskIdForCache = ref(null);

// 注意：computed getter/setter 里直接读 store getter，避免依赖下方还没定义的 latestChatIdComp
const currentView = computed({
  get() {
    const cid = store.getters.getLatestChatId;
    if (!cid) return "chat";
    return viewByChatId.value[cid] || "chat";
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
    if (!cid) return "recommend";
    return activeResultTabByChatId.value[cid] || "recommend";
  },
  set(val) {
    const cid = store.getters.getLatestChatId;
    if (!cid) return;
    activeResultTabByChatId.value = { ...activeResultTabByChatId.value, [cid]: val };
  }
});

// =====================================================================
// 嵌入式模式「回到顶部」浮动按钮
//
// 浏览器模式由 FloatingActionPanel 提供（window.scrollTo），但嵌入式模式下
// 没有 window 级滚动，每个 view 都在自己的内部容器里滚：
//   - chat view    → .workspace-card .chat-content    （ChatCard 内部）
//   - results view → 当前可见的 .workspace-card .result-tab-pane
//
// 实现：当前可见容器加 scroll listener，scrollTop ≥ 200 才显示按钮；
//      点击 smooth 滚到 0。view / tab 切换时重新绑定 listener。
// =====================================================================
const SCROLL_TOP_THRESHOLD = 200;
const currentScrollTop = ref(0);
const showScrollTopBtn = computed(() => currentScrollTop.value >= SCROLL_TOP_THRESHOLD);

let __scrollBoundEl = null;
function __onScrollContainer() {
  if (!__scrollBoundEl) return;
  currentScrollTop.value = __scrollBoundEl.scrollTop || 0;
}

function getActiveScrollContainer() {
  if (!embeddedMode.value) return null;
  if (currentView.value === "chat") {
    return document.querySelector(".workspace-card .chat-content");
  }
  // results view：可能同时存在 search/recommend 两个 .result-tab-pane（都 v-show 挂载着），
  // 选当前 active 的那个：用 offsetParent 判可见性（v-show 隐藏时 display:none → offsetParent=null）
  const panes = Array.from(document.querySelectorAll(".workspace-card .result-tab-pane"));
  const pane = panes.find((el) => el.offsetParent !== null) || null;
  if (!pane) return null;
  // ★ 推荐牛人列表（RecommendList）真正的滚动容器是内部 .rl-resume-list（flex:1; overflow-y:auto），
  //   pane 本身不滚 → 绑 pane 时 scrollTop 恒为 0、按钮不显示。有内部滚动容器就用它。
  const innerScroller = pane.querySelector(".rl-resume-list");
  if (innerScroller) return innerScroller;
  return pane;
}

function rebindScrollContainer() {
  if (__scrollBoundEl) {
    __scrollBoundEl.removeEventListener("scroll", __onScrollContainer);
    __scrollBoundEl = null;
  }
  const el = getActiveScrollContainer();
  if (el) {
    __scrollBoundEl = el;
    el.addEventListener("scroll", __onScrollContainer, { passive: true });
    currentScrollTop.value = el.scrollTop || 0;
  } else {
    currentScrollTop.value = 0;
  }
}

function handleScrollToTop() {
  const el = getActiveScrollContainer();
  if (!el) return;
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    el.scrollTop = 0;
  }
}

/**
 * BOSS 是否启用（settings 里勾选）——推荐牛人功能依赖 BOSS
 * 判定逻辑跟 AIProfileActionPanel.vue 的 bossEnabled 完全一致
 */
const bossEnabled = computed(() => {
  const cfgList = store.getters.getUserChannelConfig || [];
  const cfg = Array.isArray(cfgList) ? cfgList.find((c) => c?.key === "BOSS") : null;
  if (!cfg) return true; // 兼容：cfg 缺失时默认启用（避免 store 还没 hydrate 时整块 UI 闪烁）
  return cfg.enableConfig !== false;
});

/**
 * **当前 chat 正在查看的任务** 包含什么 channel（用于决定结果页 tab 切换器和默认 tab）。
 *
 * ⚠️ 关键修复（2026-05）：之前用 `getLatestTaskByChat` 拿"最新任务"，会出现：
 *   - 任务 A（含 RECOMMEND）是该 chat 最新
 *   - 用户点 TaskCompletionCard "查看结果"打开老任务 B（仅 SEARCH）
 *   - hasRecommendForCurrentChat 仍然 true（看的是 A 的 channels）→ 推荐 tab 错显
 *
 * 改成两阶段：
 *   1) 如果 `viewingTaskIdByChatId[cid]` 有值（用户显式点过"查看结果"）→
 *      只看那个 task 的 channels；**不 fallback 到 latest**（fallback 会把 RECOMMEND
 *      串回来）。本地 store 没该 task（老任务清掉了）→ 返回 null，让下游的
 *      bucket-based 兜底来判（recommendPaneVisible 内有 currentRecommendBucket.geekList
 *      检查，能拿到本次 `task-${taskId}` 桶的实际数据情况）。
 *   2) 没显式 viewingId（live aggregate 搜索流程、首次进入结果页等）→ 用 latest。
 *
 * 返回值约定：
 *   - 'pinned-found'   显式查看 + task 在 store → 用 task.channels
 *   - 'pinned-missing' 显式查看 + task 不在 store → 调用方应不依赖 channels，
 *                     直接看下游数据（bucket / ALL.data）
 *   - 'latest'         没显式查看 → 用 latest task.channels
 */
function getCurrentViewingTaskInfo() {
  const cid = store.getters.getLatestChatId;
  if (!cid) return { mode: "latest", task: null };
  const viewingId = viewingTaskIdByChatId.value[cid];
  if (viewingId) {
    const getById = store.getters["SearchTasks/getTaskById"];
    const t = typeof getById === "function" ? getById(viewingId) : null;
    if (t) return { mode: "pinned-found", task: t };
    return { mode: "pinned-missing", task: null };
  }
  const getLatest = store.getters["SearchTasks/getLatestTaskByChat"];
  return { mode: "latest", task: typeof getLatest === "function" ? getLatest(cid) : null };
}

const hasRecommendForCurrentChat = computed(() => {
  const { mode, task } = getCurrentViewingTaskInfo();
  if (mode === "pinned-missing") return false; // 让下游数据兜底
  if (!task || !Array.isArray(task.channels)) return false;
  return task.channels.some((c) => c && c.businessChannel === "RECOMMEND");
});

/**
 * 推荐 tab 内容是否渲染。
 *
 * ⚠️ 严禁 stale-data fallback 闪烁（2026-05 用户反馈"tab 闪一下"）：
 *   - pinned-found：task 在本地 store，channels 就是真相。**只看 task.channels**，
 *     不要再 fallback 看 bucket.geekList（bucket 可能还残留上一个 task 的数据，
 *     在 API 返回新数据 commit 之前会让 tab 错误地显示一瞬）。
 *   - pinned-missing：跨电脑查看，本地无 task，**只能** fallback 到 bucket 数据。
 *   - latest：aggregate 搜索 / 首次进入流程，用最新 task channels（这条路径
 *     latest task 就是用户当前操作的对象，channels 准确）。
 */
const recommendPaneVisible = computed(() => {
  if (!bossEnabled.value) return false;
  const { mode, task } = getCurrentViewingTaskInfo();

  // ★ viewing 模式优先看 BossRecommendData 的 task-${taskId} bucket（按 taskId 直接取）。
  //   重启后 tasksById 不持久化 → mode 可能 pinned-missing，但 viewing bucket 里有刚 commit
  //   的数据，应该让 pane 可见。getCurrentBossRecommend 已经知道 task bucket，不依赖本地 task。
  if (currentViewingTaskId.value) {
    // 历史纯 SEARCH 任务也进入推荐 pane 的空态，避免隐藏 SEARCH 后结果区整块空白。
    return true;
  }

  if (mode === "pinned-found") {
    return (
      Array.isArray(task?.channels) &&
      task.channels.some((c) => c && c.businessChannel === "RECOMMEND")
    );
  }
  // pinned-missing（跨电脑查看）/ latest（aggregate 搜索流程）：
  // 优先 task.channels（latest 模式拿到的 task 也有 channels），其次看 bucket 数据
  if (hasRecommendForCurrentChat.value) return true;
  const bucket = store.getters.getCurrentBossRecommend;
  return !!(bucket && Array.isArray(bucket.geekList) && bucket.geekList.length > 0);
});

/**
 * 搜索 tab 内容是否渲染。
 *
 * ⚠️ 同 recommendPaneVisible：pinned-found 时**只看 task.channels**，
 * 不 fallback 到 ALL.data（避免上一个 task 的 stale ALL.data 让 tab 闪烁显示）。
 *
 * pinned-missing（跨电脑查看，本地无 task）才允许 ALL.data 兜底，否则白屏。
 */
const searchPaneVisible = computed(() => {
  // 搜索牛人已下架：历史任务即使仍有 SEARCH 渠道和结果，也只保留数据、不再展示。
  // AISearch 组件仍通过 v-show 挂载，供推荐任务复用搜索条件生成能力。
  return false;
});

/**
 * tab 切换器是否显示——用户要求：**只要有搜索牛人 / 推荐牛人任意一个就显示**；
 * 只有一个时也显示对应的那个 tab（模板里每个按钮按各自 pane 可见性单独 v-if）。
 *
 * 用 searchPaneVisible / recommendPaneVisible 而不是 hasXxxForCurrentChat，是为了
 * 跨电脑查看结果场景下也能正确显示切换器（本地没 task，但 ALL.data + BossRecommendData 都有数据）。
 */
const showResultTabs = computed(() => searchPaneVisible.value || recommendPaneVisible.value);

// 把 activeResultTab 自动校正到唯一可见的那个 pane（只有一个时，避免选中态停在
// 不可见的 pane 上导致空白）
watch(
  [searchPaneVisible, recommendPaneVisible],
  ([sVisible, rVisible]) => {
    if (sVisible && !rVisible && activeResultTab.value !== "search") {
      activeResultTab.value = "search";
    } else if (!sVisible && rVisible && activeResultTab.value !== "recommend") {
      activeResultTab.value = "recommend";
    }
  },
  { immediate: true }
);

/**
 * 切换 chat 时，如果切回的 chat 处于"结果页"视图 → 确保它能拿到按 taskId 隔离的结果数据，
 * 避免空白。数据按 taskId 隔离在 ViewingResults.byTaskId，切别的职位互不影响。
 *
 * 复现路径（本次修复）：
 *   职位 A 任务进行中 → 左边切到职位 B → A 任务跑完（数据只在共享 ALL.data 里，没按
 *   taskId 隔离）→ 再切回 A：selectChat 已把 ALL.data 清掉，且 A 是 runtime 任务没点过
 *   "查看结果"卡片 → 没有 savedTaskId → 之前直接 return → 结果页空白。
 *
 * 修复：savedTaskId fallback 到该 chat 的 latest task；优先复用 byTaskId 隔离 bucket，
 * 没有就从 API 重载到 bucket，保证切职位结果互不串扰。
 *
 * ★ 同时清理离开的旧 chat 的 viewing 状态：避免之前的 viewing taskId 在 chat 切换后
 * 仍然挂在 currentViewingByChat 里干扰下一次进入。
 */
watch(
  () => store.getters.getLatestChatId,
  async (newChatId, oldChatId) => {
    if (!newChatId || newChatId === oldChatId) return;

    // ★ 清理 oldChat 的 viewing 状态（除非用户切回时还想看之前的 viewing 数据）
    // 当前策略：切走时直接清，下次回来用户重新点"查看结果"。
    // 不清的话 currentViewingByChat[oldChatId] 残留，下次 getLatestChatId=oldChatId 时
    // 又会自动走 viewing → 显示旧 viewing 数据，跟用户预期可能不符。
    if (oldChatId) {
      try {
        store.commit("clearCurrentViewingTask", oldChatId);
      } catch (e) {
        console.warn("[任务流程] [IndexPage] clearCurrentViewingTask 失败（忽略）:", e?.message || e);
      }
    }

    // 只在嵌入式模式（有 WorkspaceContainer）下处理
    if (!embeddedMode.value) return;
    // 切回的 chat 是否处于结果视图
    if ((viewByChatId.value[newChatId] || "chat") !== "results") return;

    // ===== 解析这个 chat 应该展示哪个 task 的结果 =====
    //   1) 用户显式点过"查看结果" → viewingTaskIdByChatId[cid]
    //   2) 否则用该 chat 最新的任务 —— 覆盖"runtime 搜索完没点卡片"的场景：
    //      任务 A 跑完数据只在共享的 ChannelConfig.ALL.data 里（没按 taskId 隔离），
    //      切到职位 B 再切回 A 时 selectChat 已把 ALL.data 清掉 → 之前没有 savedTaskId
    //      就直接 return → 结果页空白。这里 fallback 到 latest task，让它能从 API 重载。
    let savedTaskId = viewingTaskIdByChatId.value[newChatId];
    if (!savedTaskId) {
      const getLatest = store.getters["SearchTasks/getLatestTaskByChat"];
      const latest = typeof getLatest === "function" ? getLatest(newChatId) : null;
      if (latest && latest.taskId) savedTaskId = latest.taskId;
    }
    if (!savedTaskId) return;

    // 任务还在跑 → 数据在 runtime ALL 里持续写入，保持 runtime 视图，别拉静态快照
    const runningTaskId = store.state?.SearchTasks?.runningTaskId;
    if (savedTaskId === runningTaskId) return;

    // ★ 数据是否还在按 taskId 隔离的 bucket 里（ViewingResults.byTaskId 按 taskId 隔离，
    //   切别的职位不会互相影响）。有就直接复用：把 viewingTaskId 指过去即可，
    //   子组件通过 prop 直读 bucket，无需重新打 API。
    const bucket = store.state?.ViewingResults?.byTaskId?.[savedTaskId];
    const bucketHasData =
      bucket && Array.isArray(bucket.byChannel?.ALL) && bucket.byChannel.ALL.length > 0;
    if (bucketHasData) {
      if (viewingTaskIdByChatId.value[newChatId] !== savedTaskId) {
        viewingTaskIdByChatId.value = {
          ...viewingTaskIdByChatId.value,
          [newChatId]: savedTaskId
        };
      }
      return;
    }

    console.log(
      `[任务流程] [IndexPage] chatId 切到 ${newChatId}，结果页无隔离数据，自动重载 taskId=${savedTaskId}`
    );
    // 复用 handleViewResults 的加载逻辑：从 API 拉结果并写进按 taskId 隔离的 bucket，
    // 切职位互不影响。source=task_completion_card 让它走完整数据加载 + 记 viewingTaskId。
    await handleViewResults({
      taskId: savedTaskId,
      source: "task_completion_card",
      chatId: newChatId
    });
  }
);

/** 推荐 tab 当前展示的 BOSS jobId（在 handleAggregateSearch 里设进 store；这里只读取） */
const currentRecommendJobId = computed(() => store.getters.getCurrentRecommendJobId);
const currentRecommendBucket = computed(() => store.getters.getCurrentBossRecommend);

/** 上次拉推荐的入参，存起来供"刷新/重试"按钮复用 */
const lastRecommendArgs = ref(null);

async function retryFetchRecommend() {
  if (!lastRecommendArgs.value) {
    console.warn("[任务流程] [IndexPage] retryFetchRecommend: no last args, skip");
    return;
  }
  await doFetchRecommend(lastRecommendArgs.value);
}

/**
 * 把 BOSS **推荐 API** 返回的 geek，适配成 BOSS **搜索 API** 一样的 rawResume 形态，
 * 这样后端的 BOSS 反序列化器（按搜索 geekCard 字段写的）就能解析推荐数据，不会再报
 * SYSTEM_005 "no valid resultItems converted"。
 *
 * 字段对应（推荐 → 搜索）：
 *   geekCard.geekName            → geekCard.name
 *   geekCard.geekGender          → geekCard.gender
 *   geekCard.geekWorkYear        → geekCard.workYear
 *   geekCard.geekDegree          → geekCard.highestDegreeName
 *   geekCard.salary              → geekCard.salary
 *   geekCard.lowSalary           → geekCard.lowSalary
 *   geekCard.highSalary          → geekCard.hightSalary    （搜索拼写就是 hightSalary）
 *   geekCard.geekDesc.content    → geekCard.geekDesc.name
 *   geekCard.expectPositionName  → geekCard.expect.name + lidTag
 *   geekCard.expectPositionCode  → geekCard.expect.code
 *   geekCard.expectLocationName  → geekCard.city
 *   geekCard.geekEdu.school      → geekCard.eduSchool
 *   geekCard.geekEdu.major       → geekCard.eduMajor
 *   geekCard.geekWorks[0]        → 拼成 geekCard.current.name + works[]
 *   geekCard.matches             → geekCard.matches + labelMatchList
 *   顶层 isFriend                → friendRelationStatus
 *   顶层 geekCallStatus / cooperate / talkTimeDesc → 同名
 *
 * 没有的字段（推荐不返回，搜索后端也不一定强依赖）填 null / 0 / '' 兜底。
 */
function mapBossRecommendGeekToSearchRaw(geek) {
  const g = geek || {};
  const c = g.geekCard || {};
  const firstWork = Array.isArray(c.geekWorks) && c.geekWorks.length > 0 ? c.geekWorks[0] : null;
  const currentName = firstWork
    ? `${firstWork.company || ""}·${firstWork.positionName || firstWork.positionCategory || ""}`
    : c.middleContent?.content || "";
  const geekWorks = c.geekWorks || [];
  const worksForSearch = geekWorks.map((w) => ({
    name: `${w.positionName || w.positionCategory || ""}|${w.company || ""}`,
    dateRange: null,
    code: null,
    hlname: null,
    highlightList: null,
    intentList: null
  }));
  const topWorks = geekWorks.map((w) => ({
    isCurrent: !!w.current,
    company: {
      value: w.company || "",
      highlights: null,
      color: 0,
      setValue: true,
      setHighlights: false,
      setColor: false,
      highlightsSize: 0,
      highlightsIterator: null
    },
    position: {
      value: w.positionName || w.positionCategory || "",
      highlights: null,
      color: 0,
      setValue: true,
      setHighlights: false,
      setColor: false,
      highlightsSize: 0,
      highlightsIterator: null
    },
    companyId: 0,
    startDate8: 0,
    endDate8: 0,
    brand: null,
    title: null,
    positionCode: 0,
    setBrand: false,
    setPosition: true,
    setCompany: true,
    setTitle: false,
    setCompanyId: false,
    setStartDate8: false,
    setEndDate8: false,
    setIsCurrent: true,
    setPositionCode: false
  }));
  // ★ workList：后端 BossResumeRequestVO.getWorkList() 读这个解析 workExp（必须跟搜索同款结构）。
  //   推荐 list 接口的 geekWorks 带**真实起止日期**（startDate "2024.09" / endDate "2026.05"），
  //   转成搜索同款 dateRange "yyyy-yyyy"（在职/无结束 → "yyyy-至今"）。
  //   之前 workList 给空 / dateRange 给 null|"" 都会让后端转换抛错 → SYSTEM_005，所以这里必须带日期。
  const pickYear = (s) => (String(s || "").match(/\d{4}/) || [""])[0];
  const workListForSearch = geekWorks
    .map((w) => {
      const company = w.company || "";
      const position = w.positionName || w.positionCategory || "";
      const name = [company, position].filter(Boolean).join("·");
      if (!name) return null;
      const startY = pickYear(w.startDate);
      const endY = w.current || !w.endDate ? "至今" : pickYear(w.endDate);
      return {
        name,
        dateRange: startY ? `${startY}-${endY}` : "",
        code: null,
        hlname: null,
        highlightList: [],
        intentList: null
      };
    })
    .filter(Boolean);
  const matches = Array.isArray(c.matches) ? c.matches : [];
  return {
    geekCard: {
      headImg: 0,
      userId: 0,
      geekSource: 0,
      suid: null,
      name: c.geekName || "",
      gender: typeof c.geekGender === "number" ? c.geekGender : 1,
      city: c.expectLocationName || "",
      workYear: c.geekWorkYear || "",
      salary: c.salary || "",
      lowSalary: Number(c.lowSalary) || 0,
      hightSalary: Number(c.highSalary) || 0, // 注意：搜索接口字段拼写就是 hightSalary
      expectType: c.expectType || 0,
      positionType: 0,
      headUrl: c.geekAvatar || "",
      geekDesc: {
        name: c.geekDesc?.content || "",
        dateRange: null,
        code: null,
        hlname: null,
        highlightList: null,
        intentList: null
      },
      expect: {
        name: c.expectPositionName || "",
        dateRange: null,
        code: c.expectPositionCode ? String(c.expectPositionCode) : null,
        hlname: null,
        highlightList: null,
        intentList: null
      },
      current: {
        name: currentName,
        dateRange: null,
        code: null,
        hlname: null,
        highlightList: null,
        intentList: null
      },
      showRelatedHead: false,
      expectId: Number(c.expectId) || 0,
      encryptExpectId: null,
      lid: c.lid || "",
      isSpecial: 0,
      allWorkEmphasis: null,
      degreeName: null,
      rewardHat: null,
      rewardIcon: null,
      highestDegreeName: c.geekDegree || "",
      unitName: null,
      unitPosition: null,
      activeDesc: g.activeTimeDesc || "",
      workEduDesc: {
        name: firstWork
          ? `${firstWork.company || ""} ${
              firstWork.positionName || firstWork.positionCategory || ""
            }`
          : "",
        dateRange: null,
        code: null,
        hlname: null,
        highlightList: null,
        intentList: null
      },
      tag: 0,
      blur: g.blur || 0,
      contacting: 0,
      hotGeek: 0,
      hotGeekIcon: null,
      lidTag: c.expectPositionName || "",
      jobId: 0,
      encryptJobId: c.encryptJobId || "",
      freeGeek: 0,
      encryptGeekId: c.encryptGeekId || g.encryptGeekId || "",
      itemId: 0,
      contact: false,
      tagTimeLong: 0,
      eduSchool: c.geekEdu?.school || c.geekEdus?.[0]?.school || "",
      eduMajor: c.geekEdu?.major || c.geekEdus?.[0]?.major || "",
      eduDateRange: null,
      works: worksForSearch,
      matches,
      labelMatchList: matches.map((w) => ({ type: 0, markWord: w, labelStyle: 0, iconUrl: null })),
      securityId: c.securityId || "",
      labels: null,
      note: null,
      allLabels: null,
      geekWorks: null,
      geekEdus: null,
      ageDesc: c.ageDesc || "",
      cardFields: [],
      geekEcomInfo: null,
      eliteGeek: c.eliteGeek || 0,
      avatarBottomIcon: null,
      geekWork: {
        name: currentName,
        dateRange: null,
        code: null,
        hlname: null,
        highlightList: null,
        intentList: null
      },
      geekEdu: c.geekEdu
        ? {
            name: `${c.geekEdu.school || ""}·${c.geekEdu.major || ""}`,
            dateRange: null,
            code: null,
            hlname: null,
            highlightList: null,
            intentList: null
          }
        : null,
      workList: workListForSearch,
      matchWork: null,
      feedbackCodeConfigList: [],
      feedbackTitle: g.feedbackTitle || "",
      nameStyle: 0,
      searchChatCardCostCount: g.searchChatCardCostCount || 0,
      eventTime: 0,
      eventTimeLong: 0,
      salaryType: 0,
      viewed: !!c.viewed,
      highlightExpectName: null,
      cooperate: g.cooperate || 0,
      immediateChatFlag: 0,
      immediateChatText: null,
      productPictureList: null,
      applyStatusDesc: c.applyStatusDesc || "",
      continueChatText: null,
      rcdReason: null,
      aiRcdReason: null,
      rcdReasonList: null,
      geekMsgStatus: 0,
      remark: null,
      remarkTimeStr: null,
      contactJobInfo: null,
      geekDescTag: null,
      tags: null,
      otherSceneChat: 0,
      commonFlag: null,
      recallType: 0,
      canUseDirectCall: !!g.canUseDirectCall,
      directCallGeekType: -1,
      hotGeekIconImg: null,
      recOnline: c.recOnline || null,
      favor: false,
      favorGeekIconImg: null,
      newGeekIconImg: null,
      tagList: null,
      cardLabelInfos: [],
      geekProfileList: [c.geekWorkYear, c.geekDegree, c.salary, c.ageDesc].filter(Boolean),
      expectLabel: "期望",
      geekProfileSimpleGray: 0,
      feedbackSwitch: 1,
      encryptUserId: "",
      newGeek: 0,
      vipCostChatCount: 0,
      expectCity: c.expectLocationCode || 0,
      recommendedReason: null,
      rcdBizType: c.rcdBizType || null,
      recallStgTag: c.recallStgTag || null
    },
    endDate: null,
    startDate: null,
    school: null,
    highlightExpectName: c.expectPositionName || "",
    highlightCurrentName: currentName,
    highlightGeekDescName: c.geekDesc?.content || "",
    jobId: 0,
    inactive: false,
    applyStatus: c.applyStatus || 0,
    applyStatusDesc: c.applyStatusDesc || "",
    friendRelationStatus: g.isFriend || 0,
    highlightWorkNames: geekWorks.map(
      (w) => `${w.positionName || w.positionCategory || ""}-${w.company || ""}`
    ),
    geekCallStatus: g.geekCallStatus || 0,
    talkTimeDesc: g.talkTimeDesc || null,
    cooperate: g.cooperate || 0,
    ageDesc: c.ageDesc || "",
    works: topWorks,
    uniqSign: c.geekId
      ? `rec_${c.geekId}`
      : `rec_${c.encryptGeekId || g.encryptGeekId || Math.random().toString(36).slice(2)}`,
    geekMsgStatus: 0,
    showExpectPosition: null,
    read: false
  };
}

function normalizeCandidateId(value) {
  return String(value === undefined || value === null ? "" : value).replace(/~+$/, "");
}

/** 一个候选人可能被后端/SSE 用任意一种 ID 引用，统一收集起来做反查。 */
function collectGeekCandidateIds(geek, row) {
  const card = geek?.geekCard || {};
  const plainGeekId = card.geekId || geek?.geekId || "";
  const outId =
    extractTaskResumeRowOutId(row) ||
    (plainGeekId ? `rec_${plainGeekId}` : "");
  return [
    row?.taskResumeId,
    row?.resumeBlindId,
    row?.id,
    row?.channelResumeId,
    row?.outId,
    outId,
    geek?.encryptGeekId,
    geek?.geekId,
    geek?.uniqSign,
    card?.encryptGeekId,
    card?.geekId,
    plainGeekId ? `rec_${plainGeekId}` : ""
  ]
    .map(normalizeCandidateId)
    .filter(Boolean);
}

function geekIdentityKey(geek) {
  return normalizeCandidateId(
    geek?.encryptGeekId ||
      geek?.geekCard?.encryptGeekId ||
      geek?.geekId ||
      geek?.geekCard?.geekId ||
      geek?.uniqSign
  );
}

/** 从 /results 返回的 jobList 行里提取 outId（优先直接字段，其次 originalResumeUrlInfo.request.rowId）。 */
function extractTaskResumeRowOutId(row) {
  // /results 可能把渠道侧 ID 放在 outId / channelResumeId / uniqSign 任一字段。
  const direct = row?.outId ?? row?.channelResumeId ?? row?.uniqSign;
  if (direct !== undefined && direct !== null && direct !== "") return String(direct);
  const info = row?.originalResumeUrlInfo;
  if (!info) return "";
  try {
    const obj = typeof info === "string" ? JSON.parse(info) : info;
    const rowId = obj?.request?.rowId;
    return rowId === undefined || rowId === null || rowId === "" ? "" : String(rowId);
  } catch (_e) {
    return "";
  }
}

/**
 * /results 返回的 taskResumes 不保证跟抓取顺序一致（后端可能去重/重排）。
 * 用 outId（= uniqSign = rec_<geekId>）配对；只有整行都没有可识别 outId 时才按位置兜底。
 */
function buildTaskResumeRowMatcher(jobList, expectedCount = 0) {
  const byOutId = new Map();
  for (const row of jobList || []) {
    const key = normalizeCandidateId(extractTaskResumeRowOutId(row));
    if (key) byOutId.set(key, row);
  }
  return (geek, index) => {
    const card = geek?.geekCard || {};
    const plainGeekId = card.geekId || geek?.geekId || "";
    const candidates = [];
    if (plainGeekId) candidates.push(`rec_${plainGeekId}`, String(plainGeekId));
    const encryptIds = [
      card.encryptGeekId,
      card.encGeekId,
      geek?.encryptGeekId,
      geek?.encGeekId,
      geek?.uniqSign
    ];
    for (const id of encryptIds) {
      if (id !== undefined && id !== null && id !== "") candidates.push(String(id));
    }
    for (const key of candidates) {
      const normalized = normalizeCandidateId(key);
      if (byOutId.has(normalized)) return byOutId.get(normalized);
    }
    // 后端可能返回自己的 outId 口径，跟 uniqSign/geekId 都不一致。
    // /results 的 taskResumes 与本次上送 resultItems 一一对应时，按索引兜底，
    // 避免 5 条全部匹配失败 → 一条详情都不发。
    const byIndex = jobList?.[index];
    if (
      byIndex &&
      (!extractTaskResumeRowOutId(byIndex) ||
        (expectedCount > 0 && jobList.length === expectedCount))
    ) {
      return byIndex;
    }
    return null;
  };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * 推荐候选人 → 打开 BOSS 详情 → 截图 → /resume/upload 拿 fileId。
 *
 * BOSS 的 zpitem/web/boss/search/geek/info 已不可用，这里不再调用详情接口、
 * 也不再生成简历 HTML，改为截取详情面板图片交给后端解析/评分。
 * iframe 内 canvas 采用滚动分片截图，拼成长图后上传。
 */
async function buildAndUploadBossRecommendResume(geek, localId, tabId, shouldAbort) {
  if (!tabId) throw new Error("缺少 BOSS tabId，无法打开候选人详情");
  const automation = window?.api?.automation;
  const ihrBridge = window?.api?.ihrBridge;
  if (!automation?.sendCdp) {
    throw new Error("当前客户端版本不支持页面截图，请升级客户端");
  }
  if (!ihrBridge || typeof ihrBridge.uploadFile !== "function") {
    throw new Error("ihrBridge.uploadFile 不可用");
  }

  const card = geek?.geekCard || {};
  const displayName = card.geekName || geek?.geekName || String(localId);
  const safeName =
    String(displayName).replace(/[\\/:*?"<>|]/g, "_").trim() || String(localId);

  const collectMod = await import("src/util/automation/bossRecommendCollect");
  const checkStopped = () => {
    if (shouldAbort?.()) {
      const error = new Error("任务已停止，取消候选人截图上传");
      error.code = "TASK_STOPPED";
      throw error;
    }
  };
  checkStopped();
  try {
    await collectMod.openBossRecommendDetail(tabId, geek);
    console.log(`[任务流程] [IndexPage] 推荐详情已打开 localId=${localId} tabId=${tabId}，准备截图`);

    const { captureBossResumeLongScreenshot } = await import("src/util/automation/bossResumeScreenshot");
    const screenshot = await captureBossResumeLongScreenshot(tabId, { shouldAbort });
    console.log(
      "[任务流程]", `[IndexPage] 详情长图完成 localId=${localId} ${screenshot.width}x${screenshot.height}` +
        ` bytes=${screenshot.bytes} slices=${screenshot.sliceCount}`
    );

    const fileName = `boss直聘-${safeName}.png`;
    const arrayBuffer = base64ToArrayBuffer(screenshot.base64);
    checkStopped();
    const uploadStartedAt = Date.now();
    console.log(
      "[任务流程]", `[IndexPage] resume/upload >>> name=${fileName} bytes=${arrayBuffer.byteLength}` +
        ` localId=${localId} mime=image/png`
    );
    const uploadRes = await ihrBridge.uploadFile({
      arrayBuffer,
      name: fileName,
      mime: "image/png"
    });
    const uploadCost = Date.now() - uploadStartedAt;
    if (!uploadRes?.success) {
      console.warn(
        "[任务流程]", `[IndexPage] resume/upload !!! failed ${uploadCost}ms localId=${localId} name=${fileName}` +
          ` success=${uploadRes?.success} code=${uploadRes?.code} message=${
            uploadRes?.message ?? "-"
          }`
      );
      throw new Error(uploadRes?.message || uploadRes?.errorCode || "截图上传失败");
    }
    const fileId =
      typeof uploadRes.data === "string"
        ? uploadRes.data
        : uploadRes.data?.fileId || uploadRes.data?.id || "";
    if (!fileId) {
      console.warn(
        `[任务流程] [IndexPage] resume/upload !!! 响应缺少 fileId ${uploadCost}ms localId=${localId} data=`,
        uploadRes.data
      );
      throw new Error("截图上传后未返回 fileId");
    }
    console.log(
      "[任务流程]", `[IndexPage] resume/upload <<< ok ${uploadCost}ms localId=${localId} fileId=${fileId}` +
        ` screenshot=${screenshot.width}x${screenshot.height}`
    );

    return {
      fileId,
      content: JSON.stringify({
        source: "boss-recommend-screenshot",
        fileName,
        mime: "image/png",
        width: screenshot.width,
        height: screenshot.height,
        bytes: screenshot.bytes,
        captureMode: "scroll-stitch",
        sliceCount: screenshot.sliceCount
      }),
      detailSource: "recommend-screenshot"
    };
  } finally {
    try {
      await collectMod.closeBossRecommendDetail(tabId);
    } catch (e) {
      console.warn("[任务流程] [IndexPage] 关闭推荐详情失败（忽略）:", e?.message || e);
    }
  }
}

async function doFetchRecommend(args) {
  const jobId = normalizeBossJobId(args?.encryptJobId);
  if (!jobId) return;

  // 拿当前 task 的 taskId，用于驱动 recommendClientPhase（让 TaskStatusCard 推荐卡的
  // 步骤推进跟前端实际进度对齐，不被后端 SSE 的 channel.taskChannelStatus 误推到 RUNNING）。
  const _cidForPhase = args?.chatId || store.getters.getLatestChatId;
  const _taskForPhase = _cidForPhase
    ? store.getters["SearchTasks/getLatestTaskByChat"](_cidForPhase)
    : null;
  const _taskIdForPhase = _taskForPhase?.taskId || "";
  // 跨批次累计展示的候选人（推荐 tab 不会因为进入下一批而只剩当前批）
  const cumulativeGeeks = [];

  // ★ 若本任务的 RECOMMEND/BOSS 渠道已终态（COMPLETED/FAILED/SKIPPED），说明推荐这一路本轮
  //   不需要再跑：不 execute、不开 tab、不 finish，直接返回。
  //   常见于 CONTINUE 任务：推荐已完成、只补搜索；之前没判 taskChannelStatus 会对已 COMPLETED
  //   的推荐渠道又调一次 execute（见线上 /taskChannel/{id}/execute 命中 COMPLETED 渠道）。
  if (_taskForPhase && Array.isArray(_taskForPhase.channels)) {
    const recChannel = _taskForPhase.channels.find(
      (c) => c.businessChannel === "RECOMMEND" && c.channelSubType === "BOSS"
    );
    const recTerminal =
      recChannel &&
      (recChannel.taskChannelStatus === "COMPLETED" ||
        recChannel.taskChannelStatus === "FAILED" ||
        recChannel.taskChannelStatus === "SKIPPED");
    if (recTerminal) {
      console.log(
        `[任务流程] [IndexPage] doFetchRecommend: RECOMMEND/BOSS 已终态 ${recChannel.taskChannelStatus}，跳过整个推荐流程（不 execute/不开 tab/不 finish）`
      );
      return;
    }
  }

  const setPhase = (phase) => {
    if (!_taskIdForPhase) return;
    store.commit("SearchTasks/setRecommendClientPhase", { taskId: _taskIdForPhase, phase });
  };
  setPhase("WAITING");

  // 串行化：如果同时勾了搜索 + 推荐，先 await 搜索完成再开始推荐，避免 BOSS 同账号
  // 同时跑"搜索 BOSS API"+"推荐 BOSS tab"双流量被风控识别为爬虫。
  // 详见 handleAggregateSearch 注释。
  if (args?.awaitBeforeStart && typeof args.awaitBeforeStart.then === "function") {
    console.log("[任务流程] [IndexPage] doFetchRecommend 等搜索完成后再启动推荐...");
    try {
      await args.awaitBeforeStart;
    } catch (e) {
      // 搜索失败不阻塞推荐（用户至少能拿到推荐数据）
      console.warn("[任务流程] [IndexPage] 搜索 promise rejected，推荐流程继续:", e?.message || e);
    }
    console.log("[任务流程] [IndexPage] 搜索 fetch 已完成，等搜索的 AI 分析也完成再启动推荐...");

    // 用户明确要求：推荐要等搜索的 AI 评分跑完才能启动
    // 否则两路 AI 同时跑会让"完成卡片"时序错乱，且 BOSS 同账号双流量被风控盯
    //
    // ⚠️ 三个坑：
    //   1) 不能只查 store.getters.getAiAnalyzingActive：AsyncTaskQueueManager 用
    //      dynamic import 推 store，状态推送是 microtask 异步的，刚 await 完 searchPromise
    //      时 active 还是 false → 立刻 break。
    //   2) 评分轮询（scoreAutoUpdater）的 timer 是被 saveResumeDetailPlus 触发，启动延迟
    //      可能到 1-2s，需要"先等 AI 启动"的初始窗口。
    //   3) 评分跑完中间会有 "scorePending=0 但 queueManager 还在解析详情" 的瞬间，
    //      要三路 OR 判断（queueBusy || scoreBusy || storeActive）。
    //
    // 跟 SearchTasks/runTask 末尾的 "等 AI 完成" 用同样的判断方式。
    try {
      const [qm, su] = await Promise.all([
        import("src/pluginSrc/util/AsyncTaskQueueManager"),
        import("src/utils/scoreAutoUpdater")
      ]);
      const queueManager = qm.asyncTaskQueueManager;
      const scoreUpdater = su.default || su;

      const MAX_WAIT_AI_MS = 10 * 60 * 1000;
      const AI_POLL_MS = 800;
      const startWaitAi = Date.now();
      let aiSeenActive = false; // 必须见过一次 active 再等回落，避免"还没启动就过了"
      const WAIT_FOR_AI_START_MS = 15000; // 15s 都没启动 = 搜索 0 条简历，直接放推荐过去

      while (Date.now() - startWaitAi < MAX_WAIT_AI_MS) {
        const queueBusy = (queueManager?.queueStatus?.totalTasks || 0) > 0;
        const scoreBusy = !!scoreUpdater?.timer && (scoreUpdater?.pendingResumeIds?.size || 0) > 0;
        const storeActive = store.getters.getAiAnalyzingActive === true;
        const stillAnalyzing = queueBusy || scoreBusy || storeActive;

        if (stillAnalyzing) aiSeenActive = true;
        const elapsed = Date.now() - startWaitAi;

        if (!stillAnalyzing) {
          if (aiSeenActive) break; // AI 跑过且已歇 → 推荐启动
          if (elapsed >= WAIT_FOR_AI_START_MS) break; // 等够"启动窗口"还没动 → 跳出
        }
        await new Promise((r) => setTimeout(r, AI_POLL_MS));
      }
      console.log(
        "[任务流程]", `[IndexPage] AI 等待结束 耗时=${Date.now() - startWaitAi}ms aiSeenActive=${aiSeenActive}` +
          ` queueTotal=${queueManager?.queueStatus?.totalTasks || 0}` +
          ` scorePending=${scoreUpdater?.pendingResumeIds?.size || 0}`
      );
    } catch (e) {
      console.warn("[任务流程] [IndexPage] 加载 queueManager/scoreUpdater 失败，跳过等 AI:", e?.message || e);
    }
  }

  // ===== execute RECOMMEND 渠道（被 runTask 推迟到这里，严格串行在搜索 AI 之后）=====
  // SearchTasks.runTask 不再为 RECOMMEND 调 /execute，由本处统一发起，
  // 保证 BOSS SEARCH 与 RECOMMEND 不会同时 execute（用户要求）。
  if (_taskForPhase && Array.isArray(_taskForPhase.channels)) {
    const recCh = _taskForPhase.channels.find(
      (c) => c.businessChannel === "RECOMMEND" && c.channelSubType === "BOSS"
    );
    if (recCh?.taskChannelId) {
      try {
        const { postExecuteChannel } = await import("src/api/searchTaskApi");
        await postExecuteChannel(recCh.taskChannelId);
        console.log(
          `[任务流程] [IndexPage] postExecuteChannel ok RECOMMEND/BOSS taskChannelId=${recCh.taskChannelId}`
        );
        // execute 后刷新一次后端队列，让排队/等待信息及时更新
        store.dispatch("SearchTasks/fetchTaskQueue").catch(() => {});
      } catch (e) {
        console.warn(
          `[任务流程] [IndexPage] postExecuteChannel RECOMMEND/BOSS failed taskChannelId=${recCh.taskChannelId}:`,
          e?.message || e
        );
        // execute 失败不阻塞推荐流程（业务侧 /results 仍然会落库，后端能补救）
      }
    }
  }

  setPhase("OPENING");
  // 显式锁住所有职位的“立即沟通”。不能依赖 taskStatus/channelStatus：
  // 后端队列刷新可能在 BOSS RPA 尚未结束时提前改写这些字段。
  store.commit("SearchTasks/setBossRecommendRpaActive", true);
  store.commit("setCurrentRecommendJobId", jobId);
  store.commit("setBossRecommendFetching", { jobId, fetching: true });
  console.log("[任务流程] [IndexPage] runBossRecommend", args);

  // 蒙层：BOSS 推荐任务期间**只锁 BOSS 站 tab**，提示"客户端执行中，请勿同步操作"。
  // 蒙层是主进程 WebContentsView，盖在 BOSS view 之上；用户切回主页 / 智联等其它 tab 不受影响。
  // ⚠️ 必须传 coverChannels:['boss']，否则默认覆盖所有招聘站 tab → 切到智联也会显示蒙层。
  // 浏览器模式（非 Electron）下 window.api.automation 不存在，optional chain 兜底。
  try {
    await window?.api?.automation?.showOverlay?.({
      channelName: "BOSS直聘",
      coverChannels: ["boss"]
    });
  } catch (e) {
    console.warn("[任务流程] [IndexPage] showOverlay failed (browser mode?):", e?.message || e);
  }

  // 阶段回调：让用户在 UI 上看到推进
  //
  // phase 状态机（对应 TaskStatusCard recommendCardSteps 的 step 推进）：
  //   OPENING   = tab 已打开                       → step 0 "校对岗位" processing
  //   SELECTING = select 流程进行中（dwell/打开下拉/click li）→ step 0 仍 processing
  //   SELECTED  = 职位已选中（select.done + analyzing 模拟）  → step 0 complete, step 1 "分析关键词" processing
  //   FETCHING  = 已发请求等首屏响应               → step 1 complete, step 2 "获取候选人" processing
  //   FETCHED   = 首屏数据到了                     → step 2 complete
  //   SCORING / DONE = AI 评分 / 全部完成
  function onProgress(stage, payload) {
    if (stage === "opened") {
      console.log("[任务流程] [IndexPage] BOSS 推荐 tab 已打开:", payload?.url);
    } else if (stage === "dwell") {
      // 旧被动路径（autoSelectJob=false）：没有 select，直接被动等响应
      // 这里 emit FETCHING 是合理的（已经在等数据了）
      console.log(`[任务流程] [IndexPage] 拟人 dwell ${payload?.ms}ms 模拟用户加载后停留观察`);
      setPhase("FETCHING");
    } else if (stage === "select.waiting") {
      // autoSelectJob=true 路径：select 流程开始（15s 初始 dwell）
      // 进入 SELECTING：step 0 "校对岗位" 仍显示 processing（让用户知道还在准备）
      console.log(`[任务流程] [IndexPage] BOSS 主动选职位流程开始，initial dwell ${payload?.delayMs}ms`);
      setPhase("SELECTING");
    } else if (stage === "select.openingDropdown") {
      console.log("[任务流程] [IndexPage] CDP click 打开 BOSS 职位下拉");
    } else if (stage === "select.browsingDropdown") {
      console.log(`[任务流程] [IndexPage] 下拉已打开，浏览 dwell ${payload?.dwellMs}ms`);
    } else if (stage === "select.selectingItem") {
      console.log(`[任务流程] [IndexPage] CDP click 选中目标职位 ${payload?.selector}`);
    } else if (stage === "select.done") {
      // select 完成（li 已 click 或 alreadySelected）但还没进 analyzing → 仍 SELECTING
      // 由 bossRecommend.js 下一行立刻 emit 'analyzing' 切到 SELECTED，避免闪烁
      console.log("[任务流程] [IndexPage] BOSS 职位选中完成，等 analyzing 模拟");
    } else if (stage === "analyzing") {
      // bossRecommend.js select 成功后 emit：模拟 1.2s "分析画像关键词"
      // 切到 SELECTED phase → step 0 complete + step 1 processing
      console.log(`[任务流程] [IndexPage] 模拟分析画像关键词 ${payload?.dwellMs}ms`);
      setPhase("SELECTED");
    } else if (stage === "fetching") {
      // 发 fetchBossRecommendList 之前 emit → step 1 complete + step 2 processing
      console.log("[任务流程] [IndexPage] 开始抓取 BOSS 推荐候选人列表（等响应）");
      setPhase("FETCHING");
    } else if (stage === "verified") {
      console.log("[任务流程] [IndexPage] BOSS 推荐 verify 通过:", payload);
    } else if (stage === "firstPage" && payload?.geekList?.length > 0) {
      setPhase("FETCHED");
      // 先把首屏数据落进 store，让推荐 tab 立刻显示
      const mergedGeeks = [...cumulativeGeeks];
      for (const geek of payload.geekList) {
        const geekKey = geek?.encryptGeekId || geek?.geekId || geek?.geekCard?.geekId;
        if (!geekKey) {
          mergedGeeks.push(geek);
          continue;
        }
        const exists = mergedGeeks.some(
          (item) =>
            (item?.encryptGeekId || item?.geekId || item?.geekCard?.geekId) === geekKey
        );
        if (!exists) mergedGeeks.push(geek);
      }
      store.commit("setBossRecommendList", {
        jobId,
        geekList: mergedGeeks,
        totalSize: mergedGeeks.length,
        hasMore: payload.hasMore,
        fetchedAt: Date.now()
      });
      // commit 完上面那次 mutation 会把 fetching 重置为 false（按 mutation 设计），
      // 但逐个打开详情收藏还在跑，重新标记 fetching 让 UI 继续显示进度提示
      store.commit("setBossRecommendFetching", { jobId, fetching: true });
    } else if (stage === "collect.itemStart") {
      setPhase("FETCHING");
      console.log(
        "[任务流程]", `[IndexPage] 正在收藏候选人 ${Number(payload?.index) + 1}/${payload?.total} ` +
          `geekId=${payload?.geekId || ""}`
      );
    } else if (stage === "collected") {
      setPhase("FETCHED");
      console.log("[任务流程] [IndexPage] BOSS 推荐候选人收藏完成:", payload);
    }
  }

  // 推荐渠道：用于 /results 开批、封批及现有简历去重。
  const recommendTaskChannel =
    _taskForPhase &&
    Array.isArray(_taskForPhase.channels) &&
    _taskForPhase.channels.find(
      (c) => c.businessChannel === "RECOMMEND" && c.channelSubType === "BOSS"
    );
  const recommendTaskChannelId = recommendTaskChannel?.taskChannelId;

  // ★ 该会话**所有**推荐(BOSS)渠道 taskChannelId（含历史任务）：保留增量(CONTINUE)时当前渠道是新建空的，
  //   只用它去重会漏掉之前几次推荐已入库的人 → 采集时不跳过 → 最终新增少几个。合并全部渠道一起去重。
  const recommendTaskChannelIds = [];
  try {
    const stx = store.state?.SearchTasks || {};
    const ids = stx.chatTaskIdx?.[_cidForPhase] || [];
    for (const tid of ids) {
      const t = stx.tasksById?.[tid];
      if (!t || !Array.isArray(t.channels)) continue;
      for (const c of t.channels) {
        if (
          c.businessChannel === "RECOMMEND" &&
          c.channelSubType === "BOSS" &&
          c.taskChannelId
        ) {
          recommendTaskChannelIds.push(c.taskChannelId);
        }
      }
    }
  } catch (e) {
    console.warn("[任务流程] [IndexPage] 收集推荐渠道 id 失败（忽略）:", e?.message || e);
  }

  const cid = args?.chatId || store.getters.getLatestChatId;
  // 画像评分批次：人数由公共配置统一控制（保存 → 上传 → 评分 → SSE 通过名单 → 回列表收藏）。
  const batchSize = SCORE_BATCH_SIZE;
  const targetCount = Math.max(0, Number(args?.targetCount) || 0);
  const MAX_SCORE_BATCHES = 50;

  const cumulativeBlindIds = new Set();
  // 本任务累计的候选人 ID → geek，用于 SSE 返回通过 ID 后回 BOSS 推荐列表收藏。
  const candidateGeekById = new Map();
  // /results 上送的 uniqSign → BOSS encryptGeekId（DOM data-geekid）。
  // 约定：SSE 结果回到前端的是 uniqSign，必须靠这份映射找到可点击收藏的候选人。
  const uniqSignToEncryptGeekId = new Map();
  // 已收藏过的候选人（按 geek 维度去重），避免 SSE 返回累计 ID 时重复打开详情。
  const collectedCandidateIds = new Set();
  // SSE 的 passedUniqSigns 是任务累计名单：这里按 uniqSign 级别再记一层，
  // 前面批次已处理过的 ID 直接跳过，不再反查/滚动/打开详情。
  const collectedUniqSigns = new Set();
  // 同一个 geek 可能对应多个 ID 口径，记录 geek → 其 uniqSign，收藏后一并标记。
  const uniqSignsByGeekKey = new Map();
  let scoreBatchNo = 1;
  let processedBatchCount = 0;
  let hardFailed = false;
  let entitlementNotified = false;
  let recommendTabId = null;
  let pendingRecommendGeeks = [];

  /** 本任务是否已被用户主动停止（停止后不再抓下一批 / 不再封批） */
  const isUserStopped = () =>
    Boolean(
      _taskIdForPhase &&
        store.state?.SearchTasks?.userStoppedTaskIds?.[String(_taskIdForPhase)] === true
    );

  try {
    while (scoreBatchNo <= MAX_SCORE_BATCHES) {
      if (isUserStopped()) {
        console.log(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 任务已被用户停止，结束抓取（不封批/不等待评分）`
        );
        hardFailed = true;
        break;
      }

      console.log(
        `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 开始：targetCount=${targetCount} batchSize=${batchSize}`
      );
      console.log("[任务流程] [IndexPage] 推荐任务 BOSS 筛选条件:", args?.bossFilters || null);
      store.commit("setCurrentRecommendJobId", jobId);
      store.commit("setBossRecommendFetching", { jobId, fetching: true });
      setPhase("FETCHING");

      let res;
      try {
        res = await runBossRecommend({
          encryptJobId: jobId,
          // 每批最多发现 batchSize 个未入库候选人；本批先评分，SSE 返回通过名单后再收藏。
          targetCount: batchSize,
          discoverOnly: true,
          bossFilters: args?.bossFilters || null,
          humanizeOpts: args?.humanizeOpts || {},
          onProgress,
          recommendTaskChannelId: recommendTaskChannelId || null,
          recommendTaskChannelIds,
          // 首批打开并选择职位；后续批次复用同一个推荐页，从当前列表继续往后加载。
          reuseTabId: recommendTabId,
          pendingGeekList: pendingRecommendGeeks,
          stopAfter: args?.stopAfter,
          // ★ 传本次运行所属 taskId：用户停旧任务→开新任务时，humanize 循环只认这个 id 的停止标记，
          //   不会因"最新任务变成新任务"而漏判（修复停止后仍在跑/串台）
          abortTaskId: _taskIdForPhase
        });
      } catch (e) {
        console.warn(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} runBossRecommend 异常:`,
          e?.message || e
        );
        res = { ok: false, errorCode: "EXCEPTION", message: e?.message || String(e) };
      }

      if (res?.tabId) recommendTabId = res.tabId;
      pendingRecommendGeeks = Array.isArray(res?.pendingGeekList) ? res.pendingGeekList : [];

      const entitlementStopped = res?.errorCode === "BOSS_ENTITLEMENT_REQUIRED";
      const partialGeekCount = Array.isArray(res?.geekList) ? res.geekList.length : 0;
      const hasPartialEntitlementResults = entitlementStopped && partialGeekCount > 0;

      if (!res || (!res.ok && !hasPartialEntitlementResults)) {
        console.warn("[任务流程] [IndexPage] runBossRecommend failed:", res?.errorCode, res?.message);
        if (processedBatchCount === 0) {
          setPhase("FAILED");
          store.commit("setBossRecommendError", {
            jobId,
            error: { code: res?.errorCode, message: res?.message }
          });
        }

        // ★ LOGIN_EXPIRED 路径：顶部红 banner + 停止当前 chat 所有任务 + 上报后端
        if (res?.errorCode === "LOGIN_EXPIRED") {
          hardFailed = true;
          const cidForStop = args?.chatId || store.getters.getLatestChatId;
          const taskForStop = cidForStop
            ? store.getters["SearchTasks/getLatestTaskByChat"](cidForStop)
            : null;
          const recommendChannel = taskForStop?.channels?.find(
            (c) => c.businessChannel === "RECOMMEND"
          );
          handleChannelLoginExpired(store, {
            channelKey: "BOSS",
            chatId: cidForStop,
            taskChannelId: recommendChannel?.taskChannelId,
            errorMessage: res?.message || "BOSS 推荐接口返回登录失效"
          }).catch((e) =>
            console.warn("[任务流程] [IndexPage] handleChannelLoginExpired error:", e?.message || e)
          );
          notify.warning(
            `检测到「${CHANNEL_DISPLAY_NAME.BOSS}」账号异常/已下线，相关任务已自动停止。请重新登录后恢复。`
          );
        } else if (res?.errorCode === "BOSS_ENTITLEMENT_REQUIRED") {
          hardFailed = true;
          store.commit("SearchTasks/setRecommendClientOutcome", {
            taskId: _taskIdForPhase,
            outcome: {
              code: "BOSS_ENTITLEMENT_REQUIRED",
              message: "BOSS直聘查看权益不足，推荐任务已停止"
            }
          });
          notify.warning("BOSS直聘查看权益不足，推荐任务已停止");
        } else {
          hardFailed = true;
          store.commit("SearchTasks/setRecommendClientOutcome", {
            taskId: _taskIdForPhase,
            outcome: {
              code: res?.errorCode || "RECOMMEND_FAILED",
              message: res?.message || "获取 BOSS 推荐候选人失败"
            }
          });
          if (["TIMEOUT", "NOT_ATTACHED"].includes(res?.errorCode)) {
            notify.warning("未获取到 BOSS 推荐列表接口响应，任务已停止。请检查 BOSS 页面是否正常加载及网络监听日志。");
          }
        }
        break;
      }

      // 查看权益在本轮中途耗尽时，runBossRecommend 会带回此前已经真实收藏成功的人。
      // 这些结果必须继续落库、触发 AI 评分；仅在所有结果处理完成后，将推荐渠道以权益不足失败收尾。
      const mustStopAfterBatch = hasPartialEntitlementResults;
      if (hasPartialEntitlementResults && !entitlementNotified) {
        entitlementNotified = true;
        hardFailed = true;
        store.commit("setBossRecommendError", {
          jobId,
          error: { code: res.errorCode, message: res.message }
        });
        store.commit("SearchTasks/setRecommendClientOutcome", {
          taskId: _taskIdForPhase,
          outcome: {
            code: "BOSS_ENTITLEMENT_REQUIRED",
            message: res.message || "BOSS直聘查看权益不足，推荐任务已停止",
            partialResultCount: partialGeekCount
          }
        });
        notify.warning(
          `BOSS直聘查看权益不足，已保留已获取的 ${partialGeekCount} 份简历，任务停止`
        );
      }

      // 上传前最后一道关：本任务若已被用户主动停止，丢弃本次推荐结果
      if (isUserStopped()) {
        console.warn(
          `[任务流程] [IndexPage] 推荐流程返回但本任务(${_taskIdForPhase})已被用户停止，丢弃结果：不落库/不评分/不上传`
        );
        hardFailed = true;
        break;
      }

      const geekList = Array.isArray(res.geekList) ? res.geekList : [];
      if (geekList.length === 0) {
        console.log(`[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 本批无新增候选人，结束`);
        break;
      }

      const cumulativeKeys = new Set(
        cumulativeGeeks.map(
          (item) => item?.encryptGeekId || item?.geekId || item?.geekCard?.geekId || ""
        )
      );
      for (const geek of geekList) {
        const geekKey = geek?.encryptGeekId || geek?.geekId || geek?.geekCard?.geekId || "";
        if (geekKey && cumulativeKeys.has(geekKey)) continue;
        cumulativeGeeks.push(geek);
        if (geekKey) cumulativeKeys.add(geekKey);
      }
      store.commit("setBossRecommendList", {
        jobId,
        geekList: [...cumulativeGeeks],
        totalSize: cumulativeGeeks.length,
        hasMore: res.hasMore,
        fetchedAt: Date.now()
      });
      store.commit("setBossRecommendFetching", { jobId, fetching: true });

      console.log(
        `[任务流程] [IndexPage] BOSS 推荐批次 ${scoreBatchNo} 完成 total=${
          geekList.length
        } cumulative=${cumulativeGeeks.length} hasMore=${res.hasMore}`
      );

      // ===== 1) /results 开批：落库本批候选，显式标记批次尚未结束 =====
      const adaptedResumeList = geekList.map((g) => mapBossRecommendGeekToSearchRaw(g));
      let jobList = [];
      try {
        const { postBatchResultsToTaskChannel } = await import(
          "src/pluginSrc/util/taskResumeBridge"
        );
        jobList = await postBatchResultsToTaskChannel({
          chatId: cid,
          channelDesc: "boss直聘",
          businessChannel: "RECOMMEND",
          resumeList: adaptedResumeList,
          scoreBatchNo,
          scoreBatchComplete: false
        });
      } catch (e) {
        console.warn(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} /results 异常:`,
          e?.message || e
        );
        hardFailed = true;
        break;
      }

      const savedCount = Array.isArray(jobList) ? jobList.length : 0;
      console.log(
        "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} /results ok: geekList=${
          geekList.length
        } → taskResumes=${savedCount}` +
          ` (jobList 前 3 条 ID 样例: ${
            savedCount > 0
              ? jobList
                  .slice(0, 3)
                  .map((r) => `tri=${r?.taskResumeId}/blind=${r?.resumeBlindId}`)
                  .join(" | ")
              : "(empty)"
          })`
      );

      if (savedCount === 0) {
        console.warn(
          "[任务流程]", "[IndexPage] 推荐 /results 没拿到 taskResumes，后端可能未触发 AI 评分链路；" +
            "请检查 Network 里这条 /results 的 Response Body 看 data.taskResumes 字段"
        );
        if (processedBatchCount === 0) setPhase("FAILED");
        hardFailed = true;
        break;
      }
      processedBatchCount++;
      setPhase("SAVED");
      setPhase("SCORING");

      // ===== 2) 回填 ID 映射（供 UI / 「立即沟通」反查）=====
      const matchTaskResumeRow = buildTaskResumeRowMatcher(jobList, geekList.length);
      const geekIdPairs = [];
      let uniqSignMappedCount = 0;
      for (let i = 0; i < geekList.length; i++) {
        const geek = geekList[i] || {};
        const row = matchTaskResumeRow(geek, i);
        const card = geek.geekCard || {};
        const taskResumeId = row?.taskResumeId;
        const resumeBlindId = row?.resumeBlindId || row?.id;
        const encryptGeekId = geek?.encryptGeekId || card?.encryptGeekId || "";
        const plainGeekId = card?.geekId || geek?.geekId || "";
        // ★ 以后端实际收到的那份 uniqSign 为准（mapBossRecommendGeekToSearchRaw 生成）。
        const uniqSign = normalizeCandidateId(adaptedResumeList[i]?.uniqSign);

        for (const id of collectGeekCandidateIds(geek, row)) {
          candidateGeekById.set(id, geek);
        }

        if (uniqSign) {
          candidateGeekById.set(uniqSign, geek);
          const geekKey = geekIdentityKey(geek);
          if (geekKey) {
            let signs = uniqSignsByGeekKey.get(geekKey);
            if (!signs) {
              signs = new Set();
              uniqSignsByGeekKey.set(geekKey, signs);
            }
            signs.add(uniqSign);
          }
          if (encryptGeekId) {
            uniqSignToEncryptGeekId.set(uniqSign, encryptGeekId);
            // 同步写入 sessionStorage（跨步骤/跨页面都能按 uniqSign 反查到 encryptGeekId）。
            geekIdPairs.push({ localId: uniqSign, geekId: encryptGeekId });
            uniqSignMappedCount++;
          }
        }

        if (!row) continue;
        const outId = plainGeekId ? `rec_${plainGeekId}` : "";

        if (resumeBlindId && taskResumeId) {
          cumulativeBlindIds.add(String(resumeBlindId));
          if (encryptGeekId) {
            store.commit("patchBossRecommendGeek", {
              jobId,
              encryptGeekId,
              patch: {
                resumeBlindId: String(resumeBlindId),
                taskResumeId: String(taskResumeId)
              }
            });
            geekIdPairs.push({ localId: resumeBlindId, geekId: encryptGeekId });
            geekIdPairs.push({ localId: taskResumeId, geekId: encryptGeekId });
          }
        }
        if (outId && encryptGeekId) geekIdPairs.push({ localId: outId, geekId: encryptGeekId });
      }
      console.log(
        `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} uniqSign→encryptGeekId 映射 ${uniqSignMappedCount}/${geekList.length}`
      );
      try {
        const { rememberGeekIds } = await import("src/util/automation/recommendGeekIdMap");
        rememberGeekIds(geekIdPairs);
      } catch (e) {
        console.warn("[任务流程] [IndexPage] 写入 recommendGeekIdMap 失败（忽略）:", e?.message || e);
      }

      // ===== 3) 推荐评分轮询（累计 ID，跨批次继续查）=====
      try {
        const rsu = await import("src/utils/recommendScoreUpdater");
        const recommendScoreUpdater = rsu.default || rsu;
        const allIds = [...cumulativeBlindIds];
        if (allIds.length > 0) {
          recommendScoreUpdater.start({
            resumeBlindIds: allIds,
            onUpdate: (data) => {
              const arr = Array.isArray(data) ? data : [];
              let patched = 0;
              for (const item of arr) {
                const resumeId = item?.resumeBlindId;
                if (!resumeId) continue;
                const score = item?.score;
                const scoreStatus = item?.scoreStatus;
                const isTerminal =
                  scoreStatus === "SUCCESS" ||
                  scoreStatus === "FAILED" ||
                  scoreStatus === "NOT_SUPPORTED" ||
                  scoreStatus === "TIMEOUT" ||
                  (typeof score === "number" && score >= 0);
                if (!isTerminal) continue;
                const finalScore =
                  typeof score === "number"
                    ? score
                    : scoreStatus === "FAILED" ||
                      scoreStatus === "NOT_SUPPORTED" ||
                      scoreStatus === "TIMEOUT"
                    ? -2
                    : null;
                store.commit("patchBossRecommendGeek", {
                  jobId,
                  resumeBlindId: String(resumeId),
                  patch: { score: finalScore, scoreStatus: scoreStatus || null }
                });
                patched++;
              }
              console.log(
                `[任务流程] [IndexPage] 推荐分数 patch 写回 in=${arr.length} patched=${patched}`
              );
            },
            onAllDone: () =>
              console.log(
                `[任务流程] [IndexPage] 推荐评分全部完成 jobId=${jobId} 累计 ${allIds.length} 条`
              ),
            intervalMs: 3000,
            tag: `jobId=${jobId} batch=${scoreBatchNo}`
          });
        }
      } catch (e) {
        console.warn("[任务流程] [IndexPage] recommendScoreUpdater 启动失败:", e?.message || e);
      }

      // ===== 4) 逐条：打开 BOSS 详情 → 截图 → upload(fileId) → /detail =====
      const { postTaskResumeDetail } = await import("src/api/searchTaskApi");
      let uploadOk = 0;
      let uploadFail = 0;
      let detailOk = 0;
      let detailFail = 0;

      console.log(
        `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 开始上传简历 total=${geekList.length} jobList=${jobList.length}`
      );
      for (let i = 0; i < geekList.length; i++) {
        if (isUserStopped()) break;
        const geek = geekList[i] || {};
        const row = matchTaskResumeRow(geek, i);
        if (!row) {
          const card = geek.geekCard || {};
          console.warn(
            "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} 无法匹配 taskResumeId，跳过上传 index=${i} ` +
              `geekId=${card.geekId || geek.geekId || ""} uniqSign=${adaptedResumeList[i]?.uniqSign || ""} ` +
              `jobList.outIds=[${(jobList || []).map((r) => extractTaskResumeRowOutId(r) || "(empty)").join(", ")}]`
          );
          detailFail++;
          continue;
        }
        const card = geek.geekCard || {};
        const taskResumeId = row?.taskResumeId;
        const resumeBlindId = row?.resumeBlindId || row?.id;
        if (!taskResumeId || !resumeBlindId) {
          console.warn(
            "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} /results 行缺少 ID，跳过上传 index=${i} ` +
              `taskResumeId=${taskResumeId || "(empty)"} resumeBlindId=${resumeBlindId || "(empty)"} ` +
              `rowKeys=[${Object.keys(row || {}).slice(0, 20).join(",")}]`
          );
          detailFail++;
          continue;
        }

        const encryptGeekId = geek?.encryptGeekId || card?.encryptGeekId || "";
        const plainGeekId = card?.geekId || geek?.geekId || "";
        const outId = plainGeekId
          ? `rec_${plainGeekId}`
          : encryptGeekId
          ? String(encryptGeekId)
          : "";

        let uploaded;
        try {
          console.log(
            "[任务流程]", `[IndexPage] 上传简历 ${i + 1}/${geekList.length} taskResumeId=${taskResumeId} ` +
              `blindId=${resumeBlindId} securityId=${card?.securityId ? "yes" : "no"} ` +
              `encryptGeekId=${encryptGeekId || "(empty)"}`
          );
          uploaded = await buildAndUploadBossRecommendResume(
            geek,
            resumeBlindId,
            res?.tabId,
            isUserStopped
          );
          uploadOk++;

          // 结果卡片后续的分配职位 / 加入人才库直接使用上传得到的 fileId。
          // /search/task/results/query 不保证返回 fileId，因此同时回写当前列表和会话缓存。
          store.commit("patchBossRecommendGeek", {
            jobId,
            encryptGeekId,
            resumeBlindId,
            patch: { fileId: uploaded.fileId }
          });
          try {
            const { rememberFileIds } = await import(
              "src/util/automation/recommendFileIdMap"
            );
            rememberFileIds([
              { localId: resumeBlindId, fileId: uploaded.fileId },
              { localId: taskResumeId, fileId: uploaded.fileId },
              { localId: adaptedResumeList[i]?.uniqSign, fileId: uploaded.fileId }
            ]);
          } catch (e) {
            console.warn(
              "[任务流程] [IndexPage] 写入 recommendFileIdMap 失败（忽略）:",
              e?.message || e
            );
          }
        } catch (e) {
          uploadFail++;
          console.warn(
            `[任务流程] [IndexPage] 推荐简历上传失败 batch=${scoreBatchNo} taskResumeId=${taskResumeId} blindId=${resumeBlindId}:`,
            e?.message || e
          );
          if (e?.code === "BOSS_ENTITLEMENT_REQUIRED") {
            hardFailed = true;
            store.commit("SearchTasks/setRecommendClientOutcome", {
              taskId: _taskIdForPhase,
              outcome: {
                code: "BOSS_ENTITLEMENT_REQUIRED",
                message: "BOSS直聘查看权益不足，推荐任务已停止"
              }
            });
            notify.warning("BOSS直聘查看权益不足，推荐任务已停止");
            break;
          }
          if (e?.code === "TASK_STOPPED") break;
          continue;
        }

        if (isUserStopped()) break;
        const payload = {
          fileId: uploaded.fileId,
          serializeChannel: "boss直聘",
          channelSubType: "BOSS",
          channel: "BOSS直聘",
          content: uploaded.content,
          resume: {
            id: String(resumeBlindId),
            outId
          }
        };
        const detailStartedAt = Date.now();
        console.log(
          "[任务流程]", `[IndexPage] /detail >>> taskResumeId=${taskResumeId} resumeBlindId=${resumeBlindId}` +
            ` outId=${outId || "(empty)"} fileId=${uploaded.fileId}` +
            ` contentLen=${payload.content?.length || 0} (batch=${scoreBatchNo} ${i + 1}/${geekList.length})`
        );
        try {
          const detailResp = await postTaskResumeDetail(taskResumeId, payload);
          detailOk++;
          console.log(
            "[任务流程]", `[IndexPage] /detail <<< ok ${Date.now() - detailStartedAt}ms taskResumeId=${taskResumeId}` +
              ` success=${detailResp?.success ?? "-"} code=${detailResp?.code ?? "-"}`
          );
        } catch (e) {
          detailFail++;
          console.warn(
            "[任务流程]", `[IndexPage] /detail !!! failed ${Date.now() - detailStartedAt}ms taskResumeId=${taskResumeId}` +
              ` blindId=${resumeBlindId} fileId=${uploaded.fileId}:`,
            e?.message || e
          );
        }
      }
      console.log(
        "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} 简历处理完成 uploadOk=${uploadOk} uploadFail=${uploadFail}` +
          ` detailOk=${detailOk} detailFail=${detailFail} total=${jobList.length}`
      );

      // 没有任何详情保存成功 = 后端不会进入评分链路，封批后也等不到 SSE。
      if (detailOk === 0) {
        console.warn(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 本批没有一条 /detail 成功，跳过封批与 SSE 等待`
        );
        hardFailed = true;
        break;
      }

      if (isUserStopped()) {
        console.log(`[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 用户已停止，不封批`);
        hardFailed = true;
        break;
      }

      const latestTaskForScoring = cid
        ? store.getters["SearchTasks/getLatestTaskByChat"](cid)
        : null;
      const taskIdForScoring = latestTaskForScoring?.taskId || _taskIdForPhase;
      if (!taskIdForScoring) {
        console.warn(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 缺 taskId，无法等待评分结果，结束`
        );
        hardFailed = true;
        break;
      }

      // ===== 5) /results 封批：与开批使用同一个 scoreBatchNo =====
      const scoringTaskChannel =
        latestTaskForScoring?.channels?.find(
          (channel) =>
            channel.businessChannel === "RECOMMEND" && channel.channelSubType === "BOSS"
        ) || recommendTaskChannel;
      try {
        await sealScoreBatch({
          taskChannelId: scoringTaskChannel?.taskChannelId || recommendTaskChannelId,
          chatId: cid,
          taskId: taskIdForScoring,
          searchConditionId: scoringTaskChannel?.searchConditionId,
          businessChannel: "RECOMMEND",
          channelSubType: "BOSS",
          serializeChannel: "boss直聘",
          scoreBatchNo
        });
      } catch (e) {
        console.warn(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 封批失败:`,
          e?.message || e
        );
        hardFailed = true;
        break;
      }

      // ===== 6) 等 SSE 决定是否继续 =====
      // 只有封批请求成功后才等待后端完成本批评分。
      const batchCompletion = await waitForScoreBatchCompleted({
        taskId: taskIdForScoring,
        scoreBatchNo,
        timeoutMs: 10 * 60 * 1000
      });
      const passedIds = Array.isArray(batchCompletion.passedIds)
        ? batchCompletion.passedIds
        : [];
      console.log(
        `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 评分完成: received=${
          batchCompletion.received
        } passedCount=${batchCompletion.passedCount} passedIds=${
          passedIds.length
        } targetCount=${
          batchCompletion.targetCount ?? targetCount
        } shouldContinue=${batchCompletion.shouldContinue}`
      );

      if (!batchCompletion.received) {
        console.warn(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 未收到 RESUME_SCORE_BATCH_COMPLETED，停止继续抓取`
        );
        break;
      }

      // ===== 7) SSE 通过名单 → 回 BOSS 推荐列表逐个打开详情收藏 =====
      // 这一批先评分后收藏：只有通过画像评分的人才打开详情，不通过的人不产生收藏动作。
      // 后端统一返回 uniqSign：先按 uniqSign → encryptGeekId 反查，再定位 geek 卡片。
      let lookupPersistedGeekId = () => null;
      try {
        const idMap = await import("src/util/automation/recommendGeekIdMap");
        if (typeof idMap.lookupGeekId === "function") {
          lookupPersistedGeekId = idMap.lookupGeekId;
        }
      } catch (e) {
        console.warn("[任务流程] [IndexPage] 加载 uniqSign→encryptGeekId 持久映射失败（忽略）:", e?.message || e);
      }

      let passedGeeks = [];
      const passedGeekKeys = new Set();
      let skippedCollectedUniqSigns = 0;
      let unmatchedUniqSigns = 0;
      for (const rawId of passedIds) {
        const id = normalizeCandidateId(rawId);
        if (!id) continue;

        // ★ passedUniqSigns 是任务累计名单：上一批已经收藏过的人直接跳过。
        if (collectedUniqSigns.has(id)) {
          skippedCollectedUniqSigns++;
          continue;
        }

        const mappedEncryptGeekId = normalizeCandidateId(
          uniqSignToEncryptGeekId.get(id) || lookupPersistedGeekId(id) || ""
        );
        const geek =
          candidateGeekById.get(id) ||
          (mappedEncryptGeekId
            ? candidateGeekById.get(mappedEncryptGeekId)
            : null) ||
          candidateGeekById.get(`rec_${id}`);
        if (!geek) {
          unmatchedUniqSigns++;
          console.warn(
            "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo}: 通过 uniqSign 未找到候选人 uniqSign=${id} ` +
              `encryptGeekId=${mappedEncryptGeekId || "(none)"}`
          );
          continue;
        }
        const geekKey = geekIdentityKey(geek);
        if (!geekKey) {
          unmatchedUniqSigns++;
          continue;
        }

        // 兼容同一 geek 被多个 ID 口径重复推送：geek 已经收藏过也直接跳过。
        if (collectedCandidateIds.has(geekKey)) {
          collectedUniqSigns.add(id);
          skippedCollectedUniqSigns++;
          continue;
        }

        let signs = uniqSignsByGeekKey.get(geekKey);
        if (!signs) {
          signs = new Set();
          uniqSignsByGeekKey.set(geekKey, signs);
        }
        signs.add(id);

        if (passedGeekKeys.has(geekKey)) continue;
        passedGeekKeys.add(geekKey);
        passedGeeks.push(geek);
      }
      console.log(
        "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} SSE 累计通过 ${passedIds.length} 个 uniqSign：` +
          `已收藏跳过=${skippedCollectedUniqSigns} 未匹配=${unmatchedUniqSigns} 本批新增=${passedGeeks.length}`
      );

      // 兜底：后端只给 passedCount、没给通过 ID 时，只有“整批都通过”才能安全推断名单。
      if (passedGeeks.length === 0 && passedIds.length === 0 && batchCompletion.passedCount > 0) {
        if (batchCompletion.passedCount >= geekList.length) {
          passedGeeks = [...geekList];
          console.warn(
            `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: SSE 未返回通过 ID，但整批 ${geekList.length} 人全部通过，按全批收藏`
          );
        } else {
          console.warn(
            "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo}: SSE passedCount=${batchCompletion.passedCount} 但未返回通过 ID，` +
              `无法安全定位候选人，本批跳过收藏`
          );
        }
      } else if (passedIds.length > 0 && passedGeeks.length === 0 && unmatchedUniqSigns > 0) {
        console.warn(
          "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo}: SSE 返回了 ${passedIds.length} 个通过 ID，` +
            `其中 ${unmatchedUniqSigns} 个无法匹配到候选人（其余已在之前批次收藏）`,
          passedIds
        );
      } else if (passedIds.length > 0 && passedGeeks.length === 0) {
        console.log(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: SSE 累计通过名单均已在前序批次收藏，无需重复打开详情`
        );
      }

      const geeksToCollect = passedGeeks.filter((geek) => {
        const key = geekIdentityKey(geek);
        return key && !collectedCandidateIds.has(key);
      });
      console.log(
        "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} 待收藏候选人: passed=${passedGeeks.length} ` +
          `needOpenDetail=${geeksToCollect.length}`
      );

      if (geeksToCollect.length > 0) {
        if (isUserStopped()) {
          console.log(
            `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 用户已停止，跳过本批通过候选人的收藏`
          );
          hardFailed = true;
          break;
        }

        const { collectBossRecommendGeeks } = await import(
          "src/util/automation/bossRecommendCollect"
        );
        let collectRes = null;
        try {
          collectRes = await collectBossRecommendGeeks(res.tabId, geeksToCollect, {
            targetCount: geeksToCollect.length,
            shouldAbort: isUserStopped,
            onProgress: (stage, payload) => onProgress(`collect.${stage}`, payload)
          });
        } catch (e) {
          console.warn(
            `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 通过候选人收藏异常:`,
            e?.message || e
          );
          collectRes = { ok: false, errorCode: "EXCEPTION", message: e?.message || String(e) };
        }

        // 无论单个收藏是否成功，都记入去重集合，避免下一批 SSE 返回累计名单时重复打开详情。
        for (const geek of geeksToCollect) {
          const key = geekIdentityKey(geek);
          if (!key) continue;
          collectedCandidateIds.add(key);
          for (const sign of uniqSignsByGeekKey.get(key) || []) {
            collectedUniqSigns.add(sign);
          }
        }

        console.log(
          "[任务流程]", `[IndexPage] 推荐批次 ${scoreBatchNo} 收藏完成: attempted=${
            collectRes?.attemptedGeekIds?.length || 0
          } collected=${collectRes?.collectedGeekIds?.length || 0} ` +
            `alreadyCollected=${collectRes?.alreadyCollectedGeekIds?.length || 0} ` +
            `errors=${collectRes?.errors?.length || 0}`
        );
        if (Array.isArray(collectRes?.errors) && collectRes.errors.length > 0) {
          console.warn(
            `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 部分候选人收藏失败:`,
            collectRes.errors
          );
        }

        const entitlementError =
          collectRes?.errorCode === "BOSS_ENTITLEMENT_REQUIRED" ||
          (Array.isArray(collectRes?.errors) &&
            collectRes.errors.some((item) => item?.errorCode === "BOSS_ENTITLEMENT_REQUIRED"));
        if (entitlementError) {
          hardFailed = true;
          store.commit("SearchTasks/setRecommendClientOutcome", {
            taskId: _taskIdForPhase,
            outcome: {
              code: "BOSS_ENTITLEMENT_REQUIRED",
              message: "BOSS直聘查看权益不足，推荐任务已停止"
            }
          });
          notify.warning("BOSS直聘查看权益不足，推荐任务已停止");
          break;
        }
        if (collectRes?.aborted) {
          console.log(
            `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 收藏过程被用户停止，结束任务`
          );
          hardFailed = true;
          break;
        }
        if (!collectRes?.ok) {
          console.warn(
            `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo} 收藏批次失败:`,
            collectRes?.errorCode,
            collectRes?.message
          );
        }
      } else {
        console.log(
          `[任务流程] [IndexPage] 推荐批次 ${scoreBatchNo}: 本批无待收藏的通过候选人，不打开详情`
        );
      }
      // 权益已耗尽或上传阶段失败：本批评分与通过名单处理完再停，不再抓下一批。
      if (mustStopAfterBatch || hardFailed) break;
      // 是否继续只看 SSE 的 shouldContinue；只有明确为 false 才结束。
      if (batchCompletion.shouldContinue === false) break;

      scoreBatchNo++;
    }

    if (scoreBatchNo > MAX_SCORE_BATCHES) {
      console.warn(
        `[任务流程] [IndexPage] 推荐批次达到护栏上限 ${MAX_SCORE_BATCHES}，停止继续抓取`
      );
    }
  } catch (e) {
    console.warn("[任务流程] [IndexPage] 推荐批次流程异常:", e?.message || e);
    hardFailed = true;
  } finally {
    store.commit("SearchTasks/setBossRecommendRpaActive", false);
    // 流程结束 / 失败都要关蒙层；放 finally 防止 throw 时蒙层卡住
    try {
      await window?.api?.automation?.hideOverlay?.();
    } catch (e) {
      console.warn("[任务流程] [IndexPage] hideOverlay failed:", e?.message || e);
    }
    // 解锁 BOSS 推荐 tab（用户可以重新 X 关掉它）
    try {
      await unlockRecommendTab();
    } catch (e) {
      console.warn("[任务流程] [IndexPage] unlockRecommendTab failed:", e?.message || e);
    }
  }

  setPhase(hardFailed ? "FAILED" : "DONE");
}

/** 同步已就绪 badge（绿色），跟 ihraisaas selectedJob.isAutoSearchCompleted 一致；先 mock false */
const autoSearchCompleted = ref(false);

/** 当前选中的职位（用于 workspace-toolbar 左侧标题 + code badge） */
const latestChatIdComp = computed(() => store.getters.getLatestChatId);
const currentChatEntity = computed(() => {
  const id = latestChatIdComp.value;
  if (!id) return null;
  const getById = store.getters.getChatById;
  return typeof getById === "function" ? getById(id) : null;
});
const currentJobTitle = computed(() => {
  const name = currentChatEntity.value?.name || "";
  if (!name) return "";
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : name.trim();
});
const currentJobCode = computed(() => {
  const name = currentChatEntity.value?.name || "";
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[2].trim() : "";
});

const embeddedChatRef = ref(null);

/**
 * 把 embedded ChatCard 的 ref commit 到 store，让其他组件（LeftMenu 等）
 * 通过 `store.getters.getChatCardRefValue` 拿到正确的实例
 * （浏览器模式下这个 ref 由 FloatingActionPanel commit，嵌入式模式由这里 commit）
 */
watch(
  embeddedChatRef,
  (ref) => {
    if (ref) {
      store.commit("changeChatCardRef", ref);
    }
  },
  { immediate: false }
);

/**
 * 「清空当前对话」工具栏按钮入口（WorkspaceContainer 顶部）。
 *
 * 流程：
 *   1) 用户点击 → 弹出 ClearChatConfirmModal 确认框（1:1 对照 ihraisaas 设计）
 *   2) 用户点「确认清空」→ confirmClearChat 调 ChatCard.clearCurrentChat
 *      → 本地清消息 + await GET /ihire/chat/clearChatHistory?chatId=xxx（后端清历史）
 *   3) 切回 chat 视图（如果用户当前在 results 视图）
 *
 * 注意：clearCurrentChat 内部保留 chatId（跟 handleNewChat 新建会话语义不同），
 *       只清空当前职位对话内容，职位绑定 / 搜索条件 / 任务 store 不动。
 *       后端调用走"本地优先 + 后端异步"策略：本地立即清 → await 后端 → 失败仅日志不阻塞 UI。
 */
const clearChatConfirmVisible = ref(false);
/**
 * 当前职位是否有「进行中」任务（RUNNING/WAITING/RESTING 或 AI 评分中）→ 禁用清空记录。
 * 复用 canCreateForChat（与创建任务的拦截口径一致）：不能创建 = 有任务在跑。
 */
const clearChatDisabled = computed(() => {
  const cid = store.getters.getLatestChatId;
  if (!cid) return false;
  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  return typeof canCreate === "function" ? !canCreate(cid) : false;
});

function handleClearChat() {
  // 任务进行中不允许清空记录（按钮已 disabled，这里再兜一层防御）
  if (clearChatDisabled.value) {
    notify.warning("任务正在进行中，暂不能清空记录，请等待任务完成后再操作");
    return;
  }
  clearChatConfirmVisible.value = true;
}
async function confirmClearChat() {
  // ★ 先切视图（UX 优先）→ 再 await 清空（本地 + 后端）
  //   不能反过来：clearCurrentChat 内部 await 后端可能 ~200-500ms，
  //   先 await 会让用户看到弹框关了但视图还停在 results 半秒，体感卡。
  currentView.value = "chat";
  try {
    const chatCard = embeddedChatRef.value;
    if (chatCard && typeof chatCard.clearCurrentChat === "function") {
      await chatCard.clearCurrentChat();
    } else {
      console.warn("[IndexPage] embeddedChatRef.clearCurrentChat 不可用，跳过");
    }
  } catch (e) {
    console.warn("[IndexPage] confirmClearChat 异常：", e?.message || e);
  }
}

/**
 * 用户点 "返回对话" 按钮 —— 切回 chat 视图 + 清掉 viewing 状态。
 *
 * 清 viewing 是关键：如果当前 chat 处于 viewing 模式（在看某个历史 task 的结果），
 * 切回 chat 视图后下次再进 results 视图（比如点 aggregate / 测试按钮）默认应该显示
 * runtime 数据，而不是上次的历史 task。所以这里 commit clearCurrentViewingTask 让
 * UI 走 ChannelConfig 默认数据。
 *
 * 用户如果想再看那个历史 task，重新点 task_completion_card 的 "查看结果" 即可，
 * ViewingResults.byTaskId 缓存还在（同 taskId 会直接复用，不重新 fetch API）。
 */
function handleBackToChat() {
  currentView.value = "chat";
  const cid = store.getters.getLatestChatId;
  if (cid) {
    // 旧 viewing 全局状态清掉（兼容老调用方）
    store.commit("clearCurrentViewingTask", cid);

    // 新链路：清 viewingTaskIdByChatId[cid] → currentViewingTaskId 回 null →
    //   AISearch :key 变成 'runtime' → 上次的 task-A AISearch 实例直接销毁，新建 runtime 实例 →
    //   5 个 channel 组件 fallback 到 ChannelConfig.ALL（runtime）。
    //
    // 同时清掉对应 viewing bucket + cache 标志，避免下次进结果页时：
    //   - 旧数据短暂可见（key 变了组件销毁能挡住，但 store 还有数据是脏的）
    //   - lastViewedTaskIdForCache 命中导致跳过 API 拉取
    if (viewingTaskIdByChatId.value[cid]) {
      const oldTaskId = viewingTaskIdByChatId.value[cid];
      const next = { ...viewingTaskIdByChatId.value };
      delete next[cid];
      viewingTaskIdByChatId.value = next;
      store.commit("clearViewingTaskResults", oldTaskId);
      if (lastViewedTaskIdForCache.value === oldTaskId) {
        lastViewedTaskIdForCache.value = null;
      }
    }
  }
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
  const effectiveChatId = opts?.chatId || chatId.value || "";
  if (!effectiveChatId) {
    return { status: "FAILED", message: "no chatId" };
  }
  if (store.getters.getAggregateSearchInFlight) {
    console.log("[任务流程] [IndexPage] runRealAggregateSearch SKIPPED: 已有聚合搜索在跑");
    return { status: "SKIPPED", message: "already in flight" };
  }
  const modules = opts?.selectedModules || {};
  // 搜索牛人已下架，旧消息或历史任务即使仍携带 search=true 也不能重新触发。
  const searchChecked = false;
  const recommendChecked = !!modules.recommend;
  const jobId = normalizeBossJobId(opts?.matchedBossJobId);

  store.commit("setAggregateSearchInFlight", true);
  try {
    if (recommendChecked && !jobId) {
      console.warn(
        "[任务流程] [IndexPage] runRealAggregateSearch: 推荐牛人缺少有效 BOSS 职位 ID，停止执行"
      );
      return {
        status: "FAILED",
        message: "没有有效的 BOSS 职位，请先选择匹配的 BOSS 职位"
      };
    }

    // 搜索：跟 handleAggregateSearch 同步骤的"refreshSearchCondition + executeSearch"
    let searchPromise = null;
    if (searchChecked) {
      if (
        !jobSearchFilterRef.value ||
        typeof jobSearchFilterRef.value.refreshSearchCondition !== "function"
      ) {
        console.warn("[任务流程] [IndexPage] runRealAggregateSearch: jobSearchFilterRef 不可用");
      } else {
        searchPromise = (async () => {
          await jobSearchFilterRef.value.refreshSearchCondition(effectiveChatId);
          if (aiSearchRef.value && typeof aiSearchRef.value.executeSearch === "function") {
            // 把 opts.searchRequestData（来自 handleAggregateSearch 的 prepareConditionOnly）
            // 透传给 executeSearch，让它跳过内部第二次 saveCondition
            await aiSearchRef.value.executeSearch(searchState.value, {
              searchRequestData: opts?.searchRequestData || null
            });
          }
        })();
      }
    }
    // 推荐：和 handleAggregateSearch 同步骤的 doFetchRecommend；await 搜索串行
    let recommendPromise = null;
    if (recommendChecked && jobId) {
      // targetCount：用户期望的「通过画像评分的合格简历数」
      // batchSize：每批最多新增的候选人数，统一读取公共配置
      const targetCount =
        Number(opts?.targetCount) > 0
          ? Number(opts.targetCount)
          : Number(opts?.resumeCount) > 0
          ? Number(opts.resumeCount)
          : 10;
      const batchSize = SCORE_BATCH_SIZE;
      // 批次化流程（见 doFetchRecommend）：
      //   1) 每批 runBossRecommend（discoverOnly）发现最多 batchSize 个未入库候选人，不收藏；
      //   2) /results(scoreBatchNo) → 逐条 upload(fileId) + /detail → /results 封批；
      //   3) 等 SSE RESUME_SCORE_BATCH_COMPLETED，拿到本批打分的通过 ID；
      //   4) 回 BOSS 推荐列表，只对通过的人打开详情收藏；无通过名单则跳过收藏；
      //   5) 按 shouldContinue 决定是否抓下一批。
      // targetCount 传给后端计算 shouldContinue，前端不再自行判断目标数量。
      const args = {
        encryptJobId: jobId,
        targetCount,
        batchSize,
        // 保存条件是本轮实际提交给后端的权威筛选值；本地 task.bossFilters 只作为兜底。
        bossFilters: opts?.searchRequestData
          ? extractBossFilters(opts.searchRequestData)
          : pickBossFilters(opts?.bossFilters || {}),
        humanizeOpts: {},
        awaitBeforeStart: searchPromise
      };
      lastRecommendArgs.value = args;
      recommendPromise = doFetchRecommend(args);
    }
    if (searchPromise) await searchPromise;
    if (recommendPromise) await recommendPromise;
    console.log("[任务流程] [IndexPage] runRealAggregateSearch 完成 chatId=", effectiveChatId);
    return { status: "SUCCESS" };
  } catch (e) {
    console.error("[任务流程] [IndexPage] runRealAggregateSearch 异常:", e?.message || e);
    return { status: "FAILED", message: e?.message || String(e) };
  } finally {
    store.commit("setAggregateSearchInFlight", false);
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

/**
 * BOSS「我的职位」是否存在「招聘中」(jobStatus===0) 的职位。
 *   - 优先读 store 缓存（bossJobListAutoFetch 维护）；空则现拉一次 fetchBossJobList。
 *   - 拿不到列表（未登录 / 接口异常）→ 返回 true（不拦截，放行交运行时兜底），避免误杀。
 */
async function hasPublishedBossJob() {
  const isPublished = (j) => Number(j?.jobStatus) === 0;
  try {
    const cached = store.getters.getBossJobList;
    if (Array.isArray(cached) && cached.length > 0) {
      return cached.some(isPublished);
    }
    const { fetchBossJobList } = await import("src/util/automation/bossJobList");
    const res = await fetchBossJobList();
    const list = res?.zpData?.data;
    if (Array.isArray(list)) return list.some(isPublished);
    return true; // 拿不到 → 放行
  } catch (e) {
    console.warn("[任务流程] [IndexPage] hasPublishedBossJob 检查失败，放行:", e?.message || e);
    return true;
  }
}

async function dispatchTaskStore({
  chatIdToSearch,
  searchChecked,
  recommendChecked,
  jobId,
  positionId = null,
  taskType = "INITIAL",
  sourceTaskId = null,
  payload,
  condId: explicitCondId = null,
  searchRequestData = null
}) {
  // 立刻 set pendingCreate 标记，让业务侧 channelDataSavePlus → postBatchResultsToTaskChannel
  // 知道"任务正在 create 中"，需要短轮询等任务出现，而不是立刻当"任务化未启动"丢调用。
  // 注意：必须在 await 之前 set，不然下面任意 await 都会让搜索请求先到。
  if (chatIdToSearch) {
    store.commit("SearchTasks/setPendingCreate", chatIdToSearch);
  }
  try {
    const channels = [];
    // searchConditionId 来源（优先级从高到低）：
    //   1. caller 显式传入的 explicitCondId（handleAggregateSearch 已经 await prepareConditionOnly
    //      拿到本轮**最新** condId，这是最权威的）。
    //   2. fallback 到 waitForSearchConditionId（向后兼容；老 caller / 没传 condId 时）。
    //      ⚠️ 这条 fallback 有坑：store.getters.getSearchConditionId 可能是上一轮残留的旧 id，
    //      会立刻 resolve 拿到旧 id，导致 create 用的 condId 跟本次 saveCondition 不对应。
    //      所以**新 caller 必须传 condId**。
    let condId = explicitCondId ? String(explicitCondId) : "";
    if (!condId) {
      condId = await waitForSearchConditionId(30000);
    }
    if (!condId) {
      console.warn(
        "[任务流程] [IndexPage] dispatchTaskStore: searchConditionId 30s 内未就绪（runRealAggregateSearch 可能失败），跳过任务创建"
      );
      return { ok: false, errorCode: "NO_SEARCH_CONDITION", message: "searchConditionId 未就绪" };
    }
    console.log(
      `[任务流程] [IndexPage] dispatchTaskStore: 使用 condId=${condId} (explicit=${!!explicitCondId})`
    );

    // 从 settings 读取启用的渠道 + 组装 channels[] —— 走共用工具 buildSearchTaskChannels
    // 跟 AIProfileActionPanel 调 estimate 接口共用一份判定逻辑，避免两边 channel 组装漂移
    // 详见 src/util/searchTaskPayloadBuilder.js 顶部注释
    const cfgList = store.getters.getUserChannelConfig || [];
    console.log(
      "[任务流程] [IndexPage] dispatchTaskStore: cfgList=",
      cfgList
        .map(
          (c) =>
            `${c?.key}:${
              c?.enableConfig === true ? "on" : c?.enableConfig === false ? "off" : "undef"
            }`
        )
        .join(",")
    );

    const builtChannels = buildSearchTaskChannels({
      cfgList,
      selectedModules: { search: searchChecked, recommend: recommendChecked },
      matchedBossJobId: jobId,
      resumeCount: payload?.resumeCount,
      bossFilters: payload?.bossFilters,
      condId
    });
    channels.push(...builtChannels);

    // ★ BOSS 搜索牛人需要在 BOSS直聘发布「招聘中」的职位才能搜。创建前检查 BOSS「我的职位」，
    //   没有任何招聘中的职位 → 只剔除 BOSS-SEARCH 渠道（其它渠道照常创建），并提示去 BOSS 发布。
    //   检查失败（未登录 / 接口异常）→ 不拦截放行，交给运行时兜底（BossJobInfoManager 收到
    //   「发布职位」业务错误会停整任务）。
    const hasBossSearch = channels.some(
      (c) => c.channelSubType === "BOSS" && c.businessChannel === "SEARCH"
    );
    if (hasBossSearch && !(await hasPublishedBossJob())) {
      notify.warning("未在 BOSS直聘发布招聘中的职位，本次跳过 BOSS 搜索牛人，请先在 BOSS直聘发布职位");
      for (let i = channels.length - 1; i >= 0; i--) {
        if (channels[i].channelSubType === "BOSS" && channels[i].businessChannel === "SEARCH") {
          channels.splice(i, 1);
        }
      }
    }

    if (channels.length === 0) {
      console.warn("[任务流程] [IndexPage] dispatchTaskStore: 无启用渠道，跳过任务创建");
      return { ok: false, errorCode: "NO_ENABLED_CHANNEL", message: "没有启用的渠道" };
    }
    console.log(
      `[任务流程] [IndexPage] dispatchTaskStore: 实际下发渠道=${channels
        .map((c) => `${c.channelSubType}-${c.businessChannel}`)
        .join(",")}`
    );
    // taskType:
    //   - 'INITIAL'  首次启动聚合搜索（默认）
    //   - 'RESTART'  来自 TaskCompletionCard "清空并重新搜索" 按钮
    //   - 'CONTINUE' 来自 TaskCompletionCard "保留并增量搜索" 按钮
    // 三者在前端的渠道组装逻辑完全一致，只是落库 search_task.task_type 不一样，
    // 后端基于 taskType 决定是否清空 visible 结果集 / 续在原 resultSet 上追加。
    //
    // sourceTaskId：CONTINUE / RESTART 都要关联上游任务。
    //   - CONTINUE：后端在原 resultSet 上追加结果
    //   - RESTART：新任务真正执行时，客户端先清理上游推荐任务产生的 BOSS 收藏
    const createPayload = {
      chatId: chatIdToSearch,
      // 结果卡片重搜使用原任务职位；普通首次搜索再使用当前选中职位。
      positionId: positionId || store.getters.getLatestPositionId,
      taskType,
      triggerSource: "USER_CLICK",
      channels,
      // searchRequestData：handleAggregateSearch 已 prepareConditionOnly 拿到本轮 saveCondition data，
      // 透传到 task 上，runTask 调 executor 时再透回 runRealAggregateSearch，
      // 让 executeSearch 复用，避免重复发一次 saveCondition。
      searchRequestData,
      // 本地任务执行阶段的兜底数据；后端不依赖该字段，避免 saveCondition 响应未回显
      // 三个外层筛选字段时，current 驱动执行丢失用户选择。
      // prepareConditionOnly 已生成本轮实际保存的条件，优先从它回写任务，避免
      // action panel 初始的 {0,0,0} 覆盖用户刚选择的筛选值。
      bossFilters: searchRequestData
        ? extractBossFilters(searchRequestData)
        : pickBossFilters(payload?.bossFilters || {})
    };
    console.log("[任务流程] [IndexPage] 创建搜索任务使用职位", {
      taskType,
      chatId: chatIdToSearch,
      positionId: createPayload.positionId,
      matchedBossJobId: jobId || null
    });
    // 期望合格简历总数：后端用它 + 累计合格人数计算 shouldContinue
    const targetCount = Number(payload?.targetCount);
    if (Number.isFinite(targetCount) && targetCount > 0) {
      createPayload.targetCount = targetCount;
    }
    if (sourceTaskId && (taskType === "CONTINUE" || taskType === "RESTART")) {
      createPayload.sourceTaskId = sourceTaskId;
    }
    const res = await store.dispatch("SearchTasks/create", createPayload);
    if (res?.ok) {
      console.log(`[任务流程] [IndexPage] SearchTasks/create ok, taskId=${res.taskId}`);
    } else {
      console.warn("[任务流程] [IndexPage] SearchTasks/create 失败:", res?.errorCode, res?.message);
    }
    return res || { ok: false, errorCode: "UNKNOWN", message: "create 无返回值" };
  } catch (e) {
    console.warn("[任务流程] [IndexPage] SearchTasks/create 异常:", e?.message || e);
    return { ok: false, errorCode: "EXCEPTION", message: e?.message || String(e) };
  } finally {
    // 无论成功/失败/异常，都清掉 pendingCreate 标记，避免桥接工具继续无意义等待
    if (chatIdToSearch) {
      store.commit("SearchTasks/clearPendingCreate", chatIdToSearch);
    }
  }
}

// ★ "上一次任务创建还在 dispatching 中"标志位（兜底防抖）
//
// handleAggregateSearch 内部 `prepareConditionOnly + dispatchTaskStore` 是异步链路
// （含 saveCondition 网络 + create 接口），整个跑完可能 1-3s。期间 SearchTasks
// store 里还没有新 task → canCreateForChat 仍返回 true → 用户连点能触发多次 dispatch。
//
// ChatCard 已有 500ms 时间窗防抖兜住常规连点；这里再加一道 in-progress flag
// 兜更长 dispatch 期间的恶意连点（如用户狂点 10 下 → 时间窗能挡住，但万一漏掉一次）。
//
// 用 chatId 维度而非全局：允许不同 chat 同时启动任务（虽然 SearchTasks 队列层面
// 也只允许一次跑一个，但 dispatching 阶段可以并行）。
const _dispatchingChats = new Set(); // Set<chatId>

/**
 * 取 criteria 的三组字段（统一成字符串数组，避免 undefined 参与比较）。
 */
function pickCriteriaOverrideFields(criteria) {
  const src = criteria || {};
  const picked = {};
  CRITERIA_OVERRIDE_FIELDS.forEach((key) => {
    picked[key] = Array.isArray(src[key]) ? [...src[key]] : [];
  });
  return picked;
}

function isSameStringList(a, b) {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

/**
 * 启动搜索前刷新当前职位的最新搜索条件，三组画像字段以「用户改动优先」合并：
 *   1. 先记下刷新前本地的三组字段（用户在画像卡 / 标签区改过的值就在这里）
 *   2. 调 JobSearchFilter.refreshSearchCondition → GET /ihire/chat/getCurrentConditionByChatId
 *      拿最新条件写入 searchState（覆盖首次打开该职位时 criteria 查不到的场景）
 *   3. 覆盖优先级：接口最新值 < 本地非空值 < 画像卡编辑确认值
 *      （本地空值不覆盖接口，避免把接口查回来的数据清掉）
 *
 * 调用点：handleAggregateSearch —— 「启动聚合搜索（INITIAL）/ 清空重新搜索（RESTART）/
 * 保留增量搜索（CONTINUE）」三个入口都走这里，刷新后的 searchState 由
 * prepareConditionOnly 生成本轮 saveCondition 条件。
 */
async function refreshSearchConditionBeforeSearch(chatIdForSearch) {
  if (!chatIdForSearch) return;
  const filter = jobSearchFilterRef.value;
  if (!filter || typeof filter.refreshSearchCondition !== "function") {
    console.warn("[任务流程] [IndexPage] refreshSearchConditionBeforeSearch: jobSearchFilterRef 不可用，跳过刷新");
    return;
  }

  const localBefore = pickCriteriaOverrideFields(searchState.value?.criteria);
  try {
    await filter.refreshSearchCondition(chatIdForSearch);
  } catch (e) {
    console.warn("[任务流程] [IndexPage] refreshSearchConditionBeforeSearch 异常:", e?.message || e);
  }

  // 刷新后 searchState.criteria 已是接口最新值 → 只挑出要盖回去的"用户值"
  const serverAfter = pickCriteriaOverrideFields(searchState.value?.criteria);
  const userPatch = {};
  CRITERIA_OVERRIDE_FIELDS.forEach((key) => {
    if (localBefore[key].length > 0 && !isSameStringList(localBefore[key], serverAfter[key])) {
      userPatch[key] = localBefore[key];
    }
  });
  const cardPatch = profileCriteriaOverrideByChatId.value?.[chatIdForSearch] || {};
  const patch = { ...userPatch, ...cardPatch };
  if (Object.keys(patch).length === 0) return;

  const cur = searchState.value || {};
  searchState.value = { ...cur, criteria: { ...(cur.criteria || {}), ...patch } };
  console.log(`[任务流程] [IndexPage] 用户改动覆盖接口最新 criteria chatId=${chatIdForSearch}`, patch);
}

async function handleAggregateSearch(payload) {
  const chatIdToSearch = payload?.chatId || chatId.value;
  if (!chatIdToSearch) {
    console.warn("[任务流程] [IndexPage] aggregate-search: 没拿到 chatId，跳过真实搜索");
    return;
  }

  // 任何"创建任务"入口（启动聚合 / 清空重新 / 保留增量 / 结果页搜索栏 / 加载更多）都回到聊天视图，
  // 让用户在聊天记录里看到任务进度卡。嵌入式模式才有 chat/results 两个视图。
  if (embeddedMode.value) {
    currentView.value = "chat";
  }

  // ★ 兜底防抖：上一次的 dispatch 还在跑，静默忽略（ChatCard 时间窗已挡，这里防御性二次防御）
  if (_dispatchingChats.has(chatIdToSearch)) {
    console.warn(
      `[任务流程] [IndexPage] aggregate-search 静默忽略：chat=${chatIdToSearch} 的任务创建链路还在跑`
    );
    return;
  }

  // ★ 创建任务前校验使用权限：无权限 → 清登录态 + 弹登录框，并清掉 ChatCard 已 push 的在途占位卡
  if (!(await ensureClientAuthority(store, { reason: "create_task" }))) {
    console.warn("[任务流程] [IndexPage] aggregate-search 被拒绝：当前用户无使用权限");
    embeddedChatRef.value?.clearInflightTaskForChat?.(chatIdToSearch);
    return;
  }

  // taskType: INITIAL（默认） | RESTART（清空并重新搜索） | CONTINUE（保留并增量搜索）
  // 由 ChatCard 在 TaskCompletionCard 按钮触发时显式带过来；普通"启动聚合搜索"按钮不传 → 走 INITIAL
  // 三者数据来源都灌到 ChannelConfig store，AISearch 统一渲染；后端基于 taskType
  // 决定是否清空 visible 结果集 / 续在原 resultSet 上追加（前端不用做对应清理）。
  const taskType = payload?.taskType || "INITIAL";

  const modules = payload?.selectedModules || {};
  const searchChecked = false;
  // 当前只保留推荐牛人；未传 selectedModules 的老入口也按推荐任务处理。
  const recommendChecked = modules.recommend !== false;
  const jobId = normalizeBossJobId(payload?.matchedBossJobId);

  if (recommendChecked && !jobId) {
    console.warn(
      "[任务流程] [IndexPage] aggregate-search 被拒绝：没有有效的 BOSS 职位 ID"
    );
    notify.warning("请先选择匹配的 BOSS 职位");
    embeddedChatRef.value?.clearInflightTaskForChat?.(chatIdToSearch);
    return;
  }

  // ===== 拒绝重复点击 =====
  //
  // 同一职位（chatId）已有 RUNNING / WAITING / RESTING 任务时，提示用户等待。
  // 数据源：SearchTasks store 的 canCreateForChat getter（基于 taskStatus 判定）。
  // Phase A：仅在已成功创建过任务时才会拒绝；后端 API 未 ready 时 store 里没记录，
  // 这条判断自动放行，不影响旧业务流程。
  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  if (typeof canCreate === "function" && !canCreate(chatIdToSearch)) {
    // 判断具体原因（搜索阶段 / AI 评分阶段），给用户更精确的提示
    // 走 isAiAnalyzingForChat（带 latestChatId 护栏）跟 canCreateForChat 判定保持一致，
    // 避免全局 AI 信号串扰到非当前 chat 的 notify 文案。
    const latestTask = store.getters["SearchTasks/getLatestTaskByChat"](chatIdToSearch);
    const isAiAnalyzingPhase =
      latestTask?.taskStatus === "COMPLETED" &&
      store.getters["SearchTasks/isAiAnalyzingForChat"](chatIdToSearch);
    if (isAiAnalyzingPhase) {
      console.warn("[任务流程] [IndexPage] aggregate-search 被拒绝：AI 分析还在跑");
      notify.warning("搜索已完成，AI 分析还在进行中，请等分析完成后再启动新任务");
    } else {
      console.warn("[任务流程] [IndexPage] aggregate-search 被拒绝：该职位已有任务在进行中");
      notify.warning("该职位已有搜索任务在进行中，请等待完成后再启动");
    }
    // 拒绝创建 → 清掉 ChatCard 已 push 的在途占位卡，避免 _hasInflightTaskForChat 卡死
    embeddedChatRef.value?.clearInflightTaskForChat?.(chatIdToSearch);
    return;
  }

  // ===== 至少要选一个搜索模块 =====
  //
  // 一般情况下 ChatCard.handleSearch 已经在 fallback 给 `{search:true, recommend:false}`
  // （AIProfileActionPanel 也默认勾搜索），不会出现两个都 false。但用户**手动取消**了
  // 默认勾选时（业务允许）会走到这里，必须提示，不能让 dispatchTaskStore 拿到空 channels。
  if (!searchChecked && !recommendChecked) {
    console.warn("[任务流程] [IndexPage] aggregate-search 被拒绝：未选择任何搜索模块");
    notify.warning("请启用推荐牛人");
    embeddedChatRef.value?.clearInflightTaskForChat?.(chatIdToSearch);
    return;
  }

  // ===== 任务启动前 recheck 渠道登录态 =====
  //
  // 防止 cookie 过期但 store.channelConf.login 仍是 true 的情况下，任务跑到一半才
  // 发现失败。仅 Electron 客户端模式生效（浏览器插件由 host 页面 webRequest 实时
  // 维护登录态，不需要主动探针）。
  //
  // 失败时：
  //   - markChannelExpired(failedKey) → 顶部红 banner + 渠道按钮变红
  //   - notify warning 告诉用户哪几个渠道没登录
  //   - return 不进入 task create 链路
  if (isElectronClient()) {
    const keysToCheck = [];
    const userChannels = store.getters.getUserChannelConfig || [];
    const enabledKeys = userChannels.length
      ? userChannels.filter((c) => c.enableConfig).map((c) => c.key)
      : ["BOSS", "ZHILIAN", "JOB51"]; // 兜底全启用

    // ★ 用户禁用了所有渠道（配置存在但一个都没启用）→ 不论「搜索牛人」还是「推荐牛人」都没法跑
    //   （推荐也走 BOSS 渠道，BOSS 被禁用就推不了）→ 直接弹「未检测到登录状态」面板
    //   （可勾选启用渠道 + 去登录），而不是静默无反应。
    //   （之前只在「仅勾搜索」时拦截，勾了推荐就放行 → 全渠道禁用点启动没反应。）
    if (userChannels.length > 0 && enabledKeys.length === 0) {
      console.warn("[任务流程] [IndexPage] aggregate-search 被拒绝：用户禁用了所有渠道 → 弹渠道选择/登录面板");
      currentView.value = "chat";
      nextTick(() => {
        const chatCard = embeddedChatRef.value;
        if (chatCard && typeof chatCard.forceShowLoginRequired === "function") {
          chatCard.forceShowLoginRequired();
        } else {
          notify.warning(
            "当前没有启用任何招聘渠道，请先在左下角「设置功能」中启用至少一个渠道后再搜索"
          );
        }
      });
      // 清掉 ChatCard 已 push 的在途占位卡，避免卡死
      embeddedChatRef.value?.clearInflightTaskForChat?.(chatIdToSearch);
      return;
    }

    if (searchChecked) {
      keysToCheck.push(...enabledKeys);
    }
    if (recommendChecked && !keysToCheck.includes("BOSS")) {
      keysToCheck.push("BOSS"); // 推荐固定走 BOSS
    }
    if (keysToCheck.length > 0) {
      // ★ 直接信任 channelConf.login（由各渠道登录监视器实时维护：BOSS URL 监视 / 51job、智联
      //   10s 轮询 userStatus）。账号异常的渠道 → 弹顶部 banner + 不启动任务；用户点「恢复任务」
      //   recheck 正常后再点启动即可通过。比重新 probe 更可靠（BOSS checkAuth 偶发误报）。
      const conf = store.getters.getChannelConf || {};
      const failedKeys = keysToCheck.filter((k) => !(conf[k] && conf[k].login === true));
      if (failedKeys.length > 0) {
        markChannelExpired(store, failedKeys[0]);
        const failedNames = failedKeys.map((k) => CHANNEL_DISPLAY_NAME[k] || k);
        notify.warning(
          `「${failedNames.join("、")}」未登录或登录已失效，请先在客户端中重新登录后再启动任务`
        );
        // ★ 任务被「未登录」拦截中止 → 清掉 ChatCard 刚 push 的在途占位卡，否则
        //   _hasInflightTaskForChat 永远为 true，用户重新登录后再点「清空重新/保留增量」会被跳过。
        embeddedChatRef.value?.clearInflightTaskForChat?.(chatIdToSearch);
        return;
      }
      // 都登录有效 → 清掉可能残留的旧 channelError
      clearChannelExpired(store);
    }
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
  // sourceTaskId：CONTINUE / RESTART 都关联原任务。
  //   - CONTINUE：告诉后端把新任务挂在原 resultSet 上追加结果
  //   - RESTART：供 runTask 在真正执行时先取消原推荐任务产生的收藏
  //   - INITIAL：首次任务不传
  const sourceTaskId =
    (taskType === "CONTINUE" || taskType === "RESTART") && payload?.originalTaskId
      ? payload.originalTaskId
      : null;

  // ★ 时序修正（关键）：
  //   - 老逻辑：dispatchTaskStore + runRealAggregateSearch 并行启动，dispatchTaskStore
  //     内部 waitForSearchConditionId 轮询 store.getters.getSearchConditionId。
  //     如果 store 里残留上一轮 condId，立刻 resolve 拿到旧 id → create 用了**旧 condId**
  //     → 后端 channel 绑的是旧 id，跟本次 saveCondition 真正产生的新 id 错位，
  //     后续 /results 调用拿不到正确 channel → 数据落不了库。
  //
  //   - 新逻辑：先 await prepareConditionOnly() 拿到本轮**最新** condId，再把它显式
  //     传给 dispatchTaskStore（dispatchTaskStore 不再依赖 store getter 推断 condId）。
  //     这保证 create 用的 condId 一定是本次 saveCondition 返回的新 id。
  //
  // prepareConditionOnly 也会 commit 到 store.searchConditionId，所以后续 runRealAggregateSearch
  // 内部如果再调一次 saveCondition（executeSearch 内部业务的一部分），会再产生一个新 id
  // 覆盖到 store，但 dispatchTaskStore 已经 create 完了用的是第 1 次的 id（channel 绑定
  // 不变）。这是已有的"两次 saveCondition"模式，跟搜索通道行为一致。
  // ★ 校验都通过，正式进入 dispatch 链路 → mark in-progress
  //   后续的 prepareConditionOnly + dispatchTaskStore 全程都在 set 里，
  //   期间 handleAggregateSearch 再被调用时本函数顶部的 _dispatchingChats.has 检查会拦下
  _dispatchingChats.add(chatIdToSearch);

  // 顶部 loading 提示：创建任务期间（prepareConditionOnly + create）一直显示，成功/失败都关闭。
  // timeout:0 = 不自动消失；返回的 dismiss 函数在下方 dispatchTaskStore.finally 里调用关闭。
  const dismissCreateLoading = Notify.create({
    group: false,
    spinner: true,
    message: "正在创建搜索任务…",
    color: "primary",
    position: "top",
    timeout: 0
  });

  let condIdForCreate = "";
  let searchRequestDataForExec = null;

  // ★ 本轮条件生成前先拉一次后端最新搜索条件（首次打开职位 criteria 缺失的场景），
  //   再用用户画像卡确认过的三组字段覆盖（用户修改优先），最后交给 prepareConditionOnly。
  await refreshSearchConditionBeforeSearch(chatIdToSearch);

  // ★ 三个 BOSS 筛选条件：只进 saveCondition 请求体外层，不参与画像 structuredContent。
  //   必须在 refreshSearchCondition 之后写，否则会被接口返回值覆盖。
  if (payload?.bossFilters) {
    const filters = pickBossFilters(payload.bossFilters);
    const cur = searchState.value || {};
    searchState.value = {
      ...cur,
      ...filters
    };
    // searchState 通过 v-model 传给 AISearch，子组件的 props 更新要等当前渲染周期结束。
    // prepareConditionOnly 立即读取子组件里的 searchState 时如果不等待，会继续拿到旧的 0。
    await nextTick();
  }

  if (aiSearchRef.value && typeof aiSearchRef.value.prepareConditionOnly === "function") {
    try {
      const prep = await aiSearchRef.value.prepareConditionOnly();
      if (prep && prep.ok && prep.conditionId) {
        condIdForCreate = String(prep.conditionId);
        searchRequestDataForExec = prep.data || null;
        console.log(
          `[任务流程] [IndexPage] handleAggregateSearch: prepareConditionOnly ok condId=${condIdForCreate}`
        );
      } else {
        console.warn(
          "[任务流程] [IndexPage] handleAggregateSearch: prepareConditionOnly 失败/无 condId",
          prep
        );
      }
    } catch (e) {
      console.warn("[任务流程] [IndexPage] handleAggregateSearch: prepareConditionOnly 异常", e?.message || e);
    }
  } else {
    console.warn("[任务流程] [IndexPage] handleAggregateSearch: aiSearchRef.prepareConditionOnly 不可用");
  }

  // ⚠️ 把 prepareConditionOnly 拿到的 searchRequestData 挂到 payload 上，
  //    让 runTask executor 路径（store.aggregateSearchExecutor）跑时 executeSearch
  //    跳过重复 saveCondition（Network 上只剩 1 次 saveCondition）。
  //    存储位置：SearchTasks.tasksById[taskId].searchRequestData，runTask 调 executor 时透传。
  dispatchTaskStore({
    chatIdToSearch,
    searchChecked,
    recommendChecked,
    jobId,
    positionId: payload?.positionId || store.getters.getLatestPositionId,
    taskType,
    sourceTaskId,
    payload,
    condId: condIdForCreate,
    searchRequestData: searchRequestDataForExec
  })
    .then((res) => {
      if (res && res.ok) {
        notify.success("任务创建成功，开始执行搜索");
      } else if (res && res.ok === false) {
        const silentCodes = ["NO_ENABLED_CHANNEL", "ALREADY_RUNNING"];
        if (!silentCodes.includes(res.errorCode)) {
          notify.error(`任务创建失败：${res.message || res.errorCode || "未知错误"}`);
        }
      }
    })
    .catch((e) => console.warn("[任务流程] [IndexPage] dispatchTaskStore unexpected:", e?.message || e))
    .finally(() => {
      // 关闭顶部"正在创建搜索任务…"loading（无论成功/失败）
      try {
        dismissCreateLoading();
      } catch (_e) {
        /* ignore */
      }
      // ★ release in-progress flag —— 此后该 chat 才能接受新一次的 aggregate-search
      _dispatchingChats.delete(chatIdToSearch);
    });

  // ★ 用户要求：完全由 current 接口驱动执行，前端不再直接调 runRealAggregateSearch。
  //
  //   旧逻辑（已废弃）：
  //     - 本地没 runningTaskId 时立刻 runRealAggregateSearch（去 executeSearch + 写 ChannelConfig）
  //     - 这等于绕过 current，create 完成后立即开干，跟 current 返回 null 还在排队的语义冲突
  //
  //   新链路（统一由 current 驱动）：
  //     handleAggregateSearch
  //       → prepareConditionOnly 拿 condId
  //       → dispatchTaskStore → SearchTasks/create
  //           → 后端 POST /search/task/create
  //           → 立刻 dispatch fetchTaskQueue（启动 currentTaskPoller, 10s/tick）
  //           → 立刻 dispatch resumeFromCurrent（拉一次 current）
  //               - 后端 ready (WAITING) → enqueue + processQueue → runTask
  //                                          → executor(runRealAggregateSearch) → 真执行
  //               - 后端没 ready → 不执行，等 poller 接管
  //
  //   好处：前端不再越权决定"何时开始执行"，完全听后端调度（工作时段 / 排队顺序）
  console.log(
    `[任务流程] [IndexPage] handleAggregateSearch: 任务已请求创建，执行由 current 接口驱动（不再前端直接调 runRealAggregateSearch）`
  );

  if (recommendChecked && !jobId) {
    console.warn(
      "[任务流程] [IndexPage] aggregate-search: 勾选了推荐牛人但 matchedBossJobId 为空，跳过打开 BOSS 推荐页"
    );
  }

  // 搜索牛人已下架，结果视图始终进入推荐牛人。
  activeResultTab.value = "recommend";
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
  currentView.value = "results";
  if (!payload || payload.source !== "task_completion_card") {
    // 不带 cardData 的视图切换（aggregate 后自动切 / 测试按钮等）：
    // 切到 results 视图，但不动 viewing 状态（继续显示当前 chat 已有数据，无论 runtime / 上次 viewing）
    return;
  }
  console.log("[任务流程] [handleViewResults] ▶ 开始，payload=", payload);

  // ⚠️ 注意：之前的 runningTaskId 拦截已删除。
  // 现在通过 ViewingResults store（按 taskId 隔离）实现：handleViewResults 把数据写到
  // ViewingResults.byTaskId[taskId]，并 setCurrentViewingTask；渲染层 (BossJobInfo /
  // ZHILIANJobInfo / JobInfo 等) 通过 getEffectiveChannelConfByAll getter 优先读 viewing
  // 数据。runtime task 继续往 ChannelConfig 写完全不受影响 → 跑任务时也能自由查看历史。
  console.log(
    "[任务流程] [handleViewResults] aiSearchRef.value=",
    aiSearchRef.value,
    "hasResetFn=",
    typeof aiSearchRef.value?.resetToAggregateTab
  );

  // 重置到渠道聚合 tab（不管 store 里有没有数据都要做）
  await nextTick();
  if (aiSearchRef.value && typeof aiSearchRef.value.resetToAggregateTab === "function") {
    console.log("[任务流程] [handleViewResults] 调用 resetToAggregateTab");
    aiSearchRef.value.resetToAggregateTab().catch(() => {});
  } else {
    console.warn("[任务流程] [handleViewResults] aiSearchRef 或 resetToAggregateTab 不可用！");
  }

  const taskId = payload.taskId;

  // ★ cid 优先用 payload.chatId（卡片所在的 chat），fallback 到 latestChatId。
  //   防止用户在 chat A 看到（罕见的）chat B 的卡片时，把 viewing 状态绑错到 A。
  const cid = payload.chatId || store.getters.getLatestChatId;

  // 记住本 chat 当前查看的 taskId，供切回时自动重新加载
  if (taskId && cid) {
    viewingTaskIdByChatId.value = { ...viewingTaskIdByChatId.value, [cid]: taskId };
  }

  // 优先用 ViewingResults store 里已有的数据（本 task 之前查看过就直接复用，不重新 fetch）。
  // ⚠️ 必须**同 taskId** 才能复用 cache。lastViewedTaskIdForCache 记录"上次实际拉过数据的 taskId"。
  //   - 同 taskId + ViewingResults 有 bucket → 走缓存，跳 API（但要重新 setCurrentViewingTask
  //     让 currentViewingByChat 指向本 task）
  //   - 不同 taskId → 重新拉 API，覆盖 ViewingResults bucket
  const existingBucket = store.state?.ViewingResults?.byTaskId?.[taskId];
  const sameTaskAsLastView =
    lastViewedTaskIdForCache.value && String(lastViewedTaskIdForCache.value) === String(taskId);
  console.log(
    "[任务流程]", `[handleViewResults] ViewingResults bucket 条数=${
      existingBucket?.byChannel?.ALL?.length ?? "null"
    }` +
      ` lastViewedTaskId=${lastViewedTaskIdForCache.value} curTaskId=${taskId}` +
      ` sameTask=${sameTaskAsLastView}`
  );
  if (
    sameTaskAsLastView &&
    existingBucket &&
    Array.isArray(existingBucket.byChannel?.ALL) &&
    existingBucket.byChannel.ALL.length > 0
  ) {
    console.log(
      "[任务流程] [handleViewResults] ✅ 同 task + 已有 ViewingResults 缓存，跳过 API + 设置 viewing 切换"
    );
    if (cid) store.commit("setCurrentViewingTask", { chatId: cid, taskId });
    return;
  }
  console.log("[任务流程] [handleViewResults] 重新拉 API");

  if (!taskId) {
    console.warn("[任务流程] [handleViewResults] 缺少 taskId，无法调 /search/task/results/query");
    return;
  }

  try {
    const taskApiMod = await import("src/api/searchTaskApi");
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
      console.warn("[任务流程] [IndexPage] /search/task/results/query 响应结构未识别，pageData=", pageData);
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
      BOSS: "boss直聘",
      ZHILIAN: "智联招聘",
      JOB51: "前程无忧",
      LIEPIN: "猎聘"
    };

    const normalized = rawList.map((item) => {
      const taskResume =
        item?.taskResume && typeof item.taskResume === "object" ? item.taskResume : {};
      const blind =
        item?.resumeBlind && typeof item.resumeBlind === "object" ? item.resumeBlind : {};
      // 摊平时 item 顶层字段优先（扁平响应里它本身就是 blind 摊平结果）；
      // taskResume / blind 仅在嵌套响应里补字段。
      const flat = { ...taskResume, ...blind, ...item };
      const blindId = item.resumeBlindId || blind.resumeBlindId || blind.id || flat.id;
      const channelSubType = flat.channelSubType || blind.channelSubType || item.channelSubType;
      // channel 必须是中文 desc（如 'boss直聘'），fallback 到 channelSubType→desc 映射
      const channelDesc =
        flat.channel || blind.channel || SUBTYPE_TO_DESC[channelSubType] || channelSubType || "";
      // 保留 businessChannel 用于后续分流（SEARCH vs RECOMMEND）
      const businessChannel = item.businessChannel || flat.businessChannel || "SEARCH";
      return {
        ...flat,
        id: blindId,
        resumeBlindId: blindId,
        taskResumeId: item.taskResumeId || flat.taskResumeId,
        fileId:
          item.fileId ||
          flat.fileId ||
          item.taskResume?.fileId ||
          flat.taskResume?.fileId ||
          item.resumeFile?.fileId ||
          flat.resumeFile?.fileId ||
          item.resumeInfo?.fileId ||
          flat.resumeInfo?.fileId ||
          item.detail?.fileId ||
          flat.detail?.fileId ||
          null,
        channel: channelDesc,
        channelSubType,
        businessChannel,
        searchConditionId: item.searchConditionId || flat.searchConditionId
      };
    });

    // ★ 该 task 已停止/失败（AI 评分不会再继续）→ 把未评分简历直接落终态「分析异常」(score=-2)。
    //   解决"停止任务后返回，重新点查看结果，未评分的又显示 AI分析中 + 重启 scoreUpdater 轮询"：
    //   后端 /results/query 拉回的未评分简历 score=null，若不处理就会重新进入分析中状态。
    //   -2 是 ResumeCard 的终态（"AI分析失败/渠道数据异常"）+ scoreUpdater 的终态（不再 pending）。
    try {
      const getTaskByIdFn = store.getters["SearchTasks/getTaskById"];
      const taskForView = typeof getTaskByIdFn === "function" ? getTaskByIdFn(taskId) : null;
      const userStopped = store.state?.SearchTasks?.userStoppedTaskIds?.[taskId];
      const isStoppedOrFailed =
        !!userStopped ||
        taskForView?.taskStatus === "STOPPED" ||
        taskForView?.taskStatus === "FAILED";
      if (isStoppedOrFailed) {
        let marked = 0;
        for (const r of normalized) {
          const s = r.score;
          if (s === null || s === undefined || (typeof s === "number" && s < 0 && s !== -2)) {
            r.score = -2;
            if (r.scoreStatus !== undefined) r.scoreStatus = "FAILED";
            marked++;
          }
        }
        if (marked > 0) {
          console.log(
            `[任务流程] [handleViewResults] task=${taskId} 已停止/失败，${marked} 条未评分简历标记为分析异常(score=-2)`
          );
        }
      }
    } catch (e) {
      console.warn("[任务流程] [handleViewResults] 标记未评分简历为分析异常失败（忽略）:", e?.message || e);
    }

    // ★ 按 businessChannel 分流：
    //   - SEARCH (默认) → 灌进 ChannelConfig.ALL.data，搜索 tab 显示
    //   - RECOMMEND     → 灌进 BossRecommendData.byJobId[jobId]，推荐 tab 显示
    //   推荐数据是后端标准化的 resume 形态（含 name/resumeBlindId/score 等），
    //   mapBossGeekToResume 已经兼容这种"无 geekCard 已是 resume"的输入，直接返回。
    // SEARCH 历史数据只保留在后端，不灌入任何前端展示 bucket。
    const hiddenSearchCount = normalized.filter(
      (x) => x.businessChannel !== "RECOMMEND"
    ).length;
    const list = [];
    const recommendList = normalized.filter((x) => x.businessChannel === "RECOMMEND");
    console.log(
      `[任务流程] [IndexPage] /search/task/results/query 分流: hiddenSearch=${hiddenSearchCount} recommend=${recommendList.length}`
    );

    // 「查看结果」路径**不再**往映射里写 outId（后端给的 outId 是 rec_xxx 短 id，不是
    //   DOM 的长 encryptGeekId，写了也匹配不到、还会污染）。
    //   反查靠的是「立即沟通」时用 resume.outId(=rec_xxx) 去查**实时任务路径**已写好的
    //   `outId → encryptGeekId` 映射（见 doFetchRecommend 落库处）。这里无需写入。

    // 推荐数据灌进 BossRecommendData：每个 task 用**独立 bucket key**（`task-<taskId>`），
    // 避免不同任务的推荐结果互相串扰。
    //
    // 之前用 jobId 作 bucket key，同一个职位（同 jobId）的两次任务会共用一个 bucket，
    // 后跑的任务把先跑的覆盖；而**没有推荐数据的任务**根本不进 commit 分支，
    // currentRecommendJobId 还停留在上一个任务的 jobId → RecommendList 显示旧数据。
    //
    // 改成 task-${taskId} 后：
    //   - 每个 task 独立 bucket，不会互相覆盖
    //   - 不管有没有推荐数据都 commit + 切 currentRecommendJobId，
    //     让"任务 B 没推荐"时 RecommendList 显示本任务的空 bucket（"暂无推荐牛人"），
    //     而不是显示任务 A 的旧数据
    const recommendBucketKey = `task-${taskId}`;
    store.commit("setBossRecommendList", {
      jobId: recommendBucketKey,
      geekList: recommendList,
      totalSize: recommendList.length,
      hasMore: false,
      fetchedAt: Date.now()
    });
    store.commit("setCurrentRecommendJobId", recommendBucketKey);
    console.log(
      `[任务流程] [IndexPage] 推荐数据已切到 task bucket=${recommendBucketKey} count=${recommendList.length}`
    );

    // ★ 显式按本次 task 的数据情况切 activeResultTab，避免上一次的选中态污染本次：
    //   - 只有搜索数据 → 强制切到 'search' tab
    //   - 只有推荐数据 → 强制切到 'recommend' tab
    //   - 两个都有     → 保留当前 activeResultTab（让用户自己选）
    //   - 两个都没有   → 不动（pane 都会空态）
    //
    // 之前依赖 watch([searchPaneVisible, recommendPaneVisible]) 自动校正，但 computed
    // 依赖链有时序漂移（先看到上次的 recommendBucket → activeResultTab 已是 'recommend' →
    // 后续 commit 空 bucket 后 watch 才触发，但已经渲染了一次"推荐 tab 选中"的瞬时态）。
    // 这里直接按本次数据切，最稳。
    const hasSearchData = false;
    const hasRecommendData = recommendList.length > 0;
    activeResultTab.value = "recommend";
    console.log(
      "[任务流程]", `[handleViewResults] activeResultTab → ${activeResultTab.value}` +
        ` (hasSearchData=${hasSearchData} hasRecommendData=${hasRecommendData})`
    );

    // 按 channelSubType 分组（搜索通道的）
    const grouped = { ALL: list, BOSS: [], ZHILIAN: [], JOB51: [], LIEPIN: [] };
    for (const item of list) {
      const k = item?.channelSubType;
      if (!k) continue;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(item);
    }
    console.log(
      `[任务流程] [IndexPage] /search/task/results/query ok | taskId=${taskId} totalCount=${totalCount} 搜索分组=`,
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
    // ★ 写到 ViewingResults store（按 taskId 隔离），不动 ChannelConfig.ALL.data。
    //   这样 runtime task 写 ChannelConfig 不被打断，UI 渲染 (BossJobInfo / ZHILIANJobInfo /
    //   JobInfo 等) 通过 getEffectiveChannelConfByAll getter 优先读 viewing 数据。
    //   实现见 src/store/modules/ViewingResults.js + 4 个 JobInfo.vue 的 allDataConfig 修改。
    store.commit("setViewingTaskResults", {
      taskId,
      byChannel: {
        ALL: list,
        BOSS: grouped.BOSS,
        ZHILIAN: grouped.ZHILIAN,
        JOB51: grouped.JOB51,
        LIEPIN: grouped.LIEPIN
      }
    });
    // 标记当前 chat 进入 viewing 模式，渲染层 getter 据此从 ViewingResults 取数据
    if (cid) {
      store.commit("setCurrentViewingTask", { chatId: cid, taskId });
    }
    // tab badge（红色数字）仍写 ChannelConfig per-channel dataSize（不写 .data，无 reactive 爆炸风险）
    // viewing 模式下这个 badge 数字会跟 ChannelConfig runtime 的同步，**可能跟实际显示数据不一致**。
    // 接受这个 trade-off：badge 数量对照 ChannelConfig runtime 而不是 viewing，业务上影响较小。
    for (const ch of ["BOSS", "ZHILIAN", "JOB51", "LIEPIN"]) {
      store.commit("changeChannelConfDataSize", { key: ch, value: (grouped[ch] || []).length });
    }
    // 详细日志：能看到每条 resume 的 score 状态，方便排查"AI分析中"是数据本身还是 polling 串扰
    const scoreStats = list.reduce(
      (acc, r) => {
        const score = r.score;
        if (score === null || score === undefined) acc.nullCount++;
        else if (score === -2 || r.scoreStatus === "FAILED") acc.failedCount++;
        else if (typeof score === "number" && score >= 0) acc.scoredCount++;
        else acc.otherCount++;
        return acc;
      },
      { nullCount: 0, failedCount: 0, scoredCount: 0, otherCount: 0 }
    );
    console.log(
      "[任务流程]", `[handleViewResults] viewing 模式 commit ok taskId=${taskId} chatId=${cid} 总条数=${list.length}` +
        ` 分组=${JSON.stringify(
          Object.fromEntries(
            ["BOSS", "ZHILIAN", "JOB51", "LIEPIN"].map((k) => [k, (grouped[k] || []).length])
          )
        )}` +
        ` score 状态=${JSON.stringify(scoreStats)} (null=等评分/FAILED=评分失败/scored=已评)`
    );

    // 记下"上次实际灌进的 taskId"，下次同 task 复用缓存（不重新 fetch）
    lastViewedTaskIdForCache.value = taskId;

    // 把任务真正用的 searchConditionId 回填到 store——AI 评估 / 相似简历等接口要用
    const firstWithCondId = list.find((x) => x.searchConditionId);
    if (firstWithCondId?.searchConditionId) {
      store.commit("changeSearchConditionId", firstWithCondId.searchConditionId);
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
      .map((item) => ({
        resumeBlindId: String(item.resumeBlindId),
        taskResumeId: String(item.taskResumeId)
      }));
    if (taskResumeMappings.length > 0) {
      store.commit("SearchTasks/patchTaskResumeIds", taskResumeMappings);
      console.log("[任务流程] [handleViewResults] patchTaskResumeIds", taskResumeMappings.length, "条映射");
    }

    console.log("[任务流程] [handleViewResults] ✅ 注入完成，list.length=", list.length, "各分组=", {
      BOSS: grouped.BOSS.length,
      ZHILIAN: grouped.ZHILIAN.length,
      JOB51: grouped.JOB51.length
    });

    // commit 完再等一帧，确认数据没被清掉
    await nextTick();
    const effectiveAfter = store.getters.getEffectiveChannelConfByAll;
    console.log(
      "[任务流程] [handleViewResults] nextTick 后 effective ALL.data 条数=",
      effectiveAfter?.data?.length,
      "(viewing 模式应该等于 list 长度)"
    );

    // 数据已写入 store，resetToAggregateTab 在函数开头已经调过，无需再调
  } catch (e) {
    console.warn(
      "[任务流程] [IndexPage] /search/task/results/query failed:",
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
let searchStateConfig = createSearchState();
const searchState = ref(searchStateConfig);

/**
 * criteria 里允许用户编辑、且优先级高于接口返回值的三组字段
 * （AI 职位画像卡编辑 / 结果页标签编辑共用同一份 criteria）。
 */
const CRITERIA_OVERRIDE_FIELDS = ["professional_skills", "soft_skills", "work_experience"];

/**
 * 用户通过「AI 职位画像卡」编辑确认过的 criteria（按 chatId 维度）。
 *
 * 背景：启动搜索前会重新拉一次 `getCurrentConditionByChatId` 拿后端最新条件，
 * 但接口返回值不允许冲掉用户改过的画像字段（用户的修改优先级最高）。
 * 这里按 chatId 记住用户确认过的三组字段，刷新后重新盖回去——好处是：
 * 即使中途切到别的职位（切职位会重新拉接口、覆盖本地 criteria）再切回来，
 * 用户的修改依然生效。写入见 onProfileSkillsEdit。
 */
const profileCriteriaOverrideByChatId = ref({});

// 用于控制组件的加载顺序
const panelLoaded = ref(true);

// 处理浮动面板加载完成的事件
const handlePanelMounted = () => {
  console.log("FloatingActionPanel 已加载完成");
  // 适当延迟加载其他组件，确保浮动面板完全渲染
  setTimeout(() => {
    panelLoaded.value = true;
    // 在其他组件加载后更新一次尺寸
    setTimeout(updatePageSize, 100);
  }, 300);
};

// 搜索结果页顶部「搜索条件栏」点搜索：
//   不再直接 executeSearch（那是不建任务的即时搜索），改为**走任务流程**——
//   跟"清空重新搜索"一致（taskType=RESTART）创建任务，并切回聊天记录展示任务状态卡。
//   搜索关键字/条件由 handleAggregateSearch → prepareConditionOnly 读 searchState 自动带入。
const searchJobList = () => {
  console.log("[任务流程] searchJobList → 走任务流程(RESTART)", searchState.value);
  // 浏览器/插件模式（非嵌入式）：没有聊天记录视图，沿用旧的即时搜索
  if (!embeddedMode.value) {
    if (aiSearchRef.value) {
      if (!aiSearchRefVal.value) store.commit("changeAiSearchRef", aiSearchRef.value);
      aiSearchRef.value.executeSearch(searchState.value);
    }
    return;
  }
  const chatIdToSearch = chatId.value;
  if (!chatIdToSearch) {
    notify.warning("请先从左侧选择一个职位再搜索");
    return;
  }
  // 切回聊天视图（返回聊天记录，展示任务进度卡）
  currentView.value = "chat";
  nextTick(() => {
    const chatCard = embeddedChatRef.value;
    if (chatCard && typeof chatCard.startSearchFromFilter === "function") {
      chatCard.startSearchFromFilter();
    } else {
      // 兜底：直接走任务创建入口
      handleAggregateSearch({
        chatId: chatIdToSearch,
        taskType: "RESTART",
        selectedModules: { search: false, recommend: true }
      });
    }
  });
};

// 重置搜索
const resetSearchConnect = () => {
  searchState.value = createSearchState();
  jobSearchFilterRef.value.resetCurrentWorkPlace();
  console.log("[任务流程] resetSearchConnect", searchState.value);
};

/**
 * AI 职位画像卡「技能关键词」编辑保存 → 同步到 searchState.criteria.professional_skills，
 * 让后续 prepareConditionOnly / saveCondition / 搜索用编辑后的专业技能（之前编辑只改了卡片展示，
 * 搜索仍用旧 criteria）。searchState 与 JobSearchFilter / AISearch v-model 双绑，AITags 也会同步刷新。
 */
const onProfileSkillsEdit = (payload) => {
  const cur = searchState.value || {};
  const criteria = { ...(cur.criteria || {}) };
  // 三组标签 → criteria（专业技能 / 软实力 / 相关经历）
  if (Array.isArray(payload?.skills)) criteria.professional_skills = payload.skills;
  if (Array.isArray(payload?.softSkills)) criteria.soft_skills = payload.softSkills;
  if (Array.isArray(payload?.relatedExperience)) criteria.work_experience = payload.relatedExperience;

  const next = { ...cur, criteria };
  // 基本信息：职位名同步到关键词输入（其它如地点/经验/薪资是结构化筛选，画像卡里是自由文本，
  // 仅卡片展示，不强行回填 slider/城市选择，避免解析歧义）
  const prof = payload?.profile || {};
  if (typeof prof.position === "string" && prof.position.trim()) {
    next.positionInpValue = prof.position.trim();
  }
  searchState.value = next;
  console.log("[任务流程] [IndexPage] 画像卡编辑已同步到 searchState.criteria", criteria);

  // ★ 记住用户改过的三组画像字段（按 chatId）：启动搜索前重新拉后端最新条件时，
  //   用这份覆盖值盖回去，避免用户的修改被 getCurrentConditionByChatId 的返回值冲掉。
  const overridePatch = {};
  if (Array.isArray(payload?.skills)) overridePatch.professional_skills = [...payload.skills];
  if (Array.isArray(payload?.softSkills)) overridePatch.soft_skills = [...payload.softSkills];
  if (Array.isArray(payload?.relatedExperience)) {
    overridePatch.work_experience = [...payload.relatedExperience];
  }
  const overrideChatId = payload?.chatId || chatId.value;
  if (overrideChatId && Object.keys(overridePatch).length > 0) {
    profileCriteriaOverrideByChatId.value = {
      ...profileCriteriaOverrideByChatId.value,
      [overrideChatId]: {
        ...(profileCriteriaOverrideByChatId.value[overrideChatId] || {}),
        ...overridePatch
      }
    };
  }
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
  console.log("收到聊天消息:", message);
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
  if (jobSearchFilterRef.value) {
    store.commit("changeJobSearchFilterRef", jobSearchFilterRef.value);
  }
  window.addEventListener("resize", updatePageSize);

  // 任务化搜索初始化：**先拉后端 queue 拿真实状态**，再清理本地僵尸。
  //
  // ⚠️ 顺序很关键：
  //   - 老顺序：cleanupZombies → cleanupOrphan(fetchTaskQueue)
  //     问题：cleanupZombies 用本地持久化 createdAt > 15min 标 STOPPED，
  //     但**后端还在排队**的任务（OUT_OF_WORK_PERIOD 等待工作时间窗口）会被误杀，
  //     之后 fetchTaskQueue 拿回 WAITING 状态再覆盖回去，但 ChatCard / LeftMenu
  //     的 15min 跳过规则仍然不显示。
  //   - 新顺序：cleanupOrphan(fetchTaskQueue + hydrate tasksById) → cleanupZombies
  //     这样 cleanupZombies 看到的 tasksById 已经是后端确认的最新状态，
  //     在 queue items 里活着的任务 cleanupZombies 内部会豁免（看 state.taskQueue）。
  //
  // cleanupOrphanRunningAndResume：
  //   a) GET /search/task/queue → 把 items hydrate 进 tasksById + 缓存到 state.taskQueue
  //   b) 找 taskStatus=RUNNING 且不是本地 runningTaskId 的孤立任务
  //      → 对每个 channel 调 POST /finish { status:'FAILED' }
  //   c) 等所有 finish 完成后再调 GET /search/task/current 拉真正可执行任务
  (async () => {
    try {
      await store.dispatch("SearchTasks/cleanupOrphanRunningAndResume");
    } catch (e) {
      console.warn("[任务流程] [IndexPage] cleanupOrphanRunningAndResume threw:", e?.message || e);
    }
    try {
      store.dispatch("SearchTasks/cleanupZombies");
    } catch (e) {
      console.warn("[任务流程] [IndexPage] cleanupZombies threw:", e?.message || e);
    }

    // ★ 启动 current 轮询（后端 queue 有数据但本地没活跃任务）
    //
    // 场景：cleanupOrphanRunningAndResume 内部调过 fetchTaskQueue + resumeFromCurrent。
    // 走完之后：
    //   - state.taskQueue.totalCount > 0 → 后端确实有任务（不论 items 字段是否返回详情）
    //   - state.runningTaskId / state.queue 都空 → 本客户端这次没拿到可执行 task
    //     （可能后端在等工作时间窗 OUT_OF_WORK_PERIOD，或前面有别 client 在跑）
    //
    // → 启动 CurrentTaskPoller，每 10s 调一次 /search/task/current 直到拿到 task，
    //   然后 dispatch resumeFromCurrent 触发任务执行并停轮询。
    //
    // ⚠️ 判断条件用 totalCount 而不是 items.length：后端 /search/task/queue 可能只返回
    // 队列汇总（totalCount/maxQueueCount/queueFull），items 字段不在响应里 → items 永远是
    // undefined/[] → 旧逻辑误判"queue 空"→ poller 不启动 → 用户必须手动刷新。
    try {
      const st = store.state?.SearchTasks;
      const totalCount = Number(st?.taskQueue?.totalCount) || 0;
      const hasActiveLocal =
        !!st?.runningTaskId || (Array.isArray(st?.queue) ? st.queue.length > 0 : false);
      if (totalCount > 0 && !hasActiveLocal) {
        const [pollerMod, apiMod] = await Promise.all([
          import("src/util/automation/currentTaskPoller"),
          import("src/api/searchTaskApi")
        ]);
        const poller = pollerMod.default || pollerMod;
        const taskApi = apiMod.default || apiMod;
        // intervalMs=10s（用户要求快速反馈），maxTicks=360 ≈ 60min 兜底
        poller.start({ store, taskApi, intervalMs: 10_000, maxTicks: 360 });
        console.log(
          `[任务流程] [IndexPage] 后端 queue 非空 (totalCount=${totalCount}) 但本客户端无活跃任务 → 启动 CurrentTaskPoller (10s/tick)`
        );
      } else {
        console.log(
          `[任务流程] [IndexPage] queue 状态正常 (totalCount=${totalCount} hasActiveLocal=${hasActiveLocal})，无需启动 CurrentTaskPoller`
        );
      }
    } catch (e) {
      console.warn(
        "[任务流程] [IndexPage] CurrentTaskPoller 启动失败（忽略，不影响主流程）:",
        e?.message || e
      );
    }
  })();

  // 把"真实聚合搜索执行器"暴露到 store，让 SearchTasks actionRunner 在收到
  // 后端 STEP_COMMAND 时能"代用户"启动一次真实搜索。详见 runRealAggregateSearch 注释。
  store.commit("setAggregateSearchExecutor", runRealAggregateSearch);

  // 已下线：早期的 BOSS dev-only 调试入口（window.__DEV_bossClickFilter / Playwright
  // 冒烟测试）。业务流程现在走 runBossRecommend → selectJobInBossRecommend +
  // humanizeBrowseGeeks 这条正式链路，无需 dev console helper。

  // 「回到顶部」按钮 scroll 容器绑定（嵌入式模式专用）
  // nextTick 等 DOM 渲染完，且容器视图切换 / tab 切换时重新绑（容器变化）
  if (embeddedMode.value) {
    nextTick(() => rebindScrollContainer());
    // 切视图 / 切 tab / 推荐列表从空变有数据（.rl-resume-list 此时才渲染出来）都重新绑定滚动容器
    watch(
      [currentView, activeResultTab, () => currentRecommendBucket.value?.geekList?.length || 0],
      () => nextTick(() => rebindScrollContainer()),
      { flush: "post" }
    );
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", updatePageSize);
  if (__scrollBoundEl) {
    __scrollBoundEl.removeEventListener("scroll", __onScrollContainer);
    __scrollBoundEl = null;
  }
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

/* 「回到顶部」浮动按钮（嵌入式模式专用）
 * absolute 定位到 .workspace-body 右下角（.workspace-body 是 position:relative）
 * z-index 高于 .workspace-view (绝对定位 inset:0) 确保始终可点击
 */
.workspace-scroll-top {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #1976d2;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.25s, color 0.25s,
    box-shadow 0.25s;
}
.workspace-scroll-top:hover {
  background: #1976d2;
  color: #ffffff;
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(25, 118, 210, 0.32);
}
.workspace-scroll-top:active {
  transform: translateY(-1px);
}
</style>
