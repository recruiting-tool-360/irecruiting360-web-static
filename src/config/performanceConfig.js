// 性能优化配置
export const PERFORMANCE_CONFIG = {
  // HTML生成批次大小
  HTML_BATCH_SIZE: 3,
  
  // 图片转换批次大小 - 减小以降低内存压力
  IMAGE_BATCH_SIZE: 1,
  
  // 批次间延迟时间(ms) - 增加以让出更多控制权
  BATCH_DELAY: 200,
  
  // requestIdleCallback 超时时间(ms) - 增加以更好利用空闲时间
  IDLE_TIMEOUT: 2000,
  
  // 图片生成配置
  IMAGE_CONFIG: {
    width: 790,
    scale: 1,
    // 可以添加更多配置如质量、格式等
    quality: 0.8,
    format: 'png'
  },
  
  // 是否启用 requestIdleCallback
  ENABLE_IDLE_CALLBACK: true,
  
  // 最大并发数
  MAX_CONCURRENT: 2 // 降低并发数
};

// 根据设备性能动态调整配置
export const getOptimizedConfig = () => {
  const config = { ...PERFORMANCE_CONFIG };
  
  // 检测设备性能
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4; // GB
  
  // 根据CPU核心数调整并发
  if (hardwareConcurrency >= 8) {
    config.HTML_BATCH_SIZE = 4;
    config.IMAGE_BATCH_SIZE = 2;
    config.MAX_CONCURRENT = 3;
    config.BATCH_DELAY = 100;
  } else if (hardwareConcurrency <= 2) {
    config.HTML_BATCH_SIZE = 2;
    config.IMAGE_BATCH_SIZE = 1;
    config.MAX_CONCURRENT = 1;
    config.BATCH_DELAY = 300;
  }
  
  // 根据内存调整批次大小
  if (memory <= 2) {
    config.HTML_BATCH_SIZE = Math.max(1, config.HTML_BATCH_SIZE - 1);
    config.IMAGE_BATCH_SIZE = 1;
  }
  
  // 移动设备优化
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    config.HTML_BATCH_SIZE = 2;
    config.IMAGE_BATCH_SIZE = 1;
    config.BATCH_DELAY = 100;
    config.IMAGE_CONFIG.scale = 0.8; // 降低图片质量
  }
  
  return config;
}; 