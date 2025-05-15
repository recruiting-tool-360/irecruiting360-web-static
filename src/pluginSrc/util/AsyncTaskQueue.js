import { ref } from 'vue';

// 定义默认配置
const defaultConfig = {
  minInterval: 2000,  // 最小间隔时间(毫秒)
  maxInterval: 6000,  // 最大间隔时间(毫秒)
  maxRetries: 3       // 最大重试次数
};

// 创建任务队列系统
class AsyncTaskQueue {
  constructor(config = {}) {
    // 合并配置参数
    this.config = { ...defaultConfig, ...config };

    // 为每个渠道创建独立队列
    this.queues = {};
    this.timers = {};
    this.processing = {};
    this.queueSizes = ref({});
  }

  // 生成随机间隔时间
  getRandomInterval() {
    const { minInterval, maxInterval } = this.config;
    return Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
  }

  // 添加任务到指定渠道队列
  addTask(channelKey, task) {
    if (!this.queues[channelKey]) {
      this.queues[channelKey] = [];
      this.queueSizes.value[channelKey] = 0;
    }

    // 添加任务到队列
    this.queues[channelKey].push({
      ...task,
      retries: 0,
      addedAt: new Date()
    });

    // 更新队列大小
    this.queueSizes.value[channelKey] = this.queues[channelKey].length;

    // 如果该渠道未在处理中，启动处理
    if (!this.processing[channelKey]) {
      this.startProcessing(channelKey);
    }

    return true;
  }

  // 开始处理指定渠道的队列
  startProcessing(channelKey) {
    if (this.processing[channelKey]) return;

    this.processing[channelKey] = true;

    // 使用随机间隔启动第一个任务
    const interval = this.getRandomInterval();
    console.log(`队列${channelKey}将在${interval}ms后开始处理`);

    this.timers[channelKey] = setTimeout(() => {
      this.processNextTask(channelKey);
    }, interval);
  }

  // 暂停指定渠道的队列处理
  pauseProcessing(channelKey) {
    if (!this.processing[channelKey]) return;

    this.processing[channelKey] = false;

    // 清除现有定时器
    if (this.timers[channelKey]) {
      clearTimeout(this.timers[channelKey]);
      this.timers[channelKey] = null;
    }
  }

  // 处理指定渠道的下一个任务
  async processNextTask(channelKey) {
    // 如果队列已暂停或为空，则退出
    if (!this.processing[channelKey] || !this.queues[channelKey] || this.queues[channelKey].length === 0) {
      this.processing[channelKey] = false;
      return;
    }

    // 获取队列的第一个任务
    const task = this.queues[channelKey].shift();

    // 更新队列大小
    this.queueSizes.value[channelKey] = this.queues[channelKey].length;

    try {
      // 生成新的随机时间间隔，确保每个任务执行前都有不同的等待时间
      const nextInterval = this.getRandomInterval();

      // 执行任务处理器
      if (task.processor) {
        const result = await task.processor(task);

        // 任务失败且未超过最大重试次数，则重新加入队列
        if (!result && task.retries < this.config.maxRetries) {
          task.retries++;
          this.queues[channelKey].push(task);
          this.queueSizes.value[channelKey] = this.queues[channelKey].length;
        }
      }

      // 继续处理下一个任务（使用新的随机间隔）
      console.log(`队列${channelKey}的下一个任务将在${nextInterval}ms后处理`);
      this.timers[channelKey] = setTimeout(() => {
        this.processNextTask(channelKey);
      }, nextInterval);

    } catch (error) {
      console.error(`处理队列${channelKey}任务失败:`, error);

      // 发生错误时，仍然继续处理队列中的其它任务
      const nextInterval = this.getRandomInterval();
      this.timers[channelKey] = setTimeout(() => {
        this.processNextTask(channelKey);
      }, nextInterval);
    }
  }

  // 清除指定渠道的所有任务
  clearChannelQueue(channelKey) {
    let removedTasks = [];
    
    if (this.queues[channelKey]) {
      // 保存被删除的任务
      removedTasks = [...this.queues[channelKey]];
      
      // 暂停处理
      this.pauseProcessing(channelKey);

      // 清空队列
      this.queues[channelKey] = [];
      this.queueSizes.value[channelKey] = 0;

      console.log(`已清空渠道${channelKey}的所有任务`);
    }
    
    return removedTasks;
  }

  // 清空所有渠道的任务
  clearAllQueues() {
    // 获取所有渠道
    const channelKeys = Object.keys(this.queues);
    const allRemovedTasks = {};

    // 清空每个渠道的队列
    channelKeys.forEach(channelKey => {
      allRemovedTasks[channelKey] = this.clearChannelQueue(channelKey);
    });

    console.log('已清空所有渠道的任务队列');
    return allRemovedTasks;
  }

  // 获取队列大小的响应式引用
  getQueueSizes() {
    return this.queueSizes;
  }
}

// 导出单例实例
export const asyncTaskQueue = new AsyncTaskQueue();

// 导出类，允许创建多个实例
export default AsyncTaskQueue;
