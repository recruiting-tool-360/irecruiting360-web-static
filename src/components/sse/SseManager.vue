<template>
  <!-- 添加一个隐藏的div作为根元素 -->
  <div style="display: none;"></div>
</template>

<script setup>
import { onMounted, onUnmounted, watch, computed } from 'vue'
import { useStore } from 'vuex'
import { ElMessage } from 'element-plus'
import sseClient from '@/api/sse.js'
import { getUserInfo, userlogout } from "@/api/user/UserApi"
import Cookies from 'js-cookie'

const store = useStore();
const userInfo = computed(() => store.getters.getUserInfo);
const allChannel = computed(() => store.getters.getChannelConf);

// 处理认证错误 - 自动退出登录
async function handleAuthError(data) {
  // console.error('SSE认证错误，准备退出登录:', data)
  
  // 显示错误消息
  let errorMsg = '您的登录信息已失效，请重新登录'
  try {
    if (typeof data === 'string') {
      const parsedData = JSON.parse(data)
      errorMsg = parsedData.message || errorMsg
    } else if (data && data.message) {
      errorMsg = data.message
    }
  } catch (e) {
    console.warn('解析认证错误消息失败:', e)
  }
  
  ElMessage({
    message: errorMsg,
    type: 'error',
    duration: 5000,
    showClose: true
  })
  
  // 执行退出登录流程
  await logout()
}

//更新ai分数
const updateChannelScore = (msg) => {
  let valueElement = allChannel.value[msg.channel];
  if(valueElement){
    let allJob = allChannel.value['ALL'];
    valueElement.cardInfoRef.updateScore(msg);
    allJob.cardInfoRef.updateScore(msg);
  }
}

// 退出登录函数 - 从Header.vue复制过来的逻辑
async function logout() {
  Cookies.remove('satoken', {path: '/'});
  try {
    await userlogout();
    store.commit('changeUserInfo', null);
    store.commit('clearSearchConditionId');
  } catch (e) {
    console.log(e)
  }
  window.location.href = '/login';
}

// 初始化用户信息
async function userInfoInit() {
  try {
    let { data, success } = await getUserInfo()
    if (success && success === 'success') {
      store.commit('changeUserInfo', data)
      // 用户信息获取成功后连接SSE
      connectSse()
    } else {
      store.commit('changeUserInfo', null)
      ElMessage.error('用户信息异常，请联系管理员')
      window.location.href = '/login'
    }
  } catch (ex) {
    store.commit('changeUserInfo', null)
    ElMessage.error('用户信息异常，请联系管理员')
    console.log(ex)
    window.location.href = '/login'
  }
}

// 添加连接失败处理
function handleConnectionFailed() {
  ElMessage({
    message: '与服务器的连接已断开',
    type: 'error',
    duration: 5000,
    showClose: true
  })
  
  // 30秒后自动尝试恢复连接
  setTimeout(() => {
    if (sseClient.isConnectionFailed) {
      console.log('尝试恢复SSE连接...')
      sseClient.reconnect()
    }
  }, 30000)
}

// 连接SSE服务
function connectSse() {
  if (!userInfo.value || !userInfo.value.id) return
  
  // 断开可能的已有连接
  sseClient.disconnect()
  
  // 使用用户ID连接SSE
  const userId = userInfo.value.id
  sseClient.connect(userId)
  
  // 添加消息处理
  sseClient.on('connect', handleSseConnect)
  sseClient.on('broadcast', handleSseBroadcast)
  sseClient.on('message', handleSseMessage)
  sseClient.on('error', handleSseError)
  sseClient.on('connectionFailed', handleConnectionFailed)
  sseClient.on('authError', handleAuthError) // 添加认证错误处理
}

// SSE事件处理函数
function handleSseConnect(data) {
  try {
    // 解析连接消息
    const message = typeof data === 'string' ? JSON.parse(data) : data;
    // console.log('SSE连接成功:', message);
    
    // 如果是新格式消息，取出场景和数据
    if (message.scenario && message.data) {
      // 根据场景处理不同的连接消息
      if (message.scenario === 'connect') {
        console.warn('连接场景:', message.data);
      }
    }
  } catch (e) {
    console.warn('解析连接消息失败:', e);
  }
}

//收到SSE广播
async function handleSseBroadcast(data) {
  try {
    // 解析广播消息
    const message = typeof data === 'string' ? JSON.parse(data) : data;
    // console.log('收到SSE广播:', message);

    // 如果是新格式消息，取出场景和数据
    if (message.scenario && message.data !== undefined) {
      // 根据场景处理不同的广播消息
      console.log(typeof message.scenario)
      console.log(message.scenario)
      switch (message.scenario) {
        case 'notification':
          ElMessage.info({
            message: message.data.content || String(message.data),
            duration: 5000
          });
          break;
        case 'system':
          // 处理系统通知
          console.log('系统通知:', message.data);
          break;
        default:
          console.log(`未知场景(${message.scenario})的广播:`, message.data);
      }
    } else {
      // 兼容处理旧格式消息
      let displayMessage = typeof message === 'object' ? JSON.stringify(message) : message;
      console.log('旧格式广播:', displayMessage);
    }
  } catch (e) {
    console.warn('处理广播消息出错:', e);
  }
}

//收到SSE消息 个人
function handleSseMessage(data) {
  try {
    // 解析个人消息
    const message = typeof data === 'string' ? JSON.parse(data) : data;
    // console.log('收到SSE消息:', message);
    
    // 如果是新格式消息，取出场景和数据
    if (message.scenario && message.data !== undefined) {
      // 根据场景处理不同的个人消息
      switch (message.scenario) {
        case 'chat':
          // 处理聊天消息
          console.log('聊天消息:', message.data);
          break;
        case 'notification':
          // 处理个人通知
          ElMessage({
            message: message.data.content || String(message.data),
            type: 'info',
            duration: 5000
          });
          break;
        case 'RESUME_SCORE':
          // 处理系统通知
          updateChannelScore(message.data);
          break;
        default:
          console.log(`未知场景(${message.scenario})的消息:`, message.data);
      }
    } else {
      // 兼容处理旧格式消息
      let displayMessage = typeof message === 'object' ? JSON.stringify(message) : message;
      // console.log('旧格式消息:', displayMessage);
    }
  } catch (e) {
    console.warn('处理个人消息出错:', e);
  }
}

function handleSseError(error) {
  console.error('SSE连接错误:', error)
}

// 监听用户信息变化
watch(() => userInfo.value, (newVal, oldVal) => {
  if (newVal && newVal.id) {
    if (!oldVal || newVal.id !== oldVal.id) {
      // 用户变化时重新连接
      connectSse()
    }
  } else {
    // 用户登出时断开连接
    sseClient.disconnect()
  }
})

onMounted(async () => {
  // 初始化用户信息
  await userInfoInit()
})

onUnmounted(() => {
  // 组件卸载时断开连接
  sseClient.disconnect()
  
  // 移除事件监听
  sseClient.off('connect')
  sseClient.off('broadcast')
  sseClient.off('message')
  sseClient.off('error')
  sseClient.off('connectionFailed')
  sseClient.off('authError') // 移除认证错误监听
})

// 导出函数以便其他组件调用
defineExpose({
  refreshUserInfo: userInfoInit
})
</script> 