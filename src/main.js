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
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'

const app = createApp(App);

//element-plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}

app.use(store).
use(router).
use(ElementPlus).
mount('#app');


