<template>
  <div>
    <div v-if="isLoading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="3em" />
      <div class="q-ml-sm text-subtitle1">正在加载{{channelConfig.name}}数据...</div>
    </div>

    <div v-else-if="!hasData" class="flex flex-center column q-pa-xl" style="margin-top: 16%">
      <div v-if="!channelConfig.login" class="q-mt-md">
        <q-btn
            outline
          color="primary" 
          :label="`前往登录${channelConfig.name}`"
          icon="login" 
          @click="goToLogin"
          class="login-btn"
        />
        <div class="text-caption q-mt-sm text-grey-7  full-width text-center">登录后可查看更多职位信息</div>
      </div>
      <div v-else class="full-width" style="display: contents">
        <q-avatar square size="120px">
          <img :src="'/image/notData.png'">
        </q-avatar>
        <div class="text-subtitle1 q-mt-md text-grey-7">暂无{{channelConfig.name}}数据</div>
      </div>
    </div>

    <div v-else class="boss-job-container">
      <!-- 使用resume-list组件 -->
      <resume-list
        :resumes="jobList"
        :loading="isLoadingMore"
        :has-more-data="hasMoreData && allowLoadMore"
        :total="searchChannelConfig.channelDataTotal"
        :channel-str="channelConfig.name"
        :ai-sort="aiSortSwitch"
        @load-more="loadMore"
        @collect="handleCollect"
        @read="handleRead"
        @download="handleDownload"
        @contact="handleContact"
        @blacklist="handleBlacklist"
        @detail="handleViewDetail"
        @interview="handleScheduleInterview"
        @filter-change="handleFilterChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useStore } from "vuex";
import { useQuasar } from "quasar";
import * as BossJobInfoManager from 'src/pluginSrc/channels/BossJobInfoManager';
import notify from "src/util/notify";
import {channelDataSave, channelDataSavePlus} from "src/pluginSrc/util/CannelManager";
import ResumeList from '../../../components/resume/ResumeList.vue';
import { isHistoryTaskView } from "src/util/viewingTaskMeta";
import {channelSearchListSimilar} from "src/pluginSrc/channels/BossJobInfoManager";
import {clearChannel as clearChannelApi} from "src/pluginSrc/util/AsyncTaskQueueManager";
import {pluginAllUrls} from "src/pluginSrc/config/PluginRequestManager";
import { openChannelLoginUrl } from "src/util/openChannelLoginUrl";

// 定义组件属性
const props = defineProps({
  channelInfo: {
    type: Object,
    default: () => ({})
  },
  onlyShowUnread: {
    type: Boolean,
    default: false
  },
  aiSort: {
    type: Boolean,
    default: false
  },
  /**
   * 查看历史 task 结果时由 AISearch 透传过来。
   * - 非空 → 直接读 ViewingResults.byTaskId[viewingTaskId] 的数据
   * - 空 / null → fallback 到 ChannelConfig.ALL（runtime 模式）
   *
   * 设计意图：彻底绕开旧 `getEffectiveChannelConfByAll` 依赖的全局 viewing state
   * （getLatestChatId + currentViewingByChat[cid]）—— 那种间接寻址在 chat 切换 /
   * clearCurrentViewingTask 时容易让数据"消失"。按 taskId 直接取，taskId 不变数据稳定。
   */
  viewingTaskId: {
    type: [String, Number],
    default: null
  }
});

const store = useStore();
const $q = useQuasar();
const channelKey = "BOSS";
const channelConfig = computed(() => store.getters.getChannelConfByChannel(channelKey));
// ★ 只有"刚结束的（最新）任务"或 runtime 搜索才允许加载更多；历史完成卡"查看结果"进来的不显示
const allowLoadMore = computed(() => !isHistoryTaskView(store, props.viewingTaskId));
// ★ 按 props.viewingTaskId 直接取 viewing bucket（详见 ViewingResults.js）；
//   非 viewing 模式 fallback 到 ChannelConfig.ALL（runtime 模式）。
//   完全不依赖 currentViewingByChat 全局 state，taskId 不变时数据稳定不抖动。
const allDataConfig = computed(() => {
  if (props.viewingTaskId) {
    const byTask = store.getters.getViewingChannelConfByTaskIdAll;
    const cfg = typeof byTask === 'function' ? byTask(props.viewingTaskId) : null;
    if (cfg) return cfg;
  }
  return store.getters.getChannelConfByAll;
});
const aiSortSwitch = computed(() => channelConfig.value.aiSort);
//渠道历史查询参数
const allSearchChannelConditionRequestData = computed(() => store.getters.getSearchChannelConditionRequestData);
//当前搜索条件（null-safe）
const searchChannelCondition = computed(() => allSearchChannelConditionRequestData.value?.channelSearchConditions?.find((item) => item.channel === channelKey));
//渠道搜索分页信息（null-safe，查看任务结果时 config 为 null，用 jobList.length 兜底避免模板访问 undefined.channelDataTotal 崩溃）
const searchChannelConfig = computed(() =>
  allSearchChannelConditionRequestData.value?.config?.find((item) => item.channelKey === channelKey)
  || { channelDataTotal: jobList.value.length, channelPage: 1, channelCountSize: jobList.value.length, totalPage: 1 }
);
//是否已读
const filterByRead = computed(() => store.getters.getUnreadCheckBoxV);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//chatId
const chatId = computed(() => store.getters.getLatestChatId);
// 组件状态
const isLoading = ref(false);
const isLoadingMore = ref(false);
const hasData = ref(false);
const hasMoreData = ref(true);
const currentPage = ref(1);
const currentFilters = ref({});
const currentSort = ref('score');

//数据
const jobList = computed(() =>{
  const allData = allDataConfig.value.data;
  const desc = channelConfig.value.desc;
  const filtered = allData.filter(item=>item.channel===desc);
  console.log('[BossJobInfo] jobList computed, ALL.data=', allData.length, 'desc=', desc, 'filtered=', filtered.length);
  if (allData.length > 0 && filtered.length === 0) {
    console.warn('[BossJobInfo] filter 返回空！前3条channel=', allData.slice(0,3).map(x=>x.channel));
  }
  return filtered;
  // return channelConfig.value.data || [];
});
//查询数据变化
const searchCount = computed(()=>store.getters.getSearchCount);

//查询渠道配置
const showSettingsChannelConfig = computed(()=>store.getters.getUserChannelConfig);

//跳转登陆页：客户端模式下走 IPC 开独立窗口；浏览器模式下走 window.open
const goToLogin = () => {
  openChannelLoginUrl('boss', pluginAllUrls.BOSS.loginUrl);
};

//初始化
const initializationStatus = async () => {
  hasData.value = false
  clearChannelApi(channelKey);
};

//获取渠道禁用状态
const getChannelDisable = (key) => {
  const channelConfig = showSettingsChannelConfig.value.find(config => config.key === key);
  // 如果找到配置且 enableConfig 为 false 则禁用，否则不禁用
  return channelConfig.enableConfig;
};

// 加载更多数据
const loadMore = async () => {
  // console.log("加载更多数据",searchChannelConfig.value)
  if (!hasMoreData.value) {
    return;
  }
  const newChannelPage = searchChannelConfig.value.channelPage + 1;
  if (newChannelPage > searchChannelConfig.value.totalPage) {
    return;
  }

  isLoadingMore.value = true;
  try {
    await executeSearch(allSearchChannelConditionRequestData.value, newChannelPage);
  } catch(error) {
    console.error('加载更多数据失败:', error);
    $q.notify({
      message: '加载更多数据失败，请稍后重试',
      color: 'negative',
      icon: 'error'
    });
  } finally {
    isLoadingMore.value = false;
  }
}


// 执行BOSS直聘渠道搜索
const executeSearch = async (searchRequestData = null, page = 1) => {
  if(!getChannelDisable(channelKey)){
    return ;
  }
  const isFirstPage = page === 1;

  if (isFirstPage) {
    isLoading.value = true;
    hasData.value = false;
  } else {
    isLoadingMore.value = true;
  }

  try {
    // 调用 BossJobInfoManager 中的方法执行搜索
    const result = await BossJobInfoManager.channelSearchList(searchRequestData, page);

    if (!result) {
      console.error('BOSS直聘搜索结果为空');
      if (isFirstPage) {
        hasData.value = false;
      }
      return;
    }

    store.commit('setSearchChannelConditionConfigData', {key:channelKey, config:result});

    // 处理搜索结果
    if (result.dataList && result.dataList.length > 0) {
      //保存数据并返回结果
      let channelJobList;
      try {
        channelJobList = await channelDataSavePlus(searchRequestData.requestId, searchRequestData.id, channelConfig.value.desc, result.dataList,chatId.value, filterByRead.value);
      }catch (e){
        console.log(e)
        searchChannelConfig.value.channelPage = searchChannelConfig.value.channelPage-1;
      }
      if(channelJobList){
          // store.commit('addChannelConfData', {key: channelKey, value: channelJobList});
          // viewing 模式（刚结束任务可加载更多）下渲染读 ViewingResults bucket，
          // 必须把新页数据追加进 bucket，否则列表 / tab badge 停在首屏条数。
          if (props.viewingTaskId) {
            store.commit('appendViewingTaskResults', {taskId: props.viewingTaskId, value: channelJobList});
          } else {
            store.commit('addChannelConfData', {key: 'ALL', value: channelJobList});
          }
          hasData.value = true;

          // 将搜索结果加入异步任务队列中处理
          try {
            // 导入任务队列处理器
            import('src/pluginSrc/util/AsyncResumeProcessor')
              .then(({ addResumeTask, clearChannelTasks }) => {
                // 先清空旧的任务
                //clearChannelTasks(channelKey);

                // 批量添加新任务
                channelJobList.forEach(resume => {
                  const taskData = getAsyncDetailParam(resume);
                  addResumeTask(channelKey, taskData);
                });

                console.log(`已添加${channelJobList.length}个BOSS直聘简历任务到队列中`);
              })
              .catch(error => {
                console.error('加载异步任务队列处理器失败:', error);
              });
          } catch (error) {
            console.error('添加到异步任务队列失败:', error);
          }
          store.commit('changeSearchCount');
        }
      // 判断是否有更多数据
      const newChannelPage = searchChannelConfig.value.channelPage + 1;
      hasMoreData.value = newChannelPage < searchChannelConfig.value.totalPage;
    } else {
      if (isFirstPage) {
        hasData.value = false;
      } else {
        hasMoreData.value = false;
      }
    }
  } catch (error) {
    console.error('BOSS直聘搜索失败:', error);
    notify.error('BOSS直聘搜索失败，请稍后再试');

    if (isFirstPage) {
      hasData.value = false;
    }
  } finally {
    if (isFirstPage) {
      isLoading.value = false;
    } else {
      isLoadingMore.value = false;
    }
  }
};

//获取渠道搜索详情参数
const getAsyncDetailParam = (resume) => {
  const channel = channelConfig.value.desc;
  const searchId = searchConditionId.value;
  return  {
    channel: channel,
    searchId:searchId,
    resume:resume
  }
 }

 //递归获取渠道数据
// 递归获取渠道数据
const recursiveChannelSearch = async (maxIterations, searchRequestData, currentIteration = 1, page = 1, accumulatedData = []) => {
  console.log(`BOSS直聘递归查询第${currentIteration}次，页码：${page}`);

  try {
    // 查询渠道参数
    console.log(searchRequestData)
    const result = await BossJobInfoManager.channelSearchListSimilar(searchRequestData, page);

    // 如果有数据，添加到累积数据中
    if (result && result.dataList && result.dataList.length > 0) {
      accumulatedData.push(...result.dataList);
      console.log(`BOSS直聘第${page}页获取到${result.dataList.length}条数据，累计${accumulatedData.length}条`);

      // 判断是否有下一页数据
      const hasNextPage = page < result.totalPage;

      // 如果有下一页且未达到最大迭代次数，继续递归
      if (hasNextPage && currentIteration < maxIterations) {
        return recursiveChannelSearch(
          maxIterations,
          searchRequestData,
          currentIteration + 1,
          page + 1,
          accumulatedData
        );
      }
    }

    // 返回累积的数据
    console.log(`BOSS直聘递归查询完成，共获取${accumulatedData.length}条数据`);
    return accumulatedData;
  } catch (error) {
    console.error(`BOSS直聘递归查询第${currentIteration}次失败:`, error);
    // 发生错误时返回已累积的数据
    return accumulatedData;
  }
};

// 处理筛选条件变化
const handleFilterChange = ({ filters, sort }) => {
  currentFilters.value = filters;
  currentSort.value = sort;
  // 如果需要，这里可以调用后端API重新筛选
  // 但目前我们在前端处理筛选
};

// 处理简历操作
const handleCollect = (resume) => {
  // $q.notify({
  //   message: `收藏简历: ${resume.name}`,
  //   color: 'primary'
  // });
  // 这里应该调用API进行收藏操作
};

const handleRead = (resume) => {
  // 这里应该调用API进行标记已读操作
};

const handleDownload = (resume) => {
  // $q.notify({
  //   message: `正在下载简历: ${resume.name}`,
  //   color: 'info'
  // });
  // 这里应该调用API进行下载操作
};

const handleContact = (resume) => {
  $q.notify({
    message: `联系候选人: ${resume.name}`,
    color: 'primary'
  });
  // 这里应该弹出联系表单或执行其他操作
};

const handleBlacklist = (resume) => {
  $q.notify({
    message: `已将 ${resume.name} 加入黑名单`,
    color: 'negative'
  });
  // 这里应该调用API进行黑名单操作
};

const handleViewDetail = (resume) => {
  // 这里应该跳转到简历详情页或弹出详情对话框
};

const handleScheduleInterview = (resume) => {
  $q.notify({
    message: `安排 ${resume.name} 的面试`,
    color: 'primary'
  });
  // 这里应该弹出面试安排表单
};

// 监听jobList数据变化
// ⚠️ 必须同时处理"变非空"的情况（比如查看任务结果时外部直接往 ALL.data 灌数据，
// executeSearch 不会运行，hasData 不会被 executeSearch 内部置 true）
watch(
  jobList,
  (newValue) => {
    if (!newValue || newValue.length === 0) {
      initializationStatus();
    } else {
      hasData.value = true;
    }
  }
);


// 暴露组件方法
defineExpose({
  executeSearch,
  channelSearch: async (searchRequestData) => {
    store.commit('changeChannelConfData', {key: channelKey, value: []});
    currentPage.value = 1;
    await executeSearch(searchRequestData, 1);
    // await loadMore();
    // await loadMore();
    return Promise.resolve();
  },loadMore,recursiveChannelSearch,initializationStatus
});
</script>

<style scoped>
.boss-job-container {
}

.login-btn {
  min-width: 180px;
  font-weight: 500;
  border-radius: 4px;
  transition: all 0.3s ease;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
}
</style>
