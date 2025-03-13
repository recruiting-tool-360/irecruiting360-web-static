import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'

//全局css
import '@/assets/scss/index.scss'
//ali icons
import '@/assets/icons/iconfont.css';
import 'highlight.js/styles/github.css';

//element plus
import ElementPlus from 'element-plus'
import { ElMessage } from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import PluginMessenger from "@/api/PluginSendMsg";
import {
    getPluginBaseConfig,
    getPluginCookieBaseConfig,
    getPluginDynamicRulesConfigFn
} from "@/components/PluginRequestManager";
import zhCn from 'element-plus/es/locale/lang/zh-cn';

const handlePluginSwitchChange = (payload) => {
    // console.log("chajian:",payload)
    store.commit('changePluginSwitch',payload);
};

const app = createApp(App);

//element-plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}
const pluginRequest= async (action,emptyRequestTemplate, timeout = 1000) => {
    try {
        const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
        handlePluginSwitchChange(true)
        return response;
    } catch (error) {
        // ElMessage.error('系统监测到【i快找】浏览器插件异常，请及时安装最新插件！如果问题还没解决请联系管理员！')
        console.error('Error:', error.message);
        handlePluginSwitchChange(false)
    }
}

const initializePluginConfig = async () => {
    let pluginBaseConfig = getPluginBaseConfig();
    let pluginCookieBaseConfig = getPluginCookieBaseConfig();
    // let pluginDynamicRulesConfig = getPluginDynamicRulesConfigFn();
    let pluginConfigRs = await pluginRequest(pluginBaseConfig.action, pluginBaseConfig);
    let pluginCookieConfigRs = await pluginRequest(pluginCookieBaseConfig.action,pluginCookieBaseConfig);
    // let pluginDynamicRulesConfigRs = await pluginRequest(pluginDynamicRulesConfig.action,pluginDynamicRulesConfig);
}


app.use(store).
use(router).
use(ElementPlus, { locale: zhCn }).
mount('#app');

window.addEventListener('load', () => {
    // 在页面加载后再添加监听器
    initializePluginConfig();
});

// async function periodicFetch() {
//     try {
//         await store.dispatch("fetchAndUpdateScore"); // 执行任务
//     } catch (error) {
//         console.error("Fetch failed:", error); // 记录错误
//     }
//     setTimeout(periodicFetch, 10000); // 再次设置定时器
// }
// periodicFetch(); // 启动任务

