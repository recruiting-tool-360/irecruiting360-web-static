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

// 主题色推送
iframeMsg.on('themeColor', (data, context) => {
  if (context.from !== 'ihr-recruit-assistant') return;
  return updateGloalColor(data?.sysConfig?.color);
});

// ====== SSO 登录核心流程 ======
const handleSSOLogin = async (iframeMessage) => {
  if (!iframeMessage) return;
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
 * 把 deep link payload 重组成与 i 人事 init 推送相同结构后跑 SSO
 */
function runFromDeepLinkPayload(p) {
  if (!p?.ssoConfig) return;
  const fakeInitMessage = {
    ssoConfig: p.ssoConfig,
    sysConfig: p.sysConfig,
    positionList: [] // deep link 不传 positionList（URL 长度限制；客户端 getChatList 兜底）
  };
  iframeParams.value = fakeInitMessage;
  updateGloalColor(p.sysConfig?.color);
  handleSSOLogin(fakeInitMessage);
}

async function consumeClientHandover() {
  const handover = window?.api?.handover;
  if (!handover) return false;

  try {
    const pending = await handover.getPendingPayload();
    if (pending && pending.action === 'sso' && pending.payload) {
      runFromDeepLinkPayload(pending.payload);
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
          runFromDeepLinkPayload(data.payload);
        }
      });
    }

    // 没有 pending deep link 也没有正在跑的 SSO（用户直接打开客户端，不是 deep link 唤起）
    if (!consumed) {
      loading.value = false;
    }
    return;
  }

  // 浏览器模式：30 秒等不到 init 消息就报超时
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
