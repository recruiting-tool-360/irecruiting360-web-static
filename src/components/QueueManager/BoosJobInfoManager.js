//请求
import PluginMessenger from "@/api/PluginSendMsg";
import {
    getPluginBaseConfigEmptyDTO,
    getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls,
    pluginKeys
} from "@/components/PluginRequestManager";
import {pluginBossResultProcessor, pluginResultProcessor} from "@/components/verifyes/PluginProcessor";
import {saveResumeDetail} from "@/api/jobList/JobListApi";
import {ElMessage} from "element-plus";

const i360Request= async (action, emptyRequestTemplate, timeout = 5000) => {
    try {
        return await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    } catch (error) {
        console.error('Error:', error.message);
    }
}
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


//查询简历详情
const findJobDetail = async (data)=>{
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
    console.log(boosJobInfo)
    if(pluginBossResultProcessor(boosJobInfo)){
        data.data = boosJobInfo.responseData.data.zpData;
        console.log(data);
        try {
            await saveResumeDetail(data.data);
        }catch (e){
            ElMessage.error('后台服务异常导致系统无法分析本渠道信息！请联系管理员！')
        }

    }

}