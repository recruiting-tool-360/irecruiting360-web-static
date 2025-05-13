import PluginMessenger from "src/pluginSrc/util/PluginSendMsg";

export const pluginRequest= async (action,emptyRequestTemplate, timeout = 1000) => {
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    return response;
  } catch (error) {
    // ElMessage.error('系统监测到【i快找】浏览器插件异常，请及时安装最新插件！如果问题还没解决请联系管理员！')
    console.error('Error:', error.message);
  }
}
