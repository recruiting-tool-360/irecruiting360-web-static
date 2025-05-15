<template>
  <q-layout view="HHH LpR lfr">

    <q-header v-if="isSingleSignOn" elevated class="bg-primary text-white" style="height: 48px" ref="headerRef">
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Header from "layouts/header/Header.vue";
import SseManager from "components/sse/SseManager.vue";
import {useStore} from "vuex";
import LeftMenu from "layouts/menu/LeftMenu.vue";

const store = useStore();
// SSE管理器引用
const sseManagerRef = ref(null);
// Header引用
const headerRef = ref(null);

const leftDrawerOpen = ref(false)

const isSingleSignOn = computed(() => !store.getters.getIsSingleSignOn);

// 记录上次滚动位置
let lastScrollY = 0;

// 监听滚动事件，更新header状态
const handleScroll = () => {
  // 检测header是否可见
  if (headerRef.value) {
    const headerRect = headerRef.value.$el.getBoundingClientRect();
    const headerVisible = headerRect.bottom > 0;

    // console.log(headerVisible)
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

// 组件挂载时添加滚动监听
onMounted(() => {
  console.log(isSingleSignOn.value, 'isSingleSignOn');
  
  // 初始化header高度到Vuex
  if (headerRef.value) {
    const headerRect = headerRef.value.$el.getBoundingClientRect();
    store.commit('setHeaderHeight', headerRect.height);
  }

  // 添加滚动监听
  window.addEventListener('scroll', handleScroll, { passive: true });

  // 首次触发一次检测
  handleScroll();
});

// 组件卸载时移除滚动监听
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});
</script>
