<template>
  <div v-if="isVisible" class="chat-drawer-container" :style="{ width: width + 'px' }">
    <!-- 拖动条 -->
    <div class="resize-handle" @mousedown="startResize">
      <div class="handle-line"></div>
    </div>
    
    <div class="main-content">
      <div class="chat-header">
        <div class="header-left">
          <el-image class="header-icon" :src="'/index/header/chat/ai2.svg'" />
          <span class="header-title" style="color: rgb(31 124 255)">AI搜索人才</span>
        </div>
        <div class="header-right">
          <el-button class="close-btn" link @click="handleClose">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
      
      <!-- 添加新建聊天时的欢迎界面 -->
      <div 
        v-if="showWelcome" 
        class="welcome-section"
        :class="{ 'fade-out': isFirstMessage }"
      >
        <el-image 
          class="welcome-logo" 
          :src="'/logo/logo2.svg'"
          fit="contain"
        />
        <h2 class="welcome-title">AI 智能招聘助手</h2>
        <div class="welcome-desc">
          <ul class="feature-list">
            <li>快速筛选合适的候选人</li>
            <li>分析简历要点和技能匹配度</li>
          </ul>
        </div>
      </div>
      
      <!-- 聊天消息区域 -->
      <div 
        class="chat-messages" 
        v-loading="loading"
        :class="{ 
          'collapsed': showWelcome,
          'expanded': !showWelcome || isFirstMessage
        }"
      >
        <div class="message-list" ref="messageListRef">
          <template v-for="(message, index) in messages" :key="index">
            <!-- 用户消息 -->
            <div v-if="message.role === 'user'" class="message user-message">
              <div class="message-content">
                <p style="font-size: 15px;color: rgb(64, 64, 64);">{{ message.content }}</p>
              </div>
              <div class="message-time">{{ formatTime(message.created) }}</div>
            </div>
            
            <!-- AI 消息 -->
            <div v-else class="message ai-message">
              <div style="display: flex;
              flex-wrap: nowrap;
              justify-content: flex-start;
              align-items: flex-start;">
                <div class="message-avatar" style="padding-right:10px">
                  <el-image style="width: 32px;" class="header-icon" :src="'/logo/logo2.svg'" />
                </div>
                <div style="height: 100%">
                  <div class="message-content">
                    <div style="font-size: 15px;color: rgb(64, 64, 64);" v-html="parseMarkdown(message.content.replace('[&AI_SEARCH&]', ''))"></div>
                    <!-- 添加 AI 输出中的动画 -->
                    <div v-if="chatFluxStatus && index === messages.length - 1" class="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <div class="action-buttons">
                      <div class="right-actions">
                        <el-tooltip
                            content="复制内容"
                            placement="top"
                            effect="light"
                            :z-index="11000"
                            popper-class="chat-tooltip"
                        >
                          <el-button
                              type="info"
                              link
                              @click="handleCopy(message.content.replace('[&AI_SEARCH&]', ''))"
                          >
                            <el-icon class="copy-icon"><Document /></el-icon>
                          </el-button>
                        </el-tooltip>
                        <el-button
                            v-if="message.content.includes('[&AI_SEARCH&]')"
                            class="contentButton2"
                            size="small"
                            @click="handleEdit"
                        >
                          <el-icon class="edit-icon"><Edit /></el-icon>
                          编辑
                        </el-button>
                        <el-button
                            v-if="message.content.includes('[&AI_SEARCH&]')"
                            class="contentButton"
                            size="small"
                            @click="handleSearch"
                        >
                          聚合搜索
                        </el-button>
                      </div>
                    </div>
                  </div>
                  <div class="message-time">{{ formatTime(message.created) }}</div>
                </div>
              </div>

            </div>
          </template>
        </div>
      </div>
      
      <!-- 输入区域，新建聊天时居中显示 -->
      <div 
        class="chat-input-wrapper"
        :class="{ 
          'centered': showWelcome && !isFirstMessage,
          'bottom': !showWelcome || isFirstMessage
        }"
      >
        <el-row 
          class="el-row-100-percent-w" 
          :style="{
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'center',
            borderTop: showWelcome && !isFirstMessage ? 'none' : '1px solid rgba(224, 224, 224, 1)',
            marginTop: showWelcome && !isFirstMessage ? '40px' : '0'
          }"
        >
          <div class="chat-container-send" style="width: 100%">
            <el-input
              v-model="inputMessage"
              class="custom-input"
              style="width: 100%"
              :autosize="{minRows: 3,maxRows: 6}"
              resize="none"
              type="textarea"
              @keydown.enter.exact.prevent="handleSend"
              placeholder="给 [i快招] AI发送消息"
            >
            </el-input>
            <el-row class="el-row-100-percent-w" style="overflow: hidden">
              <el-col style="display:flex;align-items: center;justify-content: end">
                <div class="helper-text" style="color: rgba(0,0,0,0.25);font-size: 12px;margin-right: 10px">
                  <span>Enter 发送，Shift+Enter 换行</span>
                </div>
                <el-button
                  class="send-button"
                  @click="handleSend"
                  type="primary"
                  v-if="!chatFluxStatus"
                  round
                  style="width: 80px;height: 30px;background: linear-gradient(249.61deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);"
                >
                  <el-image class="headerIcons" :src="'/index/header/chat/fasong.svg'" style="margin-right: 4px"></el-image>
                  <el-text style="font-size: 12px;color: white">{{'发送'}}</el-text>
                </el-button>
                <el-tooltip v-if="chatFluxStatus" content="点击停止输出" placement="top" effect="light">
                  <el-button
                    class="send-button"
                    @click="handleSend"
                    type="primary"
                    round
                    style="width: 80px;height: 30px;background: linear-gradient(249.61deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);"
                  >
                    <el-icon><Loading /></el-icon>
                    <el-image class="headerIcons" :src="'/index/header/chat/fasong.svg'" style="margin-right: 4px"></el-image>
<!--                    <el-text style="font-size: 12px;color: white">{{'正在输出'}}</el-text>-->
                  </el-button>
                </el-tooltip>
              </el-col>
            </el-row>
          </div>
        </el-row>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted} from 'vue'
import { ElMessage } from 'element-plus'
import { Close, Position, Loading, Document, Edit } from '@element-plus/icons-vue'
import { useStore } from 'vuex'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import {getChatHistory, getCurrentConditionByChatId} from '@/api/chat/ChatApi'
import { v4 as uuidv4 } from 'uuid'
import { fetchStream } from '@/api/chat/ChatUtil2'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  chatId: {
    type: String,
    default: ''
  },
  onClose: {
    type: Function,
    required: true
  },
  onEdit: {
    type: Function,
    required: true
  },
  onSearch: {
    type: Function,
    required: true
  }
})

const store = useStore()
const isVisible = ref(props.visible)
const loading = ref(false)
const sending = ref(false)
const isComposing = ref(false)
const inputMessage = ref('')
const messageListRef = ref(null)
const messages = computed(() => store.getters.getChatMassages)
const userInfo = computed(() => store.getters.getUserInfo)


// 先定义 maxWidth 计算属性
const maxWidth = computed(() => {
  return window.innerWidth - 284 // 窗口宽度减去 290px
})

// 然后再定义 width
const width = ref(maxWidth.value)

// 移除 props.chatId，改用内部状态
const currentChatId = ref('')

// Markdown 配置
const md = new MarkdownIt({
  html: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch (err) {
        console.warn('Failed to highlight:', err)
        return str
      }
    }
    return str
  }
})

// 添加 Stream 相关状态
const chatFluxStatus = ref(false)

// 添加停止输出的状态
const abortController = ref(null)

// 添加新的响应式变量
const showWelcome = computed(() => !currentChatId.value)
const isFirstMessage = ref(false)

// 先定义 scrollToBottom 函数
const scrollToBottom = () => {
  if (messageListRef.value) {
    setTimeout(() => {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }, 100)
  }
}

// 修改加载历史消息
const loadHistory = async () => {
  if (!currentChatId.value) return
  
  loading.value = true
  try {
    const { data } = await getChatHistory(currentChatId.value, userInfo.value.id)
    if (data?.chatHistory?.length) {
      // 清空当前消息
      store.commit('clearChatMessage')
      // 添加历史消息
      data.chatHistory.forEach(msg => {
        store.commit('addMessageToQueue', {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          created: new Date(msg.timestamp).getTime() / 1000
        })
      })
      scrollToBottom()
    }
  } catch (e) {
    console.error('Load history failed:', e)
    ElMessage.error('加载历史消息失败')
  } finally {
    loading.value = false
  }
}

// 修改消息处理函数
const setMsgContainer = (msg) => {
  const content = msg.choices?.[0]?.delta?.content
  if (content) {
    if (content === '[DONE]') {
      console.log("聊天结束", content)
      chatFluxStatus.value = false
      return
    }

    const messages = store.getters.getChatMassages
    const foundObject = messages.find(item => item.id === msg.id)
    if (foundObject) {
      foundObject.content = foundObject.content + content
    } else {
      const chatTemplate = getChatTemplate()
      chatTemplate.content = content
      chatTemplate.id = msg.id
      chatTemplate.chatId = msg.chatId
      chatTemplate.searchConditionId = msg.searchConditionId
      chatTemplate.model = msg.model
      chatTemplate.object = msg.object
      chatTemplate.created = msg.created
      chatTemplate.role = "assistant"
      
      // 如果收到服务端返回的 chatId，更新状态
      if (msg.chatId && !currentChatId.value) {
        currentChatId.value = msg.chatId
        // 更新 vuex 中的 activeChatId
        store.commit('SET_ACTIVE_CHAT_ID', msg.chatId)
        // 触发列表刷新
        store.commit('SET_NEED_REFRESH_LIST', true)
      }
      
      store.commit('addMessageToQueue', chatTemplate)
    }
  }
}

// 修改发送消息函数
const handleSend = async () => {
  if (!isFirstMessage.value) {
    isFirstMessage.value = true
  }
  // 如果正在输出中，则停止输出
  if (chatFluxStatus.value) {
    abortController.value?.abort()
    chatFluxStatus.value = false
    return
  }

  if (sending.value || !inputMessage.value.trim()) return
  if (isComposing.value) return

  const content = inputMessage.value.trim()
  inputMessage.value = ''
  sending.value = true

  try {
    // 添加用户消息
    const userMessage = getChatTemplate()
    userMessage.role = 'user'
    userMessage.content = content
    userMessage.created = Math.floor(Date.now() / 1000)
    store.commit('addMessageToQueue', userMessage)
    scrollToBottom()

    // 准备请求数据
    const aiRequestMsg = {
      chatId: currentChatId.value || '',  // 使用内部的 chatId
      userId: userInfo.value.id,
      searchConditionId: store.getters.getSearchConditionId,
      prompt: content,
    }

    // 创建新的 AbortController
    abortController.value = new AbortController()

    // 发送 AI 请求
    chatFluxStatus.value = true
    fetchStream(
      `${process.env.VUE_APP_API_BASE_URL}/ihire/chat/streamChat`,
      aiRequestMsg,
      (message) => {
        try {
          const jsonString = message.replace(/^data:/, "").trim()
          if (!jsonString) return
          
          const msg = JSON.parse(jsonString)
          setMsgContainer(msg)
        } catch (error) {
          chatFluxStatus.value = false
          console.error("消息解析错误:", error, message)
        }
        scrollToBottom()
      },
      (error) => {
        chatFluxStatus.value = false
        console.error("Stream error:", error)
      },
      () => {
        chatFluxStatus.value = false
        console.log("聊天正常结束")
      },
      abortController.value // 传入 AbortController
    )
  } catch (e) {
    console.error('发送消息失败:', e)
    ElMessage.error('发送失败')
  } finally {
    sending.value = false
  }
}

// 修改时间格式化函数
const formatTime = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const parseMarkdown = (content) => {
  return md.render(content)
}

const handleClose = () => {
  isFirstMessage.value = false
  store.commit('SET_NEED_REFRESH_LIST', true)
  store.commit('SET_ACTIVE_CHAT_ID', '')
  props.onClose()
}



// 修改拖动处理函数
const startResize = (e) => {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = width.value
  
  const handleMouseMove = (e) => {
    const delta = startX - e.clientX
    width.value = Math.min(
      Math.max(startWidth + delta, 600), // 最小宽度 600px
      maxWidth.value // 最大宽度为窗口宽度-290px
    )
  }
  
  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 监听窗口大小变化
onMounted(() => {
  const handleResize = () => {
    // 如果当前宽度超过新的最大宽度，则调整为新的最大宽度
    if (width.value > maxWidth.value) {
      width.value = maxWidth.value
    }
  }
  
  window.addEventListener('resize', handleResize)
  
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })
})

watch(() => props.visible, (val) => {
  isVisible.value = val
})

// 监听 props.chatId 的变化
watch(() => props.chatId, (newId) => {
  if (newId) {
    currentChatId.value = newId  // 更新内部的 chatId
    loadHistory()  // 加载历史消息
  } else {
    currentChatId.value = ''  // 清空内部的 chatId
    store.commit('clearChatMessage')  // 清空消息列表
  }
}, { immediate: true })  // 立即执行一次

// 添加 getChatTemplate 函数
const getChatTemplate = () => {
  return {
    id: uuidv4(),
    role: '',
    content: '',
    created: Math.floor(Date.now() / 1000),
    chatId: '',
    searchConditionId: '',
    model: '',
    object: '',
    timestamp: new Date().toISOString()
  }
}

// 组件卸载时清理
onUnmounted(() => {
  abortController.value?.abort()
})

// 添加复制功能
const handleCopy = async (content) => {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('复制成功')
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败')
  }
}

// 修改编辑处理函数
const handleEdit = async () => {
  try {
    const data = await getChatConditionRequest()
    if (data) {
      // 关闭对话框
      handleClose()
      // 直接调用 prop 方法
      props.onEdit(data)
    }
  } catch (e) {
    console.error('处理编辑失败:', e)
    ElMessage.error('处理编辑失败，请稍后重试')
  }
}

const handleSearch = async () => {
  try {
    const data = await getChatConditionRequest()
    if (data) {
      // 关闭对话框
      handleClose()
      // 直接调用 prop 方法
      props.onSearch(data,true)
    }
  } catch (e) {
    console.error('处理聚合搜索失败:', e)
    ElMessage.error('处理聚合搜索失败，请稍后重试')
  }
}

const getChatConditionRequest = async () => {
  try {
    let {data} = await getCurrentConditionByChatId(currentChatId.value);
    return data;
  } catch (e) {
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
}

</script>

<style lang="scss" scoped>
.chat-drawer-container {
  position: fixed;
  top: 44px;
  right: 0;
  bottom: 0;
  background: #fff;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
  display: flex;
  transition: width 0.3s ease;
}

.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: url('/public/index/header/chat/tuodong.svg');
  background-size: 141%;
  background-position: left;
  background-repeat: no-repeat;
  z-index: 10010;
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 10px; // 为拖动条留出空间
}

.chat-header {
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e0e0e0;
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    
    .header-icon {
      width: 24px;
      height: 24px;
    }
    
    .header-title {
      font-size: 16px;
      font-weight: 500;
    }
  }
}

.chat-messages {
  flex: 1;
  overflow: hidden;
  padding: 10px;
  background-color: white;
  
  .message-list {
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  
  &.user-message {
    align-self: flex-end;
    
    .message-content {
      background: #e3f2fd;
      border-radius: 8px 0 8px 8px;
      color: #333;
      
      p {
        margin: 0;
        line-height: 1.5;
      }
    }
    
    .message-time {
      align-self: flex-end;
      padding-right: 4px;
    }
  }
  
  &.ai-message {
    align-self: flex-start;
    
    .message-content {
      background-color: #f3f4f6;
      border-radius: 0 8px 8px 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      
      :deep(pre) {
        margin: 8px 0;
        padding: 12px;
        background: #f6f8fa;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1.5;
        overflow-x: auto;
        
        code {
          font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
        }
      }
      
      :deep(p) {
        margin: 0;
        line-height: 1.6;
      }
      
      :deep(ul), :deep(ol) {
        margin: 8px 0;
        padding-left: 20px;
      }
    }
    
    .message-time {
      align-self: flex-start;
      padding-left: 4px;
    }
  }
  
  .message-content {
    padding: 12px 16px;
    font-size: 14px;
    word-break: break-word;
    white-space: pre-wrap;
  }
  
  .message-time {
    margin-top: 4px;
    font-size: 12px;
    color: #999;
  }
  
  .action-buttons {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    padding-right: 16px;
    
    .right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .el-button {
        font-size: 13px;
        //padding: 6px 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        
        .copy-icon {
          font-size: 15px;
        }
        
        .edit-icon {
          font-size: 14px;
          margin-right: 2px;
        }
      }
    }
  }
}

// 优化滚动条样式
.message-list {
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #ddd;
    border-radius: 3px;
    
    &:hover {
      background: #ccc;
    }
  }
}

.el-row-100-percent-w {
  width: 100%;
}

.chat-container-send {
  width: 100%;
}

//.custom-input {
//  width: 100%;
//
//  :deep(.el-textarea__inner) {
//    width: 100%;
//    background: #fff;
//    border: 1px solid #dcdfe6;
//    border-radius: 8px;
//    padding: 12px;
//    font-size: 14px;
//    line-height: 1.6;
//    min-height: 80px !important;
//    resize: none;
//
//    &:hover {
//      border-color: #c0c4cc;
//    }
//
//    &:focus {
//      border-color: #409eff;
//      box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
//    }
//  }
//}
.contentButton{
  //max-width: 70%;
  border-radius: 13px;
  //background: linear-gradient(234.2deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);
  background-color: #1f7cff;
  //height: 26px;
  color: rgba(255, 255, 255, 1);
  font-size: 13px;
  //font-weight: 400;
  //margin-top: 15px;
}
.contentButton2{
  //max-width: 70%;
  border-radius: 13px;
  background: orange;
  //height: 26px;
  color: rgba(255, 255, 255, 1);
  font-size: 13px;
  //font-weight: 400;
  //margin-top: 15px;
}
.el-row-100-percent-w {
  width: 100%;
  
  .chat-container-send {
    width: 100%;
    
    .el-row {
      margin-top: 12px;
      
      .el-col {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        
        .helper-text {
          color: rgba(0, 0, 0, 0.25);
          font-size: 12px;
          margin-right: 10px;
        }
        
        .send-button {
          width: 80px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(249.61deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);
          border: none;
          
          .headerIcons {
            width: 16px;
            height: 16px;
            margin-right: 4px;
          }
          
          .el-text {
            font-size: 12px;
            color: white;
          }
          
          .el-icon {
            margin-right: 4px;
            font-size: 16px;
            color: white;
          }
        }
      }
    }
  }
}
.custom-input {
  border: none !important; /* 去除外部容器的边框 */
  box-shadow: none !important; /* 去除阴影 */


  :hover{
    box-shadow: none !important;
  }
  :focus{
    box-shadow: none !important;
  }
}
::v-deep(.custom-input .el-textarea__inner) {
  box-shadow: none !important;
  background-color: #f3f4f6 !important;
  border-radius: 24px;
}
.headerIcons {
  width: 16px;
  height: 16px;
}
.chat-container-send{
  padding-right: 12px;
  padding-bottom: 8px;
  //border-radius: 6px;
  //background: rgba(255, 255, 255, 1);
  //border: 1px solid rgba(121, 96, 255, 1);
  background: #f3f4f6;
  box-shadow: 0px 0px 0px .5px var(--dsr-input-border);
  border-radius: 24px;
}
.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  
  .el-icon {
    margin-right: 4px;
    font-size: 16px;
  }
}

.welcome-section {
  position: absolute;
  top: 60px; // header 高度
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  transition: opacity 0.3s ease, transform 0.3s ease;
  
  &.fade-out {
    opacity: 0;
    transform: translateY(-20px);
    pointer-events: none;
  }
  
  .welcome-logo {
    width: 80px;
    height: 80px;
    margin-bottom: 0px;
  }
  
  .welcome-title {
    //font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-family: Serif;
    font-size: 28px;
    font-weight: 600;
    color: #4b5b6c;
    margin: 24px 0 16px;
    letter-spacing: 0.5px;
  }
  
  .welcome-desc {
    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
    color: #5a6c84;
    line-height: 1.6;
    padding: 0 24px;
  }
  
  .welcome-intro {
    font-size: 16px;
    margin-bottom: 16px;
    font-weight: 500;
  }
  
  .feature-list {
    padding-left: 20px;
    margin: 0;
  }
  
  .feature-list li {
    margin-bottom: 12px;
    font-size: 15px;
    position: relative;
    padding-left: 8px;
  }
  
  .feature-list li::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: linear-gradient(208deg, #5280FC 0%, #54A4FF 50%, #3CD1F6 100%);
  }
}

.chat-messages {
  transition: all 0.3s ease;
  
  &.collapsed {
    height: 0;
    opacity: 0;
    overflow: hidden;
  }
  
  &.expanded {
    height: calc(100% - 180px); // 减去 header 和输入框的高度
    opacity: 1;
  }
}

.chat-input-wrapper {
  transition: all 0.3s ease;
  
  &.centered {
    position: absolute;
    left: 50%;
    top: 70%;
    transform: translate(-50%, -50%);
    width: 80%;
    //margin-top: -40px; // 向上偏移一点，与欢迎文字保持适当距离
  }
  
  &.bottom {
    position: relative;
    width: 100%;
    margin-top: auto;
  }
}

// 添加 AI 输出中的动画样式
.typing-indicator {
  display: flex;
  align-items: center;
  margin-top: 8px;
  
  span {
    display: inline-block;
    width: 6px;
    height: 6px;
    background-color: #1F7CFF;
    border-radius: 50%;
    margin: 0 2px;
    opacity: 0.4;
    animation: typing 1s infinite ease-in-out;
    
    &:nth-child(1) {
      animation-delay: 200ms;
    }
    
    &:nth-child(2) {
      animation-delay: 300ms;
    }
    
    &:nth-child(3) {
      animation-delay: 400ms;
    }
  }
}

@keyframes typing {
  0% {
    transform: translateY(0);
    opacity: 0.4;
  }
  50% {
    transform: translateY(-4px);
    opacity: 0.8;
  }
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
}

// 添加全局样式（不使用 scoped）
:deep(.chat-tooltip) {
  z-index: 11000 !important;
}

.action-buttons {
  .right-actions {
    position: relative; // 添加相对定位
    
    .el-button {
      // ... 其他样式保持不变 ...
      
      &:hover {
        z-index: 1; // 确保按钮悬浮时在上层
      }
    }
  }
}
</style> 