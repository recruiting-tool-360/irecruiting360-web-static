<template>
    <div class="left-header" :style="{ width: isShrunk ? '40px' : leftSize }">
      <!-- 收缩按钮 -->
      <div style="width: 100%;height: 34px">
        <el-button
            class="left-shrink-btn"
            @click="toggleShrink"
            :icon="isShrunk ? DArrowRight : DArrowLeft"
            link
        />
      </div>

      <!-- 条件列表 -->
      <div class="conditions-list" v-loading="loading" v-if="!isShrunk">
        <el-scrollbar height="calc(100vh - 40px)">
          <!-- 新建按钮 -->
          <div class="new-chat-btn">
            <el-button type="primary" @click="handleNewChat" style="width: 100%" color="rgb(31, 124, 255)">
              <el-icon><Plus /></el-icon>新建AI聊天
            </el-button>
          </div>

          <!-- 分组显示聊天列表 -->
          <template v-for="(chats, groupKey) in groupedChats" :key="groupKey">
            <div v-if="chats.length > 0" class="chat-group">
              <div class="group-title">{{ groupTitles[groupKey] }}</div>
              <!-- 聊天项列表 -->
              <div v-for="item in chats" :key="item.id" class="condition-item" :class="{ 'active': item.id === currentChatId }">
                <div class="item-left">
                  <el-image :src="'/index/left/condition.svg'" class="item-icon"></el-image>
                </div>
                <div class="item-content" @click="handleItemClick(item)">
                  <el-tooltip 
                    :content="item.name" 
                    placement="top"
                    :show-after="1000"
                    :hide-after="0"
                  >
                    <div class="item-name">{{ item.name }}</div>
                  </el-tooltip>
                  <div class="item-time">{{ item.createTime }}</div>
                </div>
                
                <!-- 操作按钮 -->
                <div class="item-right">
                  <el-dropdown trigger="click" @command="(command) => handleCommand(command, item)">
                    <el-button link class="action-btn">
                      <el-icon><More /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
<!--                        <el-dropdown-item command="share">-->
<!--                          <el-icon><Share /></el-icon> 共享-->
<!--                        </el-dropdown-item>-->
                        <el-dropdown-item command="rename">
                          <el-icon><Edit /></el-icon> 重命名
                        </el-dropdown-item>
<!--                        <el-dropdown-item command="archive">-->
<!--                          <el-icon><Files /></el-icon> 归档-->
<!--                        </el-dropdown-item>-->
                        <el-dropdown-item command="delete" divided>
                          <el-icon><Delete /></el-icon> 删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </div>
          </template>
        </el-scrollbar>
      </div>
  
      <!-- 重命名对话框 -->
      <el-dialog
        v-model="renameDialogVisible"
        title="重命名"
        width="30%"
      >
        <el-input v-model="newName" placeholder="请输入新名称" />
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="renameDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleRename">确认</el-button>
          </span>
        </template>
      </el-dialog>

      <ChatDrawer
        v-if="showChatDrawer"
        :chatId="currentChatId"
        :visible="showChatDrawer"
        :onClose="handleCloseChatDrawer"
      />
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { DArrowLeft, DArrowRight, Search, Plus, More, Edit, Files, Share, Delete } from '@element-plus/icons-vue'
  import store from "@/store"
  import { getChatList, deleteChat, renameChat } from '@/api/chat/ChatApi'  // 添加 renameChat 导入
  import ChatDrawer from '@/views/search/chat/ChatDrawer.vue'
  
  // Props 定义
  const props = defineProps({
    isShrunk: Boolean,
    leftSize: String,
    aiSearchRef: {
      type: Object,
      default: null
    }
  })
  
  // Emits 定义
  const emit = defineEmits(['toggleShrink', 'openChat'])
  
  // Store 相关
  const userInfo = computed(() => store.getters.getUserInfo)
  const loadingStatus = computed(() => store.getters.getLeftLoadingSwitch)
  
  // 搜索关键词
  const searchKeyword = ref('')
  
  // 保存的搜索条件数据
  const savedConditions = ref([])
  
  // 重命名相关
  const renameDialogVisible = ref(false)
  const newName = ref('')
  const currentItem = ref(null)
  
  // 添加 loading 状态
  const loading = ref(false)
  
  // 分组后的聊天列表计算属性
  const groupedChats = computed(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const last7Days = new Date(today)
    last7Days.setDate(last7Days.getDate() - 7)
    const last30Days = new Date(today)
    last30Days.setDate(last30Days.getDate() - 30)
    const lastMonth = new Date(today)
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    return savedConditions.value.reduce((groups, chat) => {
      const chatDate = new Date(chat.createTime)
      
      if (chatDate >= today) {
        if (!groups.today) groups.today = []
        groups.today.push(chat)
      } else if (chatDate >= yesterday) {
        if (!groups.yesterday) groups.yesterday = []
        groups.yesterday.push(chat)
      } else if (chatDate >= last7Days) {
        if (!groups.last7Days) groups.last7Days = []
        groups.last7Days.push(chat)
      } else if (chatDate >= last30Days) {
        if (!groups.last30Days) groups.last30Days = []
        groups.last30Days.push(chat)
      } else if (chatDate >= lastMonth) {
        if (!groups.lastMonth) groups.lastMonth = []
        groups.lastMonth.push(chat)
      } else {
        if (!groups.older) groups.older = []
        groups.older.push(chat)
      }
      
      return groups
    }, {})
  })

  // 分组标题映射
  const groupTitles = {
    today: '今天',
    yesterday: '昨天',
    last7Days: '最近7天',
    last30Days: '最近30天',
    lastMonth: '上个月',
    older: '更早'
  }
  
  // 修改加载聊天列表数据函数
  const loadChatList = async () => {
    loading.value = true // 开始加载
    try {
      const { data } = await getChatList()
      if (data && Array.isArray(data)) {
        // 转换数据格式
        savedConditions.value = data.map(item => ({
          id: item.chatId,
          name: item.name || `AI对话 ${item.chatId.slice(0, 8)}`, // 如果没有名称则使用 chatId 前8位
          createTime: item.updateAt.slice(0, 16).replace('T', ' ') // 格式化时间
        }))
      }
    } catch (e) {
      console.error('加载聊天列表失败:', e)
      ElMessage.error('加载聊天列表失败，请稍后重试')
    } finally {
      loading.value = false // 结束加载
    }
  }
  
  // 处理下拉菜单命令
  const handleCommand = (command, item) => {
    switch (command) {
      case 'share':
        handleShare(item)
        break
      case 'rename':
        showRenameDialog(item)
        break
      case 'archive':
        handleArchive(item)
        break
      case 'delete':
        handleDelete(item)
        break
    }
  }
  
  // 显示重命名对话框
  const showRenameDialog = (item) => {
    currentItem.value = item
    newName.value = item.name
    renameDialogVisible.value = true
  }
  
  // 处理重命名
  const handleRename = async () => {
    if (!newName.value.trim()) {
      ElMessage.warning('名称不能为空')
      return
    }
    
    try {
      const res = await renameChat(currentItem.value.id, newName.value.trim())
      if (res.success === 'success') {
        await loadChatList() // 重新加载列表
        ElMessage.success('重命名成功')
        renameDialogVisible.value = false
      } else {
        ElMessage.error(res.errorMessage || '重命名失败')
      }
    } catch (e) {
      console.error('重命名失败:', e)
      ElMessage.error('重命名失败，请稍后重试')
    }
  }
  
  // 处理删除
  const handleDelete = async (item) => {
    try {
      await ElMessageBox.confirm(
        '确定要删除这个对话吗？',
        '警告',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )
      
      // 调用删除 API
      const res = await deleteChat(item.id)
      if (res.success === 'success') {
        await loadChatList() // 重新加载列表
        ElMessage.success('删除成功')
      } else {
        ElMessage.error(res.errorMessage || '删除失败')
      }
    } catch (e) {
      if (e !== 'cancel') {
        console.error('删除聊天失败:', e)
        ElMessage.error('删除失败，请稍后重试')
      }
    }
  }
  
  // 其他功能处理函数
  const handleShare = (item) => {
    ElMessage.success('分享功能开发中...')
  }
  
  const handleArchive = (item) => {
    ElMessage.success('归档功能开发中...')
  }
  
  // 修改新建聊天处理函数
  const handleNewChat = () => {
    // 如果已经有聊天窗口打开，先关闭它
    if (showChatDrawer.value) {
      handleCloseChatDrawer()
    }
    
    // 然后再打开新的聊天窗口
    currentChatId.value = ''
    showChatDrawer.value = true
  }
  
  // 修改关闭聊天窗口的处理函数
  const handleCloseChatDrawer = () => {
    showChatDrawer.value = false
    currentChatId.value = ''
    store.commit('SET_ACTIVE_CHAT_ID', '') // 清空当前激活的聊天 ID
  }
  
  // 修改点击项目的处理函数
  const handleItemClick = (item) => {
    // 如果已经有聊天窗口打开，先关闭它
    if (showChatDrawer.value) {
      handleCloseChatDrawer()
    }
    
    // 然后再打开新的聊天窗口
    currentChatId.value = item?.id || ''
    showChatDrawer.value = true
  }
  
  // 监听 vuex 中的 activeChatId
  watch(() => store.getters.getActiveChatId, (newChatId) => {
    if (newChatId) {
      currentChatId.value = newChatId
    }
  })
  
  // 监听 vuex 中的刷新状态
  watch(() => store.getters.getNeedRefreshList, async (needRefresh) => {
    if (needRefresh) {
      await loadChatList()
      store.commit('SET_NEED_REFRESH_LIST', false)
    }
  })
  
  // 收缩切换
  const toggleShrink = () => {
    emit('toggleShrink')
  }
  
  // 组件挂载时加载数据
  onMounted(async () => {
    await loadChatList()
  })

  const showChatDrawer = ref(false)
  const currentChatId = ref('')
  </script>
  
  <style scoped>
  .left-header {
    height: 100vh;
    border-right: 1px solid #e0e0e0;
    background: #fff;
    position: relative;
    transition: width 0.3s;
  }
  
  .left-shrink-btn {
    position: absolute;
    right: 5px;
    top: 0;  /* 调整到最上方 */
    z-index: 1;
    width: 34px;
    height: 22px;
    background-color: white;
    color: #1F7CFF;
  }
  
  .conditions-list {
    position: relative; /* 确保 loading 遮罩层定位正确 */
    height: calc(100% - 22px);
    margin-top: -22px;
  }
  
  .new-chat-btn {
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .condition-item {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    margin: 8px;
    cursor: pointer;
    border: 1px solid rgba(47, 112, 250, 0.3);
    border-radius: 6px;
    background: white;
    transition: all 0.3s;
    height: 63px;
  }
  
  .condition-item.active {
    background: rgba(31, 124, 255, 0.1);
    border-color: rgba(31, 124, 255, 0.5);
    color: #1F7CFF;
  }
  
  .condition-item:hover {
    background: rgba(31, 124, 255, 0.05);
    color: #1F7CFF;
  }
  
  .item-left {
    width: 40px;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .item-icon {
    width: 24px;
    height: 24px;
  }
  
  .item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 8px;
    min-width: 0; /* 确保文本可以正确截断 */
    width: 0; /* 强制内容收缩 */
  }
  
  .item-name {
    font-size: 13px;
    color: #1e1f24c2;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%; /* 确保宽度填满父容器 */
  }
  
  .item-time {
    font-size: 12px;
    color: #999;
  }
  
  .item-right {
    width: 32px;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .action-btn {
    color: #999;
    padding: 4px;
    margin-bottom: 20px;
  }
  
  .action-btn:hover {
    color: rgb(31, 124, 255);
    background-color: #f0f7ff;
    border-radius: 4px;
  }
  
  .dialog-footer {
    margin-top: 20px;
  }
  
  .chat-group {
    margin-bottom: 8px;
  }
  
  .group-title {
    padding: 8px 16px;
    font-size: 12px;
    color: #999;
    font-weight: 500;
  }
  </style>