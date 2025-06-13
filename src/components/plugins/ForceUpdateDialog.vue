<template>
  <q-dialog
    v-model="dialogVisible"
    persistent
    no-escape-key
    no-backdrop-dismiss
    class="force-update-dialog-container"
  >
    <q-card class="force-update-card">
      <!-- 更新图标 -->
      <q-card-section class="text-center q-pt-lg">
        <q-icon 
          name="system_update" 
          size="64px" 
          color="primary"
          class="update-icon"
        />
      </q-card-section>

      <!-- 标题和描述 -->
      <q-card-section class="text-center q-pb-none">
        <div class="text-h5 text-weight-bold text-grey-9 q-mb-md">
          插件需要更新
        </div>
        <div class="text-body1 text-grey-7 q-mb-lg">
          检测到您的i快招插件版本过低，为了确保最佳使用体验和功能正常运行，
          <span class="text-primary text-weight-bold">必须更新到最新版本</span>。
        </div>
      </q-card-section>

      <!-- 新版本特性 -->
      <q-card-section class="q-pt-none">
        <q-card flat bordered class="features-card">
          <q-card-section>
            <div class="text-subtitle1 text-weight-bold text-grey-9 q-mb-md">
              🎉 新版本特性：
            </div>
            <q-list dense>
              <q-item>
                <q-item-section avatar>
                  <q-icon name="rocket_launch" color="orange" size="sm" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2">性能优化，提升响应速度</q-item-label>
                </q-item-section>
              </q-item>
              
              <q-item>
                <q-item-section avatar>
                  <q-icon name="security" color="green" size="sm" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2">安全性增强，保护您的数据</q-item-label>
                </q-item-section>
              </q-item>
              
              <q-item>
                <q-item-section avatar>
                  <q-icon name="auto_awesome" color="purple" size="sm" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2">优化AI智能匹配功能</q-item-label>
                </q-item-section>
              </q-item>
              
              <q-item>
                <q-item-section avatar>
                  <q-icon name="bug_report" color="red" size="sm" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2">修复已知问题，提升稳定性</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </q-card-section>

      <!-- 版本信息 -->
      <q-card-section class="q-pt-none">
        <q-card flat bordered class="version-card">
          <q-card-section>
            <div class="row q-gutter-md">
              <div class="col">
                <q-chip 
                  color="orange" 
                  text-color="white" 
                  icon="info"
                  class="full-width"
                >
                  <span class="text-weight-bold">当前版本：{{ currentVersion }}</span>
                </q-chip>
              </div>
              <div class="col">
                <q-chip 
                  color="green" 
                  text-color="white" 
                  icon="new_releases"
                  class="full-width"
                >
                  <span class="text-weight-bold">最新版本：{{ latestVersion }}</span>
                </q-chip>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-card-section>

      <!-- 更新按钮 -->
      <q-card-section class="text-center q-pb-lg">
        <q-btn
          unelevated
          size="lg"
          color="primary"
          icon="system_update"
          label="立即更新"
          class="update-button"
          loading-label="更新中..."
          @click="handleUpdate"
          no-caps
        />
        
        <div class="text-caption text-grey-6 q-mt-md">
          <q-icon name="info" size="xs" class="q-mr-xs" />
          更新过程中请勿关闭浏览器
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  currentVersion: {
    type: String,
    default: '1.0.0'
  },
  latestVersion: {
    type: String,
    default: '1.0.7'
  }
})

const emit = defineEmits(['update', 'update:visible'])

const updating = ref(false)

// 使用计算属性来处理v-model
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const handleUpdate = async () => {
  updating.value = true
  
  try {
    // 触发更新事件
    emit('update')
  } catch (error) {
    console.error('更新失败:', error)
  } finally {
    // 不重置updating状态，保持按钮禁用直到页面刷新或组件销毁
  }
}
</script>

<style scoped>
.force-update-dialog-container {
  background-color: rgba(0, 0, 0, 0.8) !important;
  backdrop-filter: blur(4px);
}

.force-update-dialog-container :deep(.q-dialog__inner) {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
}

.force-update-card {
  max-width: 500px;
  width: 100%;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  background: white;
}

.update-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.features-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border: 1px solid #dee2e6;
}

.version-card {
  background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
  border: 1px solid #ffeaa7;
}

.update-button {
  min-width: 200px;
  height: 48px;
  border-radius: 24px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  transition: all 0.3s ease;
}

.update-button:hover {
  background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(25, 118, 210, 0.3);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .force-update-dialog-container :deep(.q-dialog__inner) {
    padding: 10px;
  }
  
  .force-update-card {
    width: 100%;
    max-width: 95vw;
  }
  
  .update-button {
    min-width: 150px;
    height: 44px;
    font-size: 14px;
  }
}
</style> 