
//插件结果处理器
export const pluginResultProcessorNoData = (responseData)=>{
    return responseData&&responseData.success===true&&responseData.responseData.success===true;
}
//插件结果处理器
export const pluginResultProcessor = (responseData)=>{
    return pluginResultProcessorNoData(responseData)&&responseData.responseData.data;
}

//api 监听结果处理起
export const apiListenerProcessor = (responseData)=>{
    return pluginResultProcessor(responseData)&&responseData.responseData.success===true&&responseData.responseData.data.success===true&&responseData.responseData.data.status===200;
}

export const getListenerProcessorData = (responseData)=>{
    return responseData.responseData.data.response;
}

export const getListenerProcessorALlDataAndConfig = (responseData)=>{
    return responseData.responseData;
}


export const pluginBossResultProcessor = (responseData)=>{
    return pluginResultProcessor(responseData)&&responseData.responseData.data.message&&responseData.responseData.data.message==='Success';
}

export const pluginZhiLianResultProcessor = (responseData)=>{
    return pluginResultProcessor(responseData)&&responseData.responseData.data.code&&responseData.responseData.data.code===200;
}

export const pluginLIEPINResultProcessor = (responseData)=>{
    return pluginResultProcessor(responseData)&&responseData.responseData.data.flag!==undefined&&responseData.responseData.data.flag===1;
}

export const pluginJob51ResultProcessor = (responseData)=>{
    return pluginResultProcessor(responseData)&&responseData.responseData.data.code!==undefined&&responseData.responseData.data.code==='200';
}
