//请求
import {
    getPluginEmptyRequestTemplate, pluginAllGroup
} from "src/pluginSrc/config/PluginRequestManager";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import {pluginResultProcessor} from "src/pluginSrc/verifyes/PluginProcessor";
import {forceUpdateConfig} from "src/api/user/UserApi";
import semver from 'semver';


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
    let response = {
        localVersion:"",
        remoteVersion:"",
        flag:false
    }
    try {
        let localVersion = await getPluginVersion();
        let {data} = await forceUpdateConfig();
        if(data&&data.version){
            let remoteVersion = data.version.replace("v","");
            // remoteVersion = "1.0.9";

            response.localVersion = localVersion;
            response.remoteVersion = remoteVersion;
            if (semver.gte(localVersion, remoteVersion)) {
                console.log("本地版本更高或相等，无需更新","本地版本：",localVersion,"数据库版本",remoteVersion);
                response.flag = false;
            } else {
                console.log("需要更新插件","本地版本：",localVersion,"数据库版本",remoteVersion);
                if(data.forceUpdate){
                    response.flag = true;
                }
            }
        }
    }catch (e){
        response.flag = false;
        console.error(e);
    }
    return response;
}