<template>
  <div class="login-container">
    <div class="logo">
      <img src="/logo/ikuaizhaologo.jpg" alt="i快招logo" />
    </div>
    <el-card class="login-card">
      <h2 class="title">注册账号</h2>
      <el-form :model="registerForm" :rules="rules" ref="registerFormRef">
        <el-form-item prop="username">
          <el-input 
            v-model="registerForm.username" 
            prefix-icon="User"
            placeholder="请输入用户名"
            size="large" />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input 
            v-model="registerForm.password" 
            prefix-icon="Lock"
            type="password" 
            placeholder="请输入密码"
            size="large" />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input 
            v-model="registerForm.confirmPassword" 
            prefix-icon="Lock"
            type="password" 
            placeholder="请确认密码"
            size="large" />
        </el-form-item>

        <el-form-item prop="agreement">
          <el-checkbox v-model="registerForm.agreement">
            已阅读并接受《<router-link to="/user-agreement" target="_blank">i快招用户服务协议</router-link>》
          </el-checkbox>
        </el-form-item>

        <div class="button-group">
          <el-button type="primary" :loading="loading" @click="handleRegister" size="large" class="register-btn">
            立即注册
          </el-button>
          <div class="login-tip">已有i快招系统账号？<router-link to="/login">快捷登录</router-link></div>
        </div>
      </el-form>
    </el-card>
    <div class="copyright">Copyright © 2025 上海智寻才信息科技有限公司</div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/utils/api'

const router = useRouter()
const registerFormRef = ref(null)
const loading = ref(false)

const registerForm = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  agreement: false
})

const validatePass2 = (rule, value, callback) => {
  if (value !== registerForm.password) {
    callback(new Error('两次输入密码不一致'))
  } else {
    callback()
  }
}

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度在 6 到 20 个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validatePass2, trigger: 'blur' }
  ],
  agreement: [
    { required: true, message: '请阅读并接受用户服务协议', trigger: 'change' }
  ]
}

const handleRegister = async () => {
  if (!registerFormRef.value) return
  
  await registerFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const params = new URLSearchParams()
        params.append('name', registerForm.username)
        params.append('pwd', registerForm.password)

        const { code, msg } = await api.post('/user/doSignup', params)
        
        if (code === 200) {
          ElMessage.success('注册成功')
          router.push('/login')
        } else {
          ElMessage.error(msg || '注册失败，该用户名可能已被使用')
        }
      } catch (error) {
        ElMessage.error('注册失败，请稍后重试')
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
  position: relative;

  .logo {
    position: absolute;
    top: 20px;
    left: 20px;
    
    img {
      height: 40px;
    }
  }
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
    flex-direction: column;
    align-items: center;
    gap: 10px;

    .register-btn {
      width: 100%;
    }

    .login-tip {
      color: #606266;
      font-size: 14px;
      text-align: center;

      a {
        color: #409EFF;
        text-decoration: none;
        &:hover {
          text-decoration: underline;
        }
      }
    }
  }

  el-form {
    min-height: 235px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 20px 0;
  }
}

.copyright {
  position: absolute;
  bottom: 20px;
  width: 100%;
  text-align: center;
  color: #909399;
  font-size: 14px;
}
</style>