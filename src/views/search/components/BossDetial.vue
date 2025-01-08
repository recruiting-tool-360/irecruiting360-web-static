<template>
  <div class="boss-detail-container">
    <el-dialog
        class="bigGeekInfo"
        v-model="detailDialogVisible"
        width="600"
        title="求职者信息"
        align-center
        :show-close="true"
        :close-on-click-modal="false"
        :before-close="beforeClose"
    >
<!--      <el-row class="detailMsg" style="justify-content: center;margin-top: 16px;">-->
<!--        <el-text>基本信息</el-text>-->
<!--      </el-row>-->
      <el-row v-loading="loadingUserInfoSwitch">
        <el-descriptions :column="2" v-if="geekDetailINfo&&Object.keys(geekDetailINfo).length > 0">
          <el-descriptions-item  class="geekImage" width="100" class-name="geekImage">
            <el-avatar :src="geekDetailINfo.geekDetail.geekBaseInfo.large" style="width: 100%;height: 100%"></el-avatar>
          </el-descriptions-item>
          <el-descriptions-item  class="geekInfoCad" class-name="geekInfoCad" style="width: 100%" :span="7" :rowspan="2">
            <div>
              <el-button type="info" link>
                <el-icon class="infoIconStyle"><User /></el-icon>
                {{geekDetailINfo.geekDetail.geekBaseInfo.name}}</el-button>
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.name}}</el-text>-->
              <el-button type="info" link>
                <el-icon v-if="geekDetailINfo.geekDetail.geekBaseInfo.gender===1" class="infoIconStyle" style="color:#80b6ff;"><Male /></el-icon>
                <el-icon v-else class="infoIconStyle" style="color:#e529f1;"><Female /></el-icon>
                {{geekDetailINfo.geekDetail.geekBaseInfo.gender===1?'男':'女'}}</el-button>
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.gender===1?'男':'女'}}</el-text>-->


              <el-button type="info" link>
                <el-icon class="infoIconStyle"><Calendar /></el-icon>
                {{geekDetailINfo.geekDetail.geekBaseInfo.ageDesc}}
              </el-button>
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.ageDesc}}</el-text>-->
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.workYearDesc}}</el-text>-->

              <el-button type="info" link>
                <el-icon class="infoIconStyle"><Suitcase /></el-icon>
                {{geekDetailINfo.geekDetail.geekBaseInfo.workYearDesc}}
              </el-button>
              <el-button type="info" link>
                <el-icon class="infoIconStyle"><School /></el-icon>
                {{geekDetailINfo.geekDetail.geekBaseInfo.degreeCategory}}
              </el-button>
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.degreeCategory}}</el-text>-->
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.applyStatusContent}}</el-text>-->
<!--              <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.activeTimeDesc}}</el-text>-->
            </div>
            <div style="margin: 8px 0;">
              <el-text style="color: #848691">{{geekDetailINfo.geekDetail.geekBaseInfo.applyStatusContent}}</el-text>
              <el-text style="color: #848691">{{geekDetailINfo.geekDetail.geekBaseInfo.activeTimeDesc}}</el-text>
            </div>
            <div>
              <el-text style="white-space: pre-line;color: #848691">{{geekDetailINfo.geekDetail.geekBaseInfo.userDescription}}</el-text>
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </el-row>
      <el-row class="detailMsg" style="justify-content: center;margin-top: 16px;">
        <el-button :icon="Pointer"
                   :class="['animated-button']"
                   color="#409eff"
                   :style="`--el-button-hover-text-color:white`"
                   @click="openDetail"
                   :disabled="!(geekDetailINfo&&Object.keys(geekDetailINfo).length > 0)"
        >了解更多信息</el-button>
      </el-row>

      <template #footer>
          <div class="dialog-footer">
            <el-button type="primary"
                       :disabled="!(geekDetailINfo&&Object.keys(geekDetailINfo).length > 0)"
                       @click="openInteraction"
            >联系他</el-button>
          </div>
        </template>
<!--      <iframe-->
<!--          v-if="iframeVisible"-->
<!--          :src="'https://www.zhipin.com/'"-->
<!--          style="width: 100%; height: 500px; border: none; margin-top: 20px;"-->
<!--          sandbox="allow-same-origin allow-scripts allow-forms">-->
<!--      </iframe>-->

    </el-dialog>
  </div>

</template>

<script setup>
import {onMounted,computed,ref,watch,defineExpose} from "vue";
import { User,Male,Female,Calendar,Suitcase,School,Pointer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PluginMessenger from "@/api/PluginSendMsg";
import {findJobDetail, getBoosHeader} from "@/components/QueueManager/BoosJobInfoManager";
import {pluginBossResultProcessor} from "@/components/verifyes/PluginProcessor";
import {saveResumeDetail} from "@/api/jobList/JobListApi";
import {getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls} from "@/components/PluginRequestManager";
import qs from "qs";
const props = defineProps({
  resumeId: String,
  dialogFlag: {
    type: Boolean,
    default:false
  },
  changeCloseStatus: Function
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

onMounted(()=>{
  console.log("geekResumeId.value",geekResumeId.value)
});
const beforeClose = () => {
  if(props.changeCloseStatus){
    props.changeCloseStatus();
  }
  geekResumeId.value =null;
  // geekDetailINfo.value ={};
  // geekListInfo.value ={};
}

const openDetail = async ()=>{
    const url=`https://m.zhipin.com/web/frame/recommend/resume?expectId=${geekDetailINfo.value.expectId}&isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${geekDetailINfo.value.securityId}`;
    const name='_blank';                            //网页名称，可为空;
    const iWidth=window.screen.availWidth *0.7;                          //弹出窗口的宽度;
    const iHeight=window.screen.availHeight * 0.7;                         //弹出窗口的高度;
    //获得窗口的垂直位置
    const iTop = (window.screen.availHeight +30 - iHeight) / 2;
    //获得窗口的水平位置
    const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
    window.open(url, name, 'height=' + iHeight + ',,innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');
}

const openInteraction = async ()=>{
  // let newVar2 = await runCollect2();
  // console.log(newVar2)
  let newVar = await runCollect();
  // let newVar2 = await runCollect2();
  // let newVar3 = await runCollect3();

  // console.log(newVar)
  // console.log(newVar2)
  // console.log(newVar3)
  const url=`https://www.zhipin.com/web/chat/interaction`;
  const name='_blank';                            //网页名称，可为空;
  const iWidth=window.screen.availWidth *0.9;                          //弹出窗口的宽度;
  const iHeight=window.screen.availHeight * 0.9;                         //弹出窗口的高度;
  //获得窗口的垂直位置
  const iTop = (window.screen.availHeight +30 - iHeight) / 2;
  //获得窗口的水平位置
  const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
  window.open(url, name, 'height=' + iHeight + ',,innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');

}

const runCollect = async () => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    return;
  }
  const requestData ={
    markType:6,
    encryptMarkId:geekDetailINfo.value.encryptGeekId,
    securityId:geekDetailINfo.value.securityId
  };
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl+pluginAllUrls.BOSS.addCollect+"?"+qs.stringify(requestData);
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}
const runCollect3 = async () => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    return;
  }
  const request = {
    ba: `{"action":"star-interest-click","p":2,"p2":"${geekDetailINfo.value.encryptGeekId}","p3":1,"p5":"${geekDetailINfo.value.newLid}"}`
  };

// 使用 URLSearchParams 转换
//   const params = new URLSearchParams(ba);
  console.log(qs.stringify(request))
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = 'https://www.zhipin.com/wapi/zpCommon/actionLog/common.json'+"?ba="+qs.stringify(request);
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}
const runCollect2 = async () => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    return;
  }
  const request = {
    ba: '{"action":"geeklike-guide-expo","p":1}'
  };

// 使用 URLSearchParams 转换
//   const params = new URLSearchParams(ba);
  console.log(qs.stringify(request))
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = 'https://www.zhipin.com/wapi/zpCommon/actionLog/common.json'+"?ba="+qs.stringify(request);
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

const i360Request= async (action,emptyRequestTemplate, timeout = 3000) => {
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
    //解析参数
    const urlParams = new URLSearchParams(cardInfo.originalResumeUrlInfo);
    // 获取每个参数的值
    const rowId = urlParams.get('rowId');
    const expectId = urlParams.get('expectId');
    const lid = urlParams.get('lid');
    const lidTag = urlParams.get('lidTag');
    const jobId = urlParams.get('jobId');
    const securityId = urlParams.get('securityId');
    //构造参数
    const queryString = `securityId=${securityId}&segs=${lidTag}&lid=${lid}`;
    let boosJobInfo =null;
    loadingUserInfoSwitch.value = true;
    try {
      boosJobInfo = await findJobDetail({queryString});
      if(pluginBossResultProcessor(boosJobInfo)){
        geekDetailINfo.value = boosJobInfo.responseData.data.zpData;
        geekDetailINfo.value.newLid = lid;
        loadingUserInfoSwitch.value = false;
        //数据发给后端
        const outId = geekListInfo.value.outId;
        const resumeBlindId = geekListInfo.value.id;
        const type ="1";
        const content = geekDetailINfo.value;
        const detailRequest = {content,outId,resumeBlindId,type};
        try {
          await saveResumeDetail(detailRequest);
        }catch (e){
          ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
        }
      }
    }catch (e){
      ElMessage.error('服务异常，请联系管理员！');
      loadingUserInfoSwitch.value = false;
    }

  }
}



// 使用 defineExpose 将方法暴露给父组件
defineExpose({
  childGeekInfoMethod
});

// 如果 props 的值可能会变化，使用 resumeId 更新数据
watch(() => props.resumeId, async (newValue) => {
  if(newValue){
    // try {
    //   let {data} = await getGeekDetail(newValue);
    //   console.log("zhi::::::",data)
    //   geekDetailINfo.value = data
    // } catch (e) {
    //   console.log(e)
    //   geekDetailINfo.value = {};
    //   ElMessage.error('查询简历失败！请联系管理员');
    // }
  }

});

</script>

<style scoped lang="scss">

/* 修改标题居中 */
::v-deep(.bigGeekInfo .el-dialog__header) {
  padding-left: 45px;
  text-align: center;  /* 居中 */
}

/* 修改标题颜色 */
::v-deep(.bigGeekInfo .el-dialog__title) {
  color: #3f9eff;
  font-weight: 500;
}

.bigGeekInfo{

  .geekInfoCad .el-text{
    margin: 0px 4px;
  }

  .infoIconStyle{
    color: #51ba9b;
    font-size: 15px;
    margin-right: 6px;
  }
}


.animated-button {
  //background-color: #39b391e6;  /* 改变按钮颜色 */
  color: white;  /* 改变文字颜色 */
  animation: scaleAnimation 2s infinite ease-in-out;
  transition: background-color 0.3s ease;
}

/* 定义动画 */
@keyframes scaleAnimation {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

</style>