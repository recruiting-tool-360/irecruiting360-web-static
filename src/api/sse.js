/**
 * SSE通信服务
 */
import { ElMessage } from 'element-plus'
import store from '@/store'
import Cookies from 'js-cookie'

class SseClient {
  constructor() {
    this.eventSource = null
    this.retryCount = 0
    this.maxRetry = 5
    this.listeners = {}
    this.isConnectionFailed = false
    this.lastMessageTime = 0
    this.healthCheckInterval = null
  }

  // 连接SSE，允许传入用户ID
  connect(userId) {
    if (this.eventSource) {
      this.disconnect()
    }

    // 使用环境变量中配置的API基础URL
    const apiBaseUrl = process.env.VUE_APP_API_BASE_URL || ''
    
    // 如果没有传入userId，尝试从store获取
    if (!userId) {
      const userInfo = store.getters.getUserInfo
      if (userInfo && userInfo.id) {
        userId = userInfo.id
      }
    }
    
    // 从cookie获取satoken
    const satoken = Cookies.get('satoken')
    
    // 构建SSE连接URL，改用新的路径并添加参数
    let url = `${apiBaseUrl}/sseManager/connect`
    const params = new URLSearchParams()
    if (satoken) {
      params.append('satoken', satoken)
    }
    
    // 如果有参数，添加到URL
    if (params.toString()) {
      url += `?${params.toString()}`
    }
    
    console.log('正在连接SSE服务:', url.replace(satoken, '******')) // 日志中隐藏token值
    this.eventSource = new EventSource(url)

    // 设置最后收到消息的时间
    this.lastMessageTime = Date.now()
    
    // 添加健康检查
    this.startHealthCheck()

    // 连接成功事件
    this.eventSource.addEventListener('CONNECT', (event) => {
      this.lastMessageTime = Date.now()  // 更新最后消息时间
      console.log('SSE连接成功:', event.data)
      this.retryCount = 0
      if (this.listeners['connect']) {
        this.listeners['connect'].forEach(callback => callback(event.data))
      }
    })

    // 添加认证错误事件监听
    this.eventSource.addEventListener('AUTH_ERROR', (event) => {
      console.error('SSE认证错误:', event.data)
      
      // 关闭SSE连接
      this.disconnect()
      
      // 解析错误消息
      let errorMsg = '认证失败，请重新登录'
      try {
        const data = JSON.parse(event.data)
        errorMsg = data.message || errorMsg
      } catch (e) {
        // 如果解析失败，使用默认消息
        console.warn('解析认证错误消息失败:', e)
      }
      
      // 显示错误消息
      ElMessage({
        message: errorMsg,
        type: 'error',
        duration: 5000,
        showClose: true
      })
      
      // 触发认证错误回调
      if (this.listeners['authError']) {
        this.listeners['authError'].forEach(callback => callback(event.data))
      }
      
      // 重置连接状态，不再重试
      this.isConnectionFailed = true
      this.retryCount = this.maxRetry
    })

    // 普通消息事件
    this.eventSource.addEventListener('MESSAGE', (event) => {
      this.lastMessageTime = Date.now()  // 更新最后消息时间
      console.log('收到消息:', event.data)
      if (this.listeners['message']) {
        try {
          // 尝试解析JSON，如果失败则作为字符串处理
          const parsedData = typeof event.data === 'string' && event.data.trim().startsWith('{') 
            ? JSON.parse(event.data) 
            : event.data
          this.listeners['message'].forEach(callback => callback(parsedData))
        } catch (e) {
          console.warn('无法解析消息为JSON，作为字符串处理:', e)
          this.listeners['message'].forEach(callback => callback(event.data))
        }
      }
    })

    // 广播消息事件
    this.eventSource.addEventListener('BROADCAST', (event) => {
      this.lastMessageTime = Date.now()  // 更新最后消息时间
      console.log('收到广播:', event.data)
      if (this.listeners['broadcast']) {
        let parsedData = event.data
        if (typeof event.data === 'string') {
          try {
            parsedData = JSON.parse(event.data)
          } catch (e) {
            // 如果解析失败，保留原始字符串
            console.warn('解析JSON失败，使用原始字符串', e)
          }
        }
        this.listeners['broadcast'].forEach(callback => callback(parsedData))
      }
    })

    // 连接错误处理 - 修改以避免在认证错误后重试
    this.eventSource.onerror = (event) => {
      // 安全地记录错误，避免尝试访问undefined的属性
      console.error('SSE连接错误:', event)
      
      // 触发错误回调，传递事件对象
      if (this.listeners['error']) {
        this.listeners['error'].forEach(callback => callback(event))
      }

      // 关闭当前连接
      if (this.eventSource) {
        this.eventSource.close()
      }
      
      // 重试连接逻辑 - 添加检查确保不在认证错误后重试
      if (this.retryCount < this.maxRetry && !this.isConnectionFailed) {
        this.retryCount++
        // 使用指数退避算法计算重试延迟
        const retryDelay = Math.min(1000 * Math.pow(2, this.retryCount), 30000) // 最长30秒
        
        // 显示轻量级提示
        ElMessage({
          message: `与服务器连接断开，${retryDelay/1000}秒后尝试重新连接(${this.retryCount}/${this.maxRetry})...`,
          type: 'warning',
          duration: retryDelay,
          showClose: true // 显示关闭按钮
        })
        
        setTimeout(() => {
          if (document.visibilityState !== 'hidden') {
            this.connect(userId)
          } else {
            // 如果页面不可见，等待页面可见时再连接
            const onVisibilityChange = () => {
              if (document.visibilityState !== 'hidden') {
                document.removeEventListener('visibilitychange', onVisibilityChange)
                this.connect(userId)
              }
            }
            document.addEventListener('visibilitychange', onVisibilityChange)
          }
        }, retryDelay)
      } else {
        console.error('达到最大重连次数，不再重试')
        ElMessage({
          message: '与服务器的连接已断开，请刷新页面或稍后再试',
          type: 'error',
          duration: 0,    // 不自动关闭
          showClose: true // 显示关闭按钮
        })
        
        // 添加恢复连接按钮
        this.isConnectionFailed = true
        
        // 可以在UI中显示重连按钮
        if (this.listeners['connectionFailed']) {
          this.listeners['connectionFailed'].forEach(callback => callback())
        }
      }
    }
  }

  // 断开连接
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      console.log('SSE连接已关闭')
    }
    
    // 清除健康检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  // 添加事件监听
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  // 移除事件监听
  off(event, callback) {
    if (this.listeners[event]) {
      if (callback) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
      } else {
        delete this.listeners[event]
      }
    }
  }

  // 手动重新连接方法
  reconnect() {
    // 重置重试计数
    this.retryCount = 0
    this.isConnectionFailed = false
    
    // 获取用户ID
    const userInfo = store.getters.getUserInfo
    const userId = userInfo?.id
    
    // 重新连接
    this.connect(userId)
    
    return true
  }

  // 添加健康检查方法
  startHealthCheck() {
    // 清除可能存在的旧健康检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    
    // 每30秒检查一次连接状态
    this.healthCheckInterval = setInterval(() => {
      // 如果超过2分钟没有收到任何消息
      if (Date.now() - this.lastMessageTime > 120000) {
        console.warn('SSE连接可能已断开，超过2分钟未收到消息')
        
        // 尝试关闭并重新连接
        if (this.eventSource) {
          this.disconnect()
          
          // 获取用户ID并重连
          const userInfo = store.getters.getUserInfo
          const userId = userInfo?.id
          if (userId) {
            console.log('尝试重新建立SSE连接...')
            this.connect(userId)
          }
        }
      }
    }, 30000)
  }
}

// 导出单例
export default new SseClient() 