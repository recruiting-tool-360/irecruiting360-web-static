<template>
  <q-page class="flex flex-center column">
    <div class="text-center">
      <q-spinner size="3em" color="primary" />
      <p class="q-mt-md text-body1 text-grey-8">正在处理微信登录，请稍候...</p>
    </div>
  </q-page>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { wechatLogin } from 'src/api/user/UserApi'
import Cookies from 'js-cookie'
import notify from 'src/util/notify'

const router = useRouter()
const route = useRoute()

onMounted(async () => {
  // 从URL中获取微信回调的code和state参数
  const code = route.query.code
  const state = route.query.state
  
  if (!code) {
    notify.error('登录失败：缺少必要参数')
    router.push('/login')
    return
  }
  
  try {
    // 调用后端接口处理微信登录
    const params = new URLSearchParams()
    params.append('code', code)
    params.append('state', state)

    const { data } = await wechatLogin(params)

    if (data) {
      Cookies.set('satoken', data, { path: '/', expires: 30 }) // 更新 Cookie
      notify.success('登录成功')
      router.push('/')
    } else {
      throw new Error('登录失败，未获取到有效的登录凭证')
    }
  } catch (error) {
    console.error('微信登录处理出错:', error)
    notify.error('微信登录处理出错，请稍后重试')
    router.push('/login')
  }
})
</script>

<style lang="sass" scoped>
.q-page
  background-color: #f5f7fa
</style> 