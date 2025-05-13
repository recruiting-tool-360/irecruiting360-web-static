import { addTask, clearChannel, clearAllChannels } from './AsyncTaskQueueManager';
import notify from 'src/util/notify';
import * as BossJobInfoManager from 'src/pluginSrc/channels/BossJobInfoManager';
import {exeQueueJobInfo} from "src/pluginSrc/channels/BossJobInfoManager";
import * as ZhiLianJobInfoManager from "src/pluginSrc/channels/ZhiLianJobInfoManager";
import * as Job51InfoManager from "src/pluginSrc/channels/Job51InfoManager";
import * as LIEPINJobInfoManager from "src/pluginSrc/channels/LIEPINJobInfoManager";

// 是否开启调试日志
const DEBUG_MODE = false;

// 启用调试日志的函数
function enableDebugLogs() {
  console.log('简历处理器调试模式已启用');
  // 可以在这里设置全局的调试配置
}

// 初始化时启用调试模式
if (DEBUG_MODE) {
  enableDebugLogs();
}

// 定义每个渠道的处理器
const channelProcessors = {
  // BOSS直聘渠道处理器
  BOSS: async (task) => {
    try {
      console.log('处理BOSS直聘简历任务:', task, new Date().getTime());
      // 这里放置BOSS直聘简历异步处理逻辑
      // 例如：获取简历详情、预加载数据等

      // 示例: 异步获取简历详情
      const detailResult = await BossJobInfoManager.exeQueueJobInfo(task);

      // 在实际应用中完成处理后，可以更新UI或存储结果
      return true;
    } catch (error) {
      console.error('处理BOSS直聘简历任务失败:', error);
      return false;
    }
  },

  // 智联招聘渠道处理器
  ZHILIAN: async (task) => {
    try {
      console.log('处理智联招聘简历任务:', task, new Date().getTime());
      // 这里放置智联招聘简历异步处理逻辑
      // 示例: 异步获取简历详情
      const detailResult = await ZhiLianJobInfoManager.exeQueueJobInfo(task);
      return true;
    } catch (error) {
      console.error('处理智联招聘简历任务失败:', error);
      return false;
    }
  },

  // 猎聘渠道处理器
  LIEPIN: async (task) => {
    try {
      console.log('处理猎聘简历任务:', task, new Date().getTime());
      const detailResult = await LIEPINJobInfoManager.exeQueueJobInfo(task);
      // 这里放置猎聘简历异步处理逻辑
      return true;
    } catch (error) {
      console.error('处理猎聘简历任务失败:', error);
      return false;
    }
  },

  // 前程无忧渠道处理器
  JOB51: async (task) => {
    try {
      console.log('处理前程无忧简历任务:', task, new Date().getTime());
      const detailResult = await Job51InfoManager.exeQueueJobInfo(task);
      // 这里放置前程无忧简历异步处理逻辑
      return true;
    } catch (error) {
      console.error('处理前程无忧简历任务失败:', error);
      return false;
    }
  }
};

// 初始化所有渠道处理器
function initializeAllChannelProcessors() {
  console.log('初始化所有简历处理器');

  // 这里可以进行一些初始化操作，比如:
  // 1. 检查各渠道API是否可用
  // 2. 预加载一些必要的数据
  // 3. 设置各渠道的处理优先级或配置项

  // 示例：记录已初始化的处理器数量
  const channelCount = Object.keys(channelProcessors).length;
  console.log(`已初始化${channelCount}个渠道处理器`);
}

// 添加简历任务到指定渠道的队列
export const addResumeTask = (channelKey, taskData) => {
  if (!channelProcessors[channelKey]) {
    console.warn(`未知的渠道: ${channelKey}，任务将不会被处理`);
    return false;
  }

  // 使用新的任务处理器添加任务
  const taskWithProcessor = {
    ...taskData,
    processor: channelProcessors[channelKey]
  };

  return addTask(channelKey, taskWithProcessor);
};

// 清空指定渠道的任务队列
export const clearChannelTasks = (channelKey) => {
  if (!channelProcessors[channelKey]) {
    console.warn(`未知的渠道: ${channelKey}`);
    return false;
  }

  return clearChannel(channelKey);
};

// 清空所有渠道的任务队列
export const clearAllChannelTasks = () => {
  return clearAllChannels();
};

// 初始化所有处理器
initializeAllChannelProcessors();

// 导出处理器对象和辅助函数
export default {
  addResumeTask,
  initializeAllChannelProcessors,
  clearChannelTasks,
  clearAllChannelTasks,
  channelProcessors
};
