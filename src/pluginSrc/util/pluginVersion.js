//请求
import {
    getPluginEmptyRequestTemplate, pluginAllGroup
} from "src/pluginSrc/config/PluginRequestManager";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import {pluginResultProcessor} from "src/pluginSrc/verifyes/PluginProcessor";
import {forceUpdateConfig} from "src/api/user/UserApi";


//获取插件版本
export const getPluginVersion = async ()=>{
    //请求头信息
    let pluginBaseConfigEmptyDTO = getPluginEmptyRequestTemplate();
    pluginBaseConfigEmptyDTO.group = pluginAllGroup.Sys.GET_PLUGIN_VERSION;
    let responseData = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
    if(pluginResultProcessor(responseData)){
        return responseData.responseData.data;
    }else{
        return null;
    }
}

//判断是否需要强制更新
export const needForceUpdate = async ()=>{
    let pluginVersion = await getPluginVersion();
    let axiosResponse = await forceUpdateConfig();
    console.log(axiosResponse)
    return true;
}