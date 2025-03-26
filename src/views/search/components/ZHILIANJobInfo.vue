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
    <ResumeListInfo v-model:list-data="jobALlData" :click-list-info-fn="clickListInfo"  v-model:channel-config="channelConfig" v-model:search-state-criteria="searchStateAIParam"></ResumeListInfo>

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
import {ElMessage} from "element-plus";
import {markResumeBlindReadStatus, queryScoreList, saveJobList} from "@/api/jobList/JobListApi";
import {pluginBossResultProcessor, pluginZhiLianResultProcessor} from "@/components/verifyes/PluginProcessor";
import {getBoosHeader} from "@/components/QueueManager/BoosJobInfoManager";
import {
  getPluginEmptyRequestTemplate,
  pluginAllActions,
  pluginAllRequestType,
  pluginAllUrls
} from "@/components/PluginRequestManager";
import PluginMessenger from "@/api/PluginSendMsg";
import qs from "qs";
import {saveJobListRequestTemplate} from "@/domain/request/JobListRequest";
import {zhiLianQueueManager} from "@/components/QueueManager/queueManager";
import {
  getZhiLianHeader,
  getZhiLianPageRequestId,
  getZhiLianUniversalParams
} from "@/components/QueueManager/ZhiLianJobInfoManager";
import {getCookieValue} from "@/util/StringUtil";
import {getHTMlDom} from "@/api/testRequest/DetialApi";
import ResumeListInfo from "@/views/search/components/ResumeListInfo.vue";
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
const channelKey = "ZHILIAN";
const jobALlData =computed(()=>store.getters.getChannelALlData(channelKey));
const channelConfig =computed(()=>store.getters.getChannelConfByChannel(channelKey));
//ai排序逻辑 检查符合条件的元素数量
const validScoreCount = computed(() => {
  return jobALlData.value.filter((item) => item.score !== undefined && item.score !== null && item.score >= getSortComparisonValue()).length;
});
//ai推荐
const searchStateAIParam = computed(()=>props.searchStateCriteria);
const searchStateAiParamStatus = computed(() => {return (searchStateAIParam.value && Object.keys(searchStateAIParam.value).length > 0)?"JDMATCH":"SCORE";});
const searchStateAiParamStatusFlag = computed(() => searchStateAiParamStatus.value === "JDMATCH");
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

//新增: 控制评分更新定时器
const scoreUpdateTimer = ref(null);
//新增: 标记是否有评分正在更新中
const isUpdatingScores = ref(false);
//新增: 最后一次批量更新评分的时间
const lastScoreUpdateTime = ref(0);
const scoreUpdateTimerCount = ref(0);
const maxRefreshCount = ref(10);
const refreshTime = ref(15000);

//跳转登陆页
const goToLogin = () => {
  window.open(pluginAllUrls.ZHILIAN.baseUrl, '_blank');
};
//用户登陆状态
const userLoginStatus = () => {
  //加载登陆状态
  let userLoginStatus;
  try {
    store.commit('changeChannelConfLoading',{key:channelKey,value:true});
    setTimeout(async () => {
      userLoginStatus = await zhiLianUserStatus();
      const loginStatus = pluginZhiLianResultProcessor(userLoginStatus);
      store.commit('changeChannelConfLogin',{key:channelKey,value:loginStatus});
      store.commit('changeChannelConfLoading',{key:channelKey,value:false});
    }, 2000)
  }catch (e){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    store.commit('changeChannelConfLogin',{key:channelKey,value:false});
    store.commit('changeChannelConfLoading',{key:channelKey,value:false});
  }
}

//智联 用户登陆状态
const zhiLianUserStatus = async () => {
  const headers = await getZhiLianHeader(false);
  if(!headers||headers.length===0){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  let xZpClientId = getCookieValue("x-zp-client-id",headers['Cookie']);
  let zhiLianPageRequestId = await getZhiLianPageRequestId();
  if(!(xZpClientId)||!(zhiLianPageRequestId)||!(zhiLianPageRequestId['X-zp-page-request-id'])){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return ;
  }
  const requestData ={
    "_": new Date().getTime(),
    "x-zp-page-request-id": zhiLianPageRequestId['X-zp-page-request-id'],
    "x-zp-client-id": xZpClientId
  }
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.userStatus+"?"+qs.stringify(requestData);
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

const clickListInfo = async (listInfo) => {
  resumeId.value = listInfo.id;
  openDetail(listInfo);
  //设置为已读
  try {
    let {data} = await markResumeBlindReadStatus([listInfo.id],true);
    listInfo.isRead = 1;
    store.commit("updateIsReadStatus",listInfo.id)
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
}

const openDetail = (listInfo)=>{
  if(!listInfo.originalResumeUrlInfo){
    console.log("cardInfo.originalResumeUrlInfo is null")
    ElMessage.error('服务异常，请联系管理员！');
  }

  const requestParams = JSON.parse(listInfo.originalResumeUrlInfo);
  const requestData ={
    "t": requestParams.request.t,
    "resumeNumber": requestParams.request.resumeNumber,
    "k": requestParams.request.k
  }
  const url=pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.geekDetailUrl+`?`+qs.stringify(requestData);
  const name='_blank';                            //网页名称，可为空;
  const iWidth=window.screen.availWidth *0.8;                          //弹出窗口的宽度;
  const iHeight=window.screen.availHeight * 0.8;                         //弹出窗口的高度;
  //获得窗口的垂直位置
  const iTop = (window.screen.availHeight +30 - iHeight) / 2;
  //获得窗口的水平位置
  const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
  window.open(url, name, 'height=' + iHeight + ',,innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');

  //同步详细简历
  zhiLianDetailRequest(listInfo);
}

const zhiLianDetailRequest = async (listInfo) => {
  if (!listInfo.originalResumeUrlInfo) {
    return;
  }
  let resumeDetail;
  let request = JSON.parse(listInfo.originalResumeUrlInfo);
  try {
    resumeDetail = await searchResumeInfo(request.request);
  } catch (e) {
    console.log(e);
    return;
  }
  if (!pluginZhiLianResultProcessor(resumeDetail)) {
    ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！` + (resumeDetail?.responseData?.data?.message))
    return;
  }
  console.log("详细简历：",resumeDetail?.responseData?.data)
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
  // if(props.onLodingOpen){
  //   props.onLodingOpen();
  // }
  try {
    await channelSearchList(channelRequestInfo,channelPage,page);
  }catch (e){
    console.log(e);
  }
  // if(props.onLodingClose){
  //   props.onLodingClose();
  // }
  console.log("zhilian执行完了")
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
  channelSearchCondition = JSON.parse(JSON.stringify(channelSearchCondition));
  channelSearchCondition.conditionData.pageNo = channelPage;
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginZhiLianResultProcessor(responseJobListData)){
    ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.message))
    return;
  }
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.total;
  channelSearchConfig.channelCountSize = channelSearchCondition.conditionData.pageSize;
  // 更新channelSearchConfig到Vuex
  store.commit('setSearchChannelConditionConfigData', {key:channelKey, config:channelSearchConfig});
  //列表存到后端
  const channelList = responseJobListData.responseData.data.data.list;
  let saveJobListRequest = saveJobListRequestTemplate();
  saveJobListRequest.outId = channelRequestInfo.requestId;
  saveJobListRequest.searchConditionId = channelRequestInfo.id;
  saveJobListRequest.channel = channelConfig.value.desc;
  saveJobListRequest.resumeList = channelList;
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
  // console.log("智联channelList:",channelList)
  // console.log("智联jobList:",jobList)
  //清掉异步任务
  zhiLianQueueManager.stopAndClear();
  //查询渠道信息
  //生成异步任务
  if(searchStateAiParamStatusFlag.value){
    channelList.forEach((item, index) => {
      const match = jobList.find(a => a.rawDataId === item.resumeNumber);
      if (match) {
        if(!match.originalResumeUrlInfo){
          console.log("match.originalResumeUrlInfo is null")
          ElMessage.error('服务异常，请联系管理员！');
        }
        const requestParams = JSON.parse(match.originalResumeUrlInfo);
        const queryString = requestParams.request;
        const outId = saveJobListRequest.outId;
        const channel = channelConfig.value.desc;
        const searchId = searchConditionId.value;
        const resumeBlindId = match.id;
        const type =searchStateAiParamStatus.value;
        const taskRequest = {queryString,outId,resumeBlindId,type,channel,searchId};
        // zhiLianQueueManager.enqueue(taskRequest);
        if(index < getSynchronizationDetailsContValue()){
          zhiLianQueueManager.enqueue(taskRequest);
        }
      }
    });
  }
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

//列表查询
const searchJobList = async (searchConfig, channelPage = 1) => {
  const headers = await getZhiLianHeader(true);
  if(!headers||headers.length===0){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  let xZpClientId = getCookieValue("x-zp-client-id",headers['Cookie']);
  let zhiLianPageRequestId = await getZhiLianPageRequestId();
  if(!(xZpClientId)||!(zhiLianPageRequestId)||!(zhiLianPageRequestId['X-zp-page-request-id'])){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
  }
  headers["Content-Type"] = "application/json;charset=UTF-8";

  let requestData = getZhiLianUniversalParams(zhiLianPageRequestId, xZpClientId);
  // searchConfig.pageNo = channelPage;
  //访问智联
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = searchConfig;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.getAllJobList+"?"+qs.stringify(requestData);
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

//详细信息查询
const searchResumeInfo = async (requestParam) => {
  const headers = await getZhiLianHeader(true);
  if(!headers||headers.length===0){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  let xZpClientId = getCookieValue("x-zp-client-id",headers['Cookie']);
  let zhiLianPageRequestId = await getZhiLianPageRequestId();
  if(!(xZpClientId)||!(zhiLianPageRequestId)||!(zhiLianPageRequestId['X-zp-page-request-id'])){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
  }
  headers["Content-Type"] = "application/json;charset=UTF-8";

  let requestData = getZhiLianUniversalParams(zhiLianPageRequestId, xZpClientId);
  //访问智联
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = requestParam;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.resumeDetail+"?"+qs.stringify(requestData);
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

  if(itemsNeedingScore.length===0||scoreUpdateTimerCount.value>=maxRefreshCount.value){
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
    const { data } = await queryScoreList({resumeBlindIds:ids,channel:channelKey,searchId:searchConditionId.value});

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

//清理列表
const clearData = () => {
  store.commit('setChannelData',{key:channelKey,value:[]})
  store.commit('changeChannelConfDataSize',{key:channelKey,value:0});
  currentPage.value = 1;
  pageSize.value = 10;
  totalNum.value =10;
}

//组件卸载时清理定时器
onMounted(() => {
  if(scoreUpdateTimer.value) {
    clearTimeout(scoreUpdateTimer.value);
    scoreUpdateTimer.value = null;
  }
});

// 使用 expose 暴露方法
defineExpose({
  search,userLoginStatus,channelSearch,handleCurrentChange,clickListInfo,updateScore,clearData
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