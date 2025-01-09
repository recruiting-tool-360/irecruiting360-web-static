
export const pluginAllRequestType = {
    GET:"GET",
    POST:"POST",
    PUT:"PUT",
    DELETE:"DELETE"
}
//插件所有group
export const pluginAllGroup = {
    Sys:{
        BASE_CONFIG:"BASE_CONFIG",
        UNIVERSAL_REQUEST:"UNIVERSAL_REQUEST"
    }
}
//插件所有action
export const pluginAllActions = {
    Sys:{
        setBaseConfig:"setBaseConfig",
        setCookieConfig:"setCookieConfig",
        getBaseConfig:"getBaseConfig",
        universalRequest:"universalRequest",
        universalRequestRtText:"universalRequestRtText"
    }
}
//插件所有Url配置
export const pluginAllUrls = {
    BOSS:{
        baseUrl:"https://www.zhipin.com",
        getAllJobList:"/wapi/zpitem/web/boss/search/geeks.json",
        checkUserAuth:"/wapi/hunter/h5/hunterManage/checkAuth",
        getGeekInfo:"/wapi/zpitem/web/boss/search/geek/info",
        delCollect:"/wapi/zprelation/userMark/del",
        addCollect:"/wapi/zprelation/userMark/add",
        interactionUrl:"/web/chat/interaction",
        geekDetailUrl:"https://m.zhipin.com/web/frame/recommend/resume"
    },
}
//插件所有key配置
export const pluginKeys = {
    BoosStorageKey:"BoosStorageKey",
    BoosCookieStorageKey:"BoosCookieStorageKey",
}
//插件请求模版
export const getPluginEmptyRequestTemplate = () => {
  return {
      header:[],
      type:"",
      group:pluginAllGroup.Sys.UNIVERSAL_REQUEST,
      action:pluginAllActions.Sys.universalRequest,
      id:"",
      responseData: {
          data:null,
          success:false
      },
      parameters: null,
      requestHeader: null,
      requestPath:null,
      requestType:"POST",
      requestCredentials:"include",
      success:false
  }
}

//插件初始化配置模版
export const getPluginBaseConfig = ()=>{
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.BASE_CONFIG;
    pluginEmptyRequestTemplate.parameters =[{
        url: pluginAllUrls.BOSS.baseUrl,
        headers: ["zp_token"],
        requestFilterType: ["requestHeaders"],
        storageKey: pluginKeys.BoosStorageKey
    }];
    pluginEmptyRequestTemplate.action = pluginAllActions.Sys.setBaseConfig;
    return pluginEmptyRequestTemplate;
}

export const getPluginCookieBaseConfig = ()=>{
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.BASE_CONFIG;
    pluginEmptyRequestTemplate.parameters =[{
        url: pluginAllUrls.BOSS.baseUrl,
        requestFilterType: [],
        cookieStorageKey: pluginKeys.BoosCookieStorageKey
    }];
    pluginEmptyRequestTemplate.action = pluginAllActions.Sys.setCookieConfig;
    return pluginEmptyRequestTemplate;
}

export const getPluginBaseConfigEmptyDTO = ()=>{
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.BASE_CONFIG;
    pluginEmptyRequestTemplate.action = pluginAllActions.Sys.getBaseConfig;
    return pluginEmptyRequestTemplate;
}