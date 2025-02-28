<template>
  <div v-if="isVisible" class="chat-drawer" :style="drawerStyle">
    <!-- 左侧拖动条 -->
    <div class="resize-handle" 
         @mousedown="startResize"
         :style="{ left: '-4px' }">
      <div class="handle-line"></div>
    </div>
    444
    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 头部 -->
      <div class="chat-header">
        <div class="header-left">
          <el-image class="header-icon" :src="'/index/header/chat/ai.svg'" />
          <span class="header-title" style="color: rgb(18, 150, 219)">AI搜索人才333</span>
        </div>
        <div class="header-right">
          <el-button class="close-btn" link @click="handleClose">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- 聊天内容区域 -->
      <div class="chat-content">
        <!-- 这里可以复用原来 ChatDrawer 的内容 -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch,computed, onMounted, onUnmounted } from 'vue'
import { Close } from '@element-plus/icons-vue'

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
  }
})

const isVisible = ref(props.visible)
const width = ref(800)
const minWidth = 400
const maxWidth = window.innerWidth - 290

// 监听 visible 变化
watch(() => props.visible, (val) => {
  isVisible.value = val
})

// 抽屉样式
const drawerStyle = computed(() => ({
  position: 'fixed',
  top: 0,
  right: 0,
  width: `${width.value}px`,
  height: '100%',
  zIndex: 10000,
  backgroundColor: '#fff',
  boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.15)',
  transition: 'width 0.3s ease'
}))

// 拖动相关
let isResizing = false
let startX = 0
let startWidth = 0

const startResize = (e) => {
  isResizing = true
  startX = e.clientX
  startWidth = width.value
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

const handleResize = (e) => {
  if (!isResizing) return
  
  const dx = startX - e.clientX
  let newWidth = startWidth + dx
  
  // 限制最小和最大宽度
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
  width.value = newWidth
}

const stopResize = () => {
  isResizing = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// 关闭抽屉
const handleClose = () => {
  props.onClose()
}

// 组件卸载时清理事件监听
onUnmounted(() => {
  if (isResizing) {
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  }
})
</script>

<style scoped lang="scss">
.chat-drawer {
  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    width: 4px;
    height: 100%;
    cursor: ew-resize;
    z-index: 1;
    
    &:hover .handle-line {
      background-color: #1F7CFF;
    }
    
    .handle-line {
      width: 4px;
      height: 100%;
      background-color: transparent;
      transition: background-color 0.3s;
    }
  }

  .main-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .chat-header {
    height: 60px;
    padding: 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
    
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

  .chat-content {
    flex: 1;
    overflow: auto;
    padding: 20px;
  }
}
</style>