
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