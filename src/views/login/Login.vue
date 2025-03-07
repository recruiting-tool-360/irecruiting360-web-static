<template>
  <div class="login-container">
    <!-- 纯CSS轻量级背景 -->
    <div class="light-background">
      <!-- 渐变背景 -->
      <div class="gradient-bg"></div>
      
      <!-- 轻量级CSS装饰元素 -->
      <div class="decoration-shapes">
        <div class="shape shape1"></div>
        <div class="shape shape2"></div>
        <div class="shape shape3"></div>
        <div class="shape shape4"></div>
        <div class="shape shape5"></div>
      </div>
    </div>
    
    <div class="logo">
      <img src="/logo/logo2.svg" alt="i快招logo" />
    </div>
    <el-card class="login-card glass-effect">
      <h2 class="title">登录</h2>
      <el-tabs v-model="activeTab">
        <el-tab-pane label="账号密码登录" name="account">
          <div class="account-login">
            <el-form :model="loginForm" :rules="rules" ref="loginFormRef">
              <el-form-item prop="username">
                <el-input
                    v-model="loginForm.username"
                    prefix-icon="User"
                    placeholder="用户名"
                    size="large" />
              </el-form-item>

              <el-form-item prop="password">
                <el-input
                    v-model="loginForm.password"
                    prefix-icon="Lock"
                    type="password"
                    placeholder="密码"
                    size="large"
                    @keyup.enter="handleLogin" />
              </el-form-item>

              <el-form-item>
                <el-checkbox v-model="loginForm.agreement">
                  已阅读并接受《<router-link to="/user-agreement" target="_blank">i快招用户服务协议</router-link>》
                </el-checkbox>
              </el-form-item>

              <div class="button-group">
                <el-button color="rgba(31, 124, 255, 1)" :loading="loading" @click="handleLogin" size="large" class="login-btn">
                  登录
                </el-button>
              </div>

              <div class="register-tip">
                还没有i快招系统账号？<router-link to="/register">免费注册</router-link>
              </div>
            </el-form>
          </div>
        </el-tab-pane>
        <el-tab-pane label="微信登录" name="wechat">
          <div class="wechat-login">
            <el-image src="/wechat-qr.png" class="qr-code"></el-image>
            <p>请使用微信扫码登录</p>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
    <div class="footer-container">
      <div class="copyright">Copyright © 2025 上海智寻才信息科技有限公司</div>
      <div class="icp-footer">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          沪ICP备16020917号-17
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import {ref, reactive} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import api from '@/utils/api'
import Cookies from 'js-cookie'
import {useStore} from "vuex"

const store = useStore();
const router = useRouter()
const loginFormRef = ref(null)
const loading = ref(false)
const activeTab = ref('account')

const loginForm = reactive({
  username: '',
  password: '',
  agreement: false
})

const rules = {
  username: [
    {required: true, message: '请输入用户名', trigger: 'blur'},
    {min: 3, max: 20, message: '长度在 3 到 20 个字符', trigger: 'blur'}
  ],
  password: [
    {required: true, message: '请输入密码', trigger: 'blur'},
    {min: 6, max: 20, message: '长度在 6 到 20 个字符', trigger: 'blur'}
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  if (!loginForm.agreement) {
    ElMessage({
      message: '请先同意并勾选用户服务协议',
      type: 'warning',
      duration: 3000,
      center: true
    })
    return
  }

  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const params = new URLSearchParams()
        params.append('name', loginForm.username)
        params.append('pwd', loginForm.password)

        const {code, msg, data} = await api.post('/user/doLogin', params)

        if (code === 200) {
          if (data) {
            Cookies.set('satoken', data, {path: '/', expires: 30}); // 更新 Cookie
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
  position: relative;
  overflow: hidden;
}

/* 轻量级背景效果 */
.light-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  overflow: hidden;
}

/* 渐变背景 - 使用固定渐变而非动画渐变减轻负载 */
.gradient-bg {
  position: absolute;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f5f7fa 0%, #e6eaf0 50%, #f0f4f8 100%);
}

/* 轻量级装饰形状 */
.decoration-shapes {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.shape {
  position: absolute;
  border-radius: 50%;
  opacity: 0.2;
}

.shape1 {
  width: 300px;
  height: 300px;
  background: linear-gradient(45deg, #7392d2, #96c8fb);
  top: -120px;
  left: -80px;
  animation: pulse 15s infinite alternate;
}

.shape2 {
  width: 250px;
  height: 250px;
  background: linear-gradient(45deg, #6a95e0, #8bc2f7);
  bottom: -100px;
  left: 15%;
  animation: pulse 12s infinite alternate-reverse;
}

.shape3 {
  width: 200px;
  height: 200px;
  background: linear-gradient(45deg, #8aa5d9, #b0d2f5);
  top: 20%;
  right: 10%;
  animation: pulse 18s infinite alternate;
}

.shape4 {
  width: 350px;
  height: 350px;
  background: linear-gradient(45deg, #7c9bd5, #a0c9f7);
  bottom: -150px;
  right: -100px;
  animation: pulse 20s infinite alternate-reverse;
}

.shape5 {
  width: 180px;
  height: 180px;
  background: linear-gradient(45deg, #89a7e0, #aad0fa);
  top: 10%;
  right: 25%;
  animation: pulse 14s infinite alternate;
}

/* 轻量级脉冲动画 - 只改变不透明度和尺寸，非常轻量 */
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.1;
  }
  100% {
    transform: scale(1.05);
    opacity: 0.25;
  }
}

.logo {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 3;

  img {
    height: 40px;
  }
}

/* 卡片效果 */
.glass-effect {
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
}

.login-card {
  width: 400px;
  padding: 20px;
  z-index: 2;
  border-radius: 12px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.08);
  }

  .title {
    text-align: center;
    margin-bottom: 30px;
    color: #334454;
    font-weight: 600;
    font-size: 28px;
  }

  .button-group {
    margin-top: 20px;
    display: flex;
    justify-content: center;

    .login-btn {
      width: 100%;
    }
  }

  .register-tip {
    text-align: center;
    margin-top: 15px;
    color: #606266;
    font-size: 14px;

    a {
      color: #409EFF;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .account-login {
    min-height: 235px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 20px 0;
  }

  .wechat-login {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;

    .qr-code {
      width: 200px;
      height: 200px;
      margin-bottom: 15px;
    }

    p {
      color: #606266;
      font-size: 14px;
    }
  }
}

/* 美化表单控件 */
:deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  
  &:hover, &:focus-within {
    box-shadow: 0 0 0 1px rgba(90, 120, 190, 0.3);
  }
}

:deep(.el-button--primary) {
  background: #5a78be;
  border: none;
  box-shadow: 0 4px 10px rgba(90, 120, 190, 0.25);
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 15px rgba(90, 120, 190, 0.3);
    background: #4a68ae;
  }
  
  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(90, 120, 190, 0.25);
  }
}

/* 页脚样式 */
.footer-container {
  position: absolute;
  bottom: 10px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 3;
}

.copyright {
  position: static;
  color: #666;
  font-size: 14px;
}

.icp-footer {
  position: static;
  font-size: 12px;
  color: #888;
  
  a {
    color: #888;
    text-decoration: none;
    
    &:hover {
      color: #555;
      text-decoration: underline;
    }
  }
}
</style>