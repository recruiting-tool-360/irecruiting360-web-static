//请求
import PluginMessenger from "@/api/PluginSendMsg";
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "@/components/PluginRequestManager";
import {
    pluginBossResultProcessor,
    pluginResultProcessor,
    pluginZhiLianResultProcessor
} from "@/components/verifyes/PluginProcessor";
import {saveResumeDetail} from "@/api/jobList/JobListApi";
import {ElMessage} from "element-plus";
import {getCookieValue} from "@/util/StringUtil";
import qs from "qs";

const i360Request= async (action, emptyRequestTemplate, timeout = 5000) => {
    try {
        return await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    } catch (error) {
        console.error('Error:', error.message);
    }
}
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


//查询简历详情
export const findZhiLianJobDetail = async (data)=>{
    return await searchResumeInfo(data.queryString);

}

//详细信息查询
const searchResumeInfo = async (requestParam) => {
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
            ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
        }

    }

}