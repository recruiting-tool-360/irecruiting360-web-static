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

        <el-row >
          <el-descriptions :column="2" v-if="geekDetailINfo&&Object.keys(geekDetailINfo).length > 0">
            <el-descriptions-item  class="geekImage" width="80" class-name="geekImage">
              <el-avatar :src="geekDetailINfo.geekDetail.geekBaseInfo.large" style="width: 100%;height: 100%"></el-avatar>
            </el-descriptions-item>
            <el-descriptions-item  class="geekInfoCad" class-name="geekInfoCad" style="width: 100%" :span="7" :rowspan="2">
              <div style="border-bottom: 1px solid;">
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.name}}</el-text>
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.gender===1?'男':'女'}}</el-text>
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.activeTimeDesc}}</el-text>
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.ageDesc}}</el-text>
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.degreeCategory}}</el-text>
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.workYearDesc}}</el-text>
                <el-text>{{geekDetailINfo.geekDetail.geekBaseInfo.applyStatusContent}}</el-text>
              </div>
              <div>
                <el-text style="white-space: pre-line">{{geekDetailINfo.geekDetail.geekBaseInfo.userDescription}}</el-text>
              </div>
            </el-descriptions-item>
          </el-descriptions>
        </el-row>
        <el-row >
          <el-descriptions :column="2" v-if="geekDetailINfo&&Object.keys(geekDetailINfo).length > 0">
            <el-descriptions-item  class="geekImage" width="80" class-name="geekImage" label="期望职位"></el-descriptions-item>
            <el-descriptions-item  class="geekInfoCad" class-name="geekInfoCad" style="width: 100%" :rowspan="2">
              <div style="border-bottom: 1px solid;">
                <el-text>{{geekDetailINfo.showExpectPosition.locationName}}</el-text>
                <el-text>{{geekDetailINfo.showExpectPosition.positionName}}</el-text>
                <el-text>{{geekDetailINfo.showExpectPosition.industryDesc}}</el-text>
                <el-text>{{geekDetailINfo.showExpectPosition.salaryDesc}}</el-text>
              </div>
            </el-descriptions-item>
          </el-descriptions>
        </el-row>
        <el-row >
          <el-descriptions :column="2" v-if="geekDetailINfo&&Object.keys(geekDetailINfo).length > 0">
            <el-descriptions-item  class="geekImage" width="80" class-name="geekImage" label="岗位经验"></el-descriptions-item>
            <el-descriptions-item  class="geekInfoCad" class-name="geekInfoCad" style="width: 100%" :rowspan="2">
              <template v-for="(info,index) in geekDetailINfo.bossViewGeekWorkExp.geekWorkPositionExpDescList" :key="index">
                <div style="border-bottom: 1px solid;">
                  <el-text >{{info.company}}</el-text>
                  <el-text style="white-space: pre-line">{{info.positionName}}</el-text>
                  <el-text>{{info.startYearMonStr}}</el-text>
                  <el-text>{{info.endYearMonStr}}</el-text>
                </div>
                <div>
                  <el-text style="white-space: pre-line">{{info.responsibility}}</el-text>
                </div>
              </template>

            </el-descriptions-item>
          </el-descriptions>
        </el-row>
        <el-row >
          <el-descriptions :column="2" v-if="geekDetailINfo&&Object.keys(geekDetailINfo).length > 0">
            <el-descriptions-item  class="geekImage" width="80" class-name="geekImage" label="工作经历"></el-descriptions-item>
            <el-descriptions-item  class="geekInfoCad" class-name="geekInfoCad" style="width: 100%" :rowspan="2">
              <div style="border-bottom: 1px solid;">
                <el-text v-for="(info,index) in geekDetailINfo.geekDetail.geekWorkExpList" :key="index">{{info}}</el-text>

              </div>
            </el-descriptions-item>
          </el-descriptions>
        </el-row>
        <template #footer>
          <div class="dialog-footer">
            <el-button type="primary" @click="openWebsite">联系他</el-button>
          </div>
        </template>
<!--      <iframe-->
<!--          v-if="iframeVisible"-->
<!--          :src="iframeUrl"-->
<!--          style="width: 100%; height: 500px; border: none; margin-top: 20px;"-->
<!--          sandbox="allow-same-origin allow-scripts allow-forms">-->
<!--      </iframe>-->

    </el-dialog>
  </div>

</template>

<script setup>
import {onMounted,computed,ref,watch} from "vue";
import {getGeekDetail} from "@/api/search/SearchApi";
import { ElMessage } from 'element-plus'
const props = defineProps({
  resumeId: String,
  dialogFlag: {
    type: Boolean,
    default:false
  },
  changeCloseStatus: Function,
});
//详细数据
const geekDetailINfo = ref({});
//显示开关
const detailDialogVisible = computed(()=>props.dialogFlag);
//resumeId
const geekResumeId = computed(()=>props.resumeId);

const iframeVisible = ref(true);
const iframeUrl = ref("https://www.zhipin.com/web/chat/interaction");

onMounted(()=>{
  console.log("geekResumeId.value",geekResumeId.value)
});
const beforeClose = () => {
  if(props.changeCloseStatus){
    props.changeCloseStatus();
  }
  geekResumeId.value =null;
}

const openWebsite =()=> {
  // const url = 'https://example.com'; // 目标网址
  // const windowFeatures = 'width=1000,height=800,resizable=yes,scrollbars=yes'; // 设置窗口的大小和其他属性
  // window.open('https://www.zhipin.com/web/chat/interaction', '_blank');
  const url = 'https://www.zhipin.com/web/chat/interaction'; // 目标网址
  const windowFeatures = 'width=1000,height=800,resizable=yes,scrollbars=yes'; // 设置窗口的大小和其他属性
  window.open(url, '_blank', windowFeatures);
}

// 如果 props 的值可能会变化，使用 resumeId 更新数据
watch(() => props.resumeId, async (newValue) => {
  if(newValue){
    try {
      let {data} = await getGeekDetail(null);
      geekDetailINfo.value = data
    } catch (e) {
      console.log(e)
      geekDetailINfo.value = {};
      ElMessage.error('查询简历失败！请联系管理员');
    }
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