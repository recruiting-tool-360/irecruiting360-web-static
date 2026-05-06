<template>
  <div class="client-launcher-page">
    <ClientLanding
      :status="launcherStatus"
      :subtitle="subtitle"
      @launch="handleLaunch"
      @use-web="handleUseWeb"
    />
  </div>
</template>

<script setup>
/**
 * 客户端唤起入口页（i 人事新版 iframe 会替换为此 URL）
 *
 * 设计原则：
 *   - 不判断是否在 i 人事 iframe 内：进入即开启"打开客户端"流程
 *   - 但同时挂上 iframeMessenger 监听器：
 *       - 如果是 iframe 内（i 人事会推 init 消息），收到后用真实 ssoConfig 重新唤起一次
 *       - 如果不是 iframe，直接用空 payload 唤起客户端
 *   - 客户端被唤起后从 deep link 拿到 payload 跑 SSO（参见 SSOLogin.vue 入口 B/C 分支）
 *
 * 用户路径分支：
 *   1. 已装客户端（cookie 有 satoken）→ deep link 唤起 → 客户端 SSOLogin → /
 *   2. 未装客户端 → 1.5s 探测后 missing → 用户点"下载并安装" / "继续在浏览器中使用"
 *
 * "继续在浏览器中使用"会跳到原来的 /sso-login（让 i 人事 portal 重新 iframe 嵌那个老 URL）
 */

import { computed, onMounted, ref, onUnmounted, getCurrentInstance } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import notify from 'src/util/notify';

import ClientLanding from 'src/components/sso/ClientLanding.vue';
import { useClientLauncher, setUserChoice } from 'src/hooks/useClientLauncher';
import {
  CLIENT_LAUNCH_ENABLED,
  isInsideEmbeddedWebview
} from 'src/util/clientPlatform';
import { isElectronClient } from 'src/util/openChannelLoginUrl';

const store = useStore();
const router = useRouter();
const { proxy } = getCurrentInstance();
const iframeMsg = proxy?.$iframeMessenger;

const { tryLaunch, status: launcherStatus } = useClientLauncher();

/**
 * i 人事 iframe 推过来的 init 消息（带 ssoConfig / sysConfig）
 * 如果是 iframe 内：等收到后用真实 payload 触发 deep link
 * 如果不是 iframe：iframeData 永远为 null，触发的是空 payload deep link（客户端启动后自行处理）
 */
const iframeData = ref(null);

/**
 * 是否已经触发过自动唤起，避免重复
 */
const autoLaunched = ref(false);

const subtitle = computed(() => {
  if (launcherStatus.value === 'missing') {
    return '若您已安装客户端可点击"重试"，否则请先下载';
  }
  if (launcherStatus.value === 'success') {
    return '客户端已为您打开，请在客户端中继续操作';
  }
  return '为获得最佳招聘渠道整合体验，建议使用桌面客户端';
});

// ====== iframeMessenger 监听 i 人事 init / themeColor ======
if (iframeMsg) {
  iframeMsg.on('init', (data, context) => {
    if (context.from !== 'ihr-recruit-assistant') return;

    // 缓存 i 人事推送的 SSO 数据；如果之前已经触发过空唤起，重新带数据再唤起一次
    iframeData.value = data;

    store.commit('changeAppStatus', {
      isSingleSignOn: true,
      sourceKey: context.from
    });

    if (data?.sysConfig?.color) {
      store.commit('updateSsoThemeColor', data.sysConfig.color);
    }

    // 收到 init 后用真实 payload 重新触发一次（覆盖之前的空唤起）
    // 这样客户端会拿到真实 ssoConfig 完成登录
    void launchWithLatestPayload();

    return Promise.resolve(true);
  });

  iframeMsg.on('themeColor', (data, context) => {
    if (context.from !== 'ihr-recruit-assistant') return;
    if (data?.sysConfig?.color) {
      store.commit('updateSsoThemeColor', data.sysConfig.color);
    }
    return Promise.resolve(true);
  });
}

// ====== 唤起逻辑 ======

/**
 * 用当前可用的最新 payload 触发 deep link
 *   - 已收到 i 人事 init：使用真实 ssoConfig
 *   - 还没收到：使用空 payload（客户端启动后由 SSOLogin 自行处理空登录态）
 */
async function launchWithLatestPayload() {
  const payload = iframeData.value
    ? {
        ssoConfig: iframeData.value.ssoConfig,
        sysConfig: iframeData.value.sysConfig,
        from: 'ihr-recruit-assistant'
      }
    : {
        ssoConfig: null,
        from: 'direct'
      };

  const ok = await tryLaunch('sso', payload);
  if (ok) {
    setUserChoice('client');
  }
}

function handleLaunch() {
  void launchWithLatestPayload();
}

function handleUseWeb() {
  setUserChoice('web');
  // 跳到原 SSOLogin 路由（i 人事老 URL 行为完全保留，那里有完整的浏览器 SSO 流程）
  router.replace('/sso-login');
  notify.info('已切换为浏览器登录方式');
}

// ====== 生命周期 ======
onMounted(() => {
  // 已经在 Electron 客户端里 → 跳到 SSOLogin（避免循环唤起）
  if (isElectronClient()) {
    router.replace('/sso-login');
    return;
  }

  // 灰度开关关闭 → 直接跳到 web 兜底
  if (!CLIENT_LAUNCH_ENABLED) {
    router.replace('/sso-login');
    return;
  }

  // 钉钉 / 飞书 / 企微等内置 webview 不支持自定义协议 → 直接 missing 状态等用户选下载/继续浏览器
  if (isInsideEmbeddedWebview()) {
    launcherStatus.value = 'missing';
    return;
  }

  // 默认：进页面立即尝试唤起客户端（不等 i 人事 init 消息，先发"空" payload；
  // 如果之后收到 init 消息会用完整 payload 再唤起一次，覆盖之前的）
  if (!autoLaunched.value) {
    autoLaunched.value = true;
    void launchWithLatestPayload();
  }
});

onUnmounted(() => {
  if (iframeMsg) {
    try {
      iframeMsg.off?.('init');
      iframeMsg.off?.('themeColor');
    } catch (_e) {
      /* ignore */
    }
  }
});
</script>

<style scoped>
.client-launcher-page {
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, #f5f7fb 0%, #eef2ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
