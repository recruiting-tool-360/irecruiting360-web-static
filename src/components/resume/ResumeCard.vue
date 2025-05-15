<template>
  <q-item class="resume-item q-mb-md rounded-borders"
          :style="`border-left: ${resume.isRead ? 'revert-layer' : '4px solid var(--q-primary-70)'}`"
          v-ripple clickable @click="viewDetail" :data-id="resume.id" :data-resume-id="resume.id">
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
              <img :src="`${resume.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg'}`" />
            </q-avatar>
            <span class="text-h6 text-grey-8 q-mr-sm">{{ resume.name }}</span>
            <q-badge v-if="resume.gender === 1" color="blue-5" class="q-mr-sm">男</q-badge>
            <q-badge v-else-if="resume.gender === 0" color="pink-5" class="q-mr-sm">女</q-badge>
            <span class="text-grey-8">{{ resume.ageDesc }}</span>
            <q-badge outline v-if="resume.experienceYear" rounded color="primary" class="q-ml-md q-px-sm">{{ resume.experienceYear === -1 ? '应届生' : `${resume.experienceYear}年经验` }}</q-badge>
            <q-badge  outline rounded color="teal" class="q-ml-sm q-px-sm">{{ resume.degree }}</q-badge>
            <q-badge outline v-if="resume.status" rounded color="warning" class="q-ml-sm q-px-sm">{{ resume.status }}</q-badge>
            <q-badge outline v-if="resume.intention" rounded color="purple" class="q-ml-sm q-px-sm">{{ resume.intention || '未填写' }}</q-badge>
            <q-badge outline rounded color="grey-7" class="q-ml-sm q-px-sm">
              <q-avatar size="12px" class="q-mx-sm">
                <img :src="getChannelImage(resume.channel)" />
              </q-avatar>
              {{ resume.channel }}</q-badge>
          </div>

          <div class="q-mt-sm">
            <div v-if="resume.description" class="text-body2 text-grey-7 q-mt-xs description-text">
              <q-tooltip class="text-body2">
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
              {{ resume.score }}
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
              {{ resume.score === -2 ? '渠道已断开' : (resume.score === null || resume.score === undefined ? 'AI分析中...' : 'AI 匹配度') }}
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
            <q-btn flat round size="sm" color="orange" :icon="resume.inCollection?'star':'star_outline'" @click.stop="toggleCollect" />
<!--            <q-btn flat round size="sm" color="primary" icon="visibility" @click.stop="markAsRead" />-->

            <q-btn  v-if="tabStr!=='我的收藏'" flat round size="sm" color="primary" icon="more_vert" @click.stop>
              <q-menu>
                <q-list style="min-width: 100px">
                  <q-item clickable v-close-popup @click="downloadResume">
                    <q-item-section>分享简历</q-item-section>
                  </q-item>
                  <q-item clickable v-close-popup @click="contactCandidate">
                    <q-item-section>联系候选人</q-item-section>
                  </q-item>
                  <q-item clickable v-close-popup @click="addToBlacklist">
                    <q-item-section>加入黑名单</q-item-section>
                  </q-item>
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
            <q-icon name="work" color="primary" size="sm" class="q-mr-sm" />
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
            <q-icon name="school" color="primary" size="sm" class="q-mr-sm" />
            <span class="text-subtitle2">教育经历</span>
          </div>
          <div class="q-ml-lg q-mt-xs">
            <div v-if="resume.eduExp">
              <span class="text-weight-medium">{{ resume.eduExp.schoolName }}</span>
              <span class="q-mx-xs">•</span>
              <span>{{ resume.eduExp.major }}</span>
              <span class="q-mx-xs">•</span>
              <span>{{ resume.eduExp.degree }}</span>
            </div>
            <div v-else class="text-grey-7">暂无教育经历</div>
          </div>
        </div>

        <div class="col-4 flex justify-end items-end column">
          <div class="flex wrap justify-end">
            <template v-if="isIhrPage && Number.isFinite(resume.score) && resume.score >= 0">
              <q-btn  flat class="q-ma-xs" size="sm" color="primary" @click.stop="assignJob">
                <q-icon class="q-mr-xs" name="work"></q-icon>
                <span class="">分配职位</span>
              </q-btn>
              <q-btn flat class="q-ma-xs" size="sm" color="primary" @click.stop="addToTalentPool">
                <q-icon class="q-mr-xs" name="group_add"></q-icon>
                <span class="">加入人才库</span>
              </q-btn>
            </template>
          </div>
          <div class="flex wrap justify-end">
            <q-btn flat class="q-ma-xs" size="sm" color="primary" @click.stop="searchSimilarResumes">
              <q-icon class="q-mr-xs" name="search"></q-icon>
              <span class="">相似简历</span>
            </q-btn>
<!--            <q-btn flat color="primary" label="详情" size="sm" @click.stop="viewDetail" />-->
            <q-btn flat v-if="resume.channel&&resume.channel==='boss直聘'" class="q-ma-xs" color="primary" size="sm" @click.stop="scheduleInterview">
              <q-icon class="q-mr-xs" name="chat"></q-icon>
              <span class="">立即沟通</span>
            </q-btn>
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
  <AIResumeEvaluation
    v-model:visible="showAIEvaluation"
    :resume-data="resume"
    :search-condition-id="searchConditionId"
    @view-detail="viewDetail"
  />
</template>

<script setup>
import {defineProps, defineEmits, computed, ref, defineAsyncComponent, onMounted} from 'vue';
import {bossFindJobDetail, findJobDetail, runCollect} from "src/pluginSrc/channels/BossJobInfoManager";
import notify from "src/util/notify";
import {pluginAllUrls} from "src/pluginSrc/config/PluginRequestManager";
import qs from "qs";
// 使用Quasar的Dialog显示内容
import { useQuasar } from 'quasar';
import {compareResumeSimilarity, generateSearchCondition} from "src/api/research/ResearchApi";
import {useStore} from "vuex";
import {saveCondition} from "src/api/search/SearchApi";
import SimilarResumesDialog from 'src/components/resume/SimilarResumesDialog.vue';
import {getSearchConditionRequest, getSearchStateValues} from "src/pluginSrc/util/SearchParamUtils";
import AIResumeEvaluation from 'src/components/resume/AIResumeEvaluation.vue';
import {getResumeBlindList, markResumeBlindReadStatus, userCollectResume} from "src/api/jobList/JobListApi";
import channelConfig from "src/store/modules/ChannelConfig";
import {getChannelUrl, bossUrl, zhilianUrl, liepinUrl, job51Url} from "src/pluginSrc/util/ChannelUrlUtil";
import { useSendResume } from 'src/hooks/useSendResume';

const store = useStore();
const $q = useQuasar();

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
});

const emit = defineEmits([
  'collect',
  'read',
  'download',
  'contact',
  'blacklist',
  'detail',
  'interview'
]);
// 渠道名称
const tabStr = computed(() => props.tabStr);
// 搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//aiSearchRef
const aiSearchRef = computed(() => store.getters.getAiSearchRefValue);
// 所有渠道状态
const allChannelStatus = computed(() => store.getters.getChannelConf);

// 用户信息
const userInfo = computed(() => store.getters.getUserInfo);
//当前chat id
const chatId = computed(() => store.getters.getLatestChatId);

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

// 判断ihr招聘特殊标识
const isIhrPage = computed(() => {
  const userInfo = store.getters.getUserInfo?.extendData ?? {};
  return userInfo?.hasOwnProperty('ihrRecruitAssistant') && userInfo.ihrRecruitAssistant === true;
});

// 初始化发送简历hook 
const { sendResume } = useSendResume('resumeList');

// 在新窗口中打开详情页面
const openDetailInNewWindow = (url) => {
  // 设置窗口参数
  const name = '_blank';
  const iWidth = window.screen.availWidth * 0.8;
  const iHeight = window.screen.availHeight * 0.8;
  const iTop = (window.screen.availHeight + 30 - iHeight) / 2;
  const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;

  // 打开新窗口
  window.open(
    url,
    name,
    `height=${iHeight},innerHeight=${iHeight},width=${iWidth},innerWidth=${iWidth},top=${iTop},left=${iLeft},status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no`
  );
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

//boss聊天
const bossScheduleInterview = async (resume) => {
  let boosJobInfo = await bossFindJobDetail(resume);
  if(boosJobInfo){
    let bossCollect = await runCollect(boosJobInfo);
    if(bossCollect){
      const url = pluginAllUrls.BOSS.baseUrl + pluginAllUrls.BOSS.interactionUrl;
      openDetailInNewWindow(url);
    }else{
      notify.warning(resume.channel+"联系人才失败");
    }
  }else{
    notify.warning(resume.channel+"联系人才异常，请联系管理员");
  }
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
  handleViewDetail(props.resume);
  //设置已读
  handleIsReadData(props.resume)
  emit('detail', props.resume);
};

//查找相似的简历
const searchSimilarResumes = () => {
  searchALlResumes(props.resume);
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
          resumeBlindId: resume.id
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
        const maxIterations =channelItem.key==='BOSS'?2:1;
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

// 约面试
const scheduleInterview = () => {
  //立即沟通
  bossScheduleInterview(props.resume);
  emit('interview', props.resume);
};

//处理已读
const handleIsReadData = async (resume) => {
  try {
    let {data} = await markResumeBlindReadStatus([resume.id], true);
  } catch (error) {
    console.error('标记简历已读状态失败:', error);
    return false;
  }

  // 更新渠道聚合中的对应数据
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
    notify.warning(resume.channel+"查询详情异常，请联系管理员");
  }
};  

// 分配职位
const assignJob = async () => {
  const result = await sendResume([props.resume.id], { action: 'assign-position' })
  console.log('分配职位结果', result)
};

// 加入人才库
const addToTalentPool = async () => {
  const result = await sendResume([props.resume.id], { action: 'talent-pool' })
  console.log('加入人才库结果', result)
};

// 在 script setup 中添加以下内容
const showAIEvaluation = ref(false);

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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-3px);
}

.score-badge {
  display: flex;
  align-items: center;
  justify-content: flex-end;
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
