<template>
  <div class="queue-status-monitor q-pa-sm" v-if="showMonitor">
    <q-card class="monitor-card">
      <q-card-section class="q-pa-sm">
        <div class="row items-center justify-between">
          <div class="text-subtitle2">AI任务状态监视器</div>
          <div class="row q-gutter-x-sm">
            <q-badge color="primary" class="q-px-sm">
              总任务数: {{ queueStatus.totalTasks }}
            </q-badge>
            <q-btn flat dense round icon="close" size="sm" @click="closeMonitor" />
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-pa-sm scroll" style="max-height: 300px">
        <template v-if="isEmpty">
          <div class="text-center q-pa-md text-grey">
            <q-icon name="check_circle" size="md" />
            <div>没有可执行的AI任务</div>
          </div>
        </template>

        <template v-else>
          <div v-for="(queue, queueId) in queueStatus.queues" :key="queueId" class="q-mb-sm">
            <div v-if="queue.size > 0" class="queue-item">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-weight-medium">
                  <!-- {{ queueId === 'default' ? '默认队列' : queueId }} -->
                    正在排队
                  <q-badge outline color="primary" class="q-ml-sm">
                    {{ queue.size }} 个任务
                  </q-badge>
                </div>
                <div>
                  <q-btn flat dense size="sm" color="negative" icon="delete" @click="clearQueue(queueId)" />
                </div>
              </div>

              <div class="channel-list q-pl-sm">
                <div
                  v-for="(size, channelKey) in queue.channels"
                  :key="channelKey"
                  v-show="size > 0"
                  class="channel-item q-py-xs"
                >
                  <div class="row items-center justify-between">
                    <div>
                      <q-chip size="sm" :color="getChannelColor(channelKey)" text-color="white" dense>
                        {{ channelKey }}
                      </q-chip>
                      <span class="text-caption q-ml-sm">{{ size }} 个任务</span>
                    </div>
                    <div class="row q-gutter-x-xs">
                      <q-btn flat dense size="xs" color="warning" icon="pause" @click="pauseChannel(queueId, channelKey)" />
                      <q-btn flat dense size="xs" color="negative" icon="delete" @click="clearChannel(queueId, channelKey)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-pa-xs">
        <div class="row justify-end items-center">
          <!-- <q-btn flat dense size="sm" color="primary" icon="refresh" @click="manualRefresh">
            刷新
          </q-btn> -->
          <q-btn flat dense size="sm" color="negative" icon="delete_sweep" @click="clearAllQueues">
            清空所有AI任务
          </q-btn>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import {
  asyncTaskQueueManager,
  clearChannel as clearChannelApi,
  clearAllChannels,
  pauseChannel as pauseChannelApi,
  getQueueStatus
} from 'src/pluginSrc/util/AsyncTaskQueueManager';
import {useStore} from "vuex";

const store = useStore();
const props = defineProps({
  initialShow: {
    type: Boolean,
    default: true
  }
});

const showMonitor = computed(() => store.getters.getShowQueueMonitor);
const queueStatus = ref({
  queues: {},
  totalTasks: 0
});

// 计算队列是否为空
const isEmpty = computed(() => {
  return queueStatus.value.totalTasks === 0;
});

const searchCount = computed(()=>store.getters.getSearchCount);

// 获取渠道的颜色
const channelColors = {
  'ZHILIAN': 'indigo',
  'LIEPIN': 'deep-purple',
  'JOB51': 'teal',
  'BOSS': 'orange',
  'LAGOU': 'green',
  'default': 'grey'
};

const getChannelColor = (channelKey) => {
  return channelColors[channelKey] || channelColors.default;
};

// 自动更新状态的计时器
let statusTimer = null;
// 记录最后一次的searchCount值
let lastSearchCount = 0;
// 空队列和有任务时的刷新频率（毫秒）
const EMPTY_REFRESH_INTERVAL = 10000; // 空队列时10秒刷新一次
const ACTIVE_REFRESH_INTERVAL = 2000;  // 有任务时2秒刷新一次

// 监听搜索计数变化
watch(searchCount, (newCount, oldCount) => {
  console.log(`searchCount 变化: ${oldCount} -> ${newCount}`);
  lastSearchCount = newCount;

  // 如果有新任务且定时器未运行，启动定时器
  if (!statusTimer) {
    console.log("搜索计数变化，启动监控定时器");
    // 先执行一次刷新，确保立即更新状态
    refreshStatus();
    startTimer();
  }
});

// 启动定时器
const startTimer = () => {
  // 避免重复启动
  if (statusTimer) return;

  console.log("启动定时器");
  statusTimer = setInterval(() => {
    console.log("定时器触发222")
    refreshStatus();

    // 检查队列是否为空，如果为空则停止定时器
    if (isEmpty.value) {
      console.log("队列为空，停止定时器");
      stopTimer();
    }
  }, ACTIVE_REFRESH_INTERVAL);
};

// 停止定时器
const stopTimer = () => {
  if (statusTimer) {
    console.log("停止定时器");
    clearInterval(statusTimer);
    statusTimer = null;
  }
};

// 刷新状态
const refreshStatus = () => {
  queueStatus.value = getQueueStatus();

  // 如果队列不为空但定时器没有运行，启动定时器
  if (!isEmpty.value && !statusTimer) {
    startTimer();
  }
};

// 手动刷新 - 由用户点击刷新按钮触发
const manualRefresh = () => {
  refreshStatus();

  // 如果队列不为空，确保定时器在运行
  if (!isEmpty.value) {
    startTimer();
  }
};

// 清空特定队列中的特定渠道
const clearChannel = (queueId, channelKey) => {
  if (queueId === 'default') {
    clearChannelApi(channelKey);
  } else {
    asyncTaskQueueManager.clearChannel(queueId, channelKey);
  }
  refreshStatus();
};

// 暂停特定队列中的特定渠道
const pauseChannel = (queueId, channelKey) => {
  if (queueId === 'default') {
    pauseChannelApi(channelKey);
  } else {
    asyncTaskQueueManager.pauseChannel(queueId, channelKey);
  }
  refreshStatus();
};

// 清空特定队列
const clearQueue = (queueId) => {
  if (queueId === 'default') {
    clearAllChannels();
  } else {
    asyncTaskQueueManager.clearQueue(queueId);
  }
  refreshStatus();
};

// 清空所有队列
const clearAllQueues = () => {
  asyncTaskQueueManager.clearAllQueues();
  refreshStatus();
};

// 关闭监控器
const closeMonitor = () => {
  // 使用 Vuex mutation 更新状态
  store.commit('toggleQueueMonitor');
};

onMounted(() => {
  // 初始刷新
  refreshStatus();

  // 如果队列不为空，启动定时器
  if (!isEmpty.value) {
    startTimer();
  }

  // 记录初始搜索计数
  lastSearchCount = searchCount.value;
});

onUnmounted(() => {
  // 清除定时器
  stopTimer();
});
</script>

<style scoped>
.queue-status-monitor {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999;
  width: 320px;
}

.monitor-card {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
}

.channel-list {
  border-left: 2px solid #f2f2f2;
}

.channel-item {
  border-bottom: 1px dashed #f5f5f5;
}

.channel-item:last-child {
  border-bottom: none;
}
</style>
