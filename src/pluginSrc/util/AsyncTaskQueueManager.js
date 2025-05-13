import { ref, reactive } from 'vue';
import AsyncTaskQueue, { asyncTaskQueue } from './AsyncTaskQueue';

/**
 * 任务队列管理器 - 管理多个AsyncTaskQueue实例
 */
class AsyncTaskQueueManager {
  constructor() {
    // 存储不同类型的队列
    this.queueInstances = {};

    // 默认使用全局单例
    this.defaultQueue = asyncTaskQueue;

    // 存储队列状态的响应式对象
    this.queueStatus = reactive({
      queues: {},
      totalTasks: 0
    });
  }

  /**
   * 创建新的队列实例
   * @param {string} queueId - 队列唯一标识
   * @param {Object} config - 队列配置
   * @returns {AsyncTaskQueue} 创建的队列实例
   */
  createQueue(queueId, config = {}) {
    if (this.queueInstances[queueId]) {
      console.warn(`队列 ${queueId} 已存在，返回现有实例`);
      return this.queueInstances[queueId];
    }

    // 创建新的队列实例
    const newQueue = new AsyncTaskQueue(config);
    this.queueInstances[queueId] = newQueue;

    // 初始化状态跟踪
    this.queueStatus.queues[queueId] = {
      id: queueId,
      config,
      active: false,
      size: 0
    };

    return newQueue;
  }

  /**
   * 获取指定队列实例
   * @param {string} queueId - 队列唯一标识
   * @returns {AsyncTaskQueue} 队列实例
   */
  getQueue(queueId) {
    return this.queueInstances[queueId] || null;
  }

  /**
   * 向指定队列添加任务
   * @param {string} queueId - 队列唯一标识
   * @param {string} channelKey - 渠道标识
   * @param {Object} task - 任务对象
   * @returns {boolean} 是否成功添加
   */
  addTask(queueId, channelKey, task) {
    const queue = this.queueInstances[queueId] || this.defaultQueue;

    if (!queue) {
      console.error(`队列 ${queueId} 不存在`);
      return false;
    }

    const result = queue.addTask(channelKey, task);
    this.updateQueueStatus();
    return result;
  }

  /**
   * 向默认队列添加任务
   * @param {string} channelKey - 渠道标识
   * @param {Object} task - 任务对象
   * @returns {boolean} 是否成功添加
   */
  addTaskToDefault(channelKey, task) {
    const result = this.defaultQueue.addTask(channelKey, task);
    this.updateQueueStatus();
    return result;
  }

  /**
   * 暂停指定队列的特定渠道
   * @param {string} queueId - 队列唯一标识
   * @param {string} channelKey - 渠道标识
   */
  pauseChannel(queueId, channelKey) {
    const queue = this.queueInstances[queueId] || this.defaultQueue;

    if (queue) {
      queue.pauseProcessing(channelKey);
      this.updateQueueStatus();
    }
  }

  /**
   * 暂停默认队列的特定渠道
   * @param {string} channelKey - 渠道标识
   */
  pauseDefaultChannel(channelKey) {
    this.defaultQueue.pauseProcessing(channelKey);
    this.updateQueueStatus();
  }

  /**
   * 清空指定队列的特定渠道
   * @param {string} queueId - 队列唯一标识
   * @param {string} channelKey - 渠道标识
   */
  clearChannel(queueId, channelKey) {
    const queue = this.queueInstances[queueId] || this.defaultQueue;

    if (queue) {
      queue.clearChannelQueue(channelKey);
      this.updateQueueStatus();
    }
  }

  /**
   * 清空默认队列的特定渠道
   * @param {string} channelKey - 渠道标识
   */
  clearDefaultChannel(channelKey) {
    this.defaultQueue.clearChannelQueue(channelKey);
    this.updateQueueStatus();
  }

  /**
   * 清空指定队列的所有渠道
   * @param {string} queueId - 队列唯一标识
   */
  clearQueue(queueId) {
    const queue = this.queueInstances[queueId] || this.defaultQueue;

    if (queue) {
      queue.clearAllQueues();
      this.updateQueueStatus();
    }
  }

  /**
   * 清空所有队列
   */
  clearAllQueues() {
    // 清空默认队列
    this.defaultQueue.clearAllQueues();

    // 清空所有自定义队列
    Object.values(this.queueInstances).forEach(queue => {
      queue.clearAllQueues();
    });

    this.updateQueueStatus();
  }

  /**
   * 更新队列状态信息
   */
  updateQueueStatus() {
    let totalTasks = 0;

    // 更新默认队列状态
    const defaultSizes = this.defaultQueue.getQueueSizes();
    this.queueStatus.queues['default'] = {
      id: 'default',
      active: Object.values(defaultSizes.value).some(size => size > 0),
      size: Object.values(defaultSizes.value).reduce((sum, size) => sum + size, 0),
      channels: { ...defaultSizes.value }
    };

    totalTasks += this.queueStatus.queues['default'].size;

    // 更新其他队列状态
    Object.entries(this.queueInstances).forEach(([queueId, queue]) => {
      const sizes = queue.getQueueSizes();
      const queueSize = Object.values(sizes.value).reduce((sum, size) => sum + size, 0);

      this.queueStatus.queues[queueId] = {
        id: queueId,
        active: Object.values(sizes.value).some(size => size > 0),
        size: queueSize,
        channels: { ...sizes.value }
      };

      totalTasks += queueSize;
    });

    this.queueStatus.totalTasks = totalTasks;
  }

  /**
   * 获取队列状态信息
   * @returns {Object} 队列状态信息
   */
  getQueueStatus() {
    this.updateQueueStatus();
    return this.queueStatus;
  }
}

// 创建单例实例
export const asyncTaskQueueManager = new AsyncTaskQueueManager();

// 导出简化的API函数
export const addTask = (channelKey, task) => asyncTaskQueueManager.addTaskToDefault(channelKey, task);
export const pauseChannel = (channelKey) => asyncTaskQueueManager.pauseDefaultChannel(channelKey);
export const clearChannel = (channelKey) => asyncTaskQueueManager.clearDefaultChannel(channelKey);
export const clearAllChannels = () => asyncTaskQueueManager.clearQueue('default');
export const getQueueStatus = () => asyncTaskQueueManager.getQueueStatus();

// 导出类和单例
export default AsyncTaskQueueManager;
