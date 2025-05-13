<template>
  <q-page class="q-pa-xs" ref="pageRef">
    <!-- 使用封装后的浮动操作面板组件 -->
    <floating-action-panel
      v-model:show-right-nav="showRightNav"
      @chat-message="handleChatMessage"
      :container-width="pageWidth"
      :container-height="pageHeight"
      :container-top="pageTop"
      :container-left="pageLeft"
      @mounted="handlePanelMounted"
    />

    <!-- 搜索区域和结果区域包装在v-if中，等待FloatingActionPanel加载完成 -->
    <div v-if="panelLoaded">
      <!-- 搜索区域 -->
      <JobSearchFilter ref="jobSearchFilterRef" v-model:searchState="searchState" @search="searchJobList" @reset="resetSearchConnect" />
      <!--  搜索列表  -->
      <AISearch ref="aiSearchRef" v-model:search-state="searchState"></AISearch>
    </div>

    <!-- 加载中的占位内容 -->
    <div v-else class="full-width full-height flex flex-center column">
      <q-spinner color="primary" size="3em" />
      <div class="q-mt-md text-subtitle1 text-grey-8">加载中...</div>
    </div>
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
import {getCurrentConditionByChatId} from "src/api/chat/ChatApi";

const store = useStore();

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
  console.log('resetSearchConnect');
  searchState.value = createSearchState();
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
</style>
