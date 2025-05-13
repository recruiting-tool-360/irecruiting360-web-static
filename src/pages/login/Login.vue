<template>
  <q-page class="flex flex-center">
    <div class="login-container" :style="`max-width:${isMobile?'400px':'450'}px`">
      <!-- 登录卡片 -->
      <q-card class="login-card">
        <q-card-section class="text-center q-pt-xl">
          <div class="text-h6 text-weight-bold text-grey-14">登录</div>
        </q-card-section>

        <q-card-section class="q-pt-sm">
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
            <q-tab-panel name="wechat" class="q-px-md">
              <div class="column items-center q-pa-md">
                <div class="qrcode-container q-mb-md">
                  <q-img
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
                </div>
                <p class="text-center text-grey-8">
                  请使用微信扫描二维码登录<br>
                  <small>扫码后请在微信中确认登录</small>
                </p>
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <q-card-section class="text-center q-pb-lg">
          <div class="text-caption text-grey-7">
            还没有快招系统账号？ <a href="#" @click.prevent="goToRegister" class="text-primary">免费注册</a>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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
const loading = ref(false)
const qrcodeExpired = ref(false)
const loginFormRef = ref(null)

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
  qrcodeExpired.value = false

  // 模拟二维码过期
  setTimeout(() => {
    qrcodeExpired.value = true
  }, 60000) // 60秒后过期
}

// 组件挂载时初始化二维码
onMounted(() => {
  // 模拟二维码过期倒计时
  setTimeout(() => {
    qrcodeExpired.value = true
  }, 60000) // 60秒后过期
})
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
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eaeaea;
}

.qrcode-overlay {
  background: rgba(0, 0, 0, 0.7);
  color: white;
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
