<template>
  <div class="boss-detail-container">
    <el-dialog
      class="talent-info-dialog"
      v-model="detailDialogVisible"
      width="800px"
      title="人才信息"
      :close-on-click-modal="false"
      :show-close="true"
      style="background-color:white"
      :before-close="beforeClose"
    >
      <div class="talent-info-container">
        <!-- 顶部个人信息 -->
        <div class="personal-info" v-if="geekDetailINfo && Object.keys(geekDetailINfo).length > 0" v-loading="loadingUserInfoSwitch">
          <div class="left-info">
            <el-avatar :size="60" :src="`${geekDetailINfo.geekDetail.geekBaseInfo.gender === 1?'/index/header/icons/geekMan.svg':'/index/header/icons/geekWoman.svg'}`" />
            <div class="info-text">
              <div class="name-row">
                <span class="name">{{ geekDetailINfo.geekDetail.geekBaseInfo.name }}</span>
                <el-tag size="small" :type="geekDetailINfo.geekDetail.geekBaseInfo.gender === 1 ? 'info' : 'danger'">
                  {{ geekDetailINfo.geekDetail.geekBaseInfo.gender === 1 ? '男' : '女' }}
                </el-tag>
                <span class="age">{{ geekDetailINfo.geekDetail.geekBaseInfo.ageDesc }}</span>
              </div>
              <div class="contact-row">
                <el-tag class="tag" type="info" effect="plain">{{ geekDetailINfo.geekDetail.geekBaseInfo.degreeCategory }}</el-tag>
                <el-tag class="tag" type="success" effect="plain">{{ geekDetailINfo.geekDetail.geekBaseInfo.workYearDesc }}</el-tag>
              </div>
              
              <!-- 添加性格优点到个人信息部分 -->
              <div class="personality-row">
                <el-tag
                  v-for="(point, index) in ['进取务实', '做人真诚', '热爱学习']"
                  :key="index"
                  class="personality-tag"
                  effect="plain"
                  type="warning"
                  size="small"
                >
                  {{ point }}
                </el-tag>
              </div>
            </div>
          </div>
          <div class="right-status">
            <div class="status-text">
              <el-text type="info">{{ geekDetailINfo.geekDetail.geekBaseInfo.applyStatusContent }}</el-text>
              <el-text type="info">{{ geekDetailINfo.geekDetail.geekBaseInfo.activeTimeDesc }}</el-text>
            </div>
          </div>
        </div>

        <!-- 具备工作能力 - 修改为只显示部分内容并添加渐变效果 -->
        <div class="section-container" v-if="geekDetailINfo && Object.keys(geekDetailINfo).length > 0">
          <div class="section-title">
            <div class="title-icon"><el-icon><Suitcase /></el-icon></div>
            <span>具备工作能力</span>
          </div>
          <div class="section-content description-container">
            <div class="description-text truncated">{{ geekDetailINfo.geekDetail.geekBaseInfo.userDescription }}</div>
          </div>
        </div>

        <!-- 掌握技能 -->
        <div class="section-container">
          <div class="section-title">
            <div class="title-icon"><el-icon><Connection /></el-icon></div>
            <span>掌握技能</span>
          </div>
          <div class="section-content skills-content">
<!--            <el-tag-->
<!--              v-for="(skill, index) in geekDetailINfo?.geekDetail?.professionalSkill || []"-->
<!--              :key="index"-->
<!--              class="skill-tag"-->
<!--              effect="plain"-->
<!--              type="success"-->
<!--            >-->
<!--              {{ skill }}-->
<!--            </el-tag>-->
            <div v-if="!geekDetailINfo?.geekDetail?.professionalSkill || geekDetailINfo?.geekDetail?.professionalSkill.length === 0" class="no-data">
              暂无技能信息
            </div>
            <div class="yes-data" v-else>
              {{ geekDetailINfo?.geekDetail?.professionalSkill }}
            </div>
          </div>
        </div>

        <!-- 性格优点 -->
<!--        <div class="section-container">-->
<!--          <div class="section-title">-->
<!--            <div class="title-icon"><el-icon><Star /></el-icon></div>-->
<!--            <span>性格优点</span>-->
<!--          </div>-->
<!--          <div class="section-content">-->
<!--            <div class="personality-points">-->
<!--              <el-tag-->
<!--                v-for="(point, index) in ['进取务实', '做人真诚', '热爱学习']"-->
<!--                :key="index"-->
<!--                class="personality-tag"-->
<!--                effect="plain"-->
<!--                type="warning"-->
<!--              >-->
<!--                {{ index + 1 }}. {{ point }}-->
<!--              </el-tag>-->
<!--            </div>-->
<!--          </div>-->
<!--        </div>-->

        <!-- 底部按钮 -->
        <div class="action-buttons">
          <el-button
              color="rgba(31, 124, 255, 1)"
              class="learn-more-button bounce-animation"
              @click="openDetail"
          >
            了解更多信息
            <el-icon class="arrow-down-icon"><ArrowDown /></el-icon>
          </el-button>
          <el-button
            color="rgba(31, 124, 255, 1)"
            class="action-button"
            :disabled="!(geekDetailINfo && Object.keys(geekDetailINfo).length > 0)"
            @click="openInteraction"
          >
            <el-icon><Message /></el-icon>
            立即沟通
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, defineExpose } from "vue";
import {useStore} from "vuex";
import { 
  Suitcase,
  Document,
  Message,
  Connection,
  Star,
  ArrowDown
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PluginMessenger from "@/api/PluginSendMsg";
import { findJobDetail, getBoosHeader } from "@/components/QueueManager/BoosJobInfoManager";
import { pluginBossResultProcessor } from "@/components/verifyes/PluginProcessor";
import { saveResumeDetail } from "@/api/jobList/JobListApi";
import { getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls } from "@/components/PluginRequestManager";
import qs from "qs";

//store
const store = useStore();

const props = defineProps({
  resumeId: String,
  dialogFlag: {
    type: Boolean,
    default: false
  },
  changeCloseStatus: Function,
  searchStateCriteria: {
    type: Object,
    default: () => ({})
  }
});

//详细数据
const geekDetailINfo = ref({});
//显示开关
const detailDialogVisible = computed(()=>props.dialogFlag);
//resumeId
const geekResumeId = computed(()=>props.resumeId);
//列表信息
const geekListInfo = ref({});
//查看更多信息部分按钮动画控制开关
const loadingUserInfoSwitch = ref(false);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//ai推荐
const searchStateAIParam = computed(()=>props.searchStateCriteria);

const beforeClose = () => {
  if(props.changeCloseStatus){
    props.changeCloseStatus();
  }
  geekResumeId.value = null;
}

const openDetail = async () => {
  const url = pluginAllUrls.BOSS.geekDetailUrl+`?expectId=${geekDetailINfo.value.expectId}&isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${geekDetailINfo.value.securityId}`;
  const name = '_blank';
  const iWidth = window.screen.availWidth * 0.8;
  const iHeight = window.screen.availHeight * 0.8;
  const iTop = (window.screen.availHeight + 30 - iHeight) / 2;
  const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
  window.open(url, name, 'height=' + iHeight + ',,innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');
}

const openInteraction = async () => {
  let collectResult = await runCollect();
  if(!pluginBossResultProcessor(collectResult)){
    ElMessage.error('系统异常，请联系管理员！');
    return null;
  }
  const url = pluginAllUrls.BOSS.baseUrl + pluginAllUrls.BOSS.interactionUrl;
  const name = '_blank';
  const iWidth = window.screen.availWidth * 0.9;
  const iHeight = window.screen.availHeight * 0.9;
  const iTop = (window.screen.availHeight + 30 - iHeight) / 2;
  const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
  window.open(url, name, 'height=' + iHeight + ',,innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');
}

const runCollect = async () => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    return;
  }
  const requestData = {
    markType: 6,
    encryptMarkId: geekDetailINfo.value.encryptGeekId,
    securityId: geekDetailINfo.value.securityId
  };
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  //取消收藏先关闭
  // pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl + pluginAllUrls.BOSS.delCollect + "?" + qs.stringify(requestData);
  // let deleteCollect = await i360Request(pluginEmptyRequestTemplate.action, pluginEmptyRequestTemplate);
  // if(!pluginBossResultProcessor(deleteCollect)){
  //   ElMessage.error('系统异常，请联系管理员！');
  //   return null;
  // }
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl + pluginAllUrls.BOSS.addCollect + "?" + qs.stringify(requestData);
  return await i360Request(pluginEmptyRequestTemplate.action, pluginEmptyRequestTemplate);
}

const i360Request = async (action, emptyRequestTemplate, timeout = 3000) => {
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    return response;
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// 定义子组件的方法
const childGeekInfoMethod = async (cardInfo) => {
  if (cardInfo) {
    geekListInfo.value = cardInfo;

    if(!cardInfo.originalResumeUrlInfo){
      console.log("cardInfo.originalResumeUrlInfo is null")
      ElMessage.error('服务异常，请联系管理员！');
    }

    const requestParams = JSON.parse(cardInfo.originalResumeUrlInfo);

    //构造参数
    const queryString = `securityId=${requestParams.request.securityId}&segs=${requestParams.request.lidTag}&lid=${requestParams.request.lid}`;
    let boosJobInfo = null;
    loadingUserInfoSwitch.value = true;
    try {
      boosJobInfo = await findJobDetail({queryString});
      if(pluginBossResultProcessor(boosJobInfo)){
        geekDetailINfo.value = boosJobInfo.responseData.data.zpData;
        geekDetailINfo.value.newLid = requestParams.request.lid;
        loadingUserInfoSwitch.value = false;
        //数据发给后端
        const outId = geekListInfo.value.outId;
        const resumeBlindId = geekListInfo.value.id;
        const channel = "boss直聘";
        const type = (searchStateAIParam.value && Object.keys(searchStateAIParam.value).length > 0) ? "JDMATCH" : "SCORE";
        const content = geekDetailINfo.value;
        const searchId = searchConditionId.value;
        const detailRequest = {content, outId, resumeBlindId, type, channel,searchId};
        console.log("参数是：", detailRequest)
        try {
          await saveResumeDetail(detailRequest);
        } catch (e) {
          ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
        }
      }
    } catch (e) {
      ElMessage.error('服务异常，请联系管理员！');
      loadingUserInfoSwitch.value = false;
    }
  }
}

// 使用 defineExpose 将方法暴露给父组件
defineExpose({
  childGeekInfoMethod
});
</script>

<style scoped lang="scss">
.talent-info-dialog {
  .el-dialog__header {
    margin-right: 0;
    padding: 20px;
    text-align: center;
    background: transparent;

    .el-dialog__title {
      color: #1296DB;
      font-weight: 500;
      font-size: 18px;
    }
  }

  .el-dialog__body {
    padding: 0;
  }
}

.talent-info-container {
  padding: 0 20px 20px;

  .personal-info {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    //margin-bottom: 20px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 8px;

    .left-info {
      display: flex;
      gap: 16px;
      align-items: center;

      .info-text {
        .name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;

          .name {
            font-size: 18px;
            font-weight: 500;
            color: #333;
          }

          .age {
            color: #666;
            font-size: 14px;
          }
        }

        .contact-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;

          .tag {
            font-size: 12px;
          }
        }
        
        // 添加性格优点行样式
        .personality-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          
          .personality-tag {
            font-size: 12px;
          }
        }
      }
    }

    .right-status {
      .status-text {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        color: #666;
        font-size: 14px;
      }
    }
  }

  .section-container {
    background: white;
    border-radius: 8px;
    padding: 16px 16px 0;

    //margin-bottom: 16px;

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      color: #333;
      font-weight: 500;

      .title-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: #f0f7ff;
        border-radius: 6px;
        color: #1296DB;
      }
    }

    .section-content {
      color: #666;
      line-height: 1.6;
      
      // 修改工作能力描述部分样式
      &.description-container {
        position: relative;
        max-height: 200px;
        overflow: hidden;
        
        .description-text {
          white-space: pre-wrap;
          
          &.truncated {
            max-height: 160px;
            overflow: hidden;
          }
        }
        
        .description-gradient {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 100%;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgb(255 255 255 / 39%) 15%, rgb(255, 255, 255)) 100%;
          pointer-events: none;
        }
        
        .learn-more-button-container {
          position: absolute;
          bottom: 0px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          
          .learn-more-button {
            border-radius: 20px;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 5px;
            background-color: transparent;
            color: rgba(31, 124, 255, 1);
            border: none;
            box-shadow: none;
            
            .arrow-down-icon {
              margin-left: 5px;
            }
          }
          
          .bounce-animation {
            animation: bounce 2s infinite;
          }
          
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
            40% {transform: translateY(-5px);}
            60% {transform: translateY(-3px);}
          }
        }
      }
    }
  }

  .action-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    margin-top: 40px; // 增加上边距，为了给"了解更多信息"按钮留出空间

    .action-button {
      min-width: 120px;

      .el-icon {
        margin-right: 4px;
      }
    }
  }
}
</style>