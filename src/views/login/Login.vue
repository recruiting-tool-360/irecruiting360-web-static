<template>
  <div class="login-container">
    <el-card class="login-card">
      <h2 class="title">登录</h2>
      
      <!-- 添加登录方式选项卡 -->
      <el-tabs v-model="activeTab" class="login-tabs">
        <el-tab-pane label="账号密码登录" name="account">
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
        </el-tab-pane>
        
        <el-tab-pane label="微信扫码登录" name="wechat">
          <div class="wechat-login-container">
            <div id="wechat-login-qrcode" class="qrcode-container"></div>
            <div class="qrcode-tip">
              <p>扫码登录 无需注册</p>
              <p>微信扫一扫，快速登录</p>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/utils/api'
import Cookies from 'js-cookie';
import {useStore} from "vuex";

const store = useStore();
const router = useRouter()
const loginFormRef = ref(null)
const loading = ref(false)
const activeTab = ref('account') // 默认选中账号密码登录

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

// 初始化微信登录二维码
const initWechatLogin = () => {
  // 这里需要引入微信的JS SDK并初始化二维码
  // 实际实现时需要加载微信提供的JS SDK
  if (activeTab.value === 'wechat' && document.getElementById('wechat-login-qrcode')) {
    // 加载微信JS SDK的示例代码
    const script = document.createElement('script')
    script.src = 'http://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'
    script.onload = () => {
      // 微信JS SDK加载完成后初始化二维码
      if (typeof WxLogin !== 'undefined') {
        new WxLogin({
          self_redirect: false,
          id: 'wechat-login-qrcode', 
          appid: 'wxff34cd8fe2c0a6e8', // 需要替换为实际的AppID
          scope: 'snsapi_login',
          redirect_uri: encodeURIComponent(window.location.origin + '/api/wechat/callback'), // 回调地址
          state: generateRandomState(), // 生成随机字符串作为state
          style: 'black',
          href: '' // 可以自定义样式
        })
      }
    }
    document.body.appendChild(script)
  }
}

// 生成随机state字符串，用于防止CSRF攻击
const generateRandomState = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// 监听标签页变化，当切换到微信登录时初始化二维码
watch(activeTab, (newVal) => {
  if (newVal === 'wechat') {
    // 延迟一下确保DOM已经渲染
    setTimeout(() => {
      initWechatLogin()
    }, 100)
  }
})

onMounted(() => {
  // 如果默认是微信登录标签，则初始化二维码
  if (activeTab.value === 'wechat') {
    initWechatLogin()
  }
})
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
    margin-bottom: 20px;
    color: #303133;
  }

  .button-group {
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
  }
  
  .login-tabs {
    width: 100%;
  }
}

.wechat-login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  
  .qrcode-container {
    width: 200px;
    height: 200px;
    margin-bottom: 20px;
    border: 1px solid #eaeaea;
  }
  
  .qrcode-tip {
    text-align: center;
    color: #606266;
    
    p {
      margin: 5px 0;
      font-size: 14px;
    }
    
    p:first-child {
      color: #1aad19;
      font-weight: bold;
    }
  }
}
</style>