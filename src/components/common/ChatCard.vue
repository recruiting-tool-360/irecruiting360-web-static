<!-- 聊天卡片组件 (使用Morph动画) -->
<template>
  <q-card
    v-morph:chat-card:chat-morph:300.resize="morphState"
    class="chat-panel"
    :class="[
      expanded ? 'chat-panel-large' : 'chat-panel-small',
      !expanded ? 'draggable-panel' : '',
      verticalExpanded && !expanded ? 'vertical-expanded' : ''
    ]"
    v-show="visible"
    :style="expanded ? largePanelStyle : panelPosition"
    ref="chatCardRef"
  >
    <q-card-section
      class="row items-center justify-between q-py-sm"
      @mousedown="!expanded && startDrag($event)"
    >
      <div class="text-h6 text-grey-9 invisible" style="user-select: none">
        {{(messages.length === 0 && internalMessages.length === 0 && !isFirstMessage)?'':'AI 智能招聘助手'}}
      </div>
      <div>
        <q-btn
          flat
          round
          dense
          :icon="expanded ? 'fullscreen_exit' : 'fullscreen'"
          @click="toggleExpand"
          :disable="isAnimating"
        >
          <q-tooltip>{{ expanded ? '缩小' : '放大' }}</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          :icon="verticalExpanded ? 'unfold_less' : 'unfold_more'"
          @click="toggleVerticalExpand"
          :disable="isAnimating"
        >
          <q-tooltip>{{ verticalExpanded ? '纵向缩小' : '纵向放大' }}</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          icon="remove"
          @click="$emit('close')"
          :disable="isAnimating"
        />
      </div>
    </q-card-section>

    <q-card-section class="chat-content" :class="{'expanded-content': expanded}" style="cursor: auto">
      <div v-if="messages.length === 0 && internalMessages.length === 0" class="text-center text-grey q-pa-md empty-message-hint">
      </div>
      <div v-else-if="loading" class="loading-container">
        <q-spinner color="primary" size="3em" />
        <div class="q-mt-sm text-grey">正在加载聊天历史...</div>
      </div>
      <div v-else class="chat-messages">
        <div
          v-for="(msg, index) in displayMessages"
          :key="msg.id || index"
          :class="['chat-message', msg.type === 'user' ? 'chat-message-user' : 'chat-message-bot']"
        >
          <div class="chat-message-avatar">
            <q-avatar :color="msg.type === 'user' ? 'primary' : 'secondary'" text-color="white" size="28px" :class="`${msg.type === 'user'?'invisible':''}`">
              {{ msg.type === 'user' ? '我' : 'AI' }}
            </q-avatar>
          </div>
          <div class="chat-message-content">
            <div class="chat-message-bubble">
              <!-- 使用v-html和Markdown渲染 -->
              <div v-if="msg.type === 'bot'" v-html="parseMarkdown(msg.content ? msg.content.replace('[&AI_SEARCH&]', '') : '')"></div>
              <template v-else>{{ msg.content || '' }}</template>

              <!-- 添加AI输出中的动画 -->
              <div v-if="chatFluxStatus && index === displayMessages.length - 1 && msg.type === 'bot'" class="typing-indicator">
                <span>~~</span>
                <span>~~</span>
                <span>~~</span>
              </div>
            </div>

            <!-- 消息操作按钮 -->
            <div v-if="msg.type === 'bot' && !(chatFluxStatus && index === displayMessages.length - 1)" class="message-actions">
              <q-btn v-if="!chatFluxStatus" flat round dense size="sm" icon="content_copy" @click="handleCopy(msg.content ? msg.content.replace('[&AI_SEARCH&]', '') : '')">
                <q-tooltip>复制内容</q-tooltip>
              </q-btn>
              <q-btn v-if="msg.content && msg.content.includes('[&AI_SEARCH&]')" flat  dense size="sm" icon="edit" @click="handleEdit(msg)" label="编辑">
                <q-tooltip>编辑</q-tooltip>
              </q-btn>
              <q-btn v-if="msg.content && msg.content.includes('[&AI_SEARCH&]')" flat  dense size="sm" icon="search" @click="handleSearch(msg)" label="聚合搜索">
                <q-tooltip>聚合搜索</q-tooltip>
              </q-btn>
            </div>

            <div class="chat-message-time text-grey-6">{{ msg.time || '' }}</div>
          </div>
        </div>
      </div>
    </q-card-section>

    <q-card-section style="cursor: auto"
      :key="isFirstMessage ? 'bottom-input' : 'center-input'"
      :class="[
        'chat-input q-pa-sm q-my-md',
        {'centered-input': isNewChat && messages.length === 0 && internalMessages.length === 0 && !isFirstMessage}
      ]"
    >
      <!--  初始化展示内容    -->
      <div v-if="isNewChat && messages.length === 0 && internalMessages.length === 0 && !isFirstMessage" class="q-pa-md q-mb-md rounded-borders">
        <div class="text-center q-mb-md">
          <q-avatar size="xl">
            <img src="/logo/logo2.svg" />
          </q-avatar>
        </div>
        <div class="text-h5 text-primary text-center q-mb-md text-bold">AI 智能招聘助手</div>
        <div class="q-mb-sm text-center">
          <q-badge rounded class="bg-transparent text-grey-8">
            <q-icon name="search" size="sm" class="q-mr-sm" />
            <span class="text-subtitle1 text-weight-medium">快速筛选合适的候选人</span>
          </q-badge>
        </div>
        <div class="text-center">
          <q-badge class="bg-transparent text-grey-8">
            <q-icon name="analytics" size="sm" class="q-mr-sm" />
            <span class="text-subtitle1 text-weight-medium">分析简历要点和技能匹配度</span>
          </q-badge>
        </div>
      </div>
      <!--  输入框    -->
      <div class="input-container q-mt-md">
        <q-input
          v-model="chatMessage"
          borderless
          type="textarea"
          :input-style="{ maxHeight: '150px', overflow: 'auto', resize: 'none' }"
          placeholder="给[i快招]AI发送消息，示例：发送一段招聘JD"
          class="full-width message-input"
          @keydown.enter.exact.prevent="sendChatMessage"
          @keydown.shift.enter.prevent="newLine"
        >
          <template v-slot:hint v-if="!chatFluxStatus">
            <span class="text-grey-6">Shift+Enter 换行，Enter 发送</span>
          </template>
        </q-input>

        <div class="send-button-container">
          <q-badge class="bg-transparent text-grey-8">
            Shift+Enter 换行，Enter 发送
          </q-badge>
          <q-btn
            round
            dense
            :loading="chatFluxStatus"
            color="primary"
            icon="send"
            @click="sendChatMessage"
            class="send-button"
          >
            <q-tooltip>{{ chatFluxStatus ? '停止输出' : '发送' }}</q-tooltip>
          </q-btn>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { getChatHistory, getCurrentConditionByChatId } from 'src/api/chat/ChatApi';
import { fetchStream } from 'src/api/chat/ChatUtil2';
import { v4 as uuidv4 } from 'uuid';

const store = useStore();
const $q = useQuasar();

// Markdown配置
const md = new MarkdownIt({
  html: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (err) {
        console.warn('Failed to highlight:', err);
        return str;
      }
    }
    return str;
  }
});

// 添加流式响应相关状态
const chatFluxStatus = ref(false);
const abortController = ref(null);
const loading = ref(false);
const sending = ref(false);
const isComposing = ref(false);
const currentChatId = ref('');
const userInfo = computed(() => store.getters.getUserInfo);
const latestChatId = computed(()=>store.getters.getLatestChatId)
const isFirstMessage = ref(false);
const isNewChat = ref(true);
//jobSearchFilterRef
const jobSearchFilterRef = computed(() => store.getters.getJobSearchFilterRefValue);

const msgYYY = '我已经为你生成了大致搜索条件，系统会依据这个生成完整搜索条件来精准查找合适简历。大致搜索条件是：2025 届毕业生，本科及以上计算机相关专业，对算法有兴趣，强编码能力，熟悉 linux 开发环境，掌握机器学习等相关技术，有相关领域经验优先。接下来系统会自动处理，你稍作等待就能看到符合要求的简历啦。\n' +
  '[&AI_SEARCH&]\n' +
  '\n' +
  '<div style=\'background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0;\'><div><div style=\'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;\'><div style=\'flex: 1 1 45%; min-width: 200px;\'><div style=\'font-weight: bold; margin-bottom: 3px;\'>职位：</div><div style=\'color: #333; padding: 3px 0; font-size: 14px;\'>算法工程师</div></div><div style=\'flex: 1 1 45%; min-width: 200px;\'><div style=\'font-weight: bold; margin-bottom: 3px;\'>工作经验：</div><div style=\'color: #333; padding: 3px 0; font-size: 14px;\'>应届生</div></div><div style=\'flex: 1 1 45%; min-width: 200px;\'><div style=\'font-weight: bold; margin-bottom: 3px;\'>学历要求：</div><div style=\'color: #333; padding: 3px 0; font-size: 14px;\'>本科/硕士/博士</div></div></div><div style=\'margin-top: 5px;\'><div style=\'margin-bottom: 8px;\'><div style=\'font-weight: bold; margin-bottom: 4px;\'>专业技能：</div><div style=\'display: flex; flex-wrap: wrap; gap: 5px;\'><div style=\'background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;\'>具备强悍的编码能力，熟悉linux开发环境，熟悉Hadoop/Hive优先</div><div style=\'background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;\'>具备扎实的数据结构功底，熟悉机器学习、深度学习、图计算、自然语言处理、数据挖掘、分布式计算中一项或多项</div></div></div><div style=\'margin-bottom: 8px;\'><div style=\'font-weight: bold; margin-bottom: 4px;\'>软实力要求：</div><div style=\'display: flex; flex-wrap: wrap; gap: 5px;\'><div style=\'background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;\'>具备较好的数理基础和逻辑分析能力</div><div style=\'background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;\'>对解决具有挑战性的问题充满激情</div><div style=\'background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;\'>具备较好的主动性和团队合作精神</div></div></div><div style=\'margin-bottom: 8px;\'><div style=\'font-weight: bold; margin-bottom: 4px;\'>相关经历：</div><div style=\'display: flex; flex-wrap: wrap; gap: 5px;\'><div style=\'background: #fff7e6; color: #fa8c16; border: 1px solid #ffd591; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;\'>有搜索引擎、推荐系统、计算广告、图像、互联网风控、智能客服、平台治理等相关领域经验者优先</div></div></div></div></div>';
// 添加内部消息列表
const internalMessages = ref([]);

// 合并消息列表（优先使用内部消息，如果内部没有则使用props传入的）
const displayMessages = computed(() => {
  return internalMessages.value.length > 0 ? internalMessages.value : props.messages;
});

// 定义组件属性
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  expanded: {
    type: Boolean,
    default: false
  },
  morphState: {
    type: String,
    default: 'chat-card'
  },
  messages: {
    type: Array,
    default: () => []
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
  },
  // 添加流式响应的props
  enableStream: {
    type: Boolean,
    default: true
  },
  chatId: {
    type: String,
    default: ''
  }
});

// 定义事件
const emit = defineEmits([
  'close',
  'toggle-expand',
  'send-message',
  'update:expanded',
  'edit-search',  // 添加编辑搜索条件事件
  'aggregate-search',  // 添加聚合搜索事件
  'stop-stream',  // 添加停止流式输出事件
  'load-history-complete', // 添加历史加载完成事件
  'add-message', // 添加新消息添加事件
  'message-added', // 添加新消息添加事件
  'chat-reset', // 添加聊天重置事件
  'open-chat' // 添加打开聊天面板事件
]);

// 聊天消息输入
const chatMessage = ref('');
const isAnimating = ref(false);
const chatCardRef = ref(null);

// 拖动功能相关状态
const isDragging = ref(false);
const initialX = ref(0);
const initialY = ref(0);
const offsetX = ref(0);
const offsetY = ref(0);
const defaultPosition = {
  right: '80px',
  bottom: '20px'
};

// 添加垂直展开状态
const verticalExpanded = ref(false);
//aiSearchRef
const aiSearchRef = computed(() => store.getters.getAiSearchRefValue);

// 计算面板位置样式
const panelPosition = computed(() => {
  // 纵向展开时的样式
  const verticalStyle = verticalExpanded.value && !isDragging.value ? {
    width: '380px',
    height: 'calc(100vh - 80px)',
    bottom: '20px',
    right: '80px',
    top: 'auto'
  } : {};

  if (offsetX.value || offsetY.value) {
    return {
      position: 'fixed',
      left: offsetX.value ? `${offsetX.value}px` : 'auto',
      top: offsetY.value ? `${offsetY.value}px` : 'auto',
      right: !offsetX.value ? defaultPosition.right : 'auto',
      bottom: !offsetY.value ? defaultPosition.bottom : 'auto',
      height: verticalExpanded.value ? 'calc(100vh - 80px)' : '500px',
      width: verticalExpanded.value ? '380px' : undefined,
      ...(!isDragging.value ? verticalStyle : {})
    };
  }
  return {
    position: 'fixed',
    right: defaultPosition.right,
    bottom: defaultPosition.bottom,
    ...(!isDragging.value ? verticalStyle : {})
  };
});

// Markdown解析函数
const parseMarkdown = (content) => {
  return md.render(content || '');
};

// 复制消息内容
const handleCopy = (content) => {
  try {
    // 创建临时元素提取纯文本
    const tempElement = document.createElement('div');
    tempElement.innerHTML = parseMarkdown(content);
    const textToCopy = tempElement.innerText || tempElement.textContent;

    navigator.clipboard.writeText(textToCopy);
    $q.notify({
      message: '复制成功',
      color: 'positive',
      position: 'top',
      timeout: 1000
    });
  } catch (err) {
    console.error('复制失败:', err);
    $q.notify({
      message: '复制失败',
      color: 'negative',
      position: 'top'
    });
  }
};

//新建聊天
const handleNewChat = () => {
  // 设置为新聊天状态
  isNewChat.value = true;
  isFirstMessage.value = false;  // 改为 false，表示初始未发送消息状态

  // 清空消息
  store.commit('clearChatMessage');
  internalMessages.value = [];

  // 清空聊天 ID
  currentChatId.value = '';
  store.commit('SET_LATEST_CHAT_ID', '');

  // 清空搜索条件 ID
  store.commit('clearSearchConditionId');

  // 重置输入框
  chatMessage.value = '';

  // 确保聊天框始终处于最大状态
  if (!props.expanded) {
    // 如果当前不是最大状态，则更新状态并触发切换
    emit('update:expanded', true);
    emit('toggle-expand');
  }

  console.log('已重置到新建聊天状态');

  // 通知外部组件聊天已重置
  emit('chat-reset');
  // 新增：通知父组件需要打开聊天面板
  emit('open-chat');
};

// 编辑搜索条件
const handleEdit = (msg) => {
  // emit('edit-search', {
  //   content: msg.content,
  //   chatId: props.chatId || currentChatId.value
  // });

  // 判断对话框是否是缩小状态，如果不是就把它缩小
  if (props.expanded) {
    toggleExpand();
  }

  console.log("chatID:", currentChatId.value)
  //刷新搜索条件
  jobSearchFilterRef.value.refreshSearchCondition(currentChatId.value)
};

// 聚合搜索
const handleSearch = (msg) => {
  // emit('aggregate-search', {
  //   content: msg.content,
  //   chatId: props.chatId || currentChatId.value
  // });
  // 判断对话框是否是缩小状态，如果不是就把它缩小
  if (props.expanded) {
    toggleExpand();
  }
  console.log("chatID:", currentChatId.value)
  //刷新搜索条件并搜索
  jobSearchFilterRef.value.refreshAndSearchFN(currentChatId.value)
};

// 换行处理
const newLine = () => {
  chatMessage.value += '\n';
};

// 开始拖动
const startDrag = (event) => {
  if (props.expanded) return; // 只在全屏模式下禁止拖动，纵向展开模式允许拖动

  // 防止文本选择
  event.preventDefault();

  const card = chatCardRef.value?.$el || chatCardRef.value;
  if (!card) return;

  const rect = card.getBoundingClientRect();

  // 记录初始位置
  initialX.value = event.clientX;
  initialY.value = event.clientY;

  // 如果是第一次拖动，计算初始偏移量
  if (!offsetX.value && !offsetY.value) {
    offsetX.value = rect.left;
    offsetY.value = rect.top;
  }

  isDragging.value = true;

  // 添加移动和结束拖动事件监听
  document.addEventListener('mousemove', doDrag);
  document.addEventListener('mouseup', endDrag);
};

// 拖动中
const doDrag = (event) => {
  if (!isDragging.value) return;

  // 使用 requestAnimationFrame 优化性能
  requestAnimationFrame(() => {
    // 计算移动距离
    const deltaX = event.clientX - initialX.value;
    const deltaY = event.clientY - initialY.value;

    // 更新位置 (使用直接计算方式而不是累加)
    const newOffsetX = offsetX.value + deltaX;
    const newOffsetY = offsetY.value + deltaY;

    // 确保不超出屏幕边界
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const card = chatCardRef.value?.$el || chatCardRef.value;

    if (card) {
      const rect = card.getBoundingClientRect();
      const cardWidth = rect.width;
      const cardHeight = rect.height;

      // 右边界限制 (保留20px在视图内)
      const maxX = windowWidth - cardWidth + 20;
      // 左边界限制 (保留20px在视图内)
      const minX = -20;
      // 底部边界限制 (保留20px在视图内)
      const maxY = windowHeight - cardHeight + 20;
      // 顶部边界限制 (保留50px的顶部空间)
      const minY = 50;

      // 应用边界限制
      offsetX.value = Math.min(Math.max(newOffsetX, minX), maxX);
      offsetY.value = Math.min(Math.max(newOffsetY, minY), maxY);
    } else {
      // 如果没有获取到元素，直接更新位置
      offsetX.value = newOffsetX;
      offsetY.value = newOffsetY;
    }

    // 更新初始位置为当前位置
    initialX.value = event.clientX;
    initialY.value = event.clientY;
  });
};

// 结束拖动
const endDrag = () => {
  if (!isDragging.value) return;

  isDragging.value = false;

  // 确保聊天框至少一半在视图内
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const card = chatCardRef.value?.$el || chatCardRef.value;

  if (card) {
    const rect = card.getBoundingClientRect();
    const cardWidth = rect.width;
    const cardHeight = rect.height;

    // 如果聊天框超过一半在屏幕外，则将其拉回
    if (offsetX.value + cardWidth < cardWidth / 2) {
      offsetX.value = 0;
    }
    if (offsetX.value > windowWidth - cardWidth / 2) {
      offsetX.value = windowWidth - cardWidth;
    }
    if (offsetY.value + cardHeight < cardHeight / 2) {
      offsetY.value = 0;
    }
    if (offsetY.value > windowHeight - cardHeight / 2) {
      offsetY.value = windowHeight - cardHeight;
    }
  }

  document.removeEventListener('mousemove', doDrag);
  document.removeEventListener('mouseup', endDrag);

  // 保存最后位置到本地存储（可选）
  try {
    localStorage.setItem('chatCardPosition', JSON.stringify({
      x: offsetX.value,
      y: offsetY.value
    }));
  } catch (e) {
    console.error('无法保存聊天卡片位置:', e);
  }
};

// 清理事件监听
onUnmounted(() => {
  document.removeEventListener('mousemove', doDrag);
  document.removeEventListener('mouseup', endDrag);
  document.removeEventListener('compositionstart', () => isComposing.value = true);
  document.removeEventListener('compositionend', () => isComposing.value = false);

  // 中断流式响应
  if (chatFluxStatus.value && abortController.value) {
    abortController.value.abort();
  }

  console.log("ChatCard组件已卸载");
});

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

// 获取header可见性和高度
const headerVisible = computed(() => store.getters.getHeaderVisible);
const headerHeight = computed(() => store.getters.getHeaderHeight);

// 计算大型聊天面板的样式
const chatPanelLargeStyle = computed(() => {
  // 当header可见时，调整top位置
  if (headerVisible.value) {
    return {
      top: `${headerHeight.value}px`,
      height: `calc(100vh - ${headerHeight.value}px)`
    };
  } else {
    // header不可见时，占据整个屏幕高度
    return {
      top: '0',
      height: '100vh'
    };
  }
});

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
    type: '', // 用户类型，'user' 或 'bot'
    time: new Date().toLocaleTimeString(),
    timestamp: new Date().toISOString()
  }
};

// 展开/收缩聊天面板
const toggleExpand = () => {
  // 进入动画状态
  isAnimating.value = true;

  // 反转展开状态
  emit('update:expanded', !props.expanded);

  // 触发展开/缩小事件
  emit('toggle-expand');

  // 等待DOM更新后滚动到底部
  nextTick(() => {
    // 在动画完成后执行
    setTimeout(() => {
      scrollChatToBottom();
      isAnimating.value = false;
    }, 500); // 与CSS过渡时间一致
  });
};

// 纵向展开/收缩聊天面板
const toggleVerticalExpand = () => {
  // 进入动画状态
  isAnimating.value = true;

  // 如果是大屏模式，先切换到小屏模式再纵向展开
  if (props.expanded) {
    // 先切换到小屏模式
    emit('update:expanded', false);

    // 等待小屏切换完成后再进行纵向展开
    setTimeout(() => {
      verticalExpanded.value = true;

      // 等待DOM更新后滚动到底部
      nextTick(() => {
        scrollChatToBottom();
        isAnimating.value = false;
      });
    }, 300);
  } else {
    // 直接切换纵向展开状态
    verticalExpanded.value = !verticalExpanded.value;

    // 等待DOM更新后滚动到底部
    nextTick(() => {
      // 在动画完成后执行
      setTimeout(() => {
        scrollChatToBottom();
        isAnimating.value = false;
      }, 300);
    });
  }
};

// 滚动聊天到底部
const scrollChatToBottom = () => {
  const chatContent = document.querySelector('.chat-content');
  if (chatContent) {
    chatContent.scrollTop = chatContent.scrollHeight;
  }
};

// 修改加载历史消息
const loadHistory = async () => {
  if (!currentChatId.value && !props.chatId) return;

  const chatIdToUse = currentChatId.value || props.chatId;

  // 清空内部消息列表
  internalMessages.value = [];

  loading.value = true;
  try {
    // console.log("开始加载历史消息，chatId:", chatIdToUse);

    const { data } = await getChatHistory(chatIdToUse, userInfo.value?.id);
    // console.log("历史消息加载结果:", data);

    if (data?.chatHistory?.length) {
      // 清空当前消息(Vuex中的)
      //store.commit('clearChatMessage');

      // 添加历史消息到内部列表
      data.chatHistory.forEach(msg => {
        const messageType = msg.role === 'user' ? 'user' : 'bot';
        const messageObj = {
          id: msg.id || uuidv4(),
          role: msg.role,
          content: msg.content,
          created: new Date(msg.timestamp).getTime() / 1000,
          type: messageType,
          time: new Date(msg.timestamp).toLocaleTimeString(),
          chatId: chatIdToUse,
          searchConditionId: msg.searchConditionId
        };

        // console.log("添加历史消息:", messageObj);
        addMessage(messageObj);
      });
    } else {
      console.log("没有历史消息");
    }

    // 触发历史加载完成事件
    emit('load-history-complete', data);
  } catch (e) {
    console.error('加载历史消息失败:', e);
    $q.notify({
      message: '加载历史消息失败',
      color: 'negative',
      position: 'top',
      timeout: 2000
    });

    // 添加错误消息到聊天
    const errorMessage = getChatTemplate();
    errorMessage.id = uuidv4();
    errorMessage.role = 'assistant';
    errorMessage.type = 'bot';
    errorMessage.content = `加载历史消息失败。错误信息: ${e?.message || '未知错误'}`;
    errorMessage.created = Math.floor(Date.now() / 1000);
    errorMessage.time = new Date().toLocaleTimeString();
    errorMessage.error = true;
    addMessage(errorMessage);
  } finally {
    loading.value = false;

    // 等待DOM更新后滚动到底部
    nextTick(() => {
      scrollChatToBottom();
    });
  }
};

// 添加消息到内部列表
const addMessage = (message) => {
  // 确保消息有所有必要的字段
  if (!message.id) message.id = uuidv4();
  if (!message.time) message.time = new Date().toLocaleTimeString();

  // 添加消息到内部列表
  internalMessages.value.push(message);
  // console.log("消息已添加到内部列表:", message);

  // 触发父组件更新(可选)
  emit('message-added', message);

  // 确保聊天滚动到底部
  nextTick(() => {
    scrollChatToBottom();
  });
};

// 修改消息处理函数
const setMsgContainer = (msg) => {
  console.log("处理消息:", msg);
  const content = msg.choices?.[0]?.delta?.content;

  if (content) {
    console.log("处理内容:", content);

    if (content === '[DONE]') {
      console.log("聊天结束", content);
      chatFluxStatus.value = false;
      return;
    }

    // 首先检查内部消息列表
    const messages = internalMessages.value;
    console.log("当前内部消息列表:", messages);

    const foundObject = messages.find(item => item.id === msg.id);
    if (foundObject) {
      console.log("找到现有消息，更新内容:", foundObject);
      // 更新已存在消息的内容
      foundObject.content = foundObject.content + content;
    } else {
      console.log("创建新消息");
      // 创建新消息
      const chatTemplate = getChatTemplate();
      chatTemplate.content = content;
      chatTemplate.id = msg.id;
      chatTemplate.chatId = msg.chatId;
      chatTemplate.searchConditionId = msg.searchConditionId;
      chatTemplate.model = msg.model;
      chatTemplate.object = msg.object;
      chatTemplate.created = msg.created;
      chatTemplate.role = "assistant";
      chatTemplate.type = "bot";
      chatTemplate.time = new Date().toLocaleTimeString();

      console.log("创建的新消息:", chatTemplate);

      // 如果收到服务端返回的 chatId，更新状态
      if (msg.chatId && !currentChatId.value) {
        console.log("更新chatId:", msg.chatId);
        currentChatId.value = msg.chatId;
        // 更新 vuex 中的 activeChatId
        store.commit('SET_ACTIVE_CHAT_ID', msg.chatId);
        // 触发列表刷新
        store.commit('SET_NEED_REFRESH_LIST', true);
        isNewChat.value = false;
      }
      // 将消息添加到内部列表
      addMessage(chatTemplate);
      console.log("消息已添加到内部列表");
    }

    // 确保聊天滚动到底部
    nextTick(() => {
      scrollChatToBottom();
    });
  } else {
    console.log("消息没有内容:", msg);
  }
};

// 添加错误响应函数
const addErrorResponse = (userContent, error) => {
  const botMessage = getChatTemplate();
  botMessage.id = uuidv4(); // 确保有唯一ID
  botMessage.role = 'assistant';
  botMessage.type = 'bot';
  botMessage.content = `抱歉，服务器响应出错。请稍后再试或联系管理员。错误信息: ${error?.message || '未知错误'}`;
  botMessage.created = Math.floor(Date.now() / 1000);
  botMessage.time = new Date().toLocaleTimeString();
  botMessage.error = true; // 标记为错误消息
  botMessage.chatId = currentChatId.value || props.chatId || '';

  // 添加到内部消息列表
  addMessage(botMessage);

  // 通知服务器处理错误（可选）
  try {
    const errorData = {
      type: 'error',
      message: error?.message || '未知错误',
      timestamp: new Date().toISOString(),
      userContent: userContent
    };
    console.error("发送错误信息到服务器:", errorData);
    // 这里可以添加向服务器报告错误的代码
  } catch (e) {
    console.error("报告错误失败:", e);
  }
};

// 发送聊天消息
const sendChatMessage = async () => {
  console.log("发送聊天消息开始执行", { chatFluxStatus: chatFluxStatus.value });

  // 如果正在输出中，则停止输出
  if (chatFluxStatus.value) {
    emit('stop-stream');
    chatFluxStatus.value = false;
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    return;
  }

  const messageText = chatMessage.value.trim();
  console.log("发送聊天消息", messageText, sending.value, isComposing.value);

  if (messageText === '') return;
  if (sending.value) return;
  if (isComposing.value) return;

  // 标记首次消息状态
  if (!isFirstMessage.value) {
    isFirstMessage.value = true;
  }

  chatMessage.value = '';
  sending.value = true;

  try {
    // 添加用户消息
    const userMessage = getChatTemplate();
    userMessage.role = 'user';
    userMessage.type = 'user';
    userMessage.content = messageText;
    userMessage.created = Math.floor(Date.now() / 1000);
    userMessage.time = new Date().toLocaleTimeString();
    userMessage.chatId = currentChatId.value || props.chatId || '';

    console.log("准备发送用户消息:", userMessage);

    // 将用户消息添加到聊天列表
    addMessage(userMessage);

    // 等待DOM更新后滚动到底部
    nextTick(() => {
      scrollChatToBottom();
    });

    // 创建新的 AbortController 并标记状态
    abortController.value = new AbortController();
    chatFluxStatus.value = true;

    try {
      // 准备请求数据
      const aiRequestMsg = {
        chatId: currentChatId.value || props.chatId || '',
        userId: userInfo.value?.id,
        searchConditionId: store.getters.getSearchConditionId,
        prompt: messageText,
      };

      console.log("准备发送AI请求:", aiRequestMsg);

      // 发送 AI 请求
      fetchStream(
        `${process.env.VUE_APP_API_BASE_URL}/ihire/chat/streamChat`,
        aiRequestMsg,
        (message) => {
          try {
            const jsonString = message.replace(/^data:/, "").trim();
            if (!jsonString) return;

            const msg = JSON.parse(jsonString);
            console.log("收到流式响应:", msg);
            setMsgContainer(msg);
          } catch (error) {
            chatFluxStatus.value = false;
            console.error("消息解析错误:", error, message);
            addErrorResponse(messageText, error);
          }
          nextTick(() => {
            scrollChatToBottom();
          });
        },
        (error) => {
          chatFluxStatus.value = false;
          console.error("Stream error:", error);
          $q.notify({
            message: '发送失败: ' + (error?.message || '网络错误'),
            color: 'negative',
            position: 'top',
            timeout: 3000
          });

          addErrorResponse(messageText, error);
        },
        () => {
          chatFluxStatus.value = false;
          console.log("聊天正常结束");
        },
        abortController.value // 传入 AbortController
      );
    } catch (streamError) {
      console.error("流式响应出错:", streamError);
      chatFluxStatus.value = false;
      // 添加错误回应
      addErrorResponse(messageText, streamError);
    }
  } catch (e) {
    console.error('发送消息失败:', e);
    $q.notify({
      message: '发送失败',
      color: 'negative',
      position: 'top'
    });
    // 添加错误回应
    addErrorResponse(messageText, e);
  } finally {
    sending.value = false;
  }
};

// 设置流式响应结束
const endStreamResponse = () => {
  chatFluxStatus.value = false;
  abortController.value = null;
};

// 监听 props.chatId 和 latestChatId 的变化
watch([() => props.chatId, () => latestChatId.value], ([newChatId, newLatestChatId]) => {
  // 优先使用 props.chatId，如果为空则使用 latestChatId
  const effectiveId = newChatId || newLatestChatId;

  if (effectiveId) {
    isNewChat.value = false;
    currentChatId.value = effectiveId;  // 更新内部的 chatId
    loadHistory();  // 加载历史消息
  } else {
    currentChatId.value = '';  // 清空内部的 chatId
    // 这里不清空消息列表，由父组件控制
  }
}, { immediate: true });  // 立即执行一次

// 监听父组件传入的消息变化
watch(() => props.messages, (newMessages) => {
  console.log("父组件消息列表更新:", newMessages);

  // 如果内部消息为空且父组件提供了消息，则使用父组件的消息
  if (internalMessages.value.length === 0 && newMessages.length > 0) {
    console.log("使用父组件提供的消息");
    internalMessages.value = [...newMessages];
  }
}, { deep: true });

// 组件挂载时初始化
onMounted(() => {
  console.log("ChatCard组件已挂载", {
    visible: props.visible,
    expanded: props.expanded,
    enableStream: props.enableStream,
    chatId: props.chatId || currentChatId.value
  });

  // 尝试从本地存储恢复位置（可选）
  try {
    const savedPosition = localStorage.getItem('chatCardPosition');
    if (savedPosition) {
      const position = JSON.parse(savedPosition);
      offsetX.value = position.x;
      offsetY.value = position.y;
    }
  } catch (e) {
    console.error('无法恢复聊天卡片位置:', e);
  }

  // 如果父组件传入了消息，则复制到内部消息列表
  if (props.messages && props.messages.length > 0) {
    console.log("复制父组件传入的消息到内部列表");
    internalMessages.value = [...props.messages];
  }
  // 如果有聊天ID，尝试加载历史记录
  else if (props.chatId || currentChatId.value) {
    console.log("尝试加载历史记录");
    loadHistory();
  }
  // 不添加默认欢迎消息，保持空白聊天

  // 绑定键盘事件
  document.addEventListener('compositionstart', () => {
    isComposing.value = true;
  });

  document.addEventListener('compositionend', () => {
    isComposing.value = false;
  });
});

// 向外暴露方法
defineExpose({
  scrollToBottom: scrollChatToBottom,
  endStreamResponse,
  loadHistory,handleNewChat
});
</script>

<style scoped>
/* 聊天面板样式 */
.chat-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  box-shadow: 0 8px 20px rgba(0,0,0,0.2);
  overflow: hidden;
  border: none;
  transition: all 0.5s cubic-bezier(0.25, 0.1, 0.25, 1.0);
  transform-origin: bottom right;
  backface-visibility: hidden;
  will-change: transform, opacity, width, height;
}

.chat-panel-small {
  width: 380px;
  height: 500px;
  right: 80px;
  bottom: 20px;
  border-radius: 12px;
  transform: translateZ(0);
}

.chat-panel-large {
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border-radius: 0;
  box-shadow: none;
  z-index: 1000;
  background-color: white;
  transition: all 0.3s;
}

/* 聊天面板垂直展开时的样式 - 仅当不是大屏模式时应用 */
.chat-panel-small.vertical-expanded {
  height: calc(100vh - 80px) !important;
  width: 380px !important;
  position: fixed;
  bottom: 20px !important;
  right: 80px !important;
  top: auto !important;
  border-radius: 12px;
  z-index: 1000;
}

/* 拖动相关样式 */
.draggable-panel {
  cursor: move;
  transition: none;
}

.cursor-move {
  cursor: move;
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  background-color: white;
  padding: 16px;
  transition: all 0.4s ease;
}

.chat-input {
  background-color: white;
  padding: 8px 16px;
  transition: all 0.4s ease;
}

/* 聊天消息样式 */
.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-message {
  display: flex;
  margin-bottom: 8px;
  transition: transform 0.3s ease;
}

.chat-message-bot {
  align-self: flex-start;
}

.chat-message-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-message-avatar {
  margin: 0 8px;
}

.chat-message-content {
  max-width: 80%;
}

.chat-message-bubble {
  padding: 8px 12px;
  border-radius: 12px;
  background-color: white;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  word-break: break-word;
}

.chat-message-user .chat-message-bubble {
  background-color: var(--q-primary);
  color: white;
  border-top-right-radius: 2px;
}

.chat-message-bot .chat-message-bubble {
  background-color: white;
  border-top-left-radius: 4px;
  box-shadow: none;
}

.chat-message-time {
  font-size: 0.7rem;
  margin-top: 4px;
  text-align: right;
}

.chat-message-user .chat-message-time {
  text-align: right;
}

.chat-message-bot .chat-message-time {
  text-align: left;
}

/* 动画效果增强 */
.chat-panel :deep(.q-card__section) {
  transition: all 0.4s ease;
}

.chat-panel :deep(.q-btn) {
  transition: all 0.2s ease;
}

.chat-panel :deep(.q-btn:hover) {
  transform: scale(1.05);
}

/* 添加扩展内容的过渡样式 */
.expanded-content {
  animation: content-expand 0.5s ease-out;
}

@keyframes content-expand {
  from {
    opacity: 0.8;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 覆盖卡片过渡效果 */
.q-card {
  transition-property: all;
  transition-duration: 0.5s;
  transition-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
}

/* 消息操作按钮 */
.message-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  gap: 4px;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.message-actions:hover {
  opacity: 1;
}

/* 添加 AI 输出中的动画样式 */
.typing-indicator {
  display: flex;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 4px;
}

.typing-indicator span {
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: var(--q-primary);
  border-radius: 50%;
  margin: 0 2px;
  opacity: 0.4;
  animation: typing 1s infinite ease-in-out;
  color: transparent;
  user-select: none;
}

.typing-indicator span:nth-child(1) {
  animation-delay: 200ms;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 300ms;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 400ms;
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

/* Markdown样式 */
:deep(pre) {
  margin: 8px 0;
  padding: 12px;
  background: #f6f8fa;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.5;
  overflow-x: auto;
}

:deep(code) {
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
}

:deep(p) {
  margin: 0;
  line-height: 1.6;
}

:deep(ul), :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

:deep(blockquote) {
  margin: 8px 0;
  padding-left: 16px;
  border-left: 4px solid #ddd;
  color: #666;
}

/* 加载指示器样式 */
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  background-color: rgba(255, 255, 255, 0.9);
  z-index: 10;
}

/* 输入框容器样式 */
.input-container {
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 10px 12px;
  border-radius: 32px;
  background-color: #f5f5f5;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05) inset;
  min-height: 80px;
}

.message-input {
  padding-right: 40px;
  padding-bottom: 40px;
}

.message-input :deep(.q-field__control) {
  background: transparent;
  box-shadow: none;
  min-height: 40px;
}

.message-input :deep(.q-field__native) {
  height: 80px;
  max-height: 150px;
  overflow-y: auto;
  scrollbar-width: thin;
  line-height: 1.5;
  padding: 4px 0;
  resize: none;
}

.message-input :deep(.q-field__native::-webkit-scrollbar) {
  width: 6px;
}

.message-input :deep(.q-field__native::-webkit-scrollbar-track) {
  background: transparent;
}

.message-input :deep(.q-field__native::-webkit-scrollbar-thumb) {
  background-color: #bbb;
  border-radius: 3px;
}

.message-input :deep(.q-field__marginal) {
  height: 40px;
}

.send-button-container {
  position: absolute;
  bottom: 10px;
  right: 12px;
  z-index: 5;
}

.send-button {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: transform 0.2s ease;
}

.send-button:hover {
  transform: scale(1.05);
}

/* 空聊天提示 */
.empty-message-hint {
  padding: 20px;
  color: rgba(0, 0, 0, 0.6);
}

.welcome-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--q-primary);
  margin-bottom: 16px;
  text-align: center;
}

.welcome-features {
  margin-bottom: 16px;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}

.feature-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  font-size: 15px;
  color: rgba(0, 0, 0, 0.75);
}

.feature-item:last-child {
  margin-bottom: 0;
}

/* 居中输入框样式 */
.centered-input {
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 90% !important;
  max-width: 90% !important;
  margin: 0 auto !important;
  transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1) !important;
  /* box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important; */
  border-radius: 12px !important;
  z-index: 10 !important;
}
</style>
