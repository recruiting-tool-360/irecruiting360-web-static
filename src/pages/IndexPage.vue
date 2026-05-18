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
            @view-results="currentView = 'results'"
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
            <div class="result-tab-divider" />
            <div class="result-tabs">
              <button
                type="button"
                class="result-tab"
                :class="{ active: activeResultTab === 'search' }"
                @click="activeResultTab = 'search'"
              >搜索牛人</button>
              <button
                type="button"
                class="result-tab"
                :class="{ active: activeResultTab === 'recommend' }"
                @click="activeResultTab = 'recommend'"
              >推荐牛人</button>
            </div>
          </div>

          <!--
            搜索牛人：现有 JobSearchFilter + AISearch
            推荐牛人：BOSS 推荐列表（来自 Vuex store.BossRecommendData，按 jobId 分桶）
          -->
          <div class="results-body">
            <div v-show="activeResultTab === 'search'" class="result-tab-pane">
              <JobSearchFilter
                ref="jobSearchFilterRef"
                v-model:searchState="searchState"
                @search="searchJobList"
                @reset="resetSearchConnect"
              />
              <AISearch ref="aiSearchRef" v-model:search-state="searchState"></AISearch>
            </div>
            <div v-show="activeResultTab === 'recommend'" class="result-tab-pane">
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
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

/** 嵌入式工作台当前视图：chat | results */
const currentView = ref('chat');

/**
 * results 视图内当前激活的 tab：'search' = 搜索牛人（JobSearchFilter + AISearch）
 * 'recommend' = 推荐牛人（RecommendList，BOSS recommend api 结果）
 * 切换 currentView 到 'results' 时默认走 'search'，除非"启动聚合搜索"明确只选了推荐
 */
const activeResultTab = ref('search');

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
function handleAggregateSearch(payload) {
  const chatIdToSearch = payload?.chatId || chatId.value;
  if (!chatIdToSearch) {
    console.warn('[IndexPage] aggregate-search: 没拿到 chatId，跳过真实搜索');
    return;
  }
  const modules = payload?.selectedModules || {};
  const searchChecked = modules.search !== false;
  const recommendChecked = !!modules.recommend;
  const jobId = payload?.matchedBossJobId;

  // 1) 搜索牛人：勾了 search 时触发后端聚合搜索
  //    重点：拿到 search 完成的 promise，让推荐可以 await 它再启动，避免 BOSS 同账号
  //    "搜索 API + 推荐 tab" 双流量同时进行被风控识别为爬虫。
  //
  // 历史路径用 `jobSearchFilterRef.refreshAndSearchFN()`，但它内部只 await
  // refreshSearchCondition 就 return（onSearch=emit('search') 同步发射，不等真实 search 完成）。
  // 我们直接走两步：refreshSearchCondition → aiSearchRef.executeSearch；后者是真 async，
  // 内部 `Promise.all` 等所有 channel（含 BOSS 递归翻页）完成才 resolve。
  let searchPromise = null;
  if (searchChecked) {
    if (!jobSearchFilterRef.value || typeof jobSearchFilterRef.value.refreshSearchCondition !== 'function') {
      console.warn('[IndexPage] jobSearchFilterRef 还没就绪，无法触发聚合搜索');
    } else {
      console.log('[IndexPage] aggregate-search → refreshSearchCondition + executeSearch [bg]', chatIdToSearch);
      searchPromise = (async () => {
        try {
          await jobSearchFilterRef.value.refreshSearchCondition(chatIdToSearch);
          if (aiSearchRef.value && typeof aiSearchRef.value.executeSearch === 'function') {
            await aiSearchRef.value.executeSearch(searchState.value);
          } else {
            console.warn('[IndexPage] aiSearchRef.executeSearch 不可用，搜索不会等待');
          }
          console.log('[IndexPage] 搜索全部 channel 已完成（含 BOSS 递归查询）');
        } catch (e) {
          console.error('[IndexPage] 搜索 promise 出错:', e?.message || e);
          // 不 rethrow：推荐流程 await 时仍能继续（catch 包裹）
        }
      })();
    }
  }

  // 2) 推荐牛人：勾了 recommend 且选了 matchedBossJobId → 打开 BOSS 推荐 tab + 抓首屏数据
  if (recommendChecked && jobId) {
    // targetCount 取自 ChatPanel 用户填的"简历数"。没填或不合法时兜底 10。
    const targetCount = Number(payload?.resumeCount) > 0 ? Number(payload.resumeCount) : 10;
    // ⚠️ 风控背景（2026-05-18 → 2026-05-19 演进）：
    //    v3/v4：在 BOSS chat/recommend tab 上跑 Playwright `connectOverCDP`
    //           → 触发账号封禁 24h（"系统检测到您的账号存在使用第三方招聘管理系统"）。
    //           根因：`--remote-debugging-port` switch 本身就有指纹（navigator.webdriver /
    //           Runtime.evaluate 痕迹），BOSS JS 主动探测能识别。
    //
    //    v5（now）：废弃 Playwright 抓数据路径，改用 Electron 自带的
    //           `webContents.debugger.attach('1.3')`（同进程 CDP，无 WebSocket 端口，
    //           BOSS JS 探测不到）→ siteNetworkCapture 模块 + window.api.siteNetwork。
    //           - `--remote-debugging-port` switch 永久关闭，跟普通用户 Chrome 一样
    //           - openBossRecommend 只调 TabManager 创建 tab，不注入任何脚本
    //           - fetchBossRecommendList 走 siteNetwork.waitForResponse 纯监听响应
    //
    //    现状：stopAfter='firstPage' 安全可用——会跑到"打开 tab + dwell + 抓首屏" 为止。
    //    humanize/verify 路径还是 Playwright，会被 AUTOMATION_DISABLED 拦截，跳过。
    const args = {
      encryptJobId: jobId,
      targetCount,
      stopAfter: 'firstPage',
      humanizeOpts: {},
      // 串行化：推荐流程在实际打开 BOSS tab 前会 await 这个 promise 完成
      // （详见 doFetchRecommend 顶部 awaitBeforeStart 判断）。null/undefined 表示不等。
      awaitBeforeStart: searchPromise
    };
    console.log(
      `[IndexPage] aggregate-search → runBossRecommend(jobId=${jobId}, stopAfter=firstPage, awaitSearch=${!!searchPromise}) — ${
        searchPromise ? '等搜索 BOSS 跑完后再' : '立即'
      }打开 BOSS 推荐 tab`
    );
    lastRecommendArgs.value = args;
    doFetchRecommend(args).catch((e) => {
      console.error('[IndexPage] doFetchRecommend threw:', e);
    });
  } else if (recommendChecked && !jobId) {
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
