//请求
import PluginMessenger from "@/api/PluginSendMsg";
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllGroup, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "@/components/PluginRequestManager";
import {
    pluginLIEPINResultProcessor,
    pluginResultProcessor
} from "@/components/verifyes/PluginProcessor";
import {saveResumeDetail} from "@/api/jobList/JobListApi";
import {ElMessage} from "element-plus";
import { v4 as uuidv4 } from 'uuid';
import qs from "qs";

const i360Request= async (action, emptyRequestTemplate, timeout = 5000) => {
    try {
        return await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    } catch (error) {
        console.error('Error:', error.message);
    }
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
            headers["X-Fscp-Version"]="1.1";
            headers["X-Requested-With"]="XMLHttpRequest";
            headers["X-Client-Type"]="web";
            headers["Content-Type"]="application/x-www-form-urlencoded";
            httpHeader["X-Fscp-Fe-Version"]="";
            headers["X-Fscp-Trace-Id"]=uuidv4();
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


//查询简历详情
export const findLIEPINJobDetail = async (data)=>{
    return await searchResumeInfo(data.queryString);

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

export const exeLIEPINJobInfo = async (data) => {
    console.log("开始执行")
    let boosJobInfo = await findLIEPINJobDetail(data);
    if(pluginLIEPINResultProcessor(boosJobInfo)){
        data.content = boosJobInfo.responseData.data.data;
        try {
            await saveResumeDetail(data);
        }catch (e){
            ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
        }

    }

}