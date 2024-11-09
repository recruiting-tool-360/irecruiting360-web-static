import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'

//全局css
import '@/assets/scss/index.scss'
//ali icons
import '@/assets/icons/iconfont.css';

//element plus
import ElementPlus from 'element-plus'
import { ElMessage } from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import PluginMessenger from "@/api/PluginSendMsg";
import {getPluginBaseConfig, getPluginCookieBaseConfig} from "@/components/PluginRequestManager";

const app = createApp(App);

//element-plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}
const pluginRequest= async (action,emptyRequestTemplate, timeout = 3000) => {
    try {
        const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
        return response;
    } catch (error) {
        ElMessage.error('系统监测到【i快找】浏览器插件异常，请及时安装最新插件！如果问题还没解决请联系管理员！')
        console.error('Error:', error.message);
    }
}

const initializePluginConfig = async () => {
    let pluginBaseConfig = getPluginBaseConfig();
    let pluginCookieBaseConfig = getPluginCookieBaseConfig();
    let pluginConfigRs = await pluginRequest(pluginBaseConfig.action, pluginBaseConfig);
    let pluginCookieConfigRs = await pluginRequest(pluginCookieBaseConfig.action,pluginCookieBaseConfig);
}


app.use(store).
use(router).
use(ElementPlus).
mount('#app');

window.addEventListener('load', () => {
    // 在页面加载后再添加监听器
    initializePluginConfig();
});




