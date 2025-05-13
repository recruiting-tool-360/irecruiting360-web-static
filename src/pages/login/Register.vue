<template>
  <q-page class="flex flex-center">
    <div class="login-container" :style="`max-width:${isMobile?'400px':'450'}px`">
      <!-- 注册卡片 -->
      <q-card class="login-card q-px-md">
        <q-card-section class="text-center q-pt-xl">
          <div class="text-h5 text-weight-bold text-grey-14">注册账号</div>
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <q-form
            @submit="onRegister"
            class="q-gutter-y-sm"
          >
            <q-input
              v-model="form.username"
              placeholder="请输入用户名"
              :rules="[val => !!val || '请输入用户名']"
            >
              <template v-slot:prepend>
                <q-icon name="person" color="grey-7" />
              </template>
            </q-input>

            <q-input
              v-model="form.password"
              :type="isPwd ? 'password' : 'text'"
              placeholder="请输入密码"
              :rules="[val => !!val || '请输入密码', val => val.length >= 6 || '密码长度至少6位']"
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

            <q-input
              v-model="form.confirmPassword"
              :type="isPwd ? 'password' : 'text'"
              placeholder="请确认密码"
              :rules="[
                val => !!val || '请确认密码',
                val => val === form.password || '两次输入的密码不一致'
              ]"
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

            <q-input
              v-model="form.inviteCode"
              placeholder="请输入邀请码"
            >
              <template v-slot:prepend>
                <q-icon name="card_giftcard" color="grey-7" />
              </template>
            </q-input>

            <div class="flex items-center">
              <q-checkbox v-model="agreeTerms" color="primary" />
              <div class="text-caption text-grey-8">
                已阅读并接受 <a href="#" @click.prevent="goToAgreement" class="text-primary">《i快招用户服务协议》</a>
              </div>
            </div>

            <q-btn
              :loading="loading"
              color="primary"
              class="full-width q-py-sm"
              label="立即注册"
              type="submit"
              unelevated
            >
              <template v-slot:loading>
                <q-spinner-dots class="on-left" />
                注册中...
              </template>
            </q-btn>
          </q-form>
        </q-card-section>

        <q-card-section class="text-center q-py-sm">
          <div class="text-caption text-grey-7">
            已有快招系统账号？ <a href="#" @click.prevent="goToLogin" class="text-primary">快捷登录</a>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const isMobile =ref($q.platform.is.mobile);
const router = useRouter()

// 注册表单
const form = ref({
  username: '',
  password: '',
  confirmPassword: '',
  inviteCode: ''
})

// 控制状态
const isPwd = ref(true)
const agreeTerms = ref(false)
const loading = ref(false)

// 账号注册
const onRegister = async () => {
  if (!agreeTerms.value) {
    $q.notify({
      color: 'negative',
      message: '请阅读并同意《i快招用户服务协议》',
      icon: 'error'
    })
    return
  }

  loading.value = true

  try {
    // 模拟注册请求
    await new Promise(resolve => setTimeout(resolve, 1500))

    // 注册成功
    $q.notify({
      color: 'positive',
      message: '注册成功',
      icon: 'check_circle'
    })

    // 跳转到登录页
    router.push('/login')
  } catch (error) {
    // 注册失败
    $q.notify({
      color: 'negative',
      message: '注册失败，请稍后重试',
      icon: 'error'
    })
  } finally {
    loading.value = false
  }
}

// 跳转到登录页
const goToLogin = () => {
  router.push('/login')
}

// 跳转到用户协议页
const goToAgreement = () => {
  let routeData = router.resolve('/user-agreement');
  window.open(routeData.href, '_blank');
}
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

@media (max-width: 599px) {
  .login-container {
    padding: 0 16px;
  }

  .q-card {
    border-radius: 16px;
  }
}
</style>
