//请求
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllGroup, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "src/pluginSrc/config/PluginRequestManager";
import {
  pluginLIEPINResultProcessor,
  pluginResultProcessor
} from "src/pluginSrc/verifyes/PluginProcessor";
import {saveResumeDetail, saveResumeDetailPlus} from "src/api/jobList/JobListApi";
import qs from "qs";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import notify from "src/util/notify";
import store from "src/store";

const channelKey = "LIEPIN";
function genUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0
            , v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
//猎聘 请求头信息
export const getLIEPINHeaderInfo = async (flag) => {
    let headers = {};
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.LIEPINRequestStorageKey;
    let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    if(pluginResultProcessor(boosRequestHeader)){
        const httpHeader = boosRequestHeader.responseData.data.headersData;
        if(httpHeader){
            headers= httpHeader;
            // headers=["Accept"]="application/json, text/plain, */*";
            headers["X-Fscp-Version"]="1.1";
            headers["X-Requested-With"]="XMLHttpRequest";
            headers["X-Client-Type"]="web";
            headers["Content-Type"]="application/x-www-form-urlencoded";
            headers["X-Fscp-Fe-Version"]="";
            headers["X-Fscp-Trace-Id"]=genUID();
        }
    }else{
        if(flag){
            ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
        }
        throw new Error("request error");
    }
    //认证信息
    let pluginCookieBaseConfigEmpty = getPluginBaseConfigEmptyDTO();
    pluginCookieBaseConfigEmpty.parameters =pluginKeys.LIEPINCookieStorageKey;
    let responseCookieData = await i360Request(pluginCookieBaseConfigEmpty.action,pluginCookieBaseConfigEmpty);
    if(pluginResultProcessor(responseCookieData)){
        const httpHeader = responseCookieData.responseData.data.cookieData;
        if(httpHeader){
            headers= Object.assign(headers,{Cookie:httpHeader})
        }else{
            if(flag){
                ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
            }
            throw new Error("request error");
        }
    }else{
        if(flag){
            ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
        }
        throw new Error("request error");
    }
    return headers;
}
//猎聘 请求头信息
export const getLIEPINHeader = async (flag) => {
    let header = null;
    try {
        header = await getLIEPINHeaderInfo(flag);
    }catch (e){
        console.log(e);
        header = null;
    }
    return header;
}

//猎聘 用户登陆状态
export const liePinUserStatus = async () => {
  const headers = await getLIEPINHeader(true);
  if(!headers||headers.length===0){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.LIEPIN.baseUrl+pluginAllUrls.LIEPIN.userStatus;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
  // return;
}


//猎聘 列表查询
export const channelSearchList = async (channelRequestInfo, channelPage = 1, page = 1) => {
  if(!(channelRequestInfo&&channelRequestInfo.channelSearchConditions&&channelRequestInfo.channelSearchConditions.length>0)){
    return;
  }
  let channelSearchCondition = channelRequestInfo.channelSearchConditions.find((item)=>item.channel===channelKey);
  if(!channelSearchCondition&&channelSearchCondition.conditionData){
    return;
  }
  let channelSearchConfig =channelRequestInfo.config.find((item)=>item.channelKey===channelKey);
  channelSearchCondition = JSON.parse(JSON.stringify(channelSearchCondition));
  channelSearchCondition.conditionData.cvSearchConditionInputVo.curPage = (channelPage-1)
  let responseJobListData;
  // console.log("lepin page",channelPage,page)
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData,channelPage);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginLIEPINResultProcessor(responseJobListData)){
    // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.message))
    notify.warning('猎聘数据查询异常！请联系管理员！')
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
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.cvSearchResultForm.totalCount;
  channelSearchConfig.channelCountSize = channelList.length<=0?20:channelList.length;
  channelSearchConfig.dataList = channelList;
  return channelSearchConfig;
}


//猎聘 列表查询
export const channelSearchListSimilar = async (channelRequestInfo, channelPage = 1, page = 1) => {
  if(!(channelRequestInfo&&channelRequestInfo.channelSearchConditions&&channelRequestInfo.channelSearchConditions.length>0)){
    return;
  }
  let channelSearchCondition = channelRequestInfo.channelSearchConditions.find((item)=>item.channel===channelKey);
  if(!channelSearchCondition&&channelSearchCondition.conditionData){
    return;
  }
  let channelSearchConfig ={};
  channelSearchCondition = JSON.parse(JSON.stringify(channelSearchCondition));
  channelSearchCondition.conditionData.cvSearchConditionInputVo.curPage = (channelPage-1)
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData,channelPage);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginLIEPINResultProcessor(responseJobListData)){
    // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.message))
    notify.warning('猎聘数据查询异常！请联系管理员！')
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
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.cvSearchResultForm.totalCount;
  channelSearchConfig.channelCountSize = channelList.length<=0?20:channelList.length;
  channelSearchConfig.dataList = channelList;
  channelSearchConfig.totalPage = Math.ceil(channelSearchConfig.channelDataTotal / channelSearchConfig.channelCountSize);
  return channelSearchConfig;
}




//列表查询
const searchJobList = async (searchConfig,page = 1) => {
  const headers = await getLIEPINHeader(true);
  if(!headers||headers.length===0){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  const requestParams = JSON.parse(JSON.stringify(searchConfig));
  // requestParams.cvSearchConditionInputVo.curPage = page-1;
  // console.log("requestParams",requestParams,page)
  requestParams.cvSearchConditionInputVo = JSON.stringify(searchConfig.cvSearchConditionInputVo);
  //访问猎聘
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = qs.stringify(requestParams);
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.LIEPIN.baseUrl+pluginAllUrls.LIEPIN.getAllJobList;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
  // return;
}

//查询简历详情
export const findLIEPINJobDetail = async (data)=>{
    return await searchResumeInfo(data.queryString);

}

//查询简历详情
export const lIEPINJobDetailFN = async (data)=>{
  return ;
  // if(!await checkUserAuth()){
  //   return;
  // }
  // const requestParams = JSON.parse(data.originalResumeUrlInfo);
  // let geekDetailINfo = null;
  // let jobInfo = null;
  // try {
  //   jobInfo = await searchResumeInfo(requestParams.request);
  //   // jobInfo = {};
  // }catch (e){
  //   console.log(e)
  //   return ;
  // }
  // if(pluginLIEPINResultProcessor(jobInfo)){
  //   geekDetailINfo = jobInfo.responseData.data;
  // }else{
  //   if(jobInfo?.responseData?.data?.code===100311){
  //     return;
  //   }
  // }
  // return geekDetailINfo;
}

//详细信息查询
const searchResumeInfo = async (params) => {
    const headers = await getLIEPINHeader(true);
    if(!headers||headers.length===0){
        //ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
        return;
    }
    const requestParams = {};
    requestParams.pageParamDto = JSON.stringify(params.requestParams);
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

export const checkUserAuth = async ()=>{
    const headers = await getLIEPINHeader(true);
    if(!headers||headers.length===0){
        return false;
    }
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.parameters = null;
    pluginEmptyRequestTemplate.requestHeader = headers;
    pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
    pluginEmptyRequestTemplate.requestPath = pluginAllUrls.LIEPIN.baseUrl+pluginAllUrls.LIEPIN.userConfig;
    let statusData = await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
    const dataRt = pluginLIEPINResultProcessor(statusData);
    if(dataRt){
        const allConfig = statusData.responseData.data.data?.identityPrivilege;
        if(!allConfig){
            return false;
        }
        let findItem = allConfig.find((item)=>item.operation==='b_view_res');
        if(!findItem){
            return false;
        }
        const privilegeCount = findItem.privilegeCount;
        const usedCount = findItem.usedCount;
      console.log("score:",privilegeCount,usedCount)
        if(usedCount<privilegeCount){
            return true;
        }else{
            return false;
        }
    }else{
        return false;
    }
}

export const exeLIEPINJobInfo = async (data) => {
    if(!await checkUserAuth()){
        return;
    }
    let boosJobInfo = await findLIEPINJobDetail(data);
    if(pluginLIEPINResultProcessor(boosJobInfo)){
        data.content = boosJobInfo.responseData.data.data;
        try {
            await saveResumeDetail(data);
        }catch (e){
            // ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
          console.log(e)
        }

    }

}


//异步任务查询
export const exeQueueJobInfo = async (data) => {
  try {
    let jobInfo = await lIEPINJobDetailFN(data.resume);
    if(jobInfo){
      data.content = jobInfo;
      try {
        await saveResumeDetailPlus(data);
      }catch (e){
        console.log(e)
      }
    }else{
      const allChannelData = store.getters.getChannelConfByAll;
      data.resume.score = -2;
      allChannelData.cardInfoRef.updateResumeScoreFN(data.resume);
    }
  } catch (error) {
    console.error('处理猎聘直聘简历任务失败:', error);
  }
}
