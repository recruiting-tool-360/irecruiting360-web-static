<template>
  <div class="sso-login-container">
    <div class="login-content">
      <h1 class="text-h4 text-primary q-mb-lg">SSO 登录</h1>

      <q-card flat bordered class="q-pa-md " v-if="!loading">
        <q-card-section class="text-center">
          <p class="text-body1">登录过程被中断或发生错误</p>
          <div class="q-mt-md">
            <q-btn color="primary" label="重试" @click="handleSSOLogin(iframeParams)" class="q-mr-md" />
            <q-btn color="primary" label="返回登录页" to="/login" />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="loading-overlay" v-if="loading">
      <q-spinner color="primary" size="3em" />
      <div class="text-subtitle1 q-mt-sm text-white">正在登录中，请稍候...</div>
      <q-btn flat color="white" label="取消" class="q-mt-md" @click="cancelLogin" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, onUnmounted, getCurrentInstance, unref } from 'vue';
import { useRouter } from 'vue-router';
import { generateSsoToken, ssoLogin, getUserInfo } from 'src/api/user/UserApi';
import { createChat } from 'src/api/chat/ChatApi';
import { useStore } from 'vuex';
import notify from 'src/util/notify';
import Cookies from 'js-cookie'

const router = useRouter();
const store = useStore();
const loading = ref(true);
const iframeParams = ref(null);
const { proxy } = getCurrentInstance();
const iframeMsg = proxy.$iframeMessenger;

// 初始化
iframeMsg.on("init", (data, context) => {
  if(context.from !== "ihr-recruit-assistant") return

  // 更新应用状态
  store.commit('changeAppStatus', {
    isSingleSignOn: true,
    sourceKey: context.from
  })

  iframeParams.value = data // 保存初始化信息

  updateGloalColor(data?.sysConfig?.color);

  

  handleSSOLogin(data);

  return Promise.resolve(true);
})

// 监听主题色改变
iframeMsg.on("themeColor", (data, context) => {
  if(context.from !== "ihr-recruit-assistant") return
  return updateGloalColor(data?.sysConfig?.color);
})

// SSO 登录流程
const handleSSOLogin = async (iframeMessage) => {
  
  try {
    loading.value = true;

    // 从 URL 获取参数，如果有的话
    const urlParams = new URLSearchParams(window.location.search);
    const errorMsg = urlParams.get('error');

    if (errorMsg) {
      notify.error(decodeURIComponent(errorMsg));
      loading.value = false;
      return;
    }

    const { ssoConfig, positionList } = iframeMessage;
    // 步骤1: 生成SSO令牌
    const tokenResponse = await generateSsoToken(ssoConfig?.userConfig ?? {});

    if (tokenResponse.data && tokenResponse.data.token) {
      const token = tokenResponse.data.token;

      // 步骤2: 使用令牌进行SSO登录
      const loginResponse = await ssoLogin(token);

      if (loginResponse.success === "success") {
        // 如果登录成功，更新用户信息到 Vuex
        if (loginResponse.data) {
          Cookies.set('satoken', loginResponse.data, {path: '/', expires: 30}); // 更新 Cookie
        }

        let { data, success } = await getUserInfo()
        if (success && success === 'success') {
          store.commit('changeUserInfo', data)
        }
        // if (loginResponse.data && loginResponse.data.userInfo) {
        //   store.commit('changeUserInfo', loginResponse.data.userInfo);
        // }
        // 步骤3: 创建聊天
        try {
          const chatResponse = await createChat(positionList ?? []);

          if (chatResponse.success === "success") {
            // 如果聊天创建成功，保存聊天ID（如果响应中有的话）
            if (chatResponse.data && chatResponse.data.chatId) {
              store.commit('changeLocalUserChatId', chatResponse.data.chatId);
            }

            // 所有步骤成功完成，跳转到首页
            router.push('/');
          } else {
            notify.error(chatResponse.errorMessage || '创建聊天失败');
            console.error('创建聊天失败:', chatResponse);
            loading.value = false;
          }
        } catch (chatError) {
          console.error('创建聊天时发生错误:', chatError);
          notify.error('创建聊天时发生错误');
          // 尽管创建聊天失败，但用户已登录，仍然可以跳转到首页
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

/**
 * 更新全局主题色
 * @param color 颜色
 */
const updateGloalColor = (color) => {
  color && store.commit('updateSsoThemeColor', color);
  return Promise.resolve(true);
}

// 取消登录
const cancelLogin = () => {
  loading.value = false;
  notify.warning('登录操作已取消');
};

// 组件挂载时自动开始登录流程
onMounted(() => {
  // 添加超时处理，防止无限等待
  const timeout = setTimeout(() => {
    if (loading.value) {
      loading.value = false;
      notify.error('登录超时，请稍后重试');
    }
  }, 30000); // 30秒超时

  // 组件卸载时清除超时定时器
  clearTimeoutOnUnmount(timeout);
});

// 组件卸载时清除超时定时器
const clearTimeoutOnUnmount = (timeout) => {
  onUnmounted(() => {
    clearTimeout(timeout);
  });
};
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
