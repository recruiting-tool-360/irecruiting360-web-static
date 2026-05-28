<template>
  <div class="sso-login-container">
    <!-- 兜底 UI：登录中断时显示重试按钮 -->
    <div class="login-content">
      <h1 class="text-h4 text-primary q-mb-lg">SSO 登录</h1>

      <q-card flat bordered class="q-pa-md " v-if="!loading">
        <q-card-section class="text-center">
          <p class="text-body1">登录过程被中断或发生错误</p>
          <div class="q-mt-md">
            <q-btn
              color="primary"
              label="重试"
              @click="handleSSOLogin(iframeParams)"
              class="q-mr-md"
              :disable="!iframeParams"
            />
            <q-btn color="primary" label="返回登录页" to="/login" />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- 进行中遮罩 -->
    <div class="loading-overlay" v-if="loading">
      <q-spinner color="primary" size="3em" />
      <div class="text-subtitle1 q-mt-sm text-white">正在登录中，请稍候...</div>
    </div>
  </div>
</template>

<script setup>
/**
 * SSO 登录页（保持原行为，i 人事老 URL https://login.ihire365.com/sso-login 仍然命中此页）。
 *
 * 三种触发场景，对应三条入口：
 *   A. 浏览器 / i 人事 iframe：iframeMsg.on('init') → handleSSOLogin
 *   B. Electron 客户端被 deep link 唤起后加载本页：onMounted 时通过 handover.getPendingPayload 读 payload → handleSSOLogin
 *   C. Electron 客户端运行中再次收到 deep link：handover.onDeepLink 监听器触发 → handleSSOLogin
 *
 * 三条路径都把数据组装成同一个 fakeInitMessage 形态，复用 handleSSOLogin，业务逻辑零分叉。
 */
import { onMounted, ref, onUnmounted, getCurrentInstance } from 'vue';
import { useRouter } from 'vue-router';
import { generateSsoToken, ssoLogin, getUserInfo } from 'src/api/user/UserApi';
import { createChat } from 'src/api/chat/ChatApi';
import { useStore } from 'vuex';
import notify from 'src/util/notify';
import Cookies from 'js-cookie';

import { isElectronClient } from 'src/util/openChannelLoginUrl';

const router = useRouter();
const store = useStore();
const loading = ref(true);
const iframeParams = ref(null);
const { proxy } = getCurrentInstance();
const iframeMsg = proxy.$iframeMessenger;

// ====== 入口 A：iframe init 消息（i 人事 iframe 嵌入老 URL 时） ======
//
// ⚠️ 仅在浏览器/iframe 模式下挂载！
//
// 客户端模式下 deep link payload 通过入口 B/C 进入流程，再由 runFromDeepLinkPayload
// 调 iframeMsg.injectInit() 灌给 shim。shim 会 emit 'init' 给业务（MainLayout 等），
// 但 SSOLogin 自己**不能**再监听 init，否则会触发"SSO 流程跑两次"的死循环
// （shim 把 from 伪装为 'ihr-recruit-assistant' 通过校验 → 入口 A 又跑一次 handleSSOLogin）
if (!isElectronClient()) {
  iframeMsg.on('init', (data, context) => {
    if (context.from !== 'ihr-recruit-assistant') return;

    store.commit('changeAppStatus', {
      isSingleSignOn: true,
      sourceKey: context.from
    });

    iframeParams.value = data;
    updateGloalColor(data?.sysConfig?.color);

    handleSSOLogin(data);

    return Promise.resolve(true);
  });

  // 主题色推送（客户端自带主题，shim 也不 emit themeColor，不需要在客户端模式挂）
  iframeMsg.on('themeColor', (data, context) => {
    if (context.from !== 'ihr-recruit-assistant') return;
    return updateGloalColor(data?.sysConfig?.color);
  });
}

// ====== SSO 登录核心流程 ======
//
// 幂等保护：用 module-level Promise 串行化 handleSSOLogin 调用。
// 任何并发触发（入口 A/B/C/D 互相竞速、deep link 多次到达、Vue HMR 重挂载等）
// 都只会跑一次完整 SSO 流程，避免后端被打 N 遍。
let ssoInflight = null;

const handleSSOLogin = (iframeMessage) => {
  if (!iframeMessage) return Promise.resolve();
  if (ssoInflight) {
    console.log('[SSOLogin] 已有正在跑的 SSO 流程，复用同一个 Promise');
    return ssoInflight;
  }
  ssoInflight = doSSOLogin(iframeMessage).finally(() => {
    ssoInflight = null;
  });
  return ssoInflight;
};

const doSSOLogin = async (iframeMessage) => {
  try {
    loading.value = true;

    const urlParams = new URLSearchParams(window.location.search);
    const errorMsg = urlParams.get('error');

    if (errorMsg) {
      notify.error(decodeURIComponent(errorMsg));
      loading.value = false;
      return;
    }

    const { ssoConfig, positionList } = iframeMessage;
    // 父页（ihr360-recruit-static）会在 positionList 每项里带上 jd 文本，
    // 这里立刻缓存到 store，让 LeftMenu loadChatList 后能按 positionId 回填 jd
    // （后端 chatList 接口不返 jd 字段，需要前端 cache 这条路径补）
    if (Array.isArray(positionList) && positionList.length > 0) {
      store.commit('SET_POSITION_JD_CACHE', positionList);
      console.log(
        `[SSOLogin] 已缓存 ${positionList.length} 个职位 JD（用于 LeftMenu auto-send-jd）`
      );
    }
    const tokenResponse = await generateSsoToken(ssoConfig?.userConfig ?? {});

    if (tokenResponse.data && tokenResponse.data.token) {
      const token = tokenResponse.data.token;

      const loginResponse = await ssoLogin(token);

      if (loginResponse.success === 'success') {
        if (loginResponse.data) {
          Cookies.set('satoken', loginResponse.data, { path: '/', expires: 30 });
        }

        let { data, success } = await getUserInfo();
        if (success && success === 'success') {
          store.commit('changeUserInfo', data);
        }

        // ★ 记录本次 SSO 成功登录使用的 ssoConfig.userConfig 序列化字符串
        //   下次客户端运行中收到 deep link 时，MainLayout 用它跟 incoming key 比对
        //   判定"同一用户"（静默刷新）vs "不同用户"（router.replace('/sso-login') 整页重走）
        try {
          store.commit(
            'setLastSsoUserKey',
            JSON.stringify(ssoConfig?.userConfig || {})
          );
        } catch (_e) {
          /* ignore: 极端情况下 userConfig 含循环引用，比对功能降级到永远不一致即可 */
        }

        try {
          const chatResponse = await createChat(positionList ?? []);

          if (chatResponse.success === 'success') {
            if (chatResponse.data && chatResponse.data.chatId) {
              store.commit('changeLocalUserChatId', chatResponse.data.chatId);
            }
            router.push('/');
          } else {
            notify.error(chatResponse.errorMessage || '创建聊天失败');
            console.error('创建聊天失败:', chatResponse);
            loading.value = false;
          }
        } catch (chatError) {
          console.error('创建聊天时发生错误:', chatError);
          notify.error('创建聊天时发生错误');
          setTimeout(() => {
            router.push('/');
          }, 2000);
        }
      } else {
        notify.error(loginResponse.errorMessage || 'SSO登录失败');
        console.error('SSO登录失败:', loginResponse);
        loading.value = false;
      }
    } else {
      notify.error('生成SSO令牌失败');
      loading.value = false;
    }
  } catch (error) {
    console.error('SSO登录过程中发生错误:', error);
    notify.error('登录过程中发生错误');
    loading.value = false;
  }
};

const updateGloalColor = (color) => {
  color && store.commit('updateSsoThemeColor', color);
  return Promise.resolve(true);
};

// ====== 入口 B+C：客户端模式下读 deep link payload + 监听后续 deep link ======

/**
 * 决策 D10：deep link payload 里只放 positionIds（控 URL 长度上限），
 * positionList 在客户端启动后通过 ihrBridge.getApplicationPosition() 重建。
 *
 * 这样 createChat(positionList) 仍能拿到完整职位列表，业务零感知。
 *
 * 失败时返回空数组（降级），让流程继续；用户进入主页后业务还能再次拉取。
 */
async function rebuildPositionList(positionIds) {
  try {
    const ihrBridge = window?.api?.ihrBridge;
    if (!ihrBridge || !Array.isArray(positionIds) || positionIds.length === 0) {
      return [];
    }
    const res = await ihrBridge.getApplicationPosition();
    const all = res?.success && Array.isArray(res?.data) ? res.data : [];
    const idSet = new Set(positionIds);
    return all
      .filter((item) => idSet.has(item.headcountId))
      .map((item) => ({
        ...item,
        positionId: item.headcountId,
        name: `${item.positionName ?? ''} (${item.headcountCode ?? ''})`,
        // jd 暂留空，由 ihrBridge.batchGetPositionDetailByIds 接入后补；
        // mock 阶段也是空的，对原流程兼容
        jd: ''
      }));
  } catch (e) {
    console.error('[SSOLogin] rebuildPositionList failed:', e);
    return [];
  }
}

/**
 * 把 deep link payload 重组成与 i 人事 init 推送相同结构后跑 SSO，
 * 并通过 messenger shim 的 injectInit() 把 payload 灌进去，
 * 让后续业务页面 iframeMsg.on('init', cb) 也能拿到（替代原来 postMessage 推送的角色）。
 *
 * payload schema 见 docs/client-launcher-flow.md §4.2
 */
async function runFromDeepLinkPayload(p) {
  if (!p?.ssoConfig) return;

  // 0) 回填 positionList（D10：deep link 只传 positionIds，避免 URL 超长）
  let positionList = Array.isArray(p.positionList) ? p.positionList : [];
  if (positionList.length === 0 && Array.isArray(p.positionIds) && p.positionIds.length > 0) {
    positionList = await rebuildPositionList(p.positionIds);
  }

  // 1) 跑 SSO 登录（沿用原 init 消息的形态）
  const fakeInitMessage = {
    ssoConfig: p.ssoConfig,
    sysConfig: p.sysConfig,
    positionList
  };
  iframeParams.value = fakeInitMessage;
  updateGloalColor(p.sysConfig?.color);
  handleSSOLogin(fakeInitMessage);

  // 2) 把"业务字段"灌进 messenger shim：让后续业务模块的
  //    iframeMsg.on('init') 监听器在客户端模式下也能拿到 payload。
  //    （shim 同时会写 sessionStorage，跨路由切换也能复用）
  if (typeof iframeMsg?.injectInit === 'function') {
    iframeMsg.injectInit({
      positionList, // 已回填
      positionIds: p.positionIds,
      sysConfig: p.sysConfig,
      ssoConfig: p.ssoConfig,
      companyConfig: p.companyConfig
    });
  }
}

async function consumeClientHandover() {
  const handover = window?.api?.handover;
  if (!handover) return false;

  try {
    const pending = await handover.getPendingPayload();
    if (pending && pending.action === 'sso' && pending.payload) {
      await runFromDeepLinkPayload(pending.payload);
      return true;
    }
  } catch (err) {
    console.error('[SSOLogin] consumeClientHandover error:', err);
  }
  return false;
}

// ====== 生命周期 ======
let timeoutHandle = null;
let unsubscribeDeepLink = null;

onMounted(async () => {
  if (isElectronClient()) {
    // 客户端模式：读冷启动 deep link payload + 监听运行中到达的新 deep link
    const consumed = await consumeClientHandover();

    if (window?.api?.handover?.onDeepLink) {
      unsubscribeDeepLink = window.api.handover.onDeepLink((data) => {
        if (data?.action === 'sso' && data?.payload) {
          void runFromDeepLinkPayload(data.payload);
        }
      });
    }

    // 没有 pending deep link 也没有正在跑的 SSO（用户直接打开客户端，不是 deep link 唤起）
    if (!consumed) {
      loading.value = false;
    }
    return;
  }

  // 30 秒等不到 init 消息就报超时
  timeoutHandle = setTimeout(() => {
    if (loading.value) {
      loading.value = false;
      notify.error('登录超时，请稍后重试');
    }
  }, 30000);
});

onUnmounted(() => {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  if (unsubscribeDeepLink) {
    try {
      unsubscribeDeepLink();
    } catch (_e) {
      /* ignore */
    }
    unsubscribeDeepLink = null;
  }
});
</script>

<style scoped>
.sso-login-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f5f5f5;
}

.login-content {
  width: 90%;
  max-width: 400px;
  text-align: center;
  z-index: 1;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(3px);
}
</style>
