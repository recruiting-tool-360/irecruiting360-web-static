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
import IframeMessenger from '@/util/iframeMessenger';

// 初始化 IframeMessenger
const iframeMessenger = new IframeMessenger({
    targetWindow: window.parent,
    targetOrigin: [
        'http://192.168.50.225:3000',
        'http://192.168.0.102:3000',
        'https://ambulance1a.ihr360.com', // ihr环境
    ],
    sourceName: 'kuaizhao'
});

// 连接
iframeMessenger.connect();

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

app.config.globalProperties.$iframeMessenger = iframeMessenger;
app.use(store).
use(router).
use(ElementPlus, { locale: zhCn }).
mount('#app');

window.addEventListener('load', () => {
    // 在页面加载后再添加监听器
    initializePluginConfig();
});

// 在页面卸载前执行清理操作
window.addEventListener('beforeunload', () => {
    // 断开 iframe 通信
    iframeMessenger.destroy();
    
    // 清理其他资源和监听器
    app.unmount();
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

// window.addEventListener('message', (event) => {
//     console.log("iframe",event)
//     if (event.origin !== 'http://192.168.50.225:3000') return;
//
//     const data = event.data;
//
//     if (data.type === 'login') {
//         const token = data.token;
//         console.log('收到来自 A 的 token：', token);
//
//         // 模拟存储 token（真实场景可能存 localStorage / cookie）
//         window.token = token;
//
//         // 向 A 回复
//         event.source.postMessage({
//             type: 'loginResult',
//             message: '登录信息已接收！'
//         }, event.origin);
//     }
// });