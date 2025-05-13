<template>
  <div>
    <div v-if="isLoading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="3em" />
      <div class="q-ml-sm text-subtitle1">正在加载{{channelConfig.name}}数据...</div>
    </div>

    <div v-else-if="!hasData" class="flex flex-center column q-pa-xl" style="margin-top: 16%">
      <q-icon name="search_off" size="2em" color="grey-5" />
      <div class="text-subtitle1 q-mt-md text-grey-7">暂无{{channelConfig.name}}数据</div>
    </div>

    <div v-else class="zhilian-job-container">
      <!-- 使用resume-list组件 -->
      <resume-list
        :resumes="jobList"
        :loading="isLoadingMore"
        :has-more-data="hasMoreData"
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
import * as ZhilianJobInfoManager from 'src/pluginSrc/channels/ZhiLianJobInfoManager';
import notify from "src/util/notify";
import {channelDataSave, channelDataSavePlus} from "src/pluginSrc/util/CannelManager";
import ResumeList from '../../../components/resume/ResumeList.vue';
import {clearChannel as clearChannelApi} from "src/pluginSrc/util/AsyncTaskQueueManager";

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
  onLodingOpen: {
    type: Function,
    default: () => {}
  },
  onLodingClose: {
    type: Function,
    default: () => {}
  }
});

const store = useStore();
const $q = useQuasar();
const channelKey = "ZHILIAN";
const channelConfig = computed(() => store.getters.getChannelConfByChannel(channelKey));
const allDataConfig = computed(() => store.getters.getChannelConfByAll);
const aiSortSwitch = computed(() => channelConfig.value.aiSort);
//渠道历史查询参数
const allSearchChannelConditionRequestData = computed(() => store.getters.getSearchChannelConditionRequestData);
//当前搜索条件
const searchChannelCondition = computed(() => allSearchChannelConditionRequestData.value.channelSearchConditions.find((item) => item.channel === channelKey));
//渠道搜索分页信息
const searchChannelConfig = computed(() => allSearchChannelConditionRequestData.value.config.find((item) => item.channelKey === channelKey));
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
  return allDataConfig.value.data.filter(item=>item.channel===channelConfig.value.desc)
  // return channelConfig.value.data || [];
});

//初始化
const initializationStatus = async () => {
  hasData.value = false
  clearChannelApi(channelKey);
};

//查询渠道配置
const showSettingsChannelConfig = computed(()=>store.getters.getUserChannelConfig);
//获取渠道禁用状态
const getChannelDisable = (key) => {
  const channelConfig = showSettingsChannelConfig.value.find(config => config.key === key);
  // 如果找到配置且 enableConfig 为 false 则禁用，否则不禁用
  return channelConfig.enableConfig;
};

// 加载更多数据
const loadMore = async () => {
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

// 执行智联招聘渠道搜索
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
    // 调用 ZhilianJobInfoManager 中的方法执行搜索
    const result = await ZhilianJobInfoManager.channelSearchList(searchRequestData, page);

    if (!result) {
      console.error('智联招聘搜索结果为空');
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
        channelJobList = await channelDataSavePlus(searchRequestData.requestId, searchRequestData.id, channelConfig.value.desc, result.dataList, chatId.value, filterByRead.value);
      } catch (e) {
        console.log(e)
        searchChannelConfig.value.channelPage = searchChannelConfig.value.channelPage-1;
      }
      if(channelJobList){
          // store.commit('addChannelConfData', {key: channelKey, value: channelJobList});
          store.commit('addChannelConfData', {key: 'ALL', value: channelJobList});
          hasData.value = true;

          // 将搜索结果加入异步任务队列中处理
          try {
            // 导入任务队列处理器
            import('src/pluginSrc/util/AsyncResumeProcessor')
              .then(({ addResumeTask, clearChannelTasks }) => {
                // 批量添加新任务
                channelJobList.forEach(resume => {
                  const taskData = getAsyncDetailParam(resume);
                  addResumeTask(channelKey, taskData);
                });

                console.log(`已添加${channelJobList.length}个智联招聘简历任务到队列中`);
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
    console.error('智联招聘搜索失败:', error);
    notify.error('智联招聘搜索失败，请稍后再试');

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
    searchId: searchId,
    resume: resume
  }
}

// 递归获取渠道数据
const recursiveChannelSearch = async (maxIterations, searchRequestData, currentIteration = 1, page = 1, accumulatedData = []) => {
  console.log(`智联直聘递归查询第${currentIteration}次，页码：${page}`);

  try {
    // 查询渠道参数
    const result = await ZhilianJobInfoManager.channelSearchListSimilar(searchRequestData, page);

    // 如果有数据，添加到累积数据中
    if (result && result.dataList && result.dataList.length > 0) {
      accumulatedData.push(...result.dataList);
      console.log(`智联直聘第${page}页获取到${result.dataList.length}条数据，累计${accumulatedData.length}条`);

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
    console.log(`智联直聘递归查询完成，共获取${accumulatedData.length}条数据`);
    return accumulatedData;
  } catch (error) {
    console.error(`智联直聘递归查询第${currentIteration}次失败:`, error);
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
  // ZhilianJobInfoManager.findZhiLianJobDetail(resume);
};

const handleScheduleInterview = (resume) => {
  $q.notify({
    message: `安排 ${resume.name} 的面试`,
    color: 'primary'
  });
  // 这里应该弹出面试安排表单
};

// 监听jobList数据变化
watch(
  jobList,
  (newValue) => {
    if (!newValue || newValue.length === 0) {
      initializationStatus();
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
    return Promise.resolve();
  },loadMore,recursiveChannelSearch,initializationStatus
});
</script>

<style scoped>
.zhilian-job-container {
  /* 以下是注释掉的样式，不再使用 */
  /* max-height: 80vh; */
  /* overflow-y: auto; */
}
</style>
