<template>
  <q-layout view="HHH LpR lfr">

    <q-header elevated class="bg-primary text-white" :class="!visibleThirdSwitchPlus?'layout-header':'layout-headerA'" ref="headerRef">
      <Header></Header>
    </q-header>

    <q-drawer show-if-above :v-model="false" side="left" bordered :behavior="'desktop'" :overlay="false" :breakpoint="0" :width="280">
      <LeftMenu></LeftMenu>
    </q-drawer>
<!--    <LeftMenu style="width: 280px"></LeftMenu>-->

    <q-page-container style="background-color: #fbfbfb;">
      <router-view />
    </q-page-container>
    <!-- 无UI的SSE管理组件 -->
    <SseManager ref="sseManagerRef"></SseManager>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, provide, getCurrentInstance } from 'vue'
import Header from "layouts/header/Header.vue";
import SseManager from "components/sse/SseManager.vue";
import {useStore} from "vuex";
import LeftMenu from "layouts/menu/LeftMenu.vue";
import { useUpdateResumeStatus } from "src/hooks/useUpdateResumeStatus";
import { importResumeCallback } from "src/api/jobList/JobListApi";
const store = useStore();

const { proxy } = getCurrentInstance();
const iframeMsg = proxy.$iframeMessenger;

// SSE管理器引用
const sseManagerRef = ref(null);
// Header引用
const headerRef = ref(null);

const leftDrawerOpen = ref(false)

const { update } = useUpdateResumeStatus();

//三方显示隐藏控制开关
let visibleThirdSwitch = computed(() => {
  return store.getters.getUserInfo?.extendData?.plan || '';
});
let visibleThirdSwitchPlus = computed(() => {
  return ['PlanA'].includes(visibleThirdSwitch.value);
});

provide('visibleThirdSwitchPlus', visibleThirdSwitchPlus);

// 获取ihr成功的简历ids
iframeMsg.on("ihrSuccessIds", async ({ successResumeIds }, context) => {
  if(context.from !== "ihr-recruit-assistant") return
  try {
    const { success } = await importResumeCallback(successResumeIds);
    if(success === "success") {
      update(successResumeIds);
    }
  } catch (error) {
    console.error('更新简历状态失败:', error);
  }
  return Promise.resolve(true);
})

// 记录上次滚动位置
let lastScrollY = 0;

// 监听滚动事件，更新header状态
const handleScroll = () => {
  // 检测header是否可见
  if (headerRef.value) {
    // 如果是三方企业模式，直接设置 header 高度为 0
    if(visibleThirdSwitchPlus.value) {
      store.commit('setHeaderVisible', false);
      store.commit('setHeaderHeight', 0);
      return;
    }
    
    let headerRect = headerRef.value.$el.getBoundingClientRect();
    const headerVisible = headerRect.bottom > 0;

    // 更新Vuex中的header状态
    store.commit('setHeaderVisible', headerVisible);

    // 保存header高度到Vuex
    if (headerVisible !== store.getters.getHeaderVisible) {
      store.commit('setHeaderHeight', headerRect.height);
    }

    // 记录当前滚动位置
    lastScrollY = window.scrollY;
  }
};

const handleIframeBack = () => {
  iframeMsg?.post("iframe-back", "*");
}

// 组件挂载时添加滚动监听
onMounted(() => {
  // 初始化相似简历倒计时状态（支持刷新页面后继续倒计时）
  store.dispatch('initializeCooldownState');
  
  // 初始化header高度到Vuex
  if (headerRef.value) {
    let headerRect = headerRef.value.$el.getBoundingClientRect();
    if(visibleThirdSwitchPlus.value){
      // 当 visibleThirdSwitchPlus 为 true 时，将 header 高度设为 0
      store.commit('setHeaderHeight', 0);
    } else {
      store.commit('setHeaderHeight', headerRect.height);
    }
  }

  // 添加滚动监听
  window.addEventListener('scroll', handleScroll, { passive: true });

  // 在iframe页面中,监听回退
  visibleThirdSwitchPlus.value && window.addEventListener('popstate', handleIframeBack);

  // 首次触发一次检测
  handleScroll();
});

// 组件卸载时移除滚动监听
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  visibleThirdSwitchPlus.value && window.addEventListener('popstate', handleIframeBack);
});
</script>

<style>
.layout-header {
  height: 48px;
}
.layout-headerA {
  height: 0;
  overflow: hidden;
}
</style>
