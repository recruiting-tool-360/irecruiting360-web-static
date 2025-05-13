//请求
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "src/pluginSrc/config/PluginRequestManager";
import {saveResumeDetail, saveResumeDetailPlus} from "src/api/jobList/JobListApi";
import {pluginJob51ResultProcessor, pluginResultProcessor} from "src/pluginSrc/verifyes/PluginProcessor";
import CryptoJS from "crypto-js";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import notify from "src/util/notify";
import store from 'src/store';


const channelKey = "JOB51";
//51 请求头信息
export const getJob51HeaderInfo = async (flag) => {
    let headers = {};
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.JOB51RequestStorageKey;
    let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    if(pluginResultProcessor(boosRequestHeader)){
        const httpHeader = boosRequestHeader.responseData.data.headersData;
        if(httpHeader){
            headers= httpHeader;
            headers["Content-Type"]="application/json";
            headers["Traceparent"]=getTrace();
        }
    }else{
        if(flag){
            // ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
          notify.error(`系统无法监测到前程无忧网站认证信息！如果问题还没解决请联系管理员！`)
        }
        throw new Error("request error");
    }
    //认证信息
    let pluginCookieBaseConfigEmpty = getPluginBaseConfigEmptyDTO();
    pluginCookieBaseConfigEmpty.parameters =pluginKeys.JOB51CookieStorageKey;
    let responseCookieData = await i360Request(pluginCookieBaseConfigEmpty.action,pluginCookieBaseConfigEmpty);
    if(pluginResultProcessor(responseCookieData)){
        const httpHeader = responseCookieData.responseData.data.cookieData;
        if(httpHeader){
            headers= Object.assign(headers,{Cookie:httpHeader})
        }else{
            if(flag){
                // ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
              notify.error(`系统无法监测到前程无忧网站认证信息！如果问题还没解决请联系管理员！`)
            }
            throw new Error("request error");
        }
    }else{
        if(flag){
            // ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
          notify.error(`系统无法监测到前程无忧网站认证信息！如果问题还没解决请联系管理员！`)
        }
        throw new Error("request error");
    }
    return headers;
}
//51job 请求头信息
export const getJob51Header = async (flag) => {
    let header = null;
    try {
        header = await getJob51HeaderInfo(flag);
    }catch (e){
        console.log(e);
        header = null;
    }
    return header;
}
//获取51token
export const getJob51TokenInfo = async () => {
    let token =null;
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.JOB51RequestStorageKey;
    let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    if(pluginResultProcessor(boosRequestHeader)){
        const httpHeader = boosRequestHeader.responseData.data.headersData;
        if(httpHeader&&httpHeader['Accesstoken']){
            token = httpHeader['Accesstoken'];
        }
    }
    return token;
}
//获取51Property
export const getJob51PropertyInfo = async () => {
    let PropertyData = null;
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
    pluginBaseConfigEmptyDTO.parameters = pluginKeys.JOB51URLASStorageKey;
    let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    // console.log("getJob51PropertyInfo:",boosRequestHeader)
    if(pluginResultProcessor(boosRequestHeader)){
        const httpHeader = boosRequestHeader.responseData.data.headersData;
        // console.log("51 url header",httpHeader)
        if(httpHeader&&httpHeader['url']){
            let urlData = httpHeader['url'];
            // 解析URL
            const url = new URL(urlData);
            // 获取 property 参数
            const propertyStr = url.searchParams.get('property');
            if(propertyStr){
                PropertyData =propertyStr;
            }
        }
    }
    return PropertyData;
}

//job51 用户登陆状态
export const job51UserStatus = async () => {
  const headers = await getJob51Header(false);
  // console.log("51 headers",headers)
  let job51PropertyInfo = await getJob51PropertyInfo();
  // console.log("51 job51PropertyInfo",job51PropertyInfo)
  if(!headers||headers.length===0||(!job51PropertyInfo)){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  const propertyInfo = JSON.parse(job51PropertyInfo);
  if(!propertyInfo.guid||(!headers['Guid'])||(headers['Guid']!==propertyInfo.guid)){
    return;
  }
  let token =headers['Accesstoken'];
  const requestData ={
    "timestamp": getCurrentTimestamp(),
    "pageUrl": "https://ehire.51job.com/Revision/talent/search",
    "fromPageUrl": "https://ehire.51job.com/Revision/navigate/",
    "webId": "3",
    "userType": "0",
    "property": job51PropertyInfo,
  }
  //获取加密
  let generateSignature = generateSignatureJob51(token,requestData);
  requestData.sign = generateSignature;
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = requestData;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.JOB51.baseUrl+pluginAllUrls.JOB51.job51Authority;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

//51 列表查询
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
  channelSearchCondition.conditionData.page_index = channelPage;
  // console.log("sgaggag:",channelSearchCondition)
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginJob51ResultProcessor(responseJobListData)){
    // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.msg))
    // return;
    const code =responseJobListData?.responseData?.data?.code;
    if(code&&code==='R1000'){
      responseJobListData.responseData.data.data ={list:[],total:0};
    }else{
      // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.msg))
      notify.warning('前程无忧数据查询异常！请联系管理员！')
      return;
    }
  }
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.total;
  channelSearchConfig.channelCountSize = channelSearchCondition.conditionData.page_size;
  channelSearchConfig.dataList = responseJobListData.responseData.data.data.list;
  return channelSearchConfig;
}

//51 列表查询
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
  channelSearchCondition.conditionData.page_index = channelPage;
  // console.log("sgaggag:",channelSearchCondition)
  let responseJobListData;
  try {
    responseJobListData = await searchJobList(channelSearchCondition.conditionData);
  }catch (e){
    console.log(e);
    return;
  }
  if(!pluginJob51ResultProcessor(responseJobListData)){
    // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.msg))
    // return;
    const code =responseJobListData?.responseData?.data?.code;
    if(code&&code==='R1000'){
      responseJobListData.responseData.data.data ={list:[],total:0};
    }else{
      // ElMessage.error(`${channelConfig.value.name}数据查询异常！请联系管理员！`+(responseJobListData?.responseData?.data?.msg))
      notify.warning('前程无忧数据查询异常！请联系管理员！')
      return;
    }
  }
  channelSearchConfig.channelPage = channelPage;
  channelSearchConfig.channelDataTotal = responseJobListData.responseData.data.data.total;
  channelSearchConfig.channelCountSize = channelSearchCondition.conditionData.page_size;
  channelSearchConfig.dataList = responseJobListData.responseData.data.data.list;
  channelSearchConfig.totalPage = Math.ceil(channelSearchConfig.channelDataTotal / channelSearchConfig.channelCountSize);
  return channelSearchConfig;
}





//列表查询
const searchJobList = async (searchConfig) => {
  const headers = await getJob51Header(true);
  let job51PropertyInfo = await getJob51PropertyInfo();
  if(!headers||headers.length===0||(!job51PropertyInfo)){
    // ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
    return;
  }
  const propertyInfo = JSON.parse(job51PropertyInfo);
  if(!propertyInfo.guid||(!headers['Guid'])||(headers['Guid']!==propertyInfo.guid)){
    return;
  }
  searchConfig.property = job51PropertyInfo;
  let token =headers['Accesstoken'];
  searchConfig.timestamp = getCurrentTimestamp();

  //获取加密
  let generateSignature = generateSignatureJob51(token,searchConfig);
  searchConfig.sign = generateSignature;
  // console.log("请求是：",searchConfig)
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = searchConfig;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.JOB51.baseUrl+pluginAllUrls.JOB51.getAllJobList;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

//查询简历详情
export const findJob51JobDetail = async (data)=>{
    return await searchResumeInfo(data.queryString);

}

//查询简历详情
export const job51FindJobDetailFN = async (data)=>{
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
  if(pluginJob51ResultProcessor(jobInfo)){
    geekDetailINfo = jobInfo.responseData.data;
  }
  return geekDetailINfo;
}

//详细信息查询
const searchResumeInfo = async (params) => {
    let requestData = {
        "resume_id": params.userid,
        "job_id": "",
        "request_id": params.requestid,
        "lan": "c",
        "key_word": params.keyWord,
        "resume_recommend_type": "0",
        "source": "",
        "pageUrl": "https://ehire.51job.com/Revision/talent/resume/detail",
        "fromPageUrl": "",
        "timestamp":getCurrentTimestamp(),
        "webId": "3",
        "userType": "0",
    };
    const headers = await getJob51Header(true);
    let job51PropertyInfo = await getJob51PropertyInfo();
    if(!headers||headers.length===0||(!job51PropertyInfo)){
        ElMessage.error(`系统无法监测到${channelConfig.value.name}网站认证信息！如果问题还没解决请联系管理员！`);
        return;
    }
    const propertyInfo = JSON.parse(job51PropertyInfo);
    if(!propertyInfo.guid||(!headers['Guid'])||(headers['Guid']!==propertyInfo.guid)){
        return;
    }
    requestData.property = job51PropertyInfo;
    let token =headers['Accesstoken'];
    requestData.timestamp = getCurrentTimestamp();

    //获取加密
    let generateSignature = generateSignatureJob51(token,requestData);
    requestData.sign = generateSignature;
    //访问51
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.parameters = requestData;
    pluginEmptyRequestTemplate.requestHeader = headers;
    pluginEmptyRequestTemplate.requestType = pluginAllRequestType.POST;
    pluginEmptyRequestTemplate.requestPath = pluginAllUrls.JOB51.baseUrl+pluginAllUrls.JOB51.resumeDetail;
    return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

export const exeJob51Info = async (data) => {
    let jobInfo = await findJob51JobDetail(data);
    if(pluginJob51ResultProcessor(jobInfo)){
        data.content = jobInfo.responseData.data.data;
        try {
            await saveResumeDetail(data);
        }catch (e){
            ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
        }

    }

}


//异步任务查询
export const exeQueueJobInfo = async (data) => {
  try {
    let jobInfo = await job51FindJobDetailFN(data.resume);
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
    console.error('处理前程无忧直聘简历任务失败:', error);
  }
}

function getTrace(){
    return "00-" + generateTraceId() + "-" + generateSpanId() + "-0" + 1;
}

function generateGUID() {
    var e = "";
    try {
        crypto && crypto.randomUUID && (e = crypto.randomUUID())
    } catch (t) {
        console.log("error",t)
    }
    return e || (e = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (function(e) {
            var t = 16 * Math.random() | 0
                , n = "x" == e ? t : 3 & t | 8;
            return n.toString(16)
        }
    ))),
        e
}
function generateSpanId() {
    for (var e = Array(16), t = 0; t < 16; t++)
        e[t] = Math.floor(16 * Math.random()) + 48,
        e[t] >= 58 && (e[t] += 39);
    return String.fromCharCode.apply(null, e)
}

function generateTraceId() {
    var e = (0,
        generateGUID)().replace(/-/g, "");
    return "0" === e[0] && (e = "1" + e.substring(1)),
    "0" === e[16] && (e = e.substring(0, 16) + "1" + e.substring(17)),
        e
}

export function getCurrentTimestamp() {
    // 获取当前时间的 Unix 时间戳（单位为秒）
    const timestamp = Math.floor(Date.now() / 1000);
    return timestamp;
}

//数据加密
export function generateSignatureJob51(accessToken, params, salt = 'sfhVda5dsmZf') {
    // 参数处理函数
    const processParams = (obj) => {
        const sortedKeys = Object.keys(obj).sort();
        let result = '';

        sortedKeys.forEach(key => {
            const value = obj[key];
            if (value !== null && value !== undefined) {
                if (typeof value === 'object') {
                    result += JSON.stringify(value);
                } else if (Array.isArray(value)) {
                    result += value;
                } else if (typeof value === 'string') {
                    result += value.trim();
                } else {
                    result += value;
                }
            }
        });

        return result;
    };

    // MD5加密函数
    const md5 = (text) => {
        return CryptoJS.MD5(text).toString();
    };

    // 1. 处理参数
    const processedParams = processParams(params);

    // 2. 拼接字符串
    const concatenatedString = accessToken + processedParams + salt;

    // 3. 双重MD5加密
    const signature = md5(md5(concatenatedString));

    return signature;
}
