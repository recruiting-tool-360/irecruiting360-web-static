<template>
  <div @click="viewDetail" :data-id="resume.id" :data-resume-id="resume.id">
    <q-item class="resume-item q-mb-md rounded-borders"
            :style="`border-left: ${resume.isRead ? 'revert-layer' : '4px solid var(--q-primary-70)'}; cursor:pointer`"
    >
      <!-- 头部：基本信息 -->
      <q-item-section>
        <div class="row justify-between items-center q-pb-sm">
          <!--   已读图标     -->
          <div class="absolute-top-left" v-if="resume.isRead">
            <q-avatar square class="q-mr-sm" size="md">
              <img :src="'/index/header/searchPage/read.svg'"/>
            </q-avatar>
          </div>
          <!-- 左侧：姓名、性别、年龄、工作经验 -->
          <div class="col-8">
            <div class="row items-center">
              <q-avatar class="q-mr-sm" size="lg">
                <img
                    :src="`${resume.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg'}`"/>
              </q-avatar>
              <span class="text-h6 q-mr-sm">{{ resume.name }}</span>
              <q-badge v-if="resume.gender === 1" color="blue-5" class="q-mr-sm">男</q-badge>
              <q-badge v-else-if="resume.gender === 0" color="pink-5" class="q-mr-sm">女</q-badge>
              <span class="text-grey-8">{{ resume.ageDesc }}</span>
              <q-badge outline v-if="resume.experienceYear" rounded color="primary" class="q-ml-md q-px-sm">
                {{ resume.experienceYear === -1 ? '应届生' : `${resume.experienceYear}年经验` }}
              </q-badge>
              <q-badge outline rounded color="teal" class="q-ml-sm q-px-sm">{{ resume.degree }}</q-badge>
              <q-badge outline v-if="resume.status" rounded color="warning" class="q-ml-sm q-px-sm">{{
                  resume.status
                }}
              </q-badge>
              <q-badge outline v-if="resume.intention" rounded color="purple" class="q-ml-sm q-px-sm">
                {{ resume.intention || '未填写' }}
              </q-badge>
              <q-badge outline rounded color="grey-7" class="q-ml-sm q-px-sm">
                <q-avatar size="12px" class="q-mr-xs">
                  <img :src="getChannelImage(resume.channel)"/>
                </q-avatar>
                {{ formatChannelDisplayName(resume.channel) }}
              </q-badge>
            </div>

          <div class="q-mt-sm">
            <div v-if="resume.description" class="text-body2 text-grey-7 q-mt-xs description-text">
              <q-tooltip class="text-body2" max-width="50%">
                <div v-html="resume.description"></div>
              </q-tooltip>
              <div class="ellipsis-2-lines" v-html="`简要描述: ${resume.description}`"></div>
            </div>
          </div>
        </div>

        <!-- 右侧：评分和操作按钮 -->
        <div class="col-4 text-right">
          <div  v-if="tabStr!=='我的收藏'" class="score-badge q-mb-sm">
            <!-- AI评分正常显示 -->
            <q-circular-progress
              v-if="resume.score !== null && resume.score !== undefined && resume.score !== -2"
              show-value
              font-size="14px"
              :value="resume.score < 0 ? 0 : resume.score"
              size="xl"
              :color="getScoreColor(resume.score)"
              track-color="grey-3"
              class="q-mr-sm text-bold"
            >
              {{ Math.round(resume.score) }}
            </q-circular-progress>

            <!-- 显示评分为-2（无法获取渠道信息）的特殊状态 -->
            <q-avatar v-else-if="resume.score === -2" size="xl" class="bg-grey-2 text-red-7 q-mr-sm">
              <q-icon name="link_off" size="24px" />
              <q-tooltip>无法获取渠道信息</q-tooltip>
            </q-avatar>

            <!-- 正在加载AI分析结果 -->
            <q-circular-progress
              v-else
              indeterminate
              size="xl"
              color="primary"
              track-color="grey-3"
              class="q-mr-sm"
            >
              <q-avatar class="absolute-center bg-white" size="55px">
                <q-icon name="model_training" color="primary" size="28px" class="pulsate-icon" />
              </q-avatar>
              <q-tooltip>正在进行AI分析</q-tooltip>
            </q-circular-progress>

            <span class="text-caption text-grey-7">
              {{ resume.score === -2 ? '渠道数据异常' : (resume.score === null || resume.score === undefined ? 'AI分析中...' : 'AI 匹配度') }}
            </span>
          </div>

          <div>
            <q-btn  v-if="tabStr!=='我的收藏'" flat class="q-ma-xs q-px-sm" size="sm" color="primary" @click.stop="showAIEvaluationDialog"
              :disable="resume.score === null || resume.score === undefined || resume.score < 0">
              <q-icon class="q-mr-xs" :name="resume.score !== null && resume.score !== undefined && resume.score >= 0 ? 'insights' : (resume.score === -2 ? 'error_outline' : 'hourglass_empty')" />
              <span class="">{{ resume.score !== null && resume.score !== undefined && resume.score >= 0 ? 'AI评估' : (resume.score === -2 ? 'AI分析失败' : 'AI分析中') }}</span>
              <q-tooltip v-if="resume.score === null || resume.score === undefined || (resume.score < 0 && resume.score !== -2)">
                AI分析尚未完成，请稍后再试
              </q-tooltip>
              <q-tooltip v-else-if="resume.score === -2">
                AI分析失败，请检查渠道状态
              </q-tooltip>
            </q-btn>
            <q-btn v-if="!isVisible" flat round size="sm" color="orange" :icon="resume.inCollection?'star':'star_outline'" @click.stop="toggleCollect" />
<!--            <q-btn flat round size="sm" color="primary" icon="visibility" @click.stop="markAsRead" />-->

            <q-btn  v-if="tabStr!=='我的收藏'" flat round size="sm" color="primary" icon="more_vert" @click.stop>
              <q-menu>
                <q-list style="min-width: 100px">
                  <q-item clickable v-close-popup @click="downloadResume">
                    <q-item-section>分享简历</q-item-section>
                  </q-item>
<!--                  <q-item clickable v-close-popup @click="contactCandidate">-->
<!--                    <q-item-section>联系候选人</q-item-section>-->
<!--                  </q-item>-->
<!--                  <q-item clickable v-close-popup @click="addToBlacklist">-->
<!--                    <q-item-section>加入黑名单</q-item-section>-->
<!--                  </q-item>-->
                </q-list>
              </q-menu>
            </q-btn>
          </div>
        </div>
      </div>

      <q-separator class="q-my-xs" />

      <!-- 工作和教育经历 -->
      <div class="row q-col-gutter-md q-pt-sm">
        <!-- 工作经历 -->
        <div class="col-4">
          <div class="row items-center">
            <q-icon name="work" color="primary" size="xs" class="q-mr-sm" />
            <span class="text-subtitle2">工作经历</span>
          </div>
          <div class="q-ml-lg q-mt-xs">
            <div v-if="resume.workExp">
              <span class="text-weight-medium">{{ resume.workExp.companyName }}</span>
              <span class="q-mx-xs">•</span>
              <span>{{ resume.workExp.role }}</span>
              <span class="q-ml-sm text-grey-7">{{ resume.workExp.workStartTime }} - {{ resume.workExp.workEndTime || '至今' }}</span>
            </div>
            <div v-else class="text-grey-7">暂无工作经历</div>
          </div>
        </div>

        <!-- 教育经历 -->
        <div class="col-4">
          <div class="row items-center">
            <q-icon name="school" color="primary" size="xs" class="q-mr-sm" />
            <span class="text-subtitle2">教育经历</span>
          </div>
          <div class="q-ml-lg q-mt-xs">
            <div v-if="resume.eduExp">
              <span class="text-weight-medium">{{ resume.eduExp.schoolName }}</span>
              <span class="q-mx-xs">•</span>
              <span>{{ resume.eduExp.major }}</span>
              <span class="q-mx-xs">•</span>
              <span>{{ resume.eduExp.degree || resume.degree }}</span>
            </div>
            <div v-else class="text-grey-7">暂无教育经历</div>
          </div>
        </div>
      </div>
      <div>
        <div class="col-24 flex justify-end">
          <div class="flex wrap items-end justify-end">
            <template v-if="isVisible && tabStr!=='我的收藏'">
              <q-btn 
                flat class="q-ma-xs"
                size="md" color="primary" 
                :disable="readOnly || !(resume.score !== null && resume.score !== undefined && resume.score >= 0) || isThirdPartyActionDone(resume?.resumeThirdPartyInfo)"
                @click.stop="assignJob(resume)">
                <q-icon size="xs" class="q-mr-xs" name="work"></q-icon>
                <span>
                  {{ getAssignJobButtonText(resume?.resumeThirdPartyInfo) }}
                </span>
                <q-tooltip 
                  v-if="shouldShowAssignJobTooltip(resume?.resumeThirdPartyInfo)"
                  anchor="top middle" 
                  self="bottom middle" 
                  :offset="[10, 10]"
                >
                  系统中已存在重复简历
                </q-tooltip>
              </q-btn>
              <q-btn 
                flat class="q-ma-xs"
                size="md" color="primary"
                :disable="readOnly || !(resume.score !== null && resume.score !== undefined && resume.score >= 0) || isThirdPartyActionDone(resume?.resumeThirdPartyInfo)" 
                @click.stop="addToTalentPool(resume)">
                <q-icon size="xs" class="q-mr-xs" name="group_add"></q-icon>
                <span>
                  {{ getTalentPoolButtonText(resume?.resumeThirdPartyInfo) }}
                </span>
                <q-tooltip 
                  v-if="shouldShowTalentPoolTooltip(resume?.resumeThirdPartyInfo)"
                  anchor="top middle" 
                  self="bottom middle" 
                  :offset="[10, 10]"
                >
                  系统中已存在重复简历
                </q-tooltip>
              </q-btn>
            </template>
            <q-btn flat class="q-ma-xs" size="md" color="primary" 
              :disable="readOnly || isSimilarButtonDisabled" 
              @click.stop="searchSimilarResumes">
              <q-icon size="xs" class="q-mr-xs" name="search"></q-icon>
              <span>{{ similarButtonText }}</span>
            </q-btn>
            <span
              v-if="resume.channel&&resume.channel==='boss直聘'"
              class="boss-communication-button-wrap q-ma-xs"
            >
              <q-btn flat color="primary" size="md"
                :disable="readOnly || bossCommunicationLoading || isBossRecommendTaskExecuting"
                :loading="bossCommunicationLoading"
                @click.stop="scheduleInterview">
                <q-icon size="xs" class="q-mr-xs" name="chat"></q-icon>
                <span>立即沟通</span>
                <template #loading>
                  <q-spinner size="16px" class="q-mr-xs" />
                  <span>{{ bossCommunicationLoadingText }}</span>
                </template>
              </q-btn>
              <span
                v-if="isBossRecommendTaskExecuting"
                class="boss-communication-disabled-hit-area"
                @click.stop.prevent="notifyBossRecommendTaskExecuting"
              >
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[10, 10]"
                >
                  {{ bossRecommendTaskExecutingMessage }}
                </q-tooltip>
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- 自我描述 -->
<!--      <div class="q-py-sm" v-if="resume.description">-->
<!--        <div class="row items-center">-->
<!--          <q-icon name="description" color="primary" size="sm" class="q-mr-sm" />-->
<!--          <span class="text-subtitle2">自我描述</span>-->
<!--        </div>-->
<!--        <p class="q-ml-lg q-mt-xs text-body2 description-text">{{ resume.description }}</p>-->
<!--      </div>-->

        <!-- 底部标签和操作按钮 -->
        <div class="row justify-end items-center">
          <!--        <div>-->
          <!--          <q-chip-->
          <!--            v-if="resume.status"-->
          <!--            outline-->
          <!--            :color="getStatusColor(resume.status)"-->
          <!--            size="sm"-->
          <!--          >-->
          <!--            {{ resume.status }}-->
          <!--          </q-chip>-->
          <!--          <q-chip outline color="grey-7" size="sm">-->
          <!--            {{ resume.channel }}-->
          <!--          </q-chip>-->
          <!--        </div>-->
          <!--        <div>-->
          <!--          <q-btn flat color="primary" label="详情" size="sm" @click.stop="viewDetail" />-->
          <!--          <q-btn color="primary" label="约面试" size="sm" @click.stop="scheduleInterview" />-->
          <!--        </div>-->
        </div>
      </q-item-section>
    </q-item>
  </div>

  <AIResumeEvaluation
    v-model:visible="showAIEvaluation"
    :resume-data="resume"
    :search-condition-id="searchConditionId"
    @view-detail="viewDetail"
    @assign-job="assignJob"
    @add-to-talent-pool="addToTalentPool"
  />
</template>

<script setup>
import {defineProps, defineEmits, computed, ref, defineAsyncComponent, onMounted} from 'vue';
import notify from "src/util/notify";
import qs from "qs";
// 使用Quasar的Dialog显示内容
import { useQuasar } from 'quasar';
import {compareResumeSimilarity, generateSearchCondition, compareResumeSimilarityPlus} from "src/api/research/ResearchApi";
import {useStore} from "vuex";
import {saveCondition} from "src/api/search/SearchApi";
import SimilarResumesDialog from 'src/components/resume/SimilarResumesDialog.vue';
import {getSearchConditionRequest, getSearchStateValues} from "src/pluginSrc/util/SearchParamUtils";
import AIResumeEvaluation from 'src/components/resume/AIResumeEvaluation.vue';
import {markResumeBlindReadStatus, userCollectResume} from "src/api/jobList/JobListApi";
import {getChannelUrl} from "src/pluginSrc/util/ChannelUrlUtil";
import { openExternalSiteUrl } from "src/util/openChannelLoginUrl";
import { useSendResume } from 'src/hooks/useSendResume';
import { bossDomGenerator } from 'src/hooks/bossDomGenerator';
import { usePlanVisibility } from 'src/hooks/usePlanVisibility';
import { greetBossInteractionGeek } from 'src/util/automation/bossInteractionGreet';
import { formatChannelDisplayName } from 'src/util/channelDisplayName';

const store = useStore();
const $q = useQuasar();
const bossCommunicationLoading = ref(false);
const bossCommunicationLoadingStage = ref('idle');
const bossCommunicationLoadingText = computed(() =>
  bossCommunicationLoadingStage.value === 'opening'
    ? '正在打开'
    : '正在查找'
);
const bossRecommendTaskExecutingMessage = '任务执行中，完成后可立即沟通';

const props = defineProps({
  resume: {
    type: Object,
    required: true
  },
  isRead: {
    type: [Boolean, Number],
    default: false
  },
  tabStr:{
    type: String,
    default: ''
  },
  /**
   * 只读模式：卡片内的所有"业务联动"动作都被跳过，只 emit 事件给父组件。
   *
   * 用途：BOSS 推荐 tab 的匿名候选人（id 是 encryptGeekId）不在 i 人事简历库里，
   *      不能直接调 `markResumeBlindReadStatus` / `bossHandleViewDetail`（会报 400 /
   *      JSON.parse undefined）。父组件设 readOnly=true 后，ResumeCard 只负责展示，
   *      所有交互交给父组件接 emit 后自己处理。
   *
   * 受影响的内部函数：viewDetail / handleIsReadData / handleViewDetail
   * 受影响的按钮：分配职位 / 加入人才库 / 相似简历 / 立即沟通（全部 disabled）
   */
  readOnly: {
    type: Boolean,
    default: false
  },
  /**
   * 详情打开动作是否由父组件接管。
   * 推荐牛人列表需要把原始 geek 一并交给父组件解析 securityId，因此不能先走
   * ResumeCard 内部的通用 bossUrl()，否则历史结果会打开 securityId=undefined 的空白页。
   * 仅接管详情，不影响立即沟通、分配职位、加入人才库等按钮。
   */
  detailHandledByParent: {
    type: Boolean,
    default: false
  },
  /**
   * 可选：每条简历自带的 searchConditionId（来自任务级查询 /search/task/results/query 返回的
   * `searchConditionId` 字段）。传了的话优先用，作为 AIResumeEvaluation 的 `searchId` 参数。
   *
   * 不传则 fallback 到全局 store.getters.getSearchConditionId（保留老 AISearch 流程行为）。
   *
   * 为什么要可覆盖：
   *   全局 getSearchConditionId 是单值，由 AISearch.executeSearch 在 save 条件时写入，
   *   跨任务 / 跨 chat 查看历史结果时容易脏。任务结果接口返回的 `searchConditionId` 是
   *   该任务执行时**真正使用的**条件 ID，按条传更准；AI 评估 / 相似简历等接口才能命中。
   */
  searchConditionIdOverride: {
    type: [String, Number],
    default: null
  }
});

const emit = defineEmits([
  'collect',
  'read',
  'download',
  'contact',
  'blacklist',
  'detail',
  'interview',
  'updateCollectResumeLoading'
]);
// 渠道名称
const tabStr = computed(() => props.tabStr);
// 搜索id：优先用 prop 传入的 override（任务结果路径需要这个，全局 getter 跨任务会脏），
// 没传就 fallback 到 store 全局 getter（保留老 AISearch 路径行为）
const searchConditionId = computed(
  () => props.searchConditionIdOverride || store.getters.getSearchConditionId
);
//aiSearchRef
const aiSearchRef = computed(() => store.getters.getAiSearchRefValue);
// 所有渠道状态
const allChannelStatus = computed(() => store.getters.getChannelConf);

// 用户信息
const userInfo = computed(() => store.getters.getUserInfo);
//当前chat id
const chatId = computed(() => store.getters.getLatestChatId);

// 任意职位的 BOSS 推荐 RPA 真正操作页面时，都禁用当前卡片的“立即沟通”。
// 排队/WAITING 和后续 SCORING 评分阶段不在全局 getter 的锁定范围内。
const isBossRecommendTaskExecuting = computed(() => {
  return store.getters['SearchTasks/isBossRecommendRpaExecuting'] === true;
});

// 三方公司的信息
const planInfo = computed(() => store.getters.getUserInfo?.extendData);

// 添加相似简历按钮状态的computed属性来确保响应式更新
const similarButtonText = computed(() => {
  const text = store.getters.getSimilarSearchButtonText;
  return text;
});

const isSimilarButtonDisabled = computed(() => {
  const disabled = store.getters.isSimilarSearchDisabled;
  return disabled;
});

// 所有第三方渠道配置
const allThirdPartyChannelConfig = computed(() => {
  return Object.entries(allChannelStatus.value)
    .filter(([key, channel]) => !(key === 'ALL' || key === 'Collect'))
    .map(([key, channel]) => ({ ...channel }));
});

//查询渠道配置
const showSettingsChannelConfig = computed(()=>store.getters.getUserChannelConfig);
//获取渠道禁用状态
const getChannelDisable = (key) => {
  const channelConfig = showSettingsChannelConfig.value.find(config => config.key === key);
  // 如果找到配置且 enableConfig 为 false 则禁用，否则不禁用
  return channelConfig.enableConfig;
};

// 初始化发送简历hook 
const { handleResume, sendResume } = useSendResume('resumeList');

// 默认planA企业可见， 无plan或plan不匹配时默认不可见
const { isVisible } = usePlanVisibility({
  visibleForPlans: ['PlanA'],
  defaultVisible: false
})

// 解构修复后的函数
const { resumeGenerateBase64s } = bossDomGenerator();

// 在新窗口中打开详情页面
// 客户端模式：通过 IPC 让主进程开独立 BrowserWindow（带对应招聘站 partition cookie）
// 浏览器模式：保持原 window.open 行为
//
// @param {string} url
// @param {Object} [opts]
// @param {boolean} [opts.forceReload=false] 同 URL tab 复用时强制 reload，让 SPA 重拉数据。
//   "立即沟通" / "查看详情" 等场景必须 true，否则用户刚收藏 / 加入人才库后跳过去看不到最新人。
const openDetailInNewWindow = (url, opts) => {
  openExternalSiteUrl(url, opts);
}

// 替换openDetailInNewWindow2函数
const openDetailInNewWindow2 = (url) => {
  // 创建模态框
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '10%';
  modal.style.left = '10%';
  modal.style.width = '80%';
  modal.style.height = '80%';
  modal.style.backgroundColor = 'white';
  modal.style.zIndex = '9999';
  modal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)';
  modal.style.borderRadius = '8px';
  modal.style.overflow = 'hidden';

  // 创建标题栏
  const header = document.createElement('div');
  header.style.height = '40px';
  header.style.backgroundColor = '#f5f5f5';
  header.style.borderBottom = '1px solid #e0e0e0';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.padding = '0 15px';

  // 添加标题
  const title = document.createElement('span');
  title.textContent = '简历详情';
  title.style.fontWeight = 'bold';

  // 添加关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '24px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = '#666';
  closeBtn.onclick = () => {
    document.body.removeChild(modal);
    document.body.style.overflow = 'auto';
  };

  // 创建iframe
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = 'calc(100% - 40px)';
  iframe.style.border = 'none';

  // 组装模态框
  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);
  modal.appendChild(iframe);

  // 阻止页面滚动
  document.body.style.overflow = 'hidden';

  // 添加到文档
  document.body.appendChild(modal);
}

//boss 查看详情
const bossHandleViewDetail = async (resume) => {
  console.log('boss详情信息', resume)
  // const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  // const url = pluginAllUrls.BOSS.geekDetailUrl+`?isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${requestParams.request.securityId}`;
  let url = getChannelUrl(resume);
  openDetailInNewWindow(url);
}

//zhilian 查看详情
const zhilianHandleViewDetail = async (resume) => {
  console.log('zhilian详情信息', resume)
  // const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  // const requestData ={
  //   "t": requestParams.request.t,
  //   "resumeNumber": requestParams.request.resumeNumber,
  //   "k": requestParams.request.k
  // }
  // const url=pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.geekDetailUrl+`?`+qs.stringify(requestData);
  let url = getChannelUrl(resume);
  openDetailInNewWindow(url);
}

//liepin 查看详情
const liepinHandleViewDetail = async (resume) => {
  let url = getChannelUrl(resume);
  openDetailInNewWindow(url);
}

const job51HandleViewDetail = async (resume) => {
  // const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  // const userid=requestParams.request.userid;
  // const requestid=requestParams.request.requestid;
  // const keyWord =requestParams.request.keyWord;
  // const requestData ={
  //   resumeId:userid,
  //   requestId:requestid,
  //   keyword:keyWord
  // }
  // const url=pluginAllUrls.JOB51.geekDetailUrl+`?`+qs.stringify(requestData);
  let url = getChannelUrl(resume);
  openDetailInNewWindow(url);
}

//业务配置 - 现在函数已经定义，可以安全引用
const getChannelServiceConfig = ref([
  {
    channel:'boss直聘',
    fn:bossHandleViewDetail,
    logo:'/index/header/searchPage/boss.ico'
  },
  {
    channel:'智联招聘',
    fn:zhilianHandleViewDetail,
    logo:'/index/header/searchPage/zhilian.svg'
  },
  {
    channel:'猎聘',
    fn:liepinHandleViewDetail,
    logo:'/index/header/searchPage/liepin.svg'
  },
  {
    channel:'前程无忧',
    fn:job51HandleViewDetail,
    logo:'/index/header/searchPage/job51.svg'
  }
])

// 根据分数获取颜色
const getScoreColor = (score) => {
  if (score === null || score === undefined) return 'grey-5';
  if (score >= 80) return 'positive';
  if (score >= 60) return 'primary';
  if (score >= 40) return 'warning';
  return 'negative';
};

//获取渠道图片
const getChannelImage = (channel) => {
  const channelInfo = getChannelServiceConfig.value.find(item => item.channel === channel);
  return channelInfo ? channelInfo.logo : '';
};

// 根据状态获取颜色
const getStatusColor = (status) => {
  if (status.includes('离职-随时到岗')) return 'positive';
  if (status.includes('在职-')) return 'warning';
  return 'grey-7';
};

//收藏
const handleIsCollectData = async (resume) =>{
  const requestData = {
    userId: userInfo.value.id,
    resumeBlindId: resume.id,
    isSaveOtherDelete: !resume.inCollection,
    chatId:chatId.value
  };
  try {
    let {data} = await userCollectResume(requestData);
    resume.inCollection = requestData.isSaveOtherDelete;
    //我的收藏tab数据修改
    if(tabStr.value==='我的收藏'){
      if(!resume.inCollection){
        //修改所有数据中的收藏状态
        allChannelStatus.value['ALL'].cardInfoRef.updateResumeCollectionStatus(resume.id, false)
        //删除收藏数据
        allChannelStatus.value['Collect'].cardInfoRef.removeResumeById(resume.id);
      }
    }else{
      //刷新收藏列表数据
      allChannelStatus.value['Collect'].cardInfoRef.refreshCollectList();
    }
  }catch (e){
    console.log(e);
  }
}

// 收藏操作
const toggleCollect = () => {
  emit('collect', props.resume);
  //设置已读
  handleIsReadData(props.resume)
  //收藏
  handleIsCollectData(props.resume);
};

// 标记为已读
const markAsRead = () => {
  emit('read', props.resume);
  handleIsReadData(props.resume)
};

// 下载简历
const downloadResume = async () => {
  try {
    // console.log('简历数据:', props.resume);

    // 检查简历 channel 是否存在
    if (!props.resume.channel) {
      throw new Error('简历渠道信息缺失');
    }

    // 检查 originalResumeUrlInfo 是否存在
    if (!props.resume.originalResumeUrlInfo) {
      throw new Error('简历URL信息缺失');
    }

    // 调试日志
    // console.log('获取URL前的resume channel:', props.resume.channel);

    let url = getChannelUrl(props.resume);

    // console.log('生成的URL:', url);

    if (!url) {
      throw new Error('生成URL失败');
    }

    // 使用 navigator.clipboard API 复制
    try {
      // 检查是否支持 navigator.clipboard API
      if (!navigator.clipboard) {
        // 回退到传统的方法
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      } else {
        // 使用现代 API
        await navigator.clipboard.writeText(url);
      }

      // 复制成功
      // $q.notify({
      //   message: '分享地址复制成功',
      //   color: 'positive',
      //   icon: 'content_copy',
      //   position: 'top',
      //   timeout: 2000
      // });
      notify.success('分享地址复制成功')
    } catch (clipboardError) {
      console.error('Clipboard error:', clipboardError);
      throw new Error('复制操作被浏览器拒绝');
    }
  } catch (error) {
    console.error('复制简历链接失败:', error);
    // $q.notify({
    //   message: '复制简历链接失败: ' + error.message,
    //   color: 'negative',
    //   icon: 'error',
    //   position: 'top'
    // });
    notify.error('复制简历链接失败')
  }
  emit('download', props.resume);
};

// 联系候选人
const contactCandidate = () => {
  emit('contact', props.resume);
};

// 加入黑名单
const addToBlacklist = () => {
  emit('blacklist', props.resume);
};

// 查看详情
const viewDetail = () => {
  // readOnly=true（BOSS 推荐 tab 等匿名场景）跳过所有 i 人事 / 渠道业务联动，
  // 只 emit 给父组件，由父组件决定后续行为（如打开候选人详情抽屉）
  if (!props.readOnly) {
    if (!props.detailHandledByParent) {
      handleViewDetail(props.resume);
    }
    //设置已读
    handleIsReadData(props.resume);
  }
  emit('detail', props.resume);
};

const showAIEvaluation = ref(false);

//查找相似的简历
const searchSimilarResumes = () => {
  // 如果正在冷却中，直接返回
  if (isSimilarButtonDisabled.value) {
    return;
  }
  
  console.log('开始搜索相似简历');
  searchALlResumes(props.resume);
  // getSimilarResumes(props.resume);

  // 启动全局冷却倒计时（所有简历的相似简历按钮都会被禁用）
  // 支持刷新页面后继续倒计时，使用时间戳保证准确性
  // 使用默认配置时间
  store.dispatch('startSimilarSearchCooldown');
}

//查找相似的所有简历
const searchALlResumes = async (resume) => {
  try {
    // 显示加载对话框
    const loadingDialog = $q.dialog({
      message: '正在搜索相似简历...',
      progress: {
            color: 'primary',   // 使用主题色
            size: '60px',       // 调整大小
            thickness: 0.25     // 调整粗细
        },
      persistent: true,
      ok: false,
      dark: true,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0.6)'
      },
      class: 'transparent-dialog'
    });

    // 设置超时关闭
    const timeoutId = setTimeout(() => {
      loadingDialog.hide();
      $q.notify({
        message: '搜索时间过长，已自动取消',
        color: 'warning',
        position: 'top'
      });
    }, 15000); // 30秒超时

    try {
      // 生成搜索条件
      const { data: searchConditionRequest } = await generateSearchCondition(resume.id, searchConditionId.value);

      // 获取搜索状态值并构建搜索条件请求
      let channels = allThirdPartyChannelConfig.value.filter((channel) => channel.login&&getChannelDisable(channel.key)).map((item) => (item.name))||[];
      const searchStateValues = getSearchStateValues(searchConditionRequest);
      const searchConditionRequestObj = getSearchConditionRequest(searchStateValues,chatId.value,userInfo.value.id,channels);

      // 保存搜索条件
      const { data: channelSearchCondition } = await saveCondition(searchConditionRequestObj);
      // 获取所有渠道的简历数据
      const jobListRequestDTO = await searchALlResumesRequest(channelSearchCondition);

      // 获取相似简历
      let jobList = [];
      try {
        const { data: jobListData } = await compareResumeSimilarity({
          searchVO: jobListRequestDTO,
          resumeBlindId: resume.id,
          searchConditionId:channelSearchCondition.id
        });
        jobList = jobListData;
      } catch (error) {
        console.error('获取相似简历失败:', error);
      }

      console.log('相似简历列表:', jobList);

      // 清除超时计时器
      clearTimeout(timeoutId);

      // 关闭加载对话框
      loadingDialog.hide();

      // 使用静态导入的组件创建对话框
      $q.dialog({
        component: SimilarResumesDialog,
        componentProps: {
          similarResumes: jobList || [],
          originalResume: resume,
          isLoading: false
        }
      });
    } catch (error) {
      // 清除超时计时器
      clearTimeout(timeoutId);

      // 关闭加载对话框
      loadingDialog.hide();

      throw error; // 向外层抛出错误
    }
  } catch (error) {
    console.error('搜索相似简历过程中发生错误:', error);
    $q.notify({
      message: '搜索相似简历失败，请稍后再试',
      color: 'negative',
      position: 'top'
    });
  }
}

//获取相似简历
const getSimilarResumes = async (resume) => {
  // 获取相似简历
  let jobList = [];
  try {
    // 生成搜索条件
    const { data: searchConditionRequest } = await generateSearchCondition(resume.id, searchConditionId.value);
    let channels = allThirdPartyChannelConfig.value.filter((channel) => channel.login&&getChannelDisable(channel.key)).map((item) => (item.name))||[];
    const filteredChannels = channels?.length > 0 ? channels.filter(channel => channel !== resume.channel) : [];
    const searchStateValues = getSearchStateValues(searchConditionRequest);
    const searchConditionRequestObj = getSearchConditionRequest(searchStateValues,chatId.value,userInfo.value.id,filteredChannels);

    // 保存搜索条件
    const { data: channelSearchCondition } = await saveCondition(searchConditionRequestObj);

    // 获取所有渠道的简历数据
    const jobListRequestDTO = await searchALlResumesRequest(channelSearchCondition);

    try {
      const { data: jobListData } = await compareResumeSimilarityPlus({
        searchVO: jobListRequestDTO,
        resumeBlindId: resume.id,
        searchConditionId:channelSearchCondition.id
      });
      jobList = jobListData;
    } catch (error) {
      console.error('获取相似简历失败:', error);
    }
    //过滤相同人 resume.matchType === 1
    jobList = Array.isArray(jobList) ? jobList.filter(item => item.matchType === 1) : [];
  } catch (error) {
    throw error; // 向外层抛出错误
  }
  console.log("最终简历",jobList)
  return jobList
}

const searchALlResumesRequest = async (channelSearchCondition) => {
  // 获取搜索条件ID
  const searchConditionId = channelSearchCondition.id;
  console.log(channelSearchCondition)
  // 过滤已登录的渠道
  const loggedInChannels = allThirdPartyChannelConfig.value.filter(channel => channel.login);
  let jobListRequestDTO = [];

  if (loggedInChannels.length > 0) {
    // 使用 Promise.all 进行并发处理
    const searchPromises = loggedInChannels.map(async (channelItem) => {
      try {
        const maxIterations =channelItem.key==='BOSS'?1:1;
        const allData = channelItem.cardInfoRef && typeof channelItem.cardInfoRef.recursiveChannelSearch === 'function'
          ? await channelItem.cardInfoRef.recursiveChannelSearch(maxIterations,channelSearchCondition)
          : null;
        if (allData) {
          const saveJobListRequest = saveJobListRequestTemplate();
          saveJobListRequest.searchConditionId = searchConditionId;
          saveJobListRequest.channel = channelItem.desc;
          saveJobListRequest.resumeList = allData;
          return saveJobListRequest;
        }
      } catch (error) {
        console.error(`获取渠道 ${channelItem.desc} 数据失败:`, error);
      }
      return null;
    });

    // 等待所有搜索请求完成并过滤掉失败的结果
    const results = await Promise.all(searchPromises);
    jobListRequestDTO = results.filter(item => item !== null);
  }

  return jobListRequestDTO;
}

const saveJobListRequestTemplate =()=>{
  return {
    searchConditionId:null,
    outId:null,
    channel:null,
    resumeList:null
  }
}

// 约面试 / 立即沟通
const scheduleInterview = async () => {
  // 模板 disable 外再做一次业务拦截，防止全局 RPA 刚上锁、DOM 尚未完成下一帧渲染时误触。
  if (isBossRecommendTaskExecuting.value) {
    notifyBossRecommendTaskExecuting();
    return;
  }
  if (bossCommunicationLoading.value) return;
  bossCommunicationLoadingStage.value = 'searching';
  bossCommunicationLoading.value = true;
  try {
    try {
      await window?.api?.automation?.showOverlay?.({
        title: '正在执行立即沟通',
        message:
          '客户端正在定位候选人并执行沟通，请耐心等待，请勿同步操作 <span class="channel">BOSS直聘</span> 账号',
        channelName: 'BOSS直聘',
        coverChannels: ['boss']
      });
    } catch (overlayError) {
      console.warn('立即沟通蒙层显示失败（继续执行）:', overlayError);
    }

    const result = await greetBossInteractionGeek(props.resume, {
      onProgress: (stage) => {
        bossCommunicationLoadingStage.value = stage;
      }
    });
    if (!result?.ok) {
      if (result?.code === 'BOSS_ENTITLEMENT_REQUIRED') {
        notify.warning('BOSS直聘沟通权益不足，请开通权益后重试');
      } else {
        notify.warning(result?.message || 'BOSS 互动页面操作失败，请前往 BOSS 检查');
      }
      return;
    }
    notify.success(`已在 BOSS 互动页面执行“${result.action}”`);
  } catch (error) {
    console.error('BOSS 互动页面立即沟通失败:', error);
    notify.warning('BOSS 互动页面操作失败，请前往 BOSS 检查');
  } finally {
    try {
      await window?.api?.automation?.hideOverlay?.();
    } catch (overlayError) {
      console.warn('立即沟通蒙层关闭失败（忽略）:', overlayError);
    }
    bossCommunicationLoading.value = false;
    bossCommunicationLoadingStage.value = 'idle';
    emit('interview', props.resume);
  }
};

const notifyBossRecommendTaskExecuting = () => {
  notify.warning(bossRecommendTaskExecutingMessage);
};

//处理已读
const handleIsReadData = async (resume) => {
  // ★ 已读标记如果已是已读就不重复调；否则乐观置已读（直接改当前展示对象，
  //   兼容 runtime(ALL.data) / viewing(ViewingResults bucket) 两种来源 —— 之前只改 ALL.data，
  //   查看结果列表（viewing bucket）里点开后「已读标记」不显示）
  if (resume && resume.isRead) return true;
  try {
    await markResumeBlindReadStatus([resume.id], true);
  } catch (error) {
    console.error('标记简历已读状态失败:', error);
    return false;
  }

  // 直接改当前展示的 resume 对象（无论它来自哪个 bucket，都是模板渲染的同一个对象）
  if (resume) resume.isRead = 1;

  // 同步更新渠道聚合 ALL.data 里的对应数据（保证切 tab / 重渲染仍是已读）
  if (allChannelStatus.value['ALL'] && allChannelStatus.value['ALL'].data) {
    const allDataIndex = allChannelStatus.value['ALL'].data.findIndex(item => item.id === resume.id);
    if (allDataIndex !== -1) {
      allChannelStatus.value['ALL'].data[allDataIndex].isRead = 1;
    }
  }

  // 更新对应渠道的数据
  // Object.entries(allChannelStatus.value).forEach(([key, channel]) => {
  //   if (channel.name === resume.channel && channel.data) {
  //     const channelDataIndex = channel.data.findIndex(item => item.id === resume.id);
  //     if (channelDataIndex !== -1) {
  //       channel.data[channelDataIndex].isRead = 1;
  //     }
  //   }
  // });

  return true;
}

//处理详情
const handleViewDetail = (resume) => {
  console.log('详情信息2',resume)
  const channelInfo = getChannelServiceConfig.value.find(item => item.channel === resume.channel);
  if(channelInfo){
    channelInfo.fn(resume);
  }else{
    notify.warning(formatChannelDisplayName(resume.channel)+"查询详情异常，请联系管理员");
  }
};  

/**
 * @param resume 简历
 */
const commomIHR = async (resume) => {
  try {
    emit('updateCollectResumeLoading', true);

    let allResume = [{ ...resume, type: "normal", isMaster: true }];

    // 单个请求获取相似简历
    const similarResumes = await getSimilarResumes(resume);
    console.log(similarResumes, "similarResumes-相似简历");
    
    // 有相似简历->合并修改type
    if(similarResumes.length > 0) {
      allResume = [...allResume, ...similarResumes].map(item => {
        return { isMaster: false, ...item, type: "similar" }
      })
    }
    console.log(allResume, "similarResumes-合并后");

    const { data, filterZhiLianCount } = await handleResume(allResume, true);
    if(filterZhiLianCount > 0) {
      $q.notify({
        message: `智联招聘渠道查看简历数量已达上限，已过滤${filterZhiLianCount}份智联候选人`,
        color: 'negative',
        position: 'top'
      });
    }
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    emit('updateCollectResumeLoading', false);
  }
}

// 分配职位
const assignJob = async (resume) => {
  if(!planInfo.value?.assignPositionAuth) {
    notify.warning("您没有候选人模块添加候选人权限，不能将候选人添加至职位下，请联系管理员分配权限");
    return;
  }
  try {
    emit('updateCollectResumeLoading', true);

    const res = await commomIHR(resume);
    console.log(res, 'result222');

    if(Object.keys(res).length > 0) {
      await sendResume(res, {
        action: 'assign-position',
      });
    }
  } catch (error) {
    console.error('assignJob失败:', error);
    $q.notify({
      message: '处理简历失败: ' + error.message,
      color: 'negative',
      position: 'top'
    });
  } finally {
    emit('updateCollectResumeLoading', false);
  }
};

// 加入人才库
const addToTalentPool = async (resume) => {
  if(!planInfo.value?.talentPoolAuth) {
    notify.warning("您没有人才库模块添加候选人权限，不能将候选人添加至人才库，请联系管理员分配权限");
    return;
  }
  try {
    emit('updateCollectResumeLoading', true);

    const res = await commomIHR(resume);
    console.log(res, 'result222');

    if(Object.keys(res).length > 0) {
      await sendResume(res, { 
        action: 'talent-pool',
      });
    }
  } catch (error) {
    console.error('addToTalentPool失败:', error);
    $q.notify({
      message: '处理简历失败: ' + error.message,
      color: 'negative',
      position: 'top'
    });
  } finally {
    emit('updateCollectResumeLoading', false);
  }
};

// 任一第三方操作（加入人才库 / 分配职位）已成功 → 两个按钮都置灰。
// 用户要求：加入人才库成功 或 分配职位成功后，分配职位和加入人才库都禁用。
const isThirdPartyActionDone = (thirdPartyInfo) => thirdPartyInfo?.status == '1';

// 分配职位是否已成功（决定「分配职位」按钮文案「已分配职位」）
const isAssignJobDone = (thirdPartyInfo) =>
  thirdPartyInfo?.type === 'ASSIGN_POSITIONS' && thirdPartyInfo?.status == '1';

// 加入人才库是否已成功：**只认 JOIN_POOLS**（按后端 type 区分文案）。
//   之前把 ASSIGN_POSITIONS 也算「已加入人才库」→ 用户只点了「分配职位」，刷新后却显示
//   「已加入人才库」。现按真实操作 type 区分：分配职位只显示「已分配职位」，加入人才库才显示
//   「已加入人才库」。（两个按钮在任一操作成功后仍都禁用，由 isThirdPartyActionDone 控制。）
const isTalentPoolDone = (thirdPartyInfo) =>
  thirdPartyInfo?.type === 'JOIN_POOLS' && thirdPartyInfo?.status == '1';

// 获取分配职位按钮文本
const getAssignJobButtonText = (thirdPartyInfo) => {
  if (isAssignJobDone(thirdPartyInfo)) {
    return '已分配职位';
  }
  return '分配职位';
};

// 获取加入人才库按钮文本
const getTalentPoolButtonText = (thirdPartyInfo) => {
  if (isTalentPoolDone(thirdPartyInfo)) {
    return '已加入人才库';
  }
  return '加入人才库';
};

// 是否显示分配职位按钮的tooltip
const shouldShowAssignJobTooltip = (thirdPartyInfo) => {
  if (!thirdPartyInfo) return false;
  // 不是分配职位成功的情况下显示tooltip
  return !(thirdPartyInfo.type === 'ASSIGN_POSITIONS' && thirdPartyInfo.status == '1');
};

// 是否显示加入人才库按钮的tooltip
const shouldShowTalentPoolTooltip = (thirdPartyInfo) => {
  if (!thirdPartyInfo) return false;
  // 不是加入人才库成功且不是分配职位成功的情况下显示tooltip
  return !(
    (thirdPartyInfo.type === 'JOIN_POOLS' && thirdPartyInfo.status == '1') ||
    (thirdPartyInfo.type === 'ASSIGN_POSITIONS' && thirdPartyInfo.status == '1')
  );
};

// 显示AI评估对话框
const showAIEvaluationDialog = () => {
  showAIEvaluation.value = true;
};

//处理报警使用
onMounted(() => {
  let id = props.resume.id;
  let dataset = document.querySelector(`[data-resume-id="${props.resume.id}"]`)?.dataset;
  // console.log('ResumeCard mounted, resume ID:', props.resume.id);
  // console.log('Element dataset:', document.querySelector(`[data-resume-id="${props.resume.id}"]`)?.dataset);
});

</script>

<style scoped>
.resume-item {
  border: 1px solid #e0e0e0;
  background-color: white;
}

.resume-item:hover {
  transform: translateY(-3px);
}

.score-badge {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.boss-communication-button-wrap {
  position: relative;
  display: inline-flex;
}

.boss-communication-disabled-hit-area {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: not-allowed;
}

.description-text {
  max-height: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}

:deep(.transparent-dialog) {
  background-color: rgba(0, 0, 0, 0.6) !important;
}

.pulsate-icon {
  animation: pulsate 1.5s ease-out infinite;
}

@keyframes pulsate {
  0% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.7;
  }
}
</style>
