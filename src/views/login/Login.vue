<template>
  <div class="login-container">
    <div class="logo">
      <img src="/logo/ikuaizhaologo.jpg" alt="i快招logo" />
    </div>
    <el-card class="login-card">
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
                <el-button type="primary" :loading="loading" @click="handleLogin" size="large" class="login-btn">
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
import Cookies from 'js-cookie';
import {useStore} from "vuex";

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

.footer-container {
  position: absolute;
  bottom: 10px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.copyright {
  position: static;
  color: #909399;
  font-size: 14px;
}

.icp-footer {
  position: static;
  font-size: 12px;
  color: #999;
  
  a {
    color: #999;
    text-decoration: none;
    
    &:hover {
      color: #666;
      text-decoration: underline;
    }
  }
}
</style>