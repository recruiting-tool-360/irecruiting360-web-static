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
          />
        </div>

        <!--
          results 视图：
            1. 顶部 sub-header（返回对话按钮）
            2. 搜索条件区（JobSearchFilter，跟浏览器模式原有功能保持一致）
            3. 列表区（AISearch，现有不动）
        -->
        <div v-show="currentView === 'results'" class="workspace-view">
          <div class="results-sub-header">
            <button class="back-to-chat" type="button" @click="currentView = 'chat'">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              <span>返回对话</span>
            </button>
          </div>
          <div class="results-body">
            <JobSearchFilter
              ref="jobSearchFilterRef"
              v-model:searchState="searchState"
              @search="searchJobList"
              @reset="resetSearchConnect"
            />
            <AISearch ref="aiSearchRef" v-model:search-state="searchState"></AISearch>
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

const store = useStore();

/* ===== 客户端 / iHR 融合：嵌入式工作台模式 ===== */

/** 用户的 plan 是 PlanA → 启用嵌入式 WorkspaceContainer 布局 */
const visibleThirdSwitch = computed(() => store.getters.getUserInfo?.extendData?.plan || '');
const embeddedMode = computed(() => ['PlanA'].includes(visibleThirdSwitch.value));

/** 嵌入式工作台当前视图：chat | results */
const currentView = ref('chat');

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

.results-body {
  flex: 1;
  overflow: auto;
  background: #fff;
}
</style>
