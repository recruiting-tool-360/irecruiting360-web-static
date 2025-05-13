<template>
  <q-item class="resume-item q-mb-md rounded-borders" style="border-left: 4px solid var(--q-primary-70)" v-ripple clickable @click="viewDetail">
    <!-- 头部：基本信息 -->
    <q-item-section>
      <div class="row justify-between items-center q-pb-sm">
        <!-- 左侧：姓名、性别、年龄、工作经验 -->
        <div class="col-8">
          <div class="row items-center">
            <q-avatar class="q-mr-sm" size="40px">
              <img :src="`${resume.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg'}`" />
            </q-avatar>
            <span class="text-h6 text-grey-8 q-mr-sm">{{ resume.name }}</span>
            <q-badge v-if="resume.gender === 1" color="blue-5" class="q-mr-sm">男</q-badge>
            <q-badge v-else-if="resume.gender === 0" color="pink-5" class="q-mr-sm">女</q-badge>
            <span class="text-grey-8">{{ resume.ageDesc }}</span>
            <q-badge outline v-if="resume.experienceYear" rounded color="primary" class="q-ml-md q-px-sm">{{ resume.experienceYear === -1 ? '应届生' : `${resume.experienceYear}年经验` }}</q-badge>
            <q-badge  outline rounded color="teal" class="q-ml-sm q-px-sm">{{ resume.degree }}</q-badge>
            <q-badge outline rounded color="warning" class="q-ml-sm q-px-sm">{{ resume.status }}</q-badge>
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

        <!-- 右侧：相似度部分 -->
        <div class="col-4 text-right">
          <div class="score-badge q-mb-sm">
            <q-badge
              :color="resume.matchType === 1 ? 'negative' : 'positive'"
              class="match-type-badge q-pa-sm q-mr-sm"
              outline
            >
              {{ resume.matchType === 1 ? '疑似相同候选人' : '合适备选候选人' }}
            </q-badge>
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
      </div>

      <!-- 底部标签和操作按钮 -->
      <div class="row justify-end items-center">
      </div>
    </q-item-section>
  </q-item>
</template>

<script setup>
import {defineProps, defineEmits, computed, ref} from 'vue';
import {bossFindJobDetail, findJobDetail, runCollect} from "src/pluginSrc/channels/BossJobInfoManager";
import notify from "src/util/notify";
import {pluginAllUrls} from "src/pluginSrc/config/PluginRequestManager";
import qs from "qs";
// 使用Quasar的Dialog显示内容
import { useQuasar } from 'quasar';
const $q = useQuasar();

const props = defineProps({
  resume: {
    type: Object,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  }
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
  let boosJobInfo = await bossFindJobDetail(resume);
  if(boosJobInfo){
    console.log(boosJobInfo)
    // 构造URL
    const url = pluginAllUrls.BOSS.geekDetailUrl+`?expectId=${boosJobInfo.expectId}&isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${boosJobInfo.securityId}`;
    openDetailInNewWindow(url);
  }else{
    notify.warning(resume.channel+"查询详情异常，请联系管理员");
  }
}

//zhilian 查看详情
const zhilianHandleViewDetail = async (resume) => {
  console.log('zhilian详情信息', resume)
  const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  const requestData ={
    "t": requestParams.request.t,
    "resumeNumber": requestParams.request.resumeNumber,
    "k": requestParams.request.k
  }
  const url=pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.geekDetailUrl+`?`+qs.stringify(requestData);
  openDetailInNewWindow(url);
}

//liepin 查看详情
const liepinHandleViewDetail = async (resume) => {

}

const job51HandleViewDetail = async (resume) => {

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

// 收藏操作
const toggleCollect = () => {
  emit('collect', props.resume);
};

// 标记为已读
const markAsRead = () => {
  emit('read', props.resume);
};

// 下载简历
const downloadResume = () => {
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
  emit('detail', props.resume);
};

//查找相似的简历
const searchSimilarResumes = () => {
  searchALlResumes(props.resume);
}

// 约面试
const scheduleInterview = () => {
  //立即沟通
  bossScheduleInterview(props.resume);
  emit('interview', props.resume);
};

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

.match-type-badge {
  font-weight: bold;
  border-radius: 4px;
}

.description-text {
  max-height: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
</style>
