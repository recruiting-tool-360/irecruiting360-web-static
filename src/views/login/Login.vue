<template>
  <div class="login-container">
    <el-card class="login-card">
      <h2 class="title">登录</h2>
      <el-form :model="loginForm" :rules="rules" ref="loginFormRef">
        <el-form-item prop="username">
          <el-input 
            v-model="loginForm.username" 
            prefix-icon="User"
            placeholder="用户名" />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input 
            v-model="loginForm.password" 
            prefix-icon="Lock"
            type="password" 
            placeholder="密码"
            @keyup.enter="handleLogin" />
        </el-form-item>

        <div class="button-group">
          <el-button type="primary" :loading="loading" @click="handleLogin">
            登录
          </el-button>
          <el-button @click="$router.push('/register')">
            注册账号
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/utils/api'
import Cookies from 'js-cookie';
import {useStore} from "vuex";

const store = useStore();
const router = useRouter()
const loginFormRef = ref(null)
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度在 6 到 20 个字符', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const params = new URLSearchParams()
        params.append('name', loginForm.username)
        params.append('pwd', loginForm.password)

        const { code, msg, data } = await api.post('/user/doLogin', params)

        if (code === 200) {
          if(data){
            Cookies.set('satoken', data, { path: '/', expires: 30 }); // 更新 Cookie
          }
          ElMessage.success('登录成功')
          router.push('/')
        } else {
          ElMessage.error(msg || '登录失败，请检查用户名和密码')
        }
      } catch (error) {
        console.log(error)
        ElMessage.error('登录失败，请稍后重试')
      } finally {
        loading.value = false
      }
    }
  })
}
</script>

<style scoped lang="scss">
.login-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f5f7fa;
}

.login-card {
  width: 400px;
  padding: 20px;

  .title {
    text-align: center;
    margin-bottom: 30px;
    color: #303133;
  }

  .button-group {
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
  }
}
</style>