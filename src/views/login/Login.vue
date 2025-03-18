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
      <!-- 条件渲染：显示登录表单或注册表单 -->
      <template v-if="showLoginForm">
        <h2 class="title">登录</h2>
<!--        <div id="qrCodeContainer" style="cursor: pointer;">-->
<!--          <p>点击二维码登录微信</p>-->
<!--        </div>-->
        <el-tabs v-model="activeTab" @tab-click="handleTabClick">
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
                  还没有i快招系统账号？<a href="javascript:;" @click="switchToRegister">免费注册</a>
                </div>
              </el-form>
            </div>
          </el-tab-pane>
          <el-tab-pane label="微信登录" name="wechat">
            <div class="wechat-login">
              <div ref="qrCodeContainer" class="qr-code-container" id="qrCodeContainer">
                <div class="loading-container" v-if="!qrCodeLoaded">
                  <el-icon class="is-loading"><Loading /></el-icon>
                  <p>正在加载微信登录...</p>
                </div>
                <!-- iframe将被动态插入到这里 -->
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
      
      <!-- 注册表单组件 -->
      <RegisterForm 
        v-else 
        @switch-to-login="switchToLogin" 
        @register-success="handleRegisterSuccess"
        ref="registerFormRef" 
      />
    </el-card>
    
    <div class="footer-container">
      <div class="copyright">Copyright © 2025 上海智寻才信息科技有限公司</div>
      <div class="icp-footer">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          沪ICP备2025117219号-1
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import {ref, reactive, onMounted, nextTick} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import api from '@/utils/api'
import Cookies from 'js-cookie'
import {useStore} from "vuex"
import RegisterForm from '@/components/login/RegisterForm.vue'

const store = useStore();
const router = useRouter()
const loginFormRef = ref(null)
const registerFormRef = ref(null)
const loading = ref(false)
const activeTab = ref('account')
const showLoginForm = ref(true) // 控制显示登录还是注册表单
const qrCodeContainer = ref(null)
const qrCodeLoaded = ref(false)

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

// 处理注册成功
const handleRegisterSuccess = () => {
  // 可以在这里做一些额外处理，例如填充登录表单
  // 注册成功会自动切换到登录表单
}

// 切换到注册表单
const switchToRegister = () => {
  showLoginForm.value = false
  // 重置表单
  if (registerFormRef.value) {
    registerFormRef.value.resetForm()
  }
}

// 切换到登录表单
const switchToLogin = () => {
  showLoginForm.value = true
  // 重置表单
  if (loginFormRef.value) {
    loginFormRef.value.resetFields()
  }
}

// 生成微信登录二维码
const generateWechatQrCode2 = async () => {
  try {
    // 确保容器已经渲染
    // if (!qrCodeContainer.value) {
    //   console.error('二维码容器未渲染')
    //   return
    // }
    
    // 生成随机state用于防止CSRF攻击
    const state = Math.random().toString(36).substring(2, 15)
    
    // 获取当前域名作为回调域名 - 确保使用正确的格式
    // 不要包含端口号，使用完整的路径，对URL进行编码
    // let origin = window.location.origin
    // // 如果是本地开发环境，使用配置中的回调域名
    // if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    //   origin = 'https://login.ihire365.com' // 替换为您的实际生产域名
    // }
    //
    // const callbackUrl = `${origin}/wechat/callback`
    
    // 构建微信授权URL - 使用VUE_APP_前缀的环境变量
    // 访问环境变量的方式在Vue CLI中是process.env
    const appId = process.env.VUE_APP_WECHAT_APP_ID
    
    // 如果没有配置appId，显示错误信息
    if (!appId) {
      console.error('未配置微信AppID，请检查环境变量VUE_APP_WECHAT_APP_ID是否设置')
      ElMessage.error('微信登录配置错误，请联系管理员')
      return
    }
    const appUrl = process.env.VUE_APP_API_BASE_URL
    // 生成完整的微信OAuth2授权URL
    const redirectUri = encodeURIComponent(`${appUrl}/user/wechat/callback`)
    const wechatOAuthUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}&lang=zh_CN#wechat_redirect`

    // 创建iframe
    const iframe = document.createElement('iframe')
    iframe.src = wechatOAuthUrl
    iframe.style.width = '300px'
    iframe.style.height = '400px'
    iframe.style.border = 'none'
    iframe.style.overflow = 'hidden'

    // 监听iframe加载完成
    iframe.onload = () => {
      qrCodeLoaded.value = true
    }

    // 添加iframe到二维码容器
    qrCodeContainer.value.appendChild(iframe)

    // **使用 window.open 在新窗口打开**
    // const loginWindow = window.open(
    //     wechatOAuthUrl,
    //     '_blank',
    //     'width=600,height=600,left=500,top=200'
    // );
    //
    // if (!loginWindow) {
    //   console.error('微信登录窗口被拦截，请允许弹出窗口');
    //   ElMessage.error('请允许弹出窗口或手动点击登录');
    // }

    // **生成二维码并渲染到页面**
    // const qrCanvas = await QRCode.toCanvas(wechatOAuthUrl);
    //
    // // 将二维码添加到容器
    // const qrCodeContainer = document.getElementById('qrCodeContainer');
    // qrCodeContainer.innerHTML = ''; // 清空
    // qrCodeContainer.appendChild(qrCanvas);
    //
    // // **点击二维码打开授权页面**
    // qrCanvas.addEventListener('click', () => {
    //   window.open(wechatOAuthUrl, '_blank', 'width=600,height=600,left=500,top=200');
    // });

  } catch (error) {
    console.error('嵌入微信登录页面失败:', error)
    ElMessage.error('加载微信登录失败，请刷新页面重试')
  }
}

const generateWechatQrCode4 = async () => {
  try {
    // 确保容器已经渲染
    if (!qrCodeContainer.value) {
      console.error('二维码容器未渲染');
      return;
    }

    // 清空容器内容
    qrCodeContainer.value.innerHTML = '';

    // 生成随机state用于防止CSRF攻击
    const state = Math.random().toString(36).substring(2, 15);

    // 获取当前域名作为回调域名
    let origin = window.location.origin;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      origin = 'https://login.ihire365.com'; // 替换为您的实际生产域名
    }

    // 构建回调URL并编码
    const redirectUri = encodeURIComponent(`https://login.ihire365.com/web/wechatCallback`);

    // 获取AppID
    const appId = process.env.VUE_APP_WECHAT_APP_ID;

    if (!appId) {
      console.error('未配置微信AppID，请检查环境变量VUE_APP_WECHAT_APP_ID是否设置');
      ElMessage.error('微信登录配置错误，请联系管理员');
      return;
    }

    // 动态加载微信登录JS
    const wxLoginScript = document.createElement('script');
    wxLoginScript.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';

    wxLoginScript.onload = () => {
      // 确保 wxLogin 在脚本加载后可用
      try {
        // 创建微信登录对象
        const wxLogin = new WxLogin({
          self_redirect: false,
          id: qrCodeContainer.value.id, // 容器ID
          appid: appId,
          scope: 'snsapi_login',
          redirect_uri: redirectUri,
          state: state,
          style: 'black', // 黑色文字
          fast_login: 1 // 启用快速登录功能
        });

        qrCodeLoaded.value = true; // 设置二维码加载状态
      } catch (error) {
        console.error('初始化微信登录失败:', error);
        ElMessage.error('微信登录初始化失败');
      }
    };

    wxLoginScript.onerror = (error) => {
      console.error('加载微信登录脚本失败:', error);
      ElMessage.error('加载微信登录失败，请刷新页面重试');
    };

    // 添加脚本到页面
    document.head.appendChild(wxLoginScript);

  } catch (error) {
    console.error('生成微信登录二维码失败:', error);
    ElMessage.error('加载微信登录失败，请刷新页面重试');
  }
};


const generateWechatQrCode = async () => {
  try {
    // 确保容器已经渲染
    if (!qrCodeContainer.value) {
      console.error('二维码容器未渲染')
      return
    }

    // 生成随机state用于防止CSRF攻击
    const state = Math.random().toString(36).substring(2, 15)

    // 构建微信授权URL - 使用VUE_APP_前缀的环境变量
    // 访问环境变量的方式在Vue CLI中是process.env
    const appId = process.env.VUE_APP_WECHAT_APP_ID

    // 如果没有配置appId，显示错误信息
    if (!appId) {
      console.error('未配置微信AppID，请检查环境变量VUE_APP_WECHAT_APP_ID是否设置')
      ElMessage.error('微信登录配置错误，请联系管理员')
      return
    }
    const callbackUrl = process.env.VUE_APP_WECHAT_CALL_URL;
    const appUrl = process.env.NODE_ENV === 'production'?'https://login.ihire365.com/web-manage-api/user/wechat/callback':`https://login.ihire365.com/web-manage-api/user/wechat/callback?localRedirect=${callbackUrl}`
    // console.log('appUrl:', appUrl)
    // 生成完整的微信OAuth2授权URL
    const redirectUri = encodeURIComponent(appUrl)
    const wechatOAuthUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}&lang=zh_CN#wechat_redirect`
    // console.log('wechatOAuthUrl:', wechatOAuthUrl)
    // 创建iframe
    // const iframe = document.createElement('iframe')
    // iframe.src = wechatOAuthUrl
    // iframe.style.width = '300px'
    // iframe.style.height = '400px'
    // iframe.style.border = 'none'
    // iframe.style.overflow = 'hidden'
    //
    // // 监听iframe加载完成
    // iframe.onload = () => {
    //   qrCodeLoaded.value = true
    // }
    //
    // // 添加iframe到二维码容器
    // qrCodeContainer.value.appendChild(iframe)

    // **使用 window.open 在新窗口打开**
    const loginWindow = window.open(
        wechatOAuthUrl,
        '_blank',
        'width=600,height=600,left=500,top=200'
    );

    if (!loginWindow) {
      console.error('微信登录窗口被拦截，请允许弹出窗口');
      ElMessage.error('请允许弹出窗口或手动点击登录');
    }
  } catch (error) {
    console.error('嵌入微信登录页面失败:', error)
    ElMessage.error('加载微信登录失败，请刷新页面重试')
  }
}

// 监听标签页切换
const handleTabChange = (tab) => {
  if (tab === 'wechat' && !qrCodeLoaded.value) {
    // 当切换到微信登录标签时，生成二维码
    generateWechatQrCode()
  }
}

// 处理标签页点击事件
const handleTabClick = (tab) => {
  const tabName = tab.props.name
  handleTabChange(tabName)
}

onMounted(() => {

  const satoken = Cookies.get('satoken')
  if (satoken) {
    // 如果已经登录，则跳转到首页
    router.push('/')
  }

  // 如果默认标签页是微信登录，则生成二维码
  if (activeTab.value === 'wechat') {
    nextTick(() => {
      if (qrCodeContainer.value) {
        generateWechatQrCode();
      }
    });
  }
})
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
    min-height: 250px;

    .qr-code-container, .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .loading-container {
      font-size: 32px;
      color: #67c23a;
      margin-bottom: 15px;
    }

    .qr-code {
      width: 200px;
      height: 200px;
      margin-bottom: 15px;
      border: 1px solid #ebeef5;
      border-radius: 4px;
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