<template>
  <div class="boss-detail-container">
    <el-dialog
        class="bigGeekInfo"
        v-model="detailDialogVisible"
        width="600"
        align-center
        :show-close="true"
        :close-on-click-modal="false"
        :before-close="beforeClose"
    >

      <el-button @click="open2">联系我</el-button>
      <template #footer>
          <div class="dialog-footer">
            <el-button type="primary" @click="openWebsite">联系他</el-button>
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
import {onMounted,computed,ref,watch} from "vue";
import { ElMessage } from 'element-plus'
import PluginMessenger from "@/api/PluginSendMsg";
const props = defineProps({
  resumeId: String,
  dialogFlag: {
    type: Boolean,
    default:false
  },
  changeCloseStatus: Function,
  geekCardDetail:Object
});
//详细数据
const geekDetailINfo = ref({});
//显示开关
const detailDialogVisible = computed(()=>props.dialogFlag);
//resumeId
const geekResumeId = computed(()=>props.resumeId);
//列表信息
const geekListInfo = computed(()=>props.geekCardDetail);

onMounted(()=>{
  console.log("geekResumeId.value",geekResumeId.value)
});
const beforeClose = () => {
  if(props.changeCloseStatus){
    props.changeCloseStatus();
  }
  geekResumeId.value =null;
}

const open2 = async ()=>{
  const url=`https://m.zhipin.com/web/frame/recommend/resume?expectId=${geekDetailINfo.value.expectId}&isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${geekDetailINfo.value.securityId}`;
  console.log("新url:",url)
  // const url = 'https://www.zhipin.com/web/chat/interaction'; // 目标网址
  const windowFeatures = 'width=1000,height=800,resizable=yes,scrollbars=yes'; // 设置窗口的大小和其他属性
  window.open(url, '_blank', windowFeatures);
}

const i360Request= async (action,emptyRequestTemplate, timeout = 3000) => {
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    return response;
  } catch (error) {
    console.error('Error:', error.message);
  }
}




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


.bigGeekInfo{

  .geekInfoCad .el-text{
    margin: 0px 4px;
  }
}

</style>