//请求
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "src/pluginSrc/config/PluginRequestManager";
import {
    pluginResultProcessor,
    pluginZhiLianResultProcessor
} from "src/pluginSrc/verifyes/PluginProcessor";
import {saveResumeDetail, saveResumeDetailPlus} from "src/api/jobList/JobListApi";
import {getCookieValue} from "src/util/StringUtil";
import qs from "qs";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import notify from "src/util/notify";
import store from "src/store";

const channelKey = "ZHILIAN";
//获取智联page request id
export const getZhiLianPageRequestId = async () => {
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.ZHILIANResponseStorageKey;
    let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    if (pluginResultProcessor(boosRequestHeader)) {
        const httpHeader = boosRequestHeader.responseData.data.headersData;
        if(httpHeader){
            return httpHeader;
        }else{
            return null;
        }
    } else {
        if (flag) {
            ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
        }
        throw new Error("request error");
    }
}
//智联 请求头信息
export const getZhiLianHeaderInfo = async (flag) => {
    let headers = {};
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.ZHILIANRequestStorageKey;
    let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    if(pluginResultProcessor(boosRequestHeader)){
        const httpHeader = boosRequestHeader.responseData.data.headersData;
        if(httpHeader){
            headers= httpHeader;
        }
    }else{
        if(flag){
            ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
        }
        throw new Error("request error");
    }
    //认证信息
    let pluginCookieBaseConfigEmpty = getPluginBaseConfigEmptyDTO();
    pluginCookieBaseConfigEmpty.parameters =pluginKeys.ZHILIANCookieStorageKey;
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
//智联 请求头信息
export const getZhiLianHeader = async (flag) => {
    let header = null;
    try {
        header = await getZhiLianHeaderInfo(flag);
    }catch (e){
        console.log(e);
        header = null;
    }
    return header;
}

//智联 获取统一url参数
export const getZhiLianUniversalParams = async (zhiLianPageRequestId,xZpClientId) => {
    return {
        "_": new Date().getTime(),
        "x-zp-page-request-id": zhiLianPageRequestId['X-zp-page-request-id'],
        "x-zp-client-id": xZpClientId
    };
}


//智联 用户登陆状态
export const zhiLianUserStatus = async () => {
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

//智联列表查询
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
  channelSearchCondition.conditionData.pageNo = channelPage;
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginZhiLianResultProcessor(responseJobListData)){
    // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.message))
    notify.warning('智联数据查询异常！请联系管理员！'+(responseJobListData?.responseData?.data?.message))
    return;
  }
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.total;
  channelSearchConfig.channelCountSize = channelSearchCondition.conditionData.pageSize;
  channelSearchConfig.dataList = responseJobListData.responseData.data.data.list;
  return channelSearchConfig;
}

//智联列表查询
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
  channelSearchCondition.conditionData.pageNo = channelPage;
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginZhiLianResultProcessor(responseJobListData)){
    // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.message))
    notify.warning('智联数据查询异常！请联系管理员！'+(responseJobListData?.responseData?.data?.message))
    return;
  }
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.total;
  channelSearchConfig.channelCountSize = channelSearchCondition.conditionData.pageSize;
  channelSearchConfig.dataList = responseJobListData.responseData.data.data.list;
  channelSearchConfig.totalPage = Math.ceil(channelSearchConfig.channelDataTotal / channelSearchConfig.channelCountSize);
  return channelSearchConfig;
}

//列表查询
const searchJobList = async (searchConfig, channelPage = 1) => {
  const headers = await getZhiLianHeader(true);
  if(!headers||headers.length===0){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  let xZpClientId = getCookieValue("x-zp-client-id",headers['Cookie']);
  let zhiLianPageRequestId = await getZhiLianPageRequestId();
  if(!(xZpClientId)||!(zhiLianPageRequestId)||!(zhiLianPageRequestId['X-zp-page-request-id'])){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return null;
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



//查询简历详情
export const findZhiLianJobDetail = async (data)=>{
    return await searchResumeInfo(data.queryString);

}

//查询简历详情
export const zhiLianFindJobDetail = async (data)=>{
  // console.log("zhilian参数2：",data)
  const requestParams = JSON.parse(data.originalResumeUrlInfo);
  let geekDetailINfo = null;
  let jobInfo = null;
  try {
    jobInfo = await searchResumeInfo(requestParams.request);
    // jobInfo = {};
  }catch (e){
    console.log(e)
    return ;
  }
  console.log("zhilian参数3",jobInfo)
  if(pluginZhiLianResultProcessor(jobInfo)){
    geekDetailINfo = jobInfo.responseData.data;
  }else{
    if(jobInfo?.responseData?.data?.code===100311){
      return;
    }
  }
  return geekDetailINfo;
}

//详细信息查询
const searchResumeInfo = async (requestParam) => {
  console.log("zhilian参数：",requestParam)
    const headers = await getZhiLianHeader(true);
    if(!headers||headers.length===0){
        //ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
        return;
    }
    let xZpClientId = getCookieValue("x-zp-client-id",headers['Cookie']);
    let zhiLianPageRequestId = await getZhiLianPageRequestId();
    if(!(xZpClientId)||!(zhiLianPageRequestId)||!(zhiLianPageRequestId['X-zp-page-request-id'])){
        //ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
        return;
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

export const exeZhiLianJobInfo = async (data) => {
    let boosJobInfo = await findZhiLianJobDetail(data);
    if(pluginZhiLianResultProcessor(boosJobInfo)){
        data.content = boosJobInfo.responseData.data;
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
    let jobInfo = await zhiLianFindJobDetail(data.resume);
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
    console.error('处理智联直聘简历任务失败:', error);
  }
}
