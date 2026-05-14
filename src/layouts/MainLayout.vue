<template>
  <q-layout view="HHH LpR lfr">
    <!--
      客户端模式（Electron 客户端 + PlanA）专用 mini header：
      跟原 q-header 同级（都是 q-layout 的 fixed-top 槽位），二选一显示
    -->
    <q-header v-if="showClientHeader" elevated class="client-mini-header-wrap">
      <ClientHeader @open-settings="channelSettingsVisible = true" />
    </q-header>

    <!--
      原 q-header：浏览器+插件模式下使用
      PlanA 模式下走 layout-headerA（height:0 隐藏），浏览器内嵌 iframe 时由父页提供顶部
    -->
    <q-header
      v-else
      elevated
      class="bg-primary text-white"
      :class="!visibleThirdSwitchPlus ? 'layout-header' : 'layout-headerA'"
      ref="headerRef"
    >
      <Header></Header>
    </q-header>

    <!--
      左侧大卡片：招聘中职位列表（LeftMenu）
      参考 ihraisaas/src/components/AIAssistant/JobList.tsx 整体外观：
        - 300px 宽
        - 白底
        - 右侧 1px 浅边
        - 顶部 header（招聘中职位 + X个职位 badge）
    -->
    <q-drawer
      show-if-above
      :v-model="false"
      side="left"
      bordered
      :behavior="'desktop'"
      :overlay="false"
      :breakpoint="0"
      :width="300"
      class="ihr-sidebar"
    >
      <LeftMenu></LeftMenu>
    </q-drawer>

    <!--
      右侧大卡片容器：背景灰底 + 内层 padding，让聊天卡片看起来嵌在灰底里
      （类比 ihraisaas/src/App.tsx 第 959 行 flex-1 flex flex-col p-6 bg-[#f0f2f5] overflow-hidden）
    -->
    <q-page-container :class="{ 'ihr-main-area': showClientHeader }">
      <router-view />
    </q-page-container>
    <!-- 无UI的SSE管理组件 -->
    <SseManager ref="sseManagerRef"></SseManager>

    <!-- 客户端模式下：i 人事 manage 未登录 / 会话失效时弹的"账号授权"框 -->
    <IhrAuthModal />

    <!-- 客户端模式：渠道设置弹窗（齿轮按钮触发，配置启用哪些招聘渠道） -->
    <ChannelSettingsDialog v-model:visible="channelSettingsVisible" />
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, provide, getCurrentInstance } from "vue";
import Header from "layouts/header/Header.vue";
import SseManager from "components/sse/SseManager.vue";
import { useStore } from "vuex";
import LeftMenu from "layouts/menu/LeftMenu.vue";
import IhrAuthModal from "src/components/clients/IhrAuthModal.vue";
import ClientHeader from "src/components/clients/ClientHeader.vue";
import ChannelSettingsDialog from "src/components/settings/ChannelSettingsDialog.vue";
import { isElectronClient } from "src/util/openChannelLoginUrl";
import { useUpdateResumeStatus } from "src/hooks/useUpdateResumeStatus";
import { importResumeCallbackPlus } from "src/api/jobList/JobListApi";
import { ensureBossJobList, bindBossLoginListener } from "src/util/automation/bossJobListAutoFetch";
const store = useStore();

// 客户端模式：mount 时静默拉一次 BOSS 我的职位列表 + 监听 BOSS 登录成功后自动重拉
// （隐藏 BrowserWindow + CDP，用户不可见；详见 src/util/automation/bossJobListAutoFetch.js）
let unbindBossLogin = null;

const { proxy } = getCurrentInstance();
const iframeMsg = proxy.$iframeMessenger;

// SSE管理器引用
const sseManagerRef = ref(null);
// Header引用
const headerRef = ref(null);

const leftDrawerOpen = ref(false);

const { update } = useUpdateResumeStatus();

//三方显示隐藏控制开关
let visibleThirdSwitch = computed(() => {
  return store.getters.getUserInfo?.extendData?.plan || "";
});
let visibleThirdSwitchPlus = computed(() => {
  return ["PlanA"].includes(visibleThirdSwitch.value);
});

provide("visibleThirdSwitchPlus", visibleThirdSwitchPlus);

// Electron 客户端模式下显示 mini header（PlanA 隐藏了原 q-header，需要这个补回品牌曝光）
const showClientHeader = computed(() => isElectronClient());

// 渠道设置弹窗可见性（ClientHeader 齿轮按钮触发）
const channelSettingsVisible = ref(false);

// 获取ihr成功的简历ids
iframeMsg.on("ihrSuccessIds", async (data, context) => {
  if (context.from !== "ihr-recruit-assistant") return;
  try {
    const params = [
      ...(data?.successResumeIds || []).map((id) => ({
        id,
        type: data.type,
        status: "1",
        errorMsg: ""
      })),
      ...(data?.failRepeatResumeIds || []).map((id) => ({
        id,
        type: data.type,
        status: "0",
        errorMsg:
          data.type === "ASSIGN_POSITIONS"
            ? "分配职位失败（重复简历）"
            : "加入人才库失败（重复简历）"
      })),
      ...(data?.failOtherResumeIds || []).map((id) => ({
        id,
        type: data.type,
        status: "0",
        errorMsg:
          data.type === "ASSIGN_POSITIONS"
            ? "分配职位失败（其他原因）"
            : "加入人才库失败（其他原因）"
      }))
    ];
    console.log(data, "data-ihrSuccessIds", params);

    const { success } = await importResumeCallbackPlus(params);
    if (success === "success") {
      update(params);
    }
  } catch (error) {
    console.error("更新简历状态失败:", error);
  }
  return Promise.resolve(true);
});

// 记录上次滚动位置
let lastScrollY = 0;

// 监听滚动事件，更新header状态
const handleScroll = () => {
  // 检测header是否可见
  if (headerRef.value) {
    // 如果是三方企业模式，直接设置 header 高度为 0
    if (visibleThirdSwitchPlus.value) {
      store.commit("setHeaderVisible", false);
      store.commit("setHeaderHeight", 0);
      return;
    }

    let headerRect = headerRef.value.$el.getBoundingClientRect();
    const headerVisible = headerRect.bottom > 0;

    // 更新Vuex中的header状态
    store.commit("setHeaderVisible", headerVisible);

    // 保存header高度到Vuex
    if (headerVisible !== store.getters.getHeaderVisible) {
      store.commit("setHeaderHeight", headerRect.height);
    }

    // 记录当前滚动位置
    lastScrollY = window.scrollY;
  }
};

const handleIframeBack = () => {
  iframeMsg?.post("iframe-back", "*");
};

// 组件挂载时添加滚动监听
onMounted(() => {
  // 初始化相似简历倒计时状态（支持刷新页面后继续倒计时）
  store.dispatch("initializeCooldownState");

  // 初始化header高度到Vuex
  if (headerRef.value) {
    let headerRect = headerRef.value.$el.getBoundingClientRect();
    if (visibleThirdSwitchPlus.value) {
      // 当 visibleThirdSwitchPlus 为 true 时，将 header 高度设为 0
      store.commit("setHeaderHeight", 0);
    } else {
      store.commit("setHeaderHeight", headerRect.height);
    }
  }

  // 添加滚动监听
  window.addEventListener("scroll", handleScroll, { passive: true });

  // 在iframe页面中,监听回退
  visibleThirdSwitchPlus.value && window.addEventListener("popstate", handleIframeBack);

  // 首次触发一次检测
  handleScroll();

  // 客户端模式：BOSS 已开启 + 已登录 → 隐藏窗口静默拉一次"我的职位"
  // 不阻塞渲染；节流（5 分钟内已成功抓过则跳过）+ in-flight 去重在工具内部处理
  const inClient = isElectronClient();
  console.log(
    `[MainLayout] mounted: isElectronClient=${inClient}, ` +
      `__IKUAIZHAO_NATIVE__=${
        typeof window !== "undefined" && window.__IKUAIZHAO_NATIVE__ ? "present" : "absent"
      }, ` +
      `window.api.automation=${
        typeof window !== "undefined" && window.api && window.api.automation ? "present" : "absent"
      }`
  );
  if (inClient) {
    void ensureBossJobList(store, { reason: "mainlayout_mounted" });
    // 监听 BOSS 登录态从 false → true，自动再取一次
    unbindBossLogin = bindBossLoginListener(store);
  }
});

// 组件卸载时移除滚动监听
onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
  visibleThirdSwitchPlus.value && window.addEventListener("popstate", handleIframeBack);
  if (unbindBossLogin) {
    unbindBossLogin();
    unbindBossLogin = null;
  }
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
/* 客户端 mini header：q-header 默认有蓝色背景，这里清掉让 ClientHeader 自己的白底+下边框生效 */
.client-mini-header-wrap {
  background: transparent !important;
  color: inherit !important;
}

/*
  客户端模式下的"两个大卡片"布局（1:1 参考 ihraisaas/src/App.tsx 第 935-1020 行）：
    - 左侧 q-drawer：白底 + 右侧细边（自带 bordered）+ 顶部 LeftMenu header
    - 右侧 q-page-container：灰底 #f0f2f5（让里面的 ChatCard 看起来嵌在灰底里）
*/
.ihr-sidebar :deep(.q-drawer) {
  background: #ffffff;
}
.ihr-sidebar :deep(.q-drawer__content) {
  background: #ffffff;
}

/* 客户端模式：右侧主区灰底，ChatCard 浮在上面看起来像嵌入式大卡片 */
.ihr-main-area {
  background-color: #f0f2f5 !important;
}
</style>
