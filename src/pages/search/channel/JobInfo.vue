<template>
  <div>
    <div v-if="isLoading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="3em" />
      <div class="q-ml-sm text-subtitle1">正在加载数据...</div>
    </div>

    <div v-else-if="!hasData" class="flex flex-center column q-pa-xl" style="margin-top: 16%">
      <q-avatar square size="120px">
        <img :src="'/image/notData.png'">
      </q-avatar>
      <div class="text-subtitle1 q-mt-md text-grey-7">暂无数据</div>
    </div>

    <div v-else class="job-container">
      <!-- 使用resume-list组件 -->
      <resume-list
        :resumes="jobList"
        :loading="isLoadingMore"
        :has-more-data="hasMoreData && allowLoadMore"
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
import { isHistoryTaskView } from "src/util/viewingTaskMeta";
import { triggerContinueSearchFromResults } from "src/util/triggerContinueSearch";

// 定义组件属性
const props = defineProps({
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
   * 非空 → 直接读 ViewingResults.byTaskId[viewingTaskId]；空 → fallback ChannelConfig.ALL（runtime）。
   * 详见 BossJobInfo.vue 同名 prop 注释。
   */
  viewingTaskId: {
    type: [String, Number],
    default: null
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
// 当前搜索条件（null-safe：查看任务结果时 searchChannelConditionRequestData 为 null）
const searchChannelCondition = computed(() => allSearchChannelConditionRequestData.value?.channelSearchConditions?.find((item) => item.channel === channelKey));
// 渠道搜索分页信息（null-safe）
const searchChannelConfig = computed(() => allSearchChannelConditionRequestData.value?.config?.find((item) => item.channelKey === channelKey));
//渠道所有数据总数（null-safe：查看任务结果时走 ALL.data 的 length 兜底）
const channelDataTotal = computed(() => allSearchChannelConditionRequestData.value?.config?.reduce((total, item) => total + (item.channelDataTotal || 0), 0) ?? jobList.value.length);
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
// ★ 只有"刚结束的（最新）任务"或 runtime 搜索才允许加载更多；
//   从历史完成卡"查看结果"进来的（viewingTaskId 非最新任务）不显示加载更多。
const allowLoadMore = computed(() => !isHistoryTaskView(store, props.viewingTaskId));
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

// 数据 - 聚合渠道从 vuex 获取
// ★ 按 props.viewingTaskId 直接读 ViewingResults bucket（不依赖全局 viewing state），
//   fallback 到 ChannelConfig.ALL（runtime）。详见 ViewingResults.js 顶部注释。
const jobList = computed(() => {
  if (props.viewingTaskId) {
    const byTask = store.getters.getViewingChannelConfByTaskIdAll;
    const cfg = typeof byTask === 'function' ? byTask(props.viewingTaskId) : null;
    if (cfg?.data) {
      console.log('[JobInfo] viewing 模式 taskId=', props.viewingTaskId, '条数=', cfg.data.length);
      return cfg.data;
    }
  }
  const runtimeCfg = store.getters.getChannelConfByAll;
  const data = runtimeCfg?.data;
  console.log('[JobInfo] runtime 模式 ALL.data 条数=', data?.length ?? 'null');
  return data || [];
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

  // 如果列表里的简历**全部已有 score（>=0）**，说明是查看历史任务结果（resumeBlind 返回了 score），
  // 不需要再轮询查分，避免 taskResumeIdMap 为空时走老接口却查不到任何数据的无效轮询。
  const allHaveScore = resumeList.every(
    (r) => r.score !== null && r.score !== undefined && r.score >= 0
  );
  if (allHaveScore) {
    console.log('[JobInfo] 全部简历已有 score，跳过 scoreUpdater 启动');
    return;
  }

  // 启动自动更新器
  //
  // 传 chatId 让 store 记录"这一路 AI 评分是为哪个 chat 跑"——LeftMenu
  // isAiAnalyzingForChat 据此精准判定 per-chat "进行中"状态。
  // 不传时 SearchTasks 会降级 fallback，可能出现跨 chat 串扰（"两个职位同时进行中"）。
  scoreUpdater.start(
    resumeList,
    channelKey,
    searchConditionId.value,
    updateScoreData,
    chatId.value
  );

  // WAITING 回调：
  //   scoreStatus='WAITING' = detail 从来没提交过，AI 无法开始打分
  //   判断策略（和 taskId 挂钩）：
  //     - 当前 chat 仍有进行中的任务（RUNNING/WAITING/RESTING）→ detail 会在任务执行中被补提交，继续等
  //     - 当前 chat 没有进行中任务（任务已 COMPLETED/FAILED/STOPPED）→ 分析流程已中断
  //       → 停止轮询，把这些简历标为 score=-2（UI: "AI分析失败"）
  scoreUpdater.onWaitingCallback = (waitingItems) => {
    const latestTask = (() => {
      const getter = store.getters['SearchTasks/getLatestTaskByChat'];
      return typeof getter === 'function' ? getter(chatId.value) : null;
    })();
    const ACTIVE_STATUSES = ['RUNNING', 'WAITING', 'RESTING'];
    const isTaskActive = latestTask && ACTIVE_STATUSES.includes(latestTask.taskStatus);
    // 渠道重新登录后正在"重新分析"AI 分析异常的简历 → 即使任务已停止也别急着标 -2，
    // 给重新提交的 detail 留出被后端打分的时间
    const reAnalyzing = store.getters.getReAnalyzingActive === true;

    if (!isTaskActive && !reAnalyzing) {
      console.warn(
        `[JobInfo.onWaiting] 当前 chat 无进行中任务（${latestTask?.taskStatus ?? '无任务'}），` +
        `${waitingItems.length} 条 WAITING 简历分析已中断 → 标记 score=-2，停止轮询`
      );
      // 把 WAITING 简历的 score 标为 -2（UI 层显示"AI分析失败"），停止无意义轮询
      waitingItems.forEach(({ resumeBlindId }) => {
        updateResumeScoreFN({ id: resumeBlindId, score: -2 });
      });
      stopScoreUpdate();
    } else {
      // 有进行中任务 → detail 会被任务执行器补提交 → 继续轮询等结果
      console.log('[JobInfo.onWaiting] 任务仍进行中，继续轮询等待 detail 提交');
    }
  };
};

// 检查数据是否已加载
watch(() => jobList.value, (newList) => {
  hasData.value = newList && newList.length > 0;
  console.log('[JobInfo] hasData watch 触发，长度=', newList?.length, 'hasData=', hasData.value);

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

// 加载更多 → 走任务流程的「保留增量搜索」（CONTINUE），而不是直接翻下一页。
// 由 ChatCard.startContinueSearch 创建 CONTINUE 任务 + 返回聊天视图。
const loadMore = async () => {
  triggerContinueSearchFromResults(store);
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
    // 先在 ALL 里定位该简历（拿 channelSubType 判断渠道登录态）
    const allArr = allChannelStatus.value?.['ALL']?.data || [];
    const foundIdx = allArr.findIndex(item => item && item.id === scoreItem.id);
    const foundResume = foundIdx >= 0 ? allArr[foundIdx] : null;
    const DESC_TO_KEY = { 'boss直聘': 'BOSS', '智联招聘': 'ZHILIAN', '前程无忧': 'JOB51', '猎聘': 'LIEPIN' };
    const subType = foundResume?.channelSubType || DESC_TO_KEY[foundResume?.channel];

    if(scoreItem.score ===-2){
      // ★ 该渠道未登录 → **不调 setNotScore**（避免后端把简历永久标"不可评分"），
      //   本地仍标 -2 显示"分析失败"；等用户重新登录后由 reAnalyzeFailedResumes 重新分析。
      const channelLoggedIn = subType ? allChannelStatus.value?.[subType]?.login === true : true;
      if (channelLoggedIn) {
        try {
          await setNotScore({
            resumeBlindIds: [scoreItem.id],
            searchId: searchConditionId.value
          });
        }catch (e){
          console.log(e)
        }
      } else {
        console.log(`[JobInfo] 渠道 ${subType} 未登录，跳过 setNotScore（等重新登录后重新分析）`);
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
