<template>
  <div class="wechat-callback-container">
    <div class="loading-spinner">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
    <p>正在处理微信登录，请稍候...</p>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/utils/api'
import Cookies from 'js-cookie'
import {wechatLogin} from "@/api/user/UserApi";

const router = useRouter()
const route = useRoute()

onMounted(async () => {
  // 从URL中获取微信回调的code和state参数
  const code = route.query.code
  const state = route.query.state
  
  if (!code) {
    ElMessage.error('登录失败：缺少必要参数')
    router.push('/login')
    return
  }
  
  try {
    // 调用后端接口处理微信登录
    // const { code: resCode, msg, data } = await api.get('/user/wechat/login', {
    //   params: { code, state }
    // })
    const params = new URLSearchParams()
    params.append('code', code)
    params.append('state', state)

    // const {code: resCode, msg, data} = await api.post('/user/wechat/login', params);
    const {data} = wechatLogin(params);

    if (data) {
      Cookies.set('satoken', data, {path: '/', expires: 30}); // 更新 Cookie
    }
    ElMessage.success('登录成功')
    router.push('/')
  } catch (error) {
    console.error('微信登录处理出错:', error)
    ElMessage.error('微信登录处理出错，请稍后重试')
    router.push('/login')
  }
})
</script>

<style scoped lang="scss">
.wechat-callback-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: #f5f7fa;
  
  .loading-spinner {
    font-size: 32px;
    color: #1aad19;
    margin-bottom: 20px;
  }
  
  p {
    font-size: 16px;
    color: #606266;
  }
}
</style> 