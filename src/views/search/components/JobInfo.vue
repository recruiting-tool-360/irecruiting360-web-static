<template>
  <div class="allBobContainer">
    <template v-if="jobALlData===undefined||jobALlData===null||jobALlData.length===0">
      <el-empty description="聚合渠道暂无数据" />
    </template>
    <!--  列表信息  -->

<!--    </el-card>-->
    <!--  列表信息  -->
    <ResumeListInfo v-model:list-data="jobALlData" :click-list-info-fn="clickListInfo" v-model:channel-config="channel"></ResumeListInfo>

    <BossDetial ref="bossDetialRef" v-model:dialogFlag="geekInfoDialog" :change-close-status="()=>{geekInfoDialog=false;}" v-model:search-state-criteria="searchStateAIParam"></BossDetial>
    <!--  分页信息  -->
    <div class="pageConfig">
      <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10,30,60,100]"
          background
          layout="prev, pager, next,sizes"
          :total="totalNum"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup>
import {ref, computed, watch, defineExpose, onMounted} from "vue";
import {useStore} from "vuex";
import {createPageSearchRequest} from "@/views/search/dto/request/PageSearchConfig";
import {getGeekDetail, querySearch} from "@/api/search/SearchApi";
import {channelOptions} from "@/views/search/dto/SearchPageConfig";
import BossDetial from "@/views/search/components/BossDetial.vue";
import {ElMessage} from "element-plus";
import {getScoreList, markResumeBlindReadStatus, queryScoreList} from "@/api/jobList/JobListApi";
import {pluginAllUrls} from "@/components/PluginRequestManager";
import qs from "qs";
import {getSortComparisonValue} from "@/config/staticConf/AIConf";
import ResumeListInfo from "@/views/search/components/ResumeListInfo.vue";

//store
const store = useStore();
// 通过 defineProps 定义 props
const props = defineProps({
  onLodingOpen: Function,
  onLodingClose: Function,
  thirdPartyChannelConfig:Array,
  searchStateCriteria:Object
});
const channelKey = "ALL";
const jobALlData =computed(()=>store.getters.getChannelALlData(channelKey));
const channelConfig =computed(()=>store.getters.getChannelConfByChannel(channelKey));
//ai推荐
const searchStateAIParam = computed(()=>props.searchStateCriteria);
//ai排序逻辑 检查符合条件的元素数量
const validScoreCount = computed(() => {
  return jobALlData.value.filter((item) => item.score !== undefined && item.score !== null && item.score >= getSortComparisonValue()).length;
});
//所有渠道配置
const allChannelStatus = computed(() => store.getters.getChannelConf);
//所有第三方渠道
const allThirdPartyChannelConfig = computed(() => {
  return Object.entries(allChannelStatus.value)
      .filter(([key, channel]) => !(key==='ALL'||key==='Collect'))
      .map(([key, channel]) => ({...channel })); // 返回过滤后的对象
});
//当前页码数
const currentPage = ref(1);
//当前页显示条目数
const pageSize = ref(10);
//总分页数
const totalNum =ref(10);
//渠道配置
const channel = channelOptions.find(item=>item.eName==="ALL");
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//是否已读
const filterByRead = computed(() => store.getters.getUnreadCheckBoxV);
//用户详细信息
const geekInfoDialog = ref(false);
//bossDetialRef
const bossDetialRef = ref(null);

//新增: 控制评分更新定时器
const scoreUpdateTimer = ref(null);
//新增: 标记是否有评分正在更新中
const isUpdatingScores = ref(false);
//新增: 最后一次批量更新评分的时间
const lastScoreUpdateTime = ref(0);
const scoreUpdateTimerCount = ref(0);
const refreshTime = ref(15000);

const clickListInfo = async (userInfo) => {

  let clickChannel = allThirdPartyChannelConfig.value.find((item)=>item.desc===userInfo.channel);
  if(clickChannel){
    if(clickChannel.key==="BOSS"){
      geekInfoDialog.value = true;
      bossDetialRef.value?.childGeekInfoMethod(userInfo);
    }else{
      clickChannel.cardInfoRef.clickListInfo(userInfo);
    }
  }

  //设置为已读
  try {
    let {data} = await markResumeBlindReadStatus([userInfo.id],true);
    userInfo.isRead = 1;
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
}

const openDetail = (listInfo)=>{

}

//分页设置触发时
const handleSizeChange = (value) => {
  handleCurrentChange(1);
}
//分页设置触发时
const handleCurrentChange = (value) => {
  if(props.onLodingOpen){
    props.onLodingOpen();
  }
  try {
    search(value);
  }catch (e){
    console.log(e)
  }
  if(props.onLodingClose){
    props.onLodingClose();
  }
}

//查询列表信息
const search = async (page) => {
  currentPage.value = page;
  let pageSearchRequest = createPageSearchRequest();
  pageSearchRequest.offset=page;
  pageSearchRequest.size =pageSize.value;
  pageSearchRequest.channel = channelConfig.value.desc;
  pageSearchRequest.filterByRead = filterByRead.value;
  pageSearchRequest.searchConditionId = searchConditionId.value;
  let listResponse = null;
  try {
    listResponse = await querySearch(pageSearchRequest);
  } catch (e) {
    console.log(e)
    ElMessage.error('服务异常，请联系管理员！');
  }
  if(listResponse){
    totalNum.value = listResponse.data.totalCount;
  }else{
    totalNum.value = 0;
  }
  if(listResponse&&listResponse.data&&listResponse.data.data){
    // jobALlData.value=listResponse.data.data;
    // let scoreList = listResponse.data.data.map(item=>item.id);
    store.commit('setChannelData',{key:channelKey,value:listResponse.data.data});
    // listResponse.data.data.forEach(item=>{
    //   store.commit('addScoreConfigToQueue',{id:item.id,count:0});
    // });
    scoreUpdateTimerCount.value = 0;
    // 在数据更新后处理评分
    startScoreUpdateTimer();
  }else{
    // jobALlData.value=[];
    store.commit('setChannelData',{key:channelKey,value:[]})
  }
  store.commit('changeChannelConfDataSize',{key:channelKey,value:totalNum.value});
}



//启动评分更新定时器
const startScoreUpdateTimer = () => {
  const itemsNeedingScore = jobALlData.value.filter(item =>
      item.score === undefined || item.score === null || item.score === -1
  );
  // 清除可能已存在的定时器
  if(scoreUpdateTimer.value) {
    clearTimeout(scoreUpdateTimer.value);
    scoreUpdateTimer.value = null;
  }

  if(itemsNeedingScore.length===0||scoreUpdateTimerCount.value>=5){
    clearTimeout(scoreUpdateTimer.value);
    scoreUpdateTimer.value = null;
    return;
  }

  // 设置新的定时器，每30秒检查一次未更新的评分
  scoreUpdateTimer.value = setTimeout(() => {
    scoreUpdateTimerCount.value=scoreUpdateTimerCount.value+1;
    const now = Date.now();
    // 如果距离上次更新超过30秒，且不在更新过程中
    if(now - lastScoreUpdateTime.value > refreshTime.value && !isUpdatingScores.value) {
      fetchPendingScores();
    }
    // 继续定时检查
    startScoreUpdateTimer();
  }, refreshTime.value);
};

//获取待处理评分
const fetchPendingScores = async () => {
  // 标记开始更新
  isUpdatingScores.value = true;
  try {
    // 获取所有待处理项目的ID
    // const ids = pendingScoreItems.value.map(item => item.id);
    const ids = jobALlData.value.filter(item =>
        item.score === undefined || item.score === null || item.score === -1
    ).map(item => item.id);

    // 调用API获取评分
    const { data } = await queryScoreList({resumeBlindIds:ids,channel:channelKey});

    if(data && data.length > 0) {

      // 更新本地数据
      data.forEach(scoreData => {
        // 更新总列表中的评分
        updateLocalScore(scoreData);
      });
      // 记录最后更新时间
      lastScoreUpdateTime.value = Date.now();
    }
  } catch(error) {
    console.error('获取评分时出错:', error);
  } finally {
    // 标记更新结束
    isUpdatingScores.value = false;
  }
};

//更新本地数据的评分 (既用于SSE消息也用于API响应)
const updateLocalScore = (scoreData) => {
  if(!scoreData) return;
  // 确定ID字段 - API返回的是resumeBlindId，而SSE消息可能使用resumeId
  const id = scoreData.resumeId || scoreData.resumeBlindId;
  if(!id) {
    return;
  }
  // 在jobALlData中查找并更新对应项
  if(jobALlData.value && jobALlData.value.length > 0) {
    jobALlData.value.forEach((item) => {
      if(item.id === id) {
        item.score = scoreData.score;
      }
    });
  }
};

//重写原有的updateScore方法，使用统一的本地更新逻辑
const updateScore = (val) => {
  updateLocalScore(val);
};

//组件卸载时清理定时器
onMounted(() => {
  if(scoreUpdateTimer.value) {
    clearTimeout(scoreUpdateTimer.value);
    scoreUpdateTimer.value = null;
  }
});

// 使用 expose 暴露方法
defineExpose({
  search,handleCurrentChange,updateScore
});

// 如果 props 的值可能会变化，使用 watch 来同步更新 localValue
// watch(() => props.largeData, (newValue) => {
//   jobALlData.value = newValue;
// });

//ai排序逻辑
// 监听 validScoreCount 的变化，更新 Vuex 的状态
watch(validScoreCount, (newCount) => {
      store.commit("changeAiSortSwitch", {key:channelKey,value:newCount > 0});
    }, { immediate: true });
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



</style>