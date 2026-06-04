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
import { useRouter } from "vue-router";
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
import { startBossResidentWatcher } from "src/util/automation/bossResidentWatcher";
import { initJob51LoginWatcher } from "src/util/automation/job51LoginWatcher";
import { initZhilianLoginWatcher } from "src/util/automation/zhilianLoginWatcher";
import notify from "src/util/notify";
const store = useStore();
const router = useRouter();

// 客户端模式：mount 时静默拉一次 BOSS 我的职位列表 + 监听 BOSS 登录成功后自动重拉
// （隐藏 BrowserWindow + CDP，用户不可见；详见 src/util/automation/bossJobListAutoFetch.js）
let unbindBossLogin = null;
// BOSS 常驻登录态监视（main 常驻隐藏窗口加载职位列表页 → 检测登录失效 + 抓数据）的清理函数
let unbindBossResident = null;
// 51job 登录态轮询（10s）的清理函数
let unbindJob51Watcher = null;
// 智联 登录态轮询（10s）的清理函数
let unbindZhilianWatcher = null;

// 客户端模式：监听 deep link（用户在工作台再次点"打开 i 快招"或换职位推过来）
let unbindDeepLink = null;

/**
 * 已登录页面（用户已进入业务主页）收到 deep link 时的策略：
 *
 *   1. 当前路由 = /sso-login：本 handler 不动（SSOLogin onDeepLink 自己处理）
 *   2. 当前未登录（store.userInfo 为空）：router.replace('/sso-login') 走完整 SSO
 *   3. incoming 用户 = 当前用户（ssoConfig.userConfig 序列化相同）：
 *      - accessToken 已被主进程注入 ihrBridge（无需 renderer 处理 cookie）
 *      - 缓存 incoming 职位 JD 到 store（让 LeftMenu auto-send-jd 路径能用）
 *      - commit 'triggerChatListRefresh' 让 LeftMenu 静默 loadChatList
 *      - 整页不刷新、URL 不变；toast 提示一次
 *   4. incoming 用户 ≠ 当前用户：router.replace('/sso-login') 让 SSOLogin 重走整个流程
 *      （SSO 成功后会重写 user / chatList / token，新用户状态干净接管）
 */
/**
 * 进入主页 / 收到新 token 时：若 accessToken 当前有效，主动关掉 i 人事授权弹框。
 *
 * 背景：IhrAuthModal 由 ihrBridge 业务调用返回 NOT_LOGGED_IN 时被设为 visible=true，
 * 但**没有**任何地方在"成功进主页 / token 刷新回来"时关它 → 偶发卡住一直显示。
 * 这里在能确认登录态 OK 的时机统一收口关闭。
 *
 * @param {string} reason 仅日志用
 */
async function closeIhrAuthModalIfTokenValid(reason) {
  if (!isElectronClient()) return;
  try {
    const ihrBridge = window?.api?.ihrBridge;
    // 拿不到状态接口：能进主页本身说明登录流程跑通了，保守直接关
    if (!ihrBridge?.getAccessTokenStatus) {
      store.commit("setIhrAuthModalVisible", false);
      return;
    }
    const st = await ihrBridge.getAccessTokenStatus();
    if (st?.hasToken && !st?.expired) {
      store.commit("setIhrAuthModalVisible", false);
      console.log(`[MainLayout] accessToken 有效，关闭 IhrAuthModal（${reason}）`);
    } else {
      console.log(
        `[MainLayout] accessToken 无效/过期，保留 IhrAuthModal（${reason}）`,
        st
      );
    }
  } catch (e) {
    console.warn("[MainLayout] closeIhrAuthModalIfTokenValid failed:", e?.message || e);
  }
}

async function handleClientDeepLink(data) {
  if (!data || data.action !== "sso" || !data.payload?.ssoConfig) return;

  // 当前路由是 SSO 页面 → SSOLogin onDeepLink 监听器会处理，本 handler 不动
  if (router.currentRoute.value.path === "/sso-login") {
    console.log("[MainLayout] deep link arrived but on /sso-login, defer to SSOLogin handler");
    return;
  }

  const incomingSsoUserConfig = data.payload.ssoConfig.userConfig || {};
  let incomingKey = "";
  try {
    incomingKey = JSON.stringify(incomingSsoUserConfig);
  } catch (_e) {
    incomingKey = ""; // 兜底：不一致 → 走完整 SSO
  }

  const currentUserInfo = store.getters.getUserInfo;
  const lastSsoUserKey = store.getters.getLastSsoUserKey || "";

  // 当前没登录 → 直接跳 SSO 走完整流程
  if (!currentUserInfo?.id) {
    console.log("[MainLayout] deep link arrived but no current userInfo, route to /sso-login");
    void router.replace("/sso-login");
    return;
  }

  // 用户不一致 → 跳 SSO 重走（SSO 成功后会自动 setLastSsoUserKey + 写 user / chatList）
  if (!incomingKey || !lastSsoUserKey || incomingKey !== lastSsoUserKey) {
    console.log(
      "[MainLayout] deep link incoming user differs from current user, full re-SSO",
      { incomingLen: incomingKey.length, lastLen: lastSsoUserKey.length }
    );
    void router.replace("/sso-login");
    return;
  }

  // ★ 同一用户 → 静默走：缓存职位 JD + 触发 LeftMenu 刷新职位列表，不切页面
  console.log("[MainLayout] deep link same user, silent refresh chatList + cache JD");
  try {
    const positionIds = Array.isArray(data.payload.positionIds) ? data.payload.positionIds : [];
    if (positionIds.length > 0) {
      // 用 ihrBridge.getApplicationPosition 重建完整 positionList（含 jd 字段）
      // 跟 SSOLogin.rebuildPositionList 同一份逻辑，但这里失败也不阻塞主流程（用户已登录，没拿到 JD 只影响 auto-send-jd）
      const ihrBridge = window?.api?.ihrBridge;
      if (ihrBridge?.getApplicationPosition) {
        const resp = await ihrBridge.getApplicationPosition();
        if (resp?.success) {
          const positionList = resp?.data?.list || resp?.data || [];
          if (Array.isArray(positionList) && positionList.length > 0) {
            const idSet = new Set(positionIds);
            const filtered = positionList.filter((p) =>
              idSet.has(p?.positionId || p?.id || "")
            );
            if (filtered.length > 0) {
              store.commit("SET_POSITION_JD_CACHE", filtered);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[MainLayout] silent rebuildPositionList failed:", e?.message || e);
  }
  // 触发 LeftMenu watch 静默 loadChatList
  store.commit("triggerChatListRefresh");
  // ★ 新 deep link 带回了 accessToken（主进程已注入 ihrBridge）= 已重新授权 → 关授权弹框
  store.commit("setIhrAuthModalVisible", false);

  // ★ drain 掉主进程的 pendingDeepLink：
  //   主进程在"业务页面收到 deep link"时**故意保留** pendingDeepLink（给未登录→路由到
  //   /sso-login 的 SSOLogin 兜底用）。但同用户静默刷新这条路径不会跳 /sso-login，
  //   若不 drain，残留的 pendingDeepLink 会在用户之后某次进 /sso-login 时被误消费重走 SSO。
  try {
    await window?.api?.handover?.getPendingPayload?.();
  } catch (_e) {
    /* ignore：drain 失败不影响主流程 */
  }

  notify.success("已收到来自工作台的最新数据");
}

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
    // ★ 已经能进到主页（MainLayout）→ 若 accessToken 有效，关掉可能残留的 i 人事授权弹框
    //   解决"client-launcher 打开后偶发授权弹框不关闭"：之前某次后台 ihrBridge 调用返回
    //   NOT_LOGGED_IN 把弹框设 true，但进主页后没人关它。
    void closeIhrAuthModalIfTokenValid("mainlayout_mounted");

    // 职位数据：进主页拉一次 + 监听 BOSS 登录态 false→true 自动再取一次。
    void ensureBossJobList(store, { reason: "mainlayout_mounted" });
    unbindBossLogin = bindBossLoginListener(store);

    // ★ BOSS 常驻登录态监视：开了 BOSS 渠道时，main 启动一个常驻隐藏窗口加载
    //   BOSS「我的职位列表」页（不关闭），**只读导航 URL** 判定登录失效（不打接口，避免被风控发现），
    //   登录恢复时弹通知 + 把 channelConf.BOSS.login 翻 true（顺带触发 bindBossLoginListener 拉数据）。
    //   详见 src/util/automation/bossResidentWatcher.js
    unbindBossResident = startBossResidentWatcher(store);

    // ★ 51job 登录态轮询：启用了 51job 渠道就每 10s 探测登录态。
    //   详见 src/util/automation/job51LoginWatcher.js
    unbindJob51Watcher = initJob51LoginWatcher(store);

    // ★ 智联 登录态轮询：启用了智联渠道就每 10s 探测登录态（同 51job 方式）。
    unbindZhilianWatcher = initZhilianLoginWatcher(store);

    // 监听 deep link：用户在工作台再次"打开 i 快招"时，业务页面无感刷新（同用户）/
    // 走完整 SSO（不同用户）
    if (window?.api?.handover?.onDeepLink) {
      unbindDeepLink = window.api.handover.onDeepLink((data) => {
        void handleClientDeepLink(data);
      });
    }
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
  if (unbindBossResident) {
    unbindBossResident();
    unbindBossResident = null;
  }
  if (unbindJob51Watcher) {
    unbindJob51Watcher();
    unbindJob51Watcher = null;
  }
  if (unbindZhilianWatcher) {
    unbindZhilianWatcher();
    unbindZhilianWatcher = null;
  }
  if (unbindDeepLink) {
    try {
      unbindDeepLink();
    } catch (_e) {
      /* ignore */
    }
    unbindDeepLink = null;
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
