<template>
  <q-toolbar>
    <!-- logo -->
    <div class="cursor-pointer" @click="navigateToHomepage">
      <img class="q-mt-none" :src="'/logo/logo.svg'">
    </div>

    <!-- 标题 -->
    <q-toolbar-title class="cursor-pointer" @click="navigateToHomepage">
      <span class="q-ml-sm text-h6">i 快招</span>
    </q-toolbar-title>

    <!--  右侧按钮列表  -->
    <!-- 下载插件 -->
    <q-btn flat round :size="iconSize" icon="extension" @click="togglePluginDownloadDialog">
      <q-tooltip>
        下载插件
      </q-tooltip>
    </q-btn>
    <!-- 操作指南 -->
    <q-btn flat round :size="iconSize" icon="help_outline" @click="navigateToYuQue">
      <q-tooltip>
        操作指南
      </q-tooltip>
    </q-btn>
    <!-- 联系我们 -->
    <q-btn flat round :size="iconSize" icon="support_agent">
      <q-tooltip>联系我们</q-tooltip>
      <q-menu fit anchor="bottom middle" self="top middle" :offset="[0, 10]">
          <q-card>
            <q-avatar size="120px">
              <img class="q-ml-sm" :src="'/index/header/top/vChat.png'" />
            </q-avatar>
          </q-card>
      </q-menu>
    </q-btn>
    <!-- 颜色选择器 -->
    <q-btn flat round :size="iconSize" icon="palette">
      <q-tooltip>主题颜色</q-tooltip>
      <q-menu :offset="[0, 10]">
        <q-color @change="updateThemeColor" />
        <div class="q-pa-sm flex justify-center">
          <q-btn flat label="还原默认颜色" style="color:#1F7CFFFF" @click="resetThemeColor" />
        </div>
      </q-menu>
    </q-btn>
    <!-- 用户信息 -->
    <q-btn flat round :size="iconSize" icon="account_circle">
      <q-tooltip>用户信息</q-tooltip>
      <q-menu fit anchor="bottom middle" self="top middle" :offset="[0, 10]">
        <q-card class="q-pa-none" style="min-width: 160px">
          <q-btn
            flat
            size="md"
            class="text-primary full-width"
            icon="logout"
            label="退出登录"
            @click="logout"
          />
          <q-separator />
          <div class="row items-center no-wrap bg-primary q-pa-md">
            <q-avatar size="32px" color="white" text-color="primary">
              {{ userInfo?.username?.charAt(0)?.toUpperCase() || '?' }}
            </q-avatar>
            <div class="q-ml-md text-center">
              <div class="text-weight-bold text-grey-11">{{ userInfo?.username || '未登录' }}</div>
              <div class="text-grey-11 text-center">{{ userInfo?.role || '普通用户' }}</div>
            </div>
          </div>
        </q-card>
      </q-menu>
    </q-btn>

    <!-- 插件下载对话框 -->
    <plugin-download-dialog />
  </q-toolbar>
</template>
<script setup>
import {computed, onMounted, ref} from 'vue'
  // 引入Quasar提供的颜色API
import { colors } from 'quasar'
    // 需要从useQuasar引入$q对象
import { useQuasar } from 'quasar'
import {useStore} from "vuex";
import Cookies from "js-cookie";
import {userlogout} from "src/api/user/UserApi";
import notify from "src/util/notify";
import PluginDownloadDialog from 'src/components/plugins/PluginDownloadDialog.vue';

const store = useStore();

// 引入Quasar提供的颜色API
const $q = useQuasar()
// 图标大小
const iconSize = ref("12px")
//获取主题色
const userBaseColor = ref(store.getters.getUserColor);
//用户信息
const userInfo = computed(() => store.getters.getUserInfo)
// 控制插件下载对话框显示
const togglePluginDownloadDialog = () => {
  store.commit('togglePluginDownloadDialog');
};

// 跳转到语雀操作指南
const navigateToYuQue = () => {
  const url = "https://ihr360.yuque.com/ihr360/tla84c/pb6p7077n9y6bngn";
  window.open(url, '_blank');
}

// 跳转到官网首页
const navigateToHomepage = () => {
  const url = "https://ihire365.com/";
  window.open(url, '_blank');
}

// 更新主题色
const updateThemeColor = (color) => {
  store.commit('setUserColor', color)
  document.documentElement.style.setProperty('--q-primary', color)
  // 将HEX转换为RGB并更新CSS变量
  const rgb = hexToRgb(color);
  if (rgb) {
    document.documentElement.style.setProperty(
      '--q-primary-rgb',
      `${rgb.r}, ${rgb.g}, ${rgb.b}`
    );
  }
}
// 还原默认颜色
const resetThemeColor = () => {
  updateThemeColor('#1F7CFFFF')
}

const logout = async () => {
  try {
    await userlogout();
    Cookies.remove('satoken', {path: '/'});
    store.commit('changeUserInfo', null);
    // store.commit('clearSearchConditionId');
    notify.success('退出登录成功');
    window.location.href = '/login';
  } catch (e) {
    console.log(e);
    notify.error('退出登录失败，请重试');
  }
}

//页面设置主题颜色
onMounted(() => {
  updateThemeColor(userBaseColor.value)
})

// HEX转RGB辅助函数
function hexToRgb(hex) {
  // 去除可能的#前缀和透明度部分
  hex = hex.replace(/^#/, '').substring(0, 6);

  // 处理缩写形式 (#RGB)
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }

  // 普通形式 (#RRGGBB)
  const bigint = parseInt(hex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

</script>

<style scoped>

</style>
