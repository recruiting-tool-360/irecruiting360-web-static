<template>
  <el-dialog :model-value="localVisible" @update:model-value="(val) => $emit('update:visible', val)"
             title="查找相似简历"
             top="6vh"
             style="max-width: 80%;min-height: 60%;padding: 30px">
<!--    <div v-if="loading" class="loading-container">-->
<!--      <el-text>Loading...</el-text>-->
<!--      <el-spinner />-->
<!--    </div>-->
    <div v-loading="loading" class="content-container" style="min-height: 500px">
      <el-card class="geek-card-list" v-for="geekList in jobALlData" :key="geekList.id" @click="handleListInfoClick(geekList)">
        <!--   已读   -->
        <div v-if="geekList.isRead" class="read-div">
          <el-image :src="'/index/header/searchPage/read.svg'" style="width: 100%;height: 100%"></el-image>
        </div>
        <!--  头像行    -->
        <el-row class="geek-img-el-row el-row-width-full" :gutter="10">
          <el-col class="geek-img-el-col el-col-display-Style" :span="14">
            <!--   头像     -->
            <el-avatar class="headerIcons" :size="40" :src="`${geekList.gender===1?'/index/header/icons/geekMan.svg':'/index/header/icons/geekWoman.svg'}`" />
            <el-text class="mx-1 el-button-margin-left" style="font-size: 1rem;font-weight: bold">{{geekList.name}}</el-text>
            <el-text class="mx-1 el-button-margin-left text-gray-color-130">{{geekList.genderStr}} · {{geekList.age}} </el-text>
            <el-button size="small" disabled round style="margin-left: 1rem;">求职意向:
              {{geekList.status?geekList.status:'未知'}}
              <el-tooltip
                  class="box-item"
                  :content="geekList.status?geekList.status:'未知'"
                  placement="bottom"
              >
                <!--              <el-text class="el-text-ellipsis" style="margin-left: 5px;color: rgb(96 98 102)">{{geekList.status?geekList.status:'未知'}}</el-text>-->
              </el-tooltip>
            </el-button>
          </el-col>
          <el-col class="geek-img-el-col el-col-display-Style" style="justify-content: end" :span="10">
            <el-button v-if="geekList.channel==='boss直聘'" text disabled size="small">
              <el-image :src="'/index/header/searchPage/boss.ico'"></el-image>
              &nbsp;&nbsp;BOSS直聘
            </el-button>
            <el-button v-else-if="geekList.channel==='智联招聘'" text disabled size="small">
              <el-image :src="'/index/header/searchPage/zhilian.svg'"></el-image>
              &nbsp;&nbsp;智联招聘
            </el-button>
            <el-button v-else-if="geekList.channel==='猎聘'" text disabled size="small">
              <el-image :src="'/index/header/searchPage/liepin.svg'"></el-image>
              &nbsp;&nbsp;猎聘
            </el-button>
            <el-button v-else-if="geekList.channel==='前程无忧'" text disabled size="small">
              <el-image :src="'/index/header/searchPage/job51.svg'"></el-image>
              &nbsp;&nbsp;前程无忧
            </el-button>
            <el-button v-else text disabled size="small">
              &nbsp;&nbsp;未知渠道
            </el-button>
            <el-text v-if="chatId" style="margin-right: 8px;color: #E0E0E0">|</el-text>

            <!-- 收藏按钮改为响应式设计 -->
<!--            <div v-if="chatId" class="collect-container" @click.stop="handleCollectClick(geekList)">-->
<!--              <el-image-->
<!--                  :src="geekList.inCollection ? '/index/header/searchPage/collectTrue.svg' : '/index/header/searchPage/collectFalse.svg'"-->
<!--                  class="collect-icon"-->
<!--              ></el-image>-->
<!--              <span class="collect-text">收藏</span>-->
<!--            </div>-->
          </el-col>
        </el-row>
        <!--  学历行    -->
        <el-row class="geek-highestDegree-el-row el-row-width-full el-row-margin-top-6px"  :gutter="0">
          <el-col class="geek-highestDegree-el-col el-col-display-Style" :span="15">
            <el-button style="background-color: #F0F6FF;color: #1F7CFF" class="highestDegreeBtm" color="#F0F6FF" size="small" round>{{geekList.degree?geekList.degree:"学历未知"}}</el-button>
            <el-button style="background-color: #E6FFFB;color: #13C2C2" color="#E6FFFB" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" round>{{geekList.experienceYear&&geekList.experienceYear>=0?geekList.experienceYear+"年":((geekList.experienceYear&&geekList.experienceYear===-1)?'应届生':'工作年龄未知')}}</el-button>
            <!--          <el-button style="background-color: #c0bdb6;color: #6c6e6e" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>-->
            <!--            {{geekList.gender===1?'男':'女'}}</el-button>-->
            <el-button :style="`${geekList.gender === 1?'background-color: #409EFF;color: white':'background-color: #F56C6C;color: white'}`" :color="geekList.gender === 1?'#409EFF':'#F56C6C'" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" round>
              {{ geekList.gender === 1 ? '男' : '女' }}
            </el-button>
            <el-button v-show="geekList.intention" style="background-color: #f0f6ff;color: #999" color="#f0f6ff" class="highestDegreeBtm" size="small" round>{{geekList.intention}}</el-button>

          </el-col>
<!--          <el-col v-if="props.channelConfig&&props.channelConfig.key!=='Collect'&&searchStateAiParamStatusFlag" class="geek-highestDegree-el-col el-col-display-Style" style="justify-content: end" :span="9">-->
<!--            &lt;!&ndash;          <div class="geekAIBtm">&ndash;&gt;-->
<!--            &lt;!&ndash;            <spa>AI评估</spa>&ndash;&gt;-->
<!--            &lt;!&ndash;          </div>&ndash;&gt;-->
<!--            <div class="geekAIBtm" @click.stop="showAIEvaluation(geekList)">-->
<!--              <spa>AI评估</spa>-->
<!--            </div>-->
<!--            <div class="geekAINumBtm" @click.stop="showAIEvaluation(geekList)">-->
<!--              <el-text v-if="geekList.score!==undefined&&geekList.score!==null&&geekList.score>=sortComparisonValue" style="font-size: 20px;display: flex;align-items: center">-->
<!--                <span :style="`color: ${parseFloat(geekList.score.toFixed(0)) > 50 ? 'rgba(31, 35, 41, 1)' : 'rgba(250, 173, 20, 1)'}`">{{parseFloat(geekList.score.toFixed(0))}}</span>-->
<!--                <el-icon class="ScoreArrowRight" color="#a9abb2" style="font-size: 14px;margin-left: 4px"><ArrowRight /></el-icon>-->
<!--              </el-text>-->
<!--              <el-image v-else class="rotating" :src="'/index/header/searchPage/quanquan.svg'" style="width: 18px;height: 18px"></el-image>-->
<!--            </div>-->
<!--          </el-col>-->
        </el-row>

        <!--  工作年龄一行    -->
        <el-row class="geek-work-el-row el-row-width-full el-row-margin-top-6px" :gutter="0" style="justify-content: space-between">
          <div>
            <el-button text style="background-color: rgba(255,230,230,0);color: #878787" class="workBtm" size="small" round>
              <el-image  class="headerIcons" :src="'/index/header/icons/work.svg'" style="margin-right: 10px"></el-image>
              <!--          <el-text>2018.01 - 2020.12   上海力德信息科技有限公司</el-text>-->
              <el-text style="color: #7a889b">
                {{geekList.workExp?(geekList.workExp.name?geekList.workExp.name:"未知"):"未知"}}
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <el-text v-show="geekList.workExp?.name">
                  <el-text v-show="geekList.workExp?.workStartTime" style="color: #7a889b">{{geekList.workExp?(geekList.workExp.workStartTime?geekList.workExp.workStartTime:"未知"):"未知"}} &nbsp;&nbsp;~&nbsp;&nbsp;</el-text>
                  <el-text v-show="geekList.workExp?.workEndTime" style="color: #7a889b">{{geekList.workExp?(geekList.workExp.workEndTime?geekList.workExp.workEndTime:"未知"):"未知"}}</el-text>
                </el-text>
              </el-text>

            </el-button>
          </div>

        </el-row>

        <!--  学校一行    -->
        <el-row class="geek-school-el-row el-row-width-full el-row-margin-top-6px" :gutter="0" style="justify-content: space-between">
          <div>
            <el-button text style="background-color: rgba(255,230,230,0);" class="schoolBtm" size="small" round>
              <el-image  class="headerIcons" :src="'/index/header/icons/school.svg'" style="margin-right: 10px"></el-image>
              <!--          <el-text>2013.09 - 2017.06   清华大学  视觉传达设计</el-text>-->
              <!--          <el-text>{{geekList.eduExp?geekList.eduExp:"未知"}}</el-text>-->
              <!--            <el-text>{{geekList.eduExp?(geekList.eduExp.name?geekList.eduExp.name:"未知"):"未知"}}</el-text>-->
              <el-text style="color: #7a889b">
                {{geekList.eduExp?(geekList.eduExp.name?geekList.eduExp.name:"未知"):"未知"}}
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <el-text v-show="geekList.eduExp?.name">
                  <el-text v-show="geekList.eduExp?.educationStartTime" style="color: #7a889b">{{geekList.eduExp?(geekList.eduExp.educationStartTime?geekList.eduExp.educationStartTime:"未知"):"未知"}} &nbsp;&nbsp;~&nbsp;&nbsp; </el-text>
                  <el-text v-show="geekList.eduExp?.educationEndTime" style="color: #7a889b">{{geekList.eduExp?(geekList.eduExp.educationEndTime?geekList.eduExp.educationEndTime:"未知"):"未知"}}</el-text>
                </el-text>
              </el-text>
            </el-button>
          </div>
          <div>
            <!--    简要描述      -->
            <el-tooltip effect="dark"
                        :content="geekList.description"
                        placement="bottom">
              <el-button style="background-color: #f0f6ff;color: #999" class="highestDegreeBtm" size="small" color="#f0f6ff" round>简要描述</el-button>
            </el-tooltip>
          </div>

        </el-row>

      </el-card>

    </div>
  </el-dialog>
</template>

<script setup>
import {computed, defineExpose, ref, watch} from 'vue';
import {useStore} from "vuex";
import {saveJobListRequestTemplate} from "@/domain/request/JobListRequest";
import {ElButton, ElMessage} from "element-plus";
import {compareResumeSimilarity} from "@/api/research/ResearchApi";
import {ArrowRight} from "@element-plus/icons-vue";
//store
const store = useStore();
const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  collectClick:Function,
  listInfoClick:Function
});
const emit = defineEmits(['update:visible']);

const localVisible = ref(props.visible);
const loading = ref(false);
//所有渠道配置
const allChannelStatus = computed(() => store.getters.getChannelConf);
//所有第三方渠道
const allThirdPartyChannelConfig = computed(() => {
  return Object.entries(allChannelStatus.value)
      .filter(([key, channel]) => !(key==='ALL'||key==='Collect'))
      .map(([key, channel]) => ({...channel })); // 返回过滤后的对象
});
//当前chat id
const chatId = computed(() => store.getters.getLatestChatId);
const jobALlData = ref([]);

//查询相似的人
const handleSearch = async (request) => {
  loading.value = true;
  try {
    // 查询逻辑
    await searchJobList(request)
  } catch (error) {
    console.error('查询失败：', error);
  } finally {
    loading.value = false;
  }
};

const searchJobList = async (request) => {

  // const request =data.channelSearchConditions;
  // console.log(request)
  const searchConditionId =request.id;
  // const channelConf = store.getters.getChannelConf;
  // const allThirdPartyChannelConfig =Object.entries(channelConf)
  //     .filter(([key, channel]) => !(key==='ALL'||key==='Collect'))
  //     .map(([key, channel]) => ({...channel }));
  let newVar = allThirdPartyChannelConfig.value.filter((channel) => channel.disable&&channel.login).map((item) => (item))||[];
  if(newVar){
    let jobListRequestDTO = [];
    for (let channelItem of newVar) {
      if(!(request&&request.channelSearchConditions&&request.channelSearchConditions.length>0)){
        continue;
      }
      let channelSearchCondition = request.channelSearchConditions.find((item)=>item.channel===channelItem.key);
      if(!channelSearchCondition&&channelSearchCondition.conditionData){
        continue;
      }
      // console.log(channelItem,channelSearchCondition.conditionData);
      const allData =await channelItem.cardInfoRef.searchChannelData(channelSearchCondition.conditionData);
      if(allData){
        let saveJobListRequest = saveJobListRequestTemplate();
        saveJobListRequest.searchConditionId = searchConditionId;
        saveJobListRequest.channel = channelItem.desc;
        saveJobListRequest.resumeList = allData;
        jobListRequestDTO.push(saveJobListRequest);
      }
    }
    //获取列表数据
    let jobList;
    try {
      let {data:jobListData} = await compareResumeSimilarity(jobListRequestDTO);
      jobList = jobListData;
    }catch (e){
      ElMessage.error('后端服务异常，请联系管理员');
      console.log(e);
      jobList = [];
    }
    jobALlData.value = jobList;
    console.log("jobList:",jobList)
  }
}

const handleCollectClick = (list) => {
  props.collectClick(list);
}
const handleListInfoClick = (list) => {
  props.listInfoClick(list);
}

// 恢复监听逻辑
watch(
  () => props.visible,
  (newVal) => {
    localVisible.value = newVal;
    if(!newVal){
      jobALlData.value = [];
    }
  }
);

watch(
  () => localVisible.value,
  (newVal) => {
    emit('update:visible', newVal);
  }
);

defineExpose({
  handleSearch
})
</script>

<style scoped lang="scss">
.geek-card-list{
  margin-bottom: 10px;
  position: relative;

  .read-div{
    height: 43px;
    width: 43px;
    position: absolute;
    top: 0;
    left: 0;
  }

  .el-row-margin-top-6px{
    margin-top: 6px
  }
  .el-col-display-Style{
    display: flex;
    align-items: center;
  }
  .el-button-margin-left{
    margin-left: 0.5rem;
  }

  :hover{
    cursor: pointer;
  }
}
.highestDegreeBtmMgLeft{
  margin-left: 8px;
}

.geekAIBtm{
  width: 70px;
  height: 36px;
  color: white;
  border-radius: 8.93px 0 0 8.93px;
  background: linear-gradient(248deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);
  margin-right: 0 !important;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
}

.geekAINumBtm{
  width: 56px;
  height: 36px;
  border-radius: 0 8.93px 8.93px 0;
  background: linear-gradient(246.8deg, rgba(199, 160, 255, 0.15) 0%, rgba(136, 120, 255, 0.15) 11.71%, rgba(82, 128, 252, 0.15) 49.68%, rgba(84, 164, 255, 0.15) 74.23%, rgba(60, 209, 246, 0.15) 90.26%, rgba(116, 255, 205, 0.15) 100%);
  margin-left: 0 !important;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  padding-left: 8px;
}

.pageConfig{
  border-top:1px solid #E8E8E8;
  padding: 8px 16px;
  display: flex;
  justify-content: end;

}

.rotating {
  animation: spin 2s linear infinite; /* 2秒完成一圈，线性匀速，无限循环 */
}

@keyframes spin {
  from {
    transform: rotate(0deg); /* 起始角度 */
  }
  to {
    transform: rotate(360deg); /* 结束角度 */
  }
}

.bigGeekInfo{

  .geekInfoCad .el-text{
    margin: 0px 4px;
  }

}

.el-text-ellipsis{
  //display: -webkit-box !important; /* 必须要设置为 WebKit 的盒模型 */
  -webkit-box-orient: vertical; /* 设置垂直排列 */
  -webkit-line-clamp: 2; /* 限制显示的行数 */
  overflow: hidden; /* 隐藏超出范围的内容 */
  text-overflow: ellipsis; /* 设置省略号 */
  word-wrap: break-word; /* 防止长单词撑破布局 */
  max-width: 100px; /* 根据需要设置最大宽度 */
  width: 100px;
}

.male-btn {
  background-color: #409EFF;
  color: white;
}
.female-btn {
  background-color: #F56C6C;
  color: white;
}

/* 收藏按钮容器 */
.collect-container {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .collect-icon {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
  }

  &:hover .collect-icon {
    transform: scale(1.1);
  }

  .collect-text {
    margin-left: 4px;
    color: #a8abb2;
    font-size: 12px;

    /* 在小屏幕上隐藏文字 */
    //@media (max-width: 1200px) {
    //  display: none;
    //}
  }
}

/* 在更小的屏幕上调整图标大小 */
@media (max-width: 768px) {
  .collect-container {
    padding: 4px;

    .collect-icon {
      width: 10px;
      height: 10px;
    }
  }
}

/* 在极小的屏幕上进一步调整 */
@media (max-width: 576px) {
  .collect-container {
    padding: 2px;
  }

  /* 调整渠道显示 */
  .geek-img-el-col {
    .el-button {
      padding: 4px;

      .el-image {
        margin-right: 0;
      }

      /* 隐藏渠道文字 */
      &::after {
        content: none;
      }
    }
  }
}
</style>