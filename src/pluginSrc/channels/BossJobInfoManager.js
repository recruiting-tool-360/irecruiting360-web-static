//请求
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "src/pluginSrc/config/PluginRequestManager";
import {pluginBossResultProcessor, pluginResultProcessor} from "src/pluginSrc/verifyes/PluginProcessor";
import {saveResumeDetail, saveResumeDetailPlus} from "src/api/jobList/JobListApi";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import qs from "qs";
import notify from "src/util/notify";
import store from 'src/store';

const channelKey = "BOSS";

//boos 请求头信息
const getBoosHeaderInfo = async (flag) => {
    let headers = {};
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.BoosStorageKey;
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
    pluginCookieBaseConfigEmpty.parameters =pluginKeys.BoosCookieStorageKey;
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
//boos 请求头信息
export const getBoosHeader = async (flag) => {
    let header = null;
    try {
        header = await getBoosHeaderInfo(flag);
    }catch (e){
        console.log(e);
        header = null;
    }
    return header;
}

//boss 用户登陆状态
export const bossUserStatus = async () => {
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

//boss列表查询
export const channelSearchList = async (channelRequestInfo, channelPage = 1, page = 1) => {
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
    notify.warning('Boos数据查询异常！请联系管理员！'+(responseJobListData?.responseData?.data?.message))
    return;
  }
  channelSearchConfig.channelPage = responseJobListData.responseData.data.zpData.page;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.zpData.totalCount;
  channelSearchConfig.channelCountSize = 15;
  channelSearchConfig.dataList = responseJobListData.responseData.data.zpData.geeks;
  return channelSearchConfig;
}


//boss列表查询
export const channelSearchListSimilar = async (channelRequestInfo, channelPage = 1, page = 1) => {
  if(!(channelRequestInfo&&channelRequestInfo.channelSearchConditions&&channelRequestInfo.channelSearchConditions.length>0)){
    return;
  }
  let channelSearchCondition = channelRequestInfo.channelSearchConditions.find((item)=>item.channel===channelKey);
  if(!channelSearchCondition&&channelSearchCondition.conditionData){
    return;
  }
  let channelSearchConfig ={};
  let responseJobListData;
  try {
    responseJobListData = await boosJobList(channelSearchCondition.conditionData,channelPage);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginBossResultProcessor(responseJobListData)){
    notify.warning('Boos数据查询异常！请联系管理员！'+(responseJobListData?.responseData?.data?.message))
    return;
  }
  channelSearchConfig.channelPage = responseJobListData.responseData.data.zpData.page;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.zpData.totalCount;
  channelSearchConfig.channelCountSize = 15;
  channelSearchConfig.dataList = responseJobListData.responseData.data.zpData.geeks;
  channelSearchConfig.totalPage = Math.ceil(channelSearchConfig.channelDataTotal / channelSearchConfig.channelCountSize);
  return channelSearchConfig;
}

//boss列表查询
const boosJobList = async (searchConfig, channelPage = 1) => {
  const headers = await getBoosHeader(true);
  if(!headers){
    // ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
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


//收藏人才
export const runCollect = async (geekDetailINfo) => {
  let bossCollect = null;
  const headers = await getBoosHeader();
  const requestData = {
    markType: 6,
    encryptMarkId: geekDetailINfo.encryptGeekId,
    securityId: geekDetailINfo.securityId
  };
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  //取消收藏先关闭
  // pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl + pluginAllUrls.BOSS.delCollect + "?" + qs.stringify(requestData);
  // let deleteCollect = await i360Request(pluginEmptyRequestTemplate.action, pluginEmptyRequestTemplate);
  // if(!pluginBossResultProcessor(deleteCollect)){
  //   ElMessage.error('系统异常，请联系管理员！');
  //   return null;
  // }
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl + pluginAllUrls.BOSS.addCollect + "?" + qs.stringify(requestData);
  try {
    bossCollect = await i360Request(pluginEmptyRequestTemplate.action, pluginEmptyRequestTemplate);
  }catch (e){
    console.log(e)
  }
  if(pluginBossResultProcessor(bossCollect)){
    return bossCollect;
  }else{
    return null;
  }
}

//查询简历详情
export const bossFindJobDetail = async (data)=>{
  let geekDetailINfo = null;
  const requestParams = JSON.parse(data.originalResumeUrlInfo);
  //构造参数
  const queryString = `securityId=${requestParams.request.securityId}&segs=${requestParams.request.lidTag}&lid=${requestParams.request.lid}`;
  let boosJobInfo = null;
  try {
    boosJobInfo = await findJobDetail({queryString});
  }catch (e){
    console.log(e)
    return;
  }
  if(pluginBossResultProcessor(boosJobInfo)) {
    geekDetailINfo = boosJobInfo.responseData.data.zpData;
    geekDetailINfo.newLid = requestParams.request.lid;
  }
  return geekDetailINfo;
}

//查询简历详情
export const findJobDetail = async (data)=>{
    const headers = await getBoosHeader();
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.parameters = null;
    pluginEmptyRequestTemplate.requestHeader = headers;
    pluginEmptyRequestTemplate.requestType = pluginAllRequestType.GET;
    pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl+pluginAllUrls.BOSS.getGeekInfo+"?"+data.queryString;
    return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

export const exeJobInfo = async (data) => {
    let boosJobInfo = await findJobDetail(data);
    if(pluginBossResultProcessor(boosJobInfo)){
        data.content = boosJobInfo.responseData.data.zpData;
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
    let jobInfo = await bossFindJobDetail(data.resume);
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
    console.error('处理BOSS直聘简历任务失败:', error);
  }
}
