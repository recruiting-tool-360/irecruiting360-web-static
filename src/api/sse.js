/**
 * SSE通信服务
 */
import notify from 'src/util/notify'
import store from '../store'
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
    this.lastHeartbeatSeq = null

    // 监听网络状态变化
    window.addEventListener('online', () => {
      console.log('网络已恢复连接');
      if (this.isConnectionFailed) {
        console.log('检测到网络重新连接，尝试恢复SSE连接');
        this.reconnect();
      }
    });

    // 监听页面可见性变化，在页面重新变为可见时尝试恢复连接
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' &&
          (!this.eventSource || this.eventSource.readyState === 2)) {
        console.log('页面重新可见，检查SSE连接状态');
        // 检查连接是否已经断开
        const now = Date.now();
        const elapsed = now - this.lastMessageTime;
        if (elapsed > 60000 || !this.eventSource) {
          // console.log('SSE连接已失效或不存在，尝试重新连接');
          this.reconnect();
        }
      }
    });
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

    // console.log('正在连接SSE服务:', url.replace(satoken, '******')) // 日志中隐藏token值
    this.eventSource = new EventSource(url)

    // 设置最后收到消息的时间
    this.lastMessageTime = Date.now()

    // 添加健康检查
    this.startHealthCheck()

    // 连接成功事件
    this.eventSource.addEventListener('CONNECT', (event) => {
      this.lastMessageTime = Date.now()  // 更新最后消息时间
      // console.log('SSE连接成功:', event.data)
      this.retryCount = 0
      if (this.listeners['connect']) {
        this.listeners['connect'].forEach(callback => callback(event.data))
      }
    })

    // 添加认证错误事件监听
    this.eventSource.addEventListener('AUTH_ERROR', (event) => {
      // console.error('SSE认证错误:', event.data)

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
      notify.error(errorMsg, {
        timeout: 5000,
        closeBtn: true
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
      // console.log('收到消息事件:', event);

      try {
        // 记录最后收到消息的时间
        this.lastMessageTime = Date.now();

        // 解析消息内容
        const messageData = event.data;
        // console.log('消息数据:', messageData);

        // 处理消息，确保即使解析失败也不会中断
        try {
          // 尝试解析JSON
          const jsonData = JSON.parse(messageData);

          // 触发消息回调
          if (this.listeners['message']) {
            this.listeners['message'].forEach(callback => {
              try {
                callback(jsonData);
              } catch (callbackError) {
                console.error('消息回调执行错误:', callbackError);
              }
            });
          }

          // 尝试发送确认（如果后端支持）
          this.sendMessageAck(jsonData);

        } catch (parseError) {
          // console.warn('解析消息失败:', parseError);
          // 即使解析失败，仍然尝试调用回调（使用原始数据）
          if (this.listeners['message']) {
            this.listeners['message'].forEach(callback => {
              try {
                callback(messageData);
              } catch (callbackError) {
                console.error('消息回调执行错误:', callbackError);
              }
            });
          }
        }
      } catch (e) {
        console.error('处理MESSAGE事件出错:', e);
      }
    })

    // 广播消息事件
    this.eventSource.addEventListener('BROADCAST', (event) => {
      this.lastMessageTime = Date.now()  // 更新最后消息时间
      // console.log('收到广播:', event.data)
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

    // 心跳消息事件监听
    this.eventSource.addEventListener('HEARTBEAT', (event) => {
      this.lastMessageTime = Date.now();  // 更新最后消息时间
      // console.log('收到心跳消息:', event.data, 'eventId:', event.lastEventId);

      // 记录最后接收的心跳ID
      try {
        const heartbeat = JSON.parse(event.data);
        if (heartbeat && heartbeat.data && heartbeat.data.seq !== undefined) {
          this.lastHeartbeatSeq = heartbeat.data.seq;
          // console.log(`心跳序列号: ${this.lastHeartbeatSeq}`);
        }
      } catch (e) {
        console.warn('解析心跳消息失败:', e);
      }

      // 触发心跳回调
      if (this.listeners['heartbeat']) {
        this.listeners['heartbeat'].forEach(callback => {
          try {
            callback(event.data);
          } catch (e) {
            console.error('心跳回调执行错误:', e);
          }
        });
      }
    });

    // 连接错误处理 - 修改以避免在认证错误后重试
    this.eventSource.onerror = (event) => {
      // 安全地记录错误，避免尝试访问undefined的属性
      // console.error('SSE连接错误:', event)

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
        notify.warning(`与服务器连接断开，${retryDelay/1000}秒后尝试重新连接(${this.retryCount}/${this.maxRetry})...`, {
          timeout: retryDelay,
          closeBtn: true
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
        // console.error('达到最大重连次数，不再重试')
        notify.error('与服务器的连接已断开，请刷新页面或稍后再试', {
          timeout: 0,    // 不自动关闭
          closeBtn: true // 显示关闭按钮
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
      // console.log('SSE连接已关闭')
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

  // 增强健康检查
  startHealthCheck() {
    // 清除可能存在的旧计时器
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      // 检查连接状态
      if (!this.eventSource) {
        // console.log('SSE连接不存在，跳过健康检查');
        return;
      }

      // 增加对EventSource readyState的检查
      if (this.eventSource.readyState === 2) { // CLOSED
        // console.warn('SSE连接已关闭 (readyState=2)，将尝试重新连接');
        this.reconnectAfterFailure();
        return;
      }

      // 检查最后消息时间
      const now = Date.now();
      const elapsed = now - this.lastMessageTime;

      // console.log(`SSE健康检查: 上次消息距今 ${Math.round(elapsed/1000)} 秒, readyState=${this.eventSource.readyState}`);

      // 更积极的重连策略：当60秒未收到消息，就重新连接
      if (elapsed > 60000) {
        // console.warn('SSE连接可能已失效，超过60秒未收到消息，准备重连');
        this.reconnectAfterFailure();
      }
    }, 20000); // 更频繁地检查
  }

  // 新增重连方法
  reconnectAfterFailure() {
    // 记录重连前状态
    const wasConnected = this.eventSource !== null;

    // 尝试关闭并重新连接
    this.disconnect();

    // 报告连接问题
    if (this.listeners['connectionIssue']) {
      this.listeners['connectionIssue'].forEach(callback => {
        try {
          callback({type: 'silent_disconnect'});
        } catch (e) {
          console.error('连接问题回调执行错误:', e);
        }
      });
    }

    // 只有之前是连接状态才重连
    if (wasConnected) {
      // console.log('重新建立SSE连接...');
      // 获取用户ID并重连
      const userInfo = store.getters.getUserInfo;
      const userId = userInfo?.id;
      if (userId) {
        // 延迟1秒后重连，给服务器一些恢复时间
        setTimeout(() => {
          this.connect(userId);
        }, 1000);
      }
    }
  }

  // 发送ping请求检查连接
  sendPing() {
    try {
      // 使用环境变量中配置的API基础URL
      const apiBaseUrl = process.env.VUE_APP_API_BASE_URL || '';
      fetch(`${apiBaseUrl}/sseManager/ping`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      .then(response => {
        if (response.ok) {
          console.log('Ping成功，连接正常');
          // 更新最后活动时间（虽然不是通过SSE接收的消息）
          this.lastMessageTime = Date.now() - 30000; // 减去30秒作为安全边际
        } else {
          console.warn('Ping失败，状态码:', response.status);
        }
      })
      .catch(error => {
        console.error('Ping请求失败:', error);
      });
    } catch (e) {
      console.error('发送ping请求出错:', e);
    }
  }

  // 添加消息确认方法
  sendMessageAck(message) {
    // 如果后端支持消息确认，可以在这里实现
    // 例如通过API调用告知后端消息已收到
    if (message && message.id) {
      try {
        // 使用环境变量中配置的API基础URL
        const apiBaseUrl = process.env.VUE_APP_API_BASE_URL || '';
        fetch(`${apiBaseUrl}/sseManager/ack`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messageId: message.id
          })
        }).catch(e => console.warn('发送消息确认失败:', e));
      } catch (e) {
        console.warn('准备消息确认请求失败:', e);
      }
    }
  }
}

// 导出单例
export default new SseClient()
