<template>
  <q-page class="flex flex-center">
    <div class="login-container" :style="`max-width:${isMobile?'400px':'450'}px`">
      <!-- 登录卡片 -->
      <q-card class="login-card">
        <q-card-section class="text-center q-pt-xl">
          <div class="text-h6 text-weight-bold text-grey-14">登录</div>
        </q-card-section>

        <q-card-section class="q-pt-sm q-pb-sm">
          <!-- 登录方式选择器 -->
          <q-tabs
            v-model="loginTab"
            class="text-grey-8"
            active-color="primary"
            indicator-color="primary"
            align="justify"
            narrow-indicator
            dense
          >
            <q-tab name="password" label="账号密码登录" />
            <q-tab name="wechat" label="微信登录" />
          </q-tabs>

          <!-- 登录方式内容区域 -->
          <q-tab-panels v-model="loginTab" animated class="bg-white">
            <!-- 账号密码登录 -->
            <q-tab-panel name="password" class="">
              <q-form
                ref="loginFormRef"
                @submit="onLogin"
                class="q-gutter-y-sm q-mt-sm"
              >
                <q-input
                  v-model="form.username"
                  placeholder="用户名"
                  :rules="[val => !!val || '请输入用户名']"
                >
                  <template v-slot:prepend>
                    <q-icon name="person" color="grey-7" />
                  </template>
                </q-input>

                <q-input
                  v-model="form.password"
                  :type="isPwd ? 'password' : 'text'"
                  placeholder="密码"
                  :rules="[val => !!val || '请输入密码']"
                >
                  <template v-slot:prepend>
                    <q-icon name="lock" color="grey-7" />
                  </template>
                  <template v-slot:append>
                    <q-icon
                      :name="isPwd ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      color="grey-7"
                      @click="isPwd = !isPwd"
                    />
                  </template>
                </q-input>

                <div class="flex items-center">
                  <q-checkbox size="xs" v-model="agreeTerms" color="primary" />
                  <div class="text-caption text-grey-8">
                    已阅读并接受 <a href="#" @click.prevent="goToAgreement" class="text-primary">《i快招用户服务协议》</a>
                  </div>
                </div>

                <q-btn
                  :loading="loading"
                  color="primary"
                  class="full-width q-py-sm"
                  label="登录"
                  type="submit"
                  unelevated
                >
                  <template v-slot:loading>
                    <q-spinner-dots class="on-left" />
                    登录中...
                  </template>
                </q-btn>
              </q-form>
            </q-tab-panel>

            <!-- 微信扫码登录 -->
            <q-tab-panel name="wechat" class="q-px-md q-pb-none q-tp-xs">
              <div class="column items-center">
                <div class="qrcode-container q-mb-md relative-position">
                  <q-img
                    v-if="false"
                    src="/wechat-qrcode.png"
                    alt="微信二维码"
                    width="180px"
                    height="180px"
                    class="qrcode-img"
                  >
                    <div v-if="qrcodeExpired" class="absolute-full flex flex-center qrcode-overlay">
                      <div class="text-center">
                        <div>二维码已过期</div>
                        <q-btn flat color="white" class="q-mt-sm" icon="refresh" label="刷新" @click="refreshQrcode" />
                      </div>
                    </div>
                  </q-img>
                  
                  <!-- 添加微信登录容器 -->
                  <div id="login_container" style="width: 300px; height: 333px;margin-top: -42px;transform: scale(0.7)"></div>
                  
                  <!-- 协议遮罩层 -->
                  <div v-if="!wechatAgreeTerms" class="agreement-overlay absolute-full flex flex-center">
                    <div class="text-center">
                      <q-icon name="info" color="white" size="2rem" />
                      <div class="text-white q-mt-sm">请先阅读并同意《i快招用户服务协议》</div>
                    </div>
                  </div>
                </div>
<!--                <p class="text-center text-grey-8">-->
<!--                  请使用微信扫描二维码登录<br>-->
<!--                  <small>扫码后请在微信中确认登录</small>-->
<!--                </p>-->
                <div class="flex items-center">
                  <q-checkbox size="xs" v-model="wechatAgreeTerms" color="primary" />
                  <div class="text-caption text-grey-8">
                    已阅读并接受 <a href="#" @click.prevent="goToAgreement" class="text-primary">《i快招用户服务协议》</a>
                  </div>
                </div>
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <q-card-section class="text-center q-pb-lg q-pt-none">
          <div class="text-caption text-grey-7">
            还没有快招系统账号？ <a href="#" @click.prevent="goToRegister" class="text-primary">免费注册</a>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import Cookies from 'js-cookie'
import { userLogin } from 'src/api/user/UserApi'
import notify from "src/util/notify";
import api from "src/api/loginRequest";
import CryptoJS from 'crypto-js'

const $q = useQuasar()
const isMobile = ref($q.platform.is.mobile);
const router = useRouter()

console.log(CryptoJS.MD5("company_a|test_api_key_123|test_api_secret_456").toString())

// 登录方式选择
const loginTab = ref('password')
//环境
const env = process.env.NODE_ENV
// 账号密码表单
// const form = ref({
//   username: '',
//   password: ''
// })
const form = ref({
  username: 'test1',
  password: '123456'
})

// 控制状态
const isPwd = ref(true)
const agreeTerms = ref(env==='development')
const wechatAgreeTerms = ref(true) // 微信登录协议勾选状态
const loading = ref(false)
const qrcodeExpired = ref(false)
const loginFormRef = ref(null)
// 微信登录容器ID
const qrCodeContainerId = "login_container";

// 跳转到注册页
const goToRegister = () => {
  router.push('/register')
}

// 跳转到用户协议页
const goToAgreement = () => {
  let routeData = router.resolve('/user-agreement');
  window.open(routeData.href, '_blank');
}

// 账号密码登录
const onLogin = async () => {
  if (!agreeTerms.value) {
    notify.info('请阅读并同意《i快招用户服务协议》' || title);
    return
  }

  // 验证表单
  const isValid = await loginFormRef.value.validate()
  if (!isValid) return

  loading.value = true

  try {
    const params = new URLSearchParams()
    params.append('name', form.value.username)
    params.append('pwd', form.value.password)

    // 确保params作为data参数传递
    // const { code, msg, data } = await api.post('/user/doLogin', params)
    const {data} = await userLogin(params);
    if (data) {
      Cookies.set('satoken', data, {path: '/', expires: 30}); // 更新 Cookie
    }
    // notify.success('登录成功');
    router.push('/')
  } catch (error) {
    console.log(error)
    notify.error('登录失败，请稍后重试');
  } finally {
    loading.value = false
  }
}

// 刷新二维码
const refreshQrcode = () => {
  qrcodeExpired.value = false;
  generateWechatQrCode();
}

// 生成二维码
const generateWechatQrCode = async () => {
  try {
    // 如果未勾选协议，不加载二维码
    if (!wechatAgreeTerms.value) {
      console.log('未勾选用户协议，不加载微信登录二维码');
      return;
    }
    
    // 确保DOM元素已存在
    if (!document.getElementById('login_container')) {
      console.warn('微信登录容器元素未找到，等待DOM渲染完成');
      setTimeout(generateWechatQrCode, 100);
      return;
    }

    // 清空之前的内容
    const container = document.getElementById('login_container');
    container.innerHTML = '';

    // 生成随机state用于防止CSRF攻击
    const state = Math.random().toString(36).substring(2, 15);

    // 构建微信授权URL - 使用VUE_APP_前缀的环境变量
    // 访问环境变量的方式在Vue CLI中是process.env
    const appId = process.env.VUE_APP_WECHAT_APP_ID;

    // 如果没有配置appId，显示错误信息
    if (!appId) {
      console.error('未配置微信AppID，请检查环境变量VUE_APP_WECHAT_APP_ID是否设置');
      notify.error('微信登录配置错误，请联系管理员');
      return;
    }
    
    const callbackUrl = process.env.VUE_APP_WECHAT_CALL_URL;
    const appUrl = process.env.NODE_ENV === 'production'
      ? 'https://login.ihire365.com/web-manage-api/user/wechat/callback'
      : `https://login.ihire365.com/web-manage-api/user/wechat/callback?localRedirect=${callbackUrl}`;
    
    console.log('微信登录回调URL:', appUrl);
    
    // 生成完整的微信OAuth2授权URL
    const redirectUri = encodeURIComponent(appUrl);

    // 确保WxLogin存在
    if (typeof WxLogin !== 'function') {
      console.error('WxLogin未定义，请确保微信登录脚本已加载');
      notify.error('微信登录组件加载失败，请刷新页面重试');
      return;
    }

    // 直接使用 WxLogin 生成二维码
    new WxLogin({
      self_redirect: false,
      id: 'login_container',
      appid: appId,
      scope: "snsapi_login",
      redirect_uri: redirectUri,
      state: state,
      style: "white",
      href: "",
    });
    
    console.log('微信登录二维码已生成');
  } catch (error) {
    console.error("微信二维码生成失败:", error);
    notify.error("加载微信登录失败，请刷新页面重试");
  }
};

// 组件挂载时初始化二维码
onMounted(() => {
  // 监听标签页变化
  watch(loginTab, (newTab) => {
    if (newTab === 'wechat') {
      // 当切换到微信登录标签时动态加载微信登录脚本
      loadWechatScript();
    }
  });
  
  // 监听微信协议勾选状态变化
  watch(wechatAgreeTerms, (newVal) => {
    if (newVal && loginTab.value === 'wechat') {
      // 勾选协议后加载微信登录脚本
      loadWechatScript();
    }
  });
  
  // 如果默认是微信登录标签，则加载脚本
  if (loginTab.value === 'wechat') {
    loadWechatScript();
  }
});

// 加载微信登录脚本
const loadWechatScript = () => {
  if (window.WxLogin) {
    // 如果已经加载，直接生成二维码
    generateWechatQrCode();
    return;
  }
  
  const script = document.createElement("script");
  script.src = "https://login.ihire365.com/proxy/wxLogin.js/";
  script.async = true;
  
  script.onload = () => {
    console.log('微信登录脚本加载成功');
    generateWechatQrCode();
  };
  
  script.onerror = (error) => {
    console.error('微信登录脚本加载失败:', error);
    notify.error('微信登录组件加载失败，请刷新页面重试');
  };
  
  document.body.appendChild(script);
};
</script>

<style scoped>
.login-container {
  width: 100%;
  padding: 0 12px;
  z-index: 1;
}

.login-card {
    border-radius: 5%;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.qrcode-container {
  position: relative;
  //border-radius: 8px;
  overflow: hidden;
  //border: 1px solid #eaeaea;
}

.qrcode-overlay {
  background: rgba(0, 0, 0, 0.7);
  color: white;
}

.agreement-overlay {
  background: rgba(0, 0, 0, 0.85);
  z-index: 10;
  backdrop-filter: blur(2px);
  border-radius: 8px;
  padding: 20px;
}

@media (max-width: 599px) {
  .login-container {
    padding: 0 16px;
  }

  .q-card {
    border-radius: 16px;
  }

  .q-tabs {
    font-size: 14px;
  }
}
</style>
