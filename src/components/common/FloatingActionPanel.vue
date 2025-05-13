<template>
  <div class="relative-position">
    <!-- 右侧固定按钮面板 -->
    <div class="fixed-right-panel" ref="fixedPanelRef">
      <q-btn
        v-morph:chat-btn:chat-morph:300.resize="morphState"
        round
        size="md"
        class="q-mb-md bg-white text-primary"
        label="AI"
        @click="toggleChatPanel"
      >
<!--        <q-icon name="chat" color="primary"></q-icon>-->
<!--        <q-avatar size="sm" color="primary" text-color="white" class="q-mr-sm">-->
<!--          AI-->
<!--        </q-avatar>-->
<!--        AI-->
        <q-tooltip>AI助手</q-tooltip>
      </q-btn>

      <q-btn round color="primary" :icon="resumeIndexVisible ? 'visibility' : 'visibility_off'" size="md" class="q-mb-md" @click="toggleRightNav">
        <q-tooltip>{{ resumeIndexVisible ? '隐藏' : '显示' }}数据列表导航</q-tooltip>
      </q-btn>

      <q-btn round color="primary" :icon="showQueueMonitor ? 'camera_outdoor' : 'camera_indoor'" size="md" class="q-mb-md" @click="toggleQueueMonitor">
        <q-tooltip>{{ showQueueMonitor ? '隐藏' : '显示' }}AI执行监视器</q-tooltip>
      </q-btn>

      <q-btn round color="primary" icon="arrow_upward" size="md" @click="scrollToTop">
        <q-tooltip>回到顶部</q-tooltip>
      </q-btn>
    </div>

    <!-- 使用ChatCard组件代替内联代码 -->
    <ChatCard
      ref="chatCardRef"
      :visible="showChatPanel"
      :expanded="chatPanelExpanded"
      :morph-state="morphState"
      :messages="chatMessages"
      :container-width="props.containerWidth"
      :container-height="props.containerHeight"
      :container-top="props.containerTop"
      :container-left="props.containerLeft"
      @close="toggleChatPanel"
      @toggle-expand="toggleChatExpand"
      @send-message="sendChatMessage"
      @update:expanded="val => chatPanelExpanded = val"
      @open-chat="showChatPanel = true"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useStore } from 'vuex'; // 引入useStore
import ChatCard from './ChatCard.vue'; // 引入ChatCard组件

// 获取store实例
const store = useStore();

// 定义组件属性
const props = defineProps({
  showRightNav: {
    type: Boolean,
    default: false
  },
  containerWidth: {
    type: Number,
    default: 0
  },
  containerHeight: {
    type: Number,
    default: 0
  },
  containerTop: {
    type: Number,
    default: 48
  },
  containerLeft: {
    type: Number,
    default: 280
  }
});

// 定义事件
const emit = defineEmits(['update:showRightNav', 'chatMessage', 'mounted']);

// 获取面板位置信息
const fixedPanelPosition = computed(() => store.getters.getFixedPanelPosition);

// 面板元素引用
const fixedPanelRef = ref(null);
const chatCardRef = ref(null);

// 组件加载完成时触发mounted事件
onMounted(() => {
  console.log('FloatingActionPanel 已装载完成');
  emit('mounted');

  // 等待DOM渲染完成后更新面板位置
  nextTick(() => {
    updatePanelPosition();

    // 监听窗口大小变化，更新面板位置
    window.addEventListener('resize', updatePanelPosition);
  });
});

// 组件卸载时移除事件监听
onUnmounted(() => {
  window.removeEventListener('resize', updatePanelPosition);
});

// 更新面板位置信息到Vuex
function updatePanelPosition() {
  if (fixedPanelRef.value) {
    const rect = fixedPanelRef.value.getBoundingClientRect();
    const position = {
      right: parseInt(window.getComputedStyle(fixedPanelRef.value).right),
      top: rect.top + rect.height / 2, // 获取面板中心点的垂直位置
      height: rect.height, // 面板高度
      width: rect.width,   // 面板宽度
      buttons: fixedPanelRef.value.querySelectorAll('.q-btn').length // 按钮数量
    };

    // 仅当位置或大小发生变化时更新Vuex
    if (position.right !== fixedPanelPosition.value.right ||
        position.top !== fixedPanelPosition.value.top ||
        position.height !== fixedPanelPosition.value.height ||
        position.width !== fixedPanelPosition.value.width) {
      store.commit('updateFixedPanelPosition', position);
      console.log('更新面板位置和大小:', position);
    }
  }
}

// 使用计算属性获取面板尺寸样式
const largePanelStyle = computed(() => {
  if (props.containerWidth && props.containerHeight) {
    return {
      width: `${props.containerWidth}px`,
      height: `${props.containerHeight}px`,
      top: `${props.containerTop}px`,
      left: `${props.containerLeft}px`
    };
  }
  // 默认样式
  return {};
});

// 右侧面板相关状态
const resumeIndexVisible = computed({
  get: () => store.getters.getResumeIndexVisible, // 从store获取状态
  set: (value) => {
    store.commit('setResumeIndexVisible', value); // 更新store中的状态
    emit('update:showRightNav', value); // 保持原有的emit
  }
});
const showChatPanel = ref(true);
const chatPanelExpanded = ref(true);
const chatMessages = ref([
]);

// Morph状态控制
const morphState = computed(() => {
  if (!showChatPanel.value) return 'chat-btn';
  return 'chat-card';
});

// 添加动画中状态标记
const isAnimating = ref(false);

// 队列监视器状态
const showQueueMonitor = computed(() => store.getters.getShowQueueMonitor);

// 切换队列监视器显示与隐藏
const toggleQueueMonitor = () => {
  store.commit('toggleQueueMonitor');
};

// 切换显示/隐藏右侧导航
const toggleRightNav = () => {
  store.commit('toggleResumeIndexVisible'); // 使用store提交mutation
};

// 切换聊天面板显示
const toggleChatPanel = () => {
  if (isAnimating.value) return; // 如果正在动画中，不执行操作

  if (showChatPanel.value && chatPanelExpanded.value) {
    // 如果是展开状态，则关闭
    showChatPanel.value = false;
  } else {
    showChatPanel.value = !showChatPanel.value;
  }
};

// 展开/收缩聊天面板
const toggleChatExpand = () => {
  // 进入动画状态
  isAnimating.value = true;

  // 等待动画完成后结束动画状态
  setTimeout(() => {
    isAnimating.value = false;
  }, 500); // 与CSS过渡时间一致
};

// 发送聊天消息
const sendChatMessage = (message) => {
  // 添加用户消息到聊天列表
  chatMessages.value.push({
    content: message,
    type: 'user',
    time: formatTime()
  });

  // 发出消息事件
  emit('chatMessage', message);

  // 模拟AI回复
  setTimeout(() => {
    chatMessages.value.push({
      content: `收到您的消息："${message}"，我会尽快处理。`,
      type: 'bot',
      time: formatTime()
    });
  }, 800);
};

// 格式化时间
const formatTime = () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// 滚动到顶部
const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
};

onMounted(()=>{
  if (chatCardRef.value) {
    //初始化ref
    store.commit('changeChatCardRef', chatCardRef.value);
  }
})
</script>

<style scoped>
/* 右侧固定按钮面板样式 */
.fixed-right-panel {
  position: fixed;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
