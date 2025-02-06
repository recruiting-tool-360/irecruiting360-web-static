
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
        UNIVERSAL_REQUEST:"UNIVERSAL_REQUEST",
        UNIVERSAL_REQUEST_BACKGROUND_MAIN:"UNIVERSAL_REQUEST_BACKGROUND_MAIN"
    }
}
//插件所有group
export const headerTypes = {
    REQUEST:"REQUEST",
    RESPONSE:"RESPONSE"
}
//插件所有action
export const pluginAllActions = {
    Sys:{
        setBaseConfig:"setBaseConfig",
        setCookieConfig:"setCookieConfig",
        setDynamicRulesConfig:"setDynamicRulesConfig",
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
    ZHILIAN:{
        baseUrl:"https://rd6.zhaopin.com",
        userStatus:"/api/weChat/getAcction/status",
        getAllJobList:"/api/talent/search/list",
        geekDetailUrl:"/resume/detail",
        resumeDetail:"/api/resume/detail"
    },
    LIEPIN:{
        loginURL:"https://lpt.liepin.com",
        baseUrl:"https://api-lpt.liepin.com",
        userStatus:"/api/com.liepin.tiangong.usere.bpc.get-current-info",
        getAllJobList:"/api/com.liepin.searchfront4r.b.search",
        geekInfo:"/api/com.liepin.rresume.usere.pc.get-resume-detail",
    }
}
//插件所有key配置
export const pluginKeys = {
    BoosStorageKey:"BoosStorageKey",
    BoosCookieStorageKey:"BoosCookieStorageKey",
    ZHILIANRequestStorageKey:"ZHILIANRequestStorageKey",
    ZHILIANResponseStorageKey:"ZHILIANResponseStorageKey",
    ZHILIANCookieStorageKey:"ZHILIANCookieStorageKey",
    LIEPINRequestStorageKey:"LIEPINRequestStorageKey",
    LIEPINCookieStorageKey:"LIEPINCookieStorageKey",
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
      tabUrl:null,
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
        type:headerTypes.REQUEST,
        url: pluginAllUrls.BOSS.baseUrl,
        headers: ["zp_token"],
        requestFilterType: ["requestHeaders"],
        storageKey: pluginKeys.BoosStorageKey
    },{
        type:headerTypes.REQUEST,
        url: pluginAllUrls.ZHILIAN.baseUrl,
        headers: ["X-Zp-Ai-Token","X-Zp-Page-Code","Y-Zp-Business-Type"],
        requestFilterType: ["requestHeaders", "blocking", "extraHeaders"],
        storageKey: pluginKeys.ZHILIANRequestStorageKey
    },{
        type: headerTypes.RESPONSE,
        url: pluginAllUrls.ZHILIAN.baseUrl,
        responseHeaders: ["X-zp-page-request-id"],
        responseFilterType: ['blocking', 'responseHeaders'],
        storageKey: pluginKeys.ZHILIANResponseStorageKey
    },{
        type:headerTypes.REQUEST,
        url: pluginAllUrls.LIEPIN.baseUrl,
        headers: ["X-Fscp-Bi-Stat","X-Fscp-Std-Info","X-Xsrf-Token"],
        requestFilterType: ["requestHeaders"],
        storageKey: pluginKeys.LIEPINRequestStorageKey
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
    },
    {
        url: pluginAllUrls.ZHILIAN.baseUrl,
        requestFilterType: [],
        cookieStorageKey: pluginKeys.ZHILIANCookieStorageKey
    },
    {
        url: pluginAllUrls.LIEPIN.baseUrl,
        requestFilterType: [],
        cookieStorageKey: pluginKeys.LIEPINCookieStorageKey
    }];
    pluginEmptyRequestTemplate.action = pluginAllActions.Sys.setCookieConfig;
    return pluginEmptyRequestTemplate;
}

export const getPluginDynamicRulesConfigFn = () => {
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.BASE_CONFIG;
    pluginEmptyRequestTemplate.parameters =[
        {
            id: 1,
            priority: 1,
            action: {
                type: "modifyHeaders",
                requestHeaders: [
                    {
                        header: "Origin",
                        operation: "set",
                        value: pluginAllUrls.ZHILIAN.baseUrl
                    }
                ]
            },
            condition: {
                urlFilter: pluginAllUrls.ZHILIAN.baseUrl+"/*",
                resourceTypes: ["xmlhttprequest"]
            }
        }
    ];
    pluginEmptyRequestTemplate.action = pluginAllActions.Sys.setDynamicRulesConfig;
    return pluginEmptyRequestTemplate;
}

export const getPluginBaseConfigEmptyDTO = ()=>{
    let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
    pluginEmptyRequestTemplate.group = pluginAllGroup.Sys.BASE_CONFIG;
    pluginEmptyRequestTemplate.action = pluginAllActions.Sys.getBaseConfig;
    return pluginEmptyRequestTemplate;
}