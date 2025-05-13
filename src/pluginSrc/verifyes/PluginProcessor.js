
//插件结果处理器
export const pluginResultProcessorNoData = (responseData)=>{
    return responseData&&responseData.success===true&&responseData.responseData.success===true;
}
//插件结果处理器
export const pluginResultProcessor = (responseData)=>{
    return pluginResultProcessorNoData(responseData)&&responseData.responseData.data;
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