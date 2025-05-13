<template>
  <div>
    <div v-if="isLoading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="3em" />
      <div class="q-ml-sm text-subtitle1">正在加载数据...</div>
    </div>

    <div v-else-if="!hasData" class="flex flex-center column q-pa-xl" style="margin-top: 16%">
      <q-icon name="search_off" size="2em" color="grey-5" />
      <div class="text-subtitle1 q-mt-md text-grey-7">暂无数据</div>
    </div>

    <div v-else class="job-container">
      <!-- 使用resume-list组件 -->
      <resume-list
        :resumes="jobList"
        :loading="isLoadingMore"
        :has-more-data="hasMoreData"
        :total="channelDataTotal"
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
import { ref, computed, onMounted, watch, onUnmounted } from "vue";
import { useStore } from "vuex";
import { useQuasar } from "quasar";
import ResumeList from 'src/components/resume/ResumeList.vue';
import scoreUpdater from "src/utils/scoreAutoUpdater";
import {setNotScore} from "src/api/jobList/JobListApi";

// 定义组件属性
const props = defineProps({
  onlyShowUnread: {
    type: Boolean,
    default: false
  },
  aiSort: {
    type: Boolean,
    default: false
  }
});

const store = useStore();
const $q = useQuasar();
const channelKey = "ALL";
const channelConfig = computed(() => store.getters.getChannelConfByChannel(channelKey));
const aiSortSwitch = computed(() => channelConfig.value.aiSort);
// 所有渠道状态
const allChannelStatus = computed(() => store.getters.getChannelConf);
// 所有第三方渠道配置
const allThirdPartyChannelConfig = computed(() => {
  return Object.entries(allChannelStatus.value)
    .filter(([key, channel]) => !(key === 'ALL' || key === 'Collect'))
    .map(([key, channel]) => ({ ...channel }));
});
// 渠道历史查询参数
const allSearchChannelConditionRequestData = computed(() => store.getters.getSearchChannelConditionRequestData);
// 当前搜索条件
const searchChannelCondition = computed(() => allSearchChannelConditionRequestData.value.channelSearchConditions.find((item) => item.channel === channelKey));
// 渠道搜索分页信息
const searchChannelConfig = computed(() => allSearchChannelConditionRequestData.value.config.find((item) => item.channelKey === channelKey));
//渠道所有数据总数
const channelDataTotal = computed(() => allSearchChannelConditionRequestData.value.config.reduce((total, item) => total + (item.channelDataTotal || 0), 0));
// 是否已读
const filterByRead = computed(() => store.getters.getUnreadCheckBoxV);
// 搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
// 搜索计数，用于触发分数查询
const searchCount = computed(() => store.getters.getSearchCount);
// chatId
const chatId = computed(() => store.getters.getLatestChatId);
// 组件状态
const isLoading = ref(false);
const isLoadingMore = ref(false);
const hasData = ref(false);
const hasMoreData = computed(() => {
  // 如果jobList数量小于总数据量，说明还有更多数据可以加载
  return jobList.value.length < channelDataTotal.value;
});
const currentPage = ref(1);
const currentFilters = ref({});
const currentSort = ref('score');

//查询渠道配置
const showSettingsChannelConfig = computed(()=>store.getters.getUserChannelConfig);
//获取渠道禁用状态
const getChannelDisable = (key) => {
  const channelConfig = showSettingsChannelConfig.value.find(config => config.key === key);
  // 如果找到配置且 enableConfig 为 false 则禁用，否则不禁用
  return channelConfig.enableConfig;
};

// 数据 - 聚合渠道从vuex中获取数据
const jobList = computed(() => {
  console.log('渲染ALL渠道数据:', channelConfig.value.data);
  return channelConfig.value.data || [];
});

// 停止分数自动更新
const stopScoreUpdate = () => {
  console.log('停止分数自动更新');
  scoreUpdater.stop();
};

// 初始化组件状态
const initializationStatus = () => {
  console.log('初始化组件状态');
  // 停止分数自动更新
  stopScoreUpdate();
  // 其他初始化逻辑...
};

// 启动分数自动更新
const startScoreUpdate = (resumeList) => {
  if (!resumeList || resumeList.length === 0) return;

  // 启动自动更新器
  scoreUpdater.start(
    resumeList,
    channelKey,
    searchConditionId.value,
    updateScoreData
  );
};

// 检查数据是否已加载
watch(() => jobList.value, (newList) => {
  hasData.value = newList && newList.length > 0;
  console.log('jobList更新，长度:', newList?.length, '有数据:', hasData.value);

  // 当数据被清空时，停止分数自动更新
  if (!newList || newList.length === 0) {
    stopScoreUpdate();
  }
}, { immediate: true, deep: true });

// 监听数据变化，自动启动分数查询
watch(() => jobList.value, (newJobList, oldJobList) => {
  // 只有在数据由无到有，或者数据量增加时才启动查询
  const newLength = newJobList?.length || 0;
  const oldLength = oldJobList?.length || 0;

  if (newLength > 0 && (oldLength === 0 || newLength > oldLength)) {
    console.log('数据变化触发分数查询, 旧数据量:', oldLength, '新数据量:', newLength);
    startScoreUpdate(newJobList);
  } else if (newLength === 0 && oldLength > 0) {
    // 数据被清空时停止查询
    console.log('数据被清空，停止分数查询');
    stopScoreUpdate();
  }
}, { deep: true });

// 监听搜索计数变化，重新启动分数查询
watch(() => searchCount.value, (newCount, oldCount) => {
  if (newCount !== oldCount && jobList.value && jobList.value.length > 0) {
    console.log('搜索计数变化，重新启动分数查询');
    startScoreUpdate(jobList.value);
  }
});

// 处理分数更新回调
const updateScoreData = async (scoreData) => {
  if (!scoreData || !Array.isArray(scoreData) || scoreData.length === 0) return;

  // 更新渠道聚合中的对应数据
  if (allChannelStatus.value['ALL'] && allChannelStatus.value['ALL'].data) {
    for (const scoreItem of scoreData) {
      if (scoreItem.score && scoreItem.score >= 0) {
        // const allDataIndex = allChannelStatus.value['ALL'].data.findIndex(item => item.id === scoreItem.resumeBlindId);
        // if (allDataIndex !== -1) {
        //   allChannelStatus.value['ALL'].data[allDataIndex].score = scoreItem.score;
        // }
        console.log("定时器修改", scoreItem)
        await updateResumeScoreFN({id: scoreItem.resumeBlindId, score: scoreItem.score});
      }
    }
  }
  // console.log(`成功更新${scoreData.length}条简历分数`);
};

// 组件卸载时清理定时器
onUnmounted(() => {
  stopScoreUpdate();
});

// 加载更多数据 - 调用各个渠道的loadMore方法
const loadMore = async () => {
  if (!hasMoreData.value) {
    return;
  }

  // 设置加载状态
  isLoadingMore.value = true;

  try {
    console.log('ALL渠道开始执行加载更多');

    // 获取所有已登录的渠道
    const loggedInChannels = allThirdPartyChannelConfig.value.filter(channel => channel.login && getChannelDisable(channel.key));
    console.log(`找到${loggedInChannels.length}个已登录渠道`, loggedInChannels.map(c => c.key));

    if (!loggedInChannels || loggedInChannels.length === 0) {
      console.warn('没有渠道可以加载更多数据');
      isLoadingMore.value = false;
      return;
    }

    // 收集所有loadMore调用的Promise
    const promises = [];

    // 遍历已登录的渠道执行加载更多
    for (const channel of loggedInChannels) {
      try {
        // 使用channel.cardInfoRef访问组件引用
        if (channel.cardInfoRef && typeof channel.cardInfoRef.loadMore === 'function') {
          console.log(`正在调用${channel.name}(${channel.key})的loadMore方法`);
          promises.push(channel.cardInfoRef.loadMore());
        } else {
          console.warn(`${channel.name}(${channel.key})渠道组件不存在或loadMore方法未定义`);
        }
      } catch (err) {
        console.error(`调用${channel.key}渠道的loadMore方法时出错:`, err);
      }
    }

    // 如果有有效的promise，等待它们全部完成
    if (promises.length > 0) {
      try {
        await Promise.all(promises);
        console.log('所有渠道的loadMore方法执行完成');
      } catch (error) {
        console.error('执行渠道loadMore方法时发生错误:', error);
        throw error; // 继续向上抛出错误
      }
    } else {
      console.warn('没有找到可执行的渠道loadMore方法');
    }
  } catch (error) {
    console.error('加载更多执行过程中发生错误:', error);
    $q.notify({
      message: '加载更多数据失败，请稍后重试',
      color: 'negative',
      icon: 'error',
      position: 'top'
    });
  } finally {
    // 无论成功失败都需要重置加载状态
    isLoadingMore.value = false;
    console.log('ALL渠道loadMore执行完成，当前数据量:', jobList.value.length);
  }
};

// 获取渠道搜索详情参数
const getAsyncDetailParam = (resume) => {
  const channel = channelConfig.value?.desc || channelKey;
  const searchId = searchConditionId.value;
  return {
    channel: channel,
    searchId: searchId,
    resume: resume
  };
};

// 修改简历分数
const updateResumeScoreFN = async (scoreItem) => {
  try {
    // console.log('更新简历分数:', scoreItem);

    // 检查参数是否有效
    if (!scoreItem || !scoreItem.id || scoreItem.score === undefined) {
      console.error('更新分数参数无效:', scoreItem);
      return false;
    }
    if(scoreItem.score ===-2){
      try {
        await setNotScore({
          resumeBlindIds: [scoreItem.id],
          searchId: searchConditionId.value
        });
      }catch (e){
        console.log(e)
      }
    }

    // 在ALL渠道中查找并更新对应简历的分数
    if (allChannelStatus.value && allChannelStatus.value['ALL'] && allChannelStatus.value['ALL'].data) {
      const allDataIndex = allChannelStatus.value['ALL'].data.findIndex(item => item.id === scoreItem.id);
      if (allDataIndex !== -1) {
        store.dispatch('updateChannelConf', {
          key: 'ALL',
          index: allDataIndex,
          data: {
            ...allChannelStatus.value['ALL'].data[allDataIndex],
            score: scoreItem.score
          }
        })
        // console.log(`成功更新简历 ${scoreItem.id} 的分数为 ${scoreItem.score}`);
        return true;
      } else {
        console.warn(`未找到ID为 ${scoreItem.id} 的简历`);
      }

    } else {
      console.warn('ALL渠道数据不存在或格式不正确');
    }
    return false;
  } catch (error) {
    console.error('更新简历分数时发生错误:', error);
    return false;
  }
};


// 处理筛选条件变化
const handleFilterChange = ({ filters, sort }) => {
  currentFilters.value = filters;
  currentSort.value = sort;
};

// 处理简历操作
const handleCollect = (resume) => {
  // $q.notify({
  //   message: `收藏简历: ${resume.name}`,
  //   color: 'primary'
  // });
  // 调用API进行收藏操作
};

const handleRead = (resume) => {
  // 调用API进行标记已读操作
};

const handleDownload = (resume) => {
  // $q.notify({
  //   message: `正在下载简历: ${resume.name}`,
  //   color: 'info'
  // });
  // 调用API进行下载操作
};

const handleContact = (resume) => {
  $q.notify({
    message: `联系候选人: ${resume.name}`,
    color: 'primary'
  });
  // 调用API进行联系操作
};

const handleBlacklist = (resume) => {
  $q.notify({
    message: `已将 ${resume.name} 加入黑名单`,
    color: 'negative'
  });
  // 调用API进行黑名单操作
};

const handleViewDetail = (resume) => {
  // 调用API获取详情
};

const handleScheduleInterview = (resume) => {
  $q.notify({
    message: `安排 ${resume.name} 的面试`,
    color: 'primary'
  });
  // 调用API进行面试安排
};

// 初始化检查数据
onMounted(() => {
  // 检查是否已有数据
  if (jobList.value && jobList.value.length > 0) {
    console.log('组件挂载时已有数据:', jobList.value.length);
    hasData.value = true;
    // 启动分数查询
    startScoreUpdate(jobList.value);
  } else {
    console.log('组件挂载时无数据');
  }
});

// 修改简历收藏状态
const updateResumeCollectionStatus = (id, inCollection) => {
  if (!id) return false;
  if (allChannelStatus.value && allChannelStatus.value['ALL'] && allChannelStatus.value['ALL'].data) {
    const allDataIndex = allChannelStatus.value['ALL'].data.findIndex(item => item.id === id);
    if (allDataIndex !== -1) {
      store.dispatch('updateChannelConf', {
        key: 'ALL',
        index: allDataIndex,
        data: {
          ...allChannelStatus.value['ALL'].data[allDataIndex],
          inCollection: inCollection
        }
      });
      return true;
    } else {
      console.warn(`未找到ID为 ${id} 的简历`);
    }
  } else {
    console.warn('ALL渠道数据不存在或格式不正确');
  }
  return false;
};

// 暴露组件方法
defineExpose({
  channelSearch: async (searchRequestData) => {
    console.log('JobInfo.vue接收到搜索请求', searchRequestData);
    // 不需要自己查询数据，返回一个空Promise即可
    currentPage.value = 1;
    return Promise.resolve();
  },
  loadMore,
  initializationStatus, // 暴露初始化状态方法
  updateResumeScoreFN,
  updateResumeCollectionStatus
});

</script>

<style scoped>
.job-container {
  /* max-height: 80vh; */
  /* overflow-y: auto; */
  //min-height: 100vh;
}
</style>
