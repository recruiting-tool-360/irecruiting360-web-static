<template>
  <div class="allBobContainer">
    <template v-if="!(channelConfig&&channelConfig.login&&channelConfig.disable)">
      <el-empty :description="`${channelConfig.name}渠道暂无数据`" >
        <el-button class="btm-color" style="height: 30px;width: 88px" @click="goToLogin">前往登陆</el-button>
      </el-empty>
    </template>
    <template v-else-if="jobALlData===undefined||jobALlData===null||jobALlData.length===0">
      <el-empty :description="`${channelConfig.name}渠道暂无数据`" >
      </el-empty>
    </template>
    <!--  列表信息  -->
    <ResumeListInfo v-model:list-data="jobALlData" :click-list-info-fn="clickListInfo" v-model:channel-config="channelConfig"></ResumeListInfo>

    <BossDetial ref="bossDetialRef" v-model:dialogFlag="geekInfoDialog" v-model:resume-id="resumeId" :change-close-status="()=>{geekInfoDialog=false;resumeId=''}" v-model:search-state-criteria="searchStateAIParam"></BossDetial>
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
import {ref,computed,watch,defineExpose} from "vue";
import {useStore} from "vuex";
import {createPageSearchRequest} from "@/views/search/dto/request/PageSearchConfig";
import {getGeekDetail, querySearch} from "@/api/search/SearchApi";
import BossDetial from "@/views/search/components/BossDetial.vue";
import {ElMessage} from "element-plus";
import {markResumeBlindReadStatus, saveJobList} from "@/api/jobList/JobListApi";
import {pluginBossResultProcessor} from "@/components/verifyes/PluginProcessor";
import {getBoosHeader} from "@/components/QueueManager/BoosJobInfoManager";
import {getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls} from "@/components/PluginRequestManager";
import PluginMessenger from "@/api/PluginSendMsg";
import qs from "qs";
import {saveJobListRequestTemplate} from "@/domain/request/JobListRequest";
import ResumeListInfo from "@/views/search/components/ResumeListInfo.vue";
import {boosQueueManager} from "@/components/QueueManager/queueManager";
import {getSortComparisonValue, getSynchronizationDetailsContValue} from "@/config/staticConf/AIConf";

//store
const store = useStore();
// 通过 defineProps 定义 props
const props = defineProps({
  onLodingOpen: Function,
  onLodingClose: Function,
  searchStateCriteria:Object
});
//渠道
const channelKey = "BOSS";
const jobALlData =computed(()=>store.getters.getChannelALlData(channelKey));
const channelConfig =computed(()=>store.getters.getChannelConfByChannel(channelKey));
//ai排序逻辑 检查符合条件的元素数量
const validScoreCount = computed(() => {
  return jobALlData.value.filter((item) => item.score !== undefined && item.score !== null && item.score >= getSortComparisonValue()).length;
});
//ai推荐
const searchStateAIParam = computed(()=>props.searchStateCriteria);
//当前页码数
const currentPage = ref(1);
//当前页显示条目数
const pageSize = ref(10);
//总分页数
const totalNum =ref(10);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//是否已读
const filterByRead = computed(() => store.getters.getUnreadCheckBoxV);
//用户详细信息
const geekInfoDialog = ref(false);
//盲简历id
const resumeId = ref("");
//bossDetialRef
const bossDetialRef = ref(null);

//跳转登陆页
const goToLogin = () => {
  window.open(pluginAllUrls.BOSS.baseUrl, '_blank');
};
//用户登陆状态
const userLoginStatus = () => {
  // 加载登陆状态
  let userLoginStatus;
  try {
    store.commit('changeChannelConfLoading',{key:channelKey,value:true});
    setTimeout(async () => {
      userLoginStatus = await boosUserStatus();
      const loginStatus = pluginBossResultProcessor(userLoginStatus);
      store.commit('changeChannelConfLogin',{key:channelKey,value:loginStatus});
      store.commit('changeChannelConfLoading',{key:channelKey,value:false});
    }, 2000)
  }catch (e){
    ElMessage.warning('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    store.commit('changeChannelConfLogin',{key:channelKey,value:false});
    store.commit('changeChannelConfLoading',{key:channelKey,value:false});
  }
}

//boos 用户登陆状态
const boosUserStatus = async () => {
  const headers = await getBoosHeader(false);
  if(!headers){
    // ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    return;
  }
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.GET;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl+pluginAllUrls.BOSS.checkUserAuth;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

const clickListInfo = async (listInfo) => {
  resumeId.value = listInfo.id;
  geekInfoDialog.value = true;
  console.log("searchStateAIParam:",searchStateAIParam)
  bossDetialRef.value?.childGeekInfoMethod(listInfo);
  //设置为已读
  try {
    let {data} = await markResumeBlindReadStatus([listInfo.id],true);
    listInfo.isRead = 1;
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
}

//分页设置触发时
const handleSizeChange = (value) => {
  handleCurrentChange(1);
}
//分页设置触发时
const handleCurrentChange = (value) => {
  if(!(channelConfig.value&&channelConfig.value.login&&channelConfig.value.disable)){
    return;
  }
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

//渠道查询
const channelSearch = async (channelRequestInfo, channelPage = 1, page = 1) => {
  if(!(channelConfig.value&&channelConfig.value.login&&channelConfig.value.disable)){
    return;
  }
  try {
    await channelSearchList(channelRequestInfo,channelPage,page);
  }catch (e){
    console.log(e);
  }
  console.log("boos执行完了")
}

const channelSearchList = async (channelRequestInfo, channelPage = 1, page = 1) => {
  if(!(channelRequestInfo&&channelRequestInfo.channelSearchConditions&&channelRequestInfo.channelSearchConditions.length>0)){
    return;
  }
  let channelSearchCondition = channelRequestInfo.channelSearchConditions.find((item)=>item.channel===channelKey);
  if(!channelSearchCondition&&channelSearchCondition.conditionData){
    return;
  }
  let channelSearchConfig =channelRequestInfo.config.find((item)=>item.channelKey===channelKey);
  let responseJobListData;
  try {
    responseJobListData = await boosJobList(channelSearchCondition.conditionData,channelPage);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginBossResultProcessor(responseJobListData)){
    ElMessage.error('Boos数据查询异常！请联系管理员！'+(responseJobListData?.responseData?.data?.message))
    return;
  }
  channelSearchConfig.channelPage = responseJobListData.responseData.data.zpData.page;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.zpData.totalCount;
  channelSearchConfig.channelCountSize = 15;
  // 更新channelSearchConfig到Vuex
  store.commit('setSearchChannelConditionConfigData', {key:channelKey, config:channelSearchConfig});
  // console.log("boos数据：",responseJobListData)
  //列表存到后端
  const boosList = responseJobListData.responseData.data.zpData.geeks;
  let saveJobListRequest = saveJobListRequestTemplate();
  saveJobListRequest.outId = channelRequestInfo.requestId;
  saveJobListRequest.searchConditionId = channelRequestInfo.id;
  saveJobListRequest.channel = channelConfig.value.desc;
  saveJobListRequest.resumeList = boosList;
  let jobList;
  try {
    let {data:jobListData} = await saveJobList(saveJobListRequest);
    jobList = jobListData;
  }catch (e){
    ElMessage.error('后端服务异常，请联系管理员');
    console.log(e);
    return;
  }
  //处理id
  if(!jobList||jobList.length===0){
    return;
  }
  //查询渠道信息
  //生成异步任务
  boosList.forEach((item, index) => {
    const match = jobList.find(a => a.rawDataId === item.uniqSign);
    if (match) {
      let jobHunterInfo = item.geekCard;
      const queryString = `securityId=${jobHunterInfo.securityId}&segs=${jobHunterInfo.lidTag}&lid=${jobHunterInfo.lid}`;
      const outId = saveJobListRequest.outId;
      const channel = channelConfig.value.desc;
      const resumeBlindId = match.id;
      const type =(searchStateAIParam.value && Object.keys(searchStateAIParam.value).length > 0)?"JDMATCH":"SCORE";
      const taskRequest = {queryString,outId,resumeBlindId,type,channel};
      // boosQueueManager.enqueue(taskRequest);
      if(index < getSynchronizationDetailsContValue()){
        boosQueueManager.enqueue(taskRequest);
      }
    }
  });
  //查询第一页数据
  await search(1);
}

//查询列表信息
const search = async (page) => {
  if(!(channelConfig.value&&channelConfig.value.login&&channelConfig.value.disable)){
    return;
  }
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
    let scoreList = listResponse.data.data.map(item=>item.id);
    store.commit('setChannelData',{key:channelKey,value:listResponse.data.data});
    listResponse.data.data.forEach(item=>{
      store.commit('addScoreConfigToQueue',{id:item.id,count:0});
    });
  }else{
    // jobALlData.value=[];
    store.commit('setChannelData',{key:channelKey,value:[]})
  }
  store.commit('changeChannelConfDataSize',{key:channelKey,value:totalNum.value});
}

//boss列表查询
const boosJobList = async (searchConfig, channelPage = 1) => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    throw new Error("系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！");
  }
  searchConfig.page = channelPage;
  const queryString = qs.stringify(searchConfig);
  //访问Boos
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.GET;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl+pluginAllUrls.BOSS.getAllJobList+"?"+queryString;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

//请求
const i360Request= async (action,emptyRequestTemplate, timeout = 5000) => {
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    return response;
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// 使用 expose 暴露方法
defineExpose({
  search,userLoginStatus,channelSearch,handleCurrentChange,clickListInfo
});

//ai排序逻辑
// 监听 validScoreCount 的变化，更新 Vuex 的状态
watch(validScoreCount, (newCount) => {
  store.commit("changeAiSortSwitch", {key:channelKey,value:newCount > 0});
}, { immediate: true });

</script>

<style scoped lang="scss">

.pageConfig{
  border-top:1px solid #E8E8E8;
  padding: 8px 16px;
  display: flex;
  justify-content: end;

}

</style>