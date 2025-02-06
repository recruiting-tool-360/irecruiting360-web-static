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
    <ResumeListInfo v-model:list-data="jobALlData" :click-list-info-fn="clickListInfo"></ResumeListInfo>

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
import {ElMessage} from "element-plus";
import {markResumeBlindReadStatus, saveJobList} from "@/api/jobList/JobListApi";
import {
  pluginBossResultProcessor,
  pluginLIEPINResultProcessor,
  pluginZhiLianResultProcessor
} from "@/components/verifyes/PluginProcessor";
import {getBoosHeader} from "@/components/QueueManager/BoosJobInfoManager";
import {
  getPluginEmptyRequestTemplate,
  pluginAllActions, pluginAllGroup,
  pluginAllRequestType,
  pluginAllUrls
} from "@/components/PluginRequestManager";
import PluginMessenger from "@/api/PluginSendMsg";
import qs from "qs";
import {saveJobListRequestTemplate} from "@/domain/request/JobListRequest";
import {liePinQueueManager, zhiLianQueueManager} from "@/components/QueueManager/queueManager";
import {
  getZhiLianHeader,
  getZhiLianPageRequestId,
  getZhiLianUniversalParams
} from "@/components/QueueManager/ZhiLianJobInfoManager";
import {getCookieValue} from "@/util/StringUtil";
import {getHTMlDom} from "@/api/testRequest/DetialApi";
import ResumeListInfo from "@/views/search/components/ResumeListInfo.vue";
import {getSortComparisonValue} from "@/config/staticConf/AIConf";
import {exeLIEPINJobInfo, getLIEPINHeader} from "@/components/QueueManager/LIEPINJobInfoManager";
import _ from "lodash";

//store
const store = useStore();
// 通过 defineProps 定义 props
const props = defineProps({
  onLodingOpen: Function,
  onLodingClose: Function,
  searchStateCriteria:Object
});
//渠道
const channelKey = "LIEPIN";
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
  window.open(pluginAllUrls.LIEPIN.loginURL, '_blank');
};
//用户登陆状态
const userLoginStatus = () => {
  //加载登陆状态
  let userLoginStatus;
  try {
    store.commit('changeChannelConfLoading',{key:channelKey,value:true});
    setTimeout(async () => {
      userLoginStatus = await liePinUserStatus();
      const loginStatus = pluginLIEPINResultProcessor(userLoginStatus);
      store.commit('changeChannelConfLogin',{key:channelKey,value:loginStatus});
      store.commit('changeChannelConfLoading',{key:channelKey,value:false});
    }, 2000)
  }catch (e){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    store.commit('changeChannelConfLogin',{key:channelKey,value:false});
    store.commit('changeChannelConfLoading',{key:channelKey,value:false});
  }
}

//猎聘 用户登陆状态
const liePinUserStatus = async () => {
  const headers = await getLIEPINHeader(true);
  if(!headers||headers.length===0){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.UNIVERSAL_REQUEST_BACKGROUND_MAIN;
  pluginEmptyRequestTemplate.tabUrl = pluginAllUrls.LIEPIN.loginURL;
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.LIEPIN.baseUrl+pluginAllUrls.LIEPIN.userStatus;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

const clickListInfo = async (listInfo) => {
  resumeId.value = listInfo.id;
  openDetail(listInfo);
  //设置为已读
  try {
    let {data} = await markResumeBlindReadStatus([listInfo.id],true);
    listInfo.isRead = 1;
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
  const url=requestParams.request.resumeUrl;
  const name='_blank';                            //网页名称，可为空;
  const iWidth=window.screen.availWidth *0.8;                          //弹出窗口的宽度;
  const iHeight=window.screen.availHeight * 0.8;                         //弹出窗口的高度;
  //获得窗口的垂直位置
  const iTop = (window.screen.availHeight +30 - iHeight) / 2;
  //获得窗口的水平位置
  const iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
  window.open(url, name, 'height=' + iHeight + ',,innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');

  //同步详细简历
  liePinDetailRequest(listInfo);
}

const liePinDetailRequest = async (listInfo) => {
  const requestParams = JSON.parse(listInfo.originalResumeUrlInfo);
  const queryString = requestParams.request;
  const channel = channelConfig.value.desc;
  const outId = listInfo.outId;
  const resumeBlindId = listInfo.id;
  const type =(searchStateAIParam.value && Object.keys(searchStateAIParam.value).length > 0)?"JDMATCH":"SCORE";
  const taskRequest = {queryString,outId,resumeBlindId,type,channel};
  console.log("can",taskRequest)
  await exeLIEPINJobInfo(taskRequest);
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
const channelSearch = async (channelRequestInfo) => {
  if(!(channelConfig.value&&channelConfig.value.login&&channelConfig.value.disable)){
    return;
  }
  // if(props.onLodingOpen){
  //   props.onLodingOpen();
  // }
  try {
    await channelSearchList(channelRequestInfo);
  }catch (e){
    console.log(e);
  }
  // if(props.onLodingClose){
  //   props.onLodingClose();
  // }
  console.log("liepin执行完了")
}

const channelSearchList = async (channelRequestInfo) => {
  if(!(channelRequestInfo&&channelRequestInfo.channelSearchConditions&&channelRequestInfo.channelSearchConditions.length>0)){
    return;
  }
  let channelSearchCondition = channelRequestInfo.channelSearchConditions.find((item)=>item.channel===channelKey);
  if(!channelSearchCondition&&channelSearchCondition.conditionData){
    return;
  }
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginLIEPINResultProcessor(responseJobListData)){
    ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.message))
    return;
  }
  //列表存到后端
  const channelList = responseJobListData.responseData.data.data.cvSearchResultForm.cvSearchListFormList;
  //包装数据
  if(channelList&&channelList.length>0){
    const highLightKey = responseJobListData.responseData.data.data.cvSearchResultForm.highLightKey;
    channelList.forEach((item)=>{
      item.highLightKey = highLightKey;
    })
  }
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
  // console.log("猎聘channelList:",channelList)
  // console.log("猎聘jobList:",jobList)
  //查询渠道信息
  //生成异步任务
  channelList.forEach((item, index) => {
    const match = jobList.find(a => a.rawDataId === item.usercId);
    if (match) {
      if(!match.originalResumeUrlInfo){
        console.log("match.originalResumeUrlInfo is null")
        ElMessage.error('服务异常，请联系管理员！');
      }
      const requestParams = JSON.parse(match.originalResumeUrlInfo);
      const queryString = requestParams.request;
      const channel = channelConfig.value.desc;
      const outId = saveJobListRequest.outId;
      const resumeBlindId = match.id;
      const type =(searchStateAIParam.value && Object.keys(searchStateAIParam.value).length > 0)?"JDMATCH":"SCORE";
      const taskRequest = {queryString,outId,resumeBlindId,type,channel};
      if(index<1){
        liePinQueueManager.enqueue(taskRequest);
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

//列表查询
const searchJobList = async (searchConfig) => {
  const headers = await getLIEPINHeader(true);
  if(!headers||headers.length===0){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  const requestParams = _.cloneDeep(searchConfig);
  requestParams.cvSearchConditionInputVo.curPage = 0;
  requestParams.cvSearchConditionInputVo = JSON.stringify(searchConfig.cvSearchConditionInputVo);
  //访问猎聘
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.UNIVERSAL_REQUEST_BACKGROUND_MAIN;
  pluginEmptyRequestTemplate.tabUrl = pluginAllUrls.LIEPIN.loginURL;
  pluginEmptyRequestTemplate.parameters = qs.stringify(requestParams);
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.LIEPIN.baseUrl+pluginAllUrls.LIEPIN.getAllJobList;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

//详细信息查询
const searchResumeInfo = async (requestParam) => {
  const headers = await getLIEPINHeader(true);
  if(!headers||headers.length===0){
    ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  const requestParams = {};
  requestParams.pageParamDto = JSON.stringify(requestParam);
  console.log(requestParams)
  //访问猎聘
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.UNIVERSAL_REQUEST_BACKGROUND_MAIN;
  pluginEmptyRequestTemplate.tabUrl = pluginAllUrls.LIEPIN.loginURL;
  pluginEmptyRequestTemplate.parameters = qs.stringify(requestParams);
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.LIEPIN.baseUrl+pluginAllUrls.LIEPIN.geekInfo;
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