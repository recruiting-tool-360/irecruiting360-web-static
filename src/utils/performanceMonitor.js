// 性能监控工具
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  // 开始计时
  start(key) {
    this.startTimes.set(key, performance.now());
  }

  // 结束计时并记录
  end(key, metadata = {}) {
    const startTime = this.startTimes.get(key);
    if (startTime) {
      const duration = performance.now() - startTime;
      const metric = {
        duration,
        timestamp: Date.now(),
        ...metadata
      };
      
      if (!this.metrics.has(key)) {
        this.metrics.set(key, []);
      }
      this.metrics.get(key).push(metric);
      
      this.startTimes.delete(key);
      
      // 实时打印当前操作耗时
      this.logCurrentOperation(key, duration, metadata);
      
      return duration;
    }
    return null;
  }

  // 打印当前操作耗时
  logCurrentOperation(key, duration, metadata = {}) {
    const formattedDuration = duration.toFixed(2);
    const timestamp = new Date().toLocaleTimeString();
    
    // 根据耗时长短选择不同的颜色和图标
    let icon, color;
    if (duration < 100) {
      icon = '⚡'; // 快速
      color = '#4CAF50'; // 绿色
    } else if (duration < 500) {
      icon = '⏱️'; // 正常
      color = '#FF9800'; // 橙色
    } else {
      icon = '🐌'; // 慢速
      color = '#F44336'; // 红色
    }
    
    // 构建额外信息字符串
    const extraInfo = Object.entries(metadata)
      .filter(([k, v]) => k !== 'success' && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    
    const extraInfoStr = extraInfo ? ` (${extraInfo})` : '';
    
    console.log(
      `%c${icon} [${timestamp}] ${key}: ${formattedDuration}ms${extraInfoStr}`,
      `color: ${color}; font-weight: bold;`
    );
    
    // 如果耗时过长，给出警告
    if (duration > 1000) {
      console.warn(`⚠️ 操作 "${key}" 耗时较长 (${formattedDuration}ms)，建议检查性能配置`);
    }
  }

  // 获取指标统计
  getStats(key) {
    const metrics = this.metrics.get(key) || [];
    if (metrics.length === 0) return null;

    const durations = metrics.map(m => m.duration);
    const total = durations.reduce((sum, d) => sum + d, 0);
    
    return {
      count: metrics.length,
      total,
      average: total / metrics.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      latest: metrics[metrics.length - 1]
    };
  }

  // 清除指标
  clear(key) {
    if (key) {
      this.metrics.delete(key);
      this.startTimes.delete(key);
    } else {
      this.metrics.clear();
      this.startTimes.clear();
    }
  }

  // 获取所有指标
  getAllStats() {
    const stats = {};
    for (const [key] of this.metrics) {
      stats[key] = this.getStats(key);
    }
    return stats;
  }

  // 获取当前会话总耗时
  getTotalTime() {
    const stats = this.getAllStats();
    return Object.values(stats).reduce((sum, stat) => sum + (stat?.total || 0), 0);
  }

  // 获取当前会话总操作次数
  getTotalOperations() {
    const stats = this.getAllStats();
    return Object.values(stats).reduce((sum, stat) => sum + (stat?.count || 0), 0);
  }

  // 打印简要总结
  printSummary() {
    const totalTime = this.getTotalTime();
    const totalOperations = this.getTotalOperations();
    const avgTime = totalOperations > 0 ? totalTime / totalOperations : 0;
    
    console.log(`%c📊 当前会话总计: ${totalOperations}次操作, 总耗时${totalTime.toFixed(2)}ms, 平均${avgTime.toFixed(2)}ms/次`, 
      'color: #2196F3; font-weight: bold; font-size: 14px;');
  }

  // 输出性能报告
  report() {
    const stats = this.getAllStats();
    const totalOperations = Object.values(stats).reduce((sum, stat) => sum + (stat?.count || 0), 0);
    const totalTime = Object.values(stats).reduce((sum, stat) => sum + (stat?.total || 0), 0);
    
    console.group('🚀 性能监控总报告');
    console.log(`📊 总操作次数: ${totalOperations}`);
    console.log(`⏱️ 总耗时: ${totalTime.toFixed(2)}ms`);
    console.log(`⚡ 平均每次操作: ${totalOperations > 0 ? (totalTime / totalOperations).toFixed(2) : 0}ms`);
    console.log('─'.repeat(50));
    
    Object.entries(stats).forEach(([key, stat]) => {
      if (stat) {
        // 计算性能等级
        let performanceLevel = '优秀';
        let levelIcon = '🟢';
        if (stat.average > 500) {
          performanceLevel = '需优化';
          levelIcon = '🔴';
        } else if (stat.average > 200) {
          performanceLevel = '一般';
          levelIcon = '🟡';
        }
        
        console.group(`${levelIcon} ${key} (${performanceLevel})`);
        console.log(`执行次数: ${stat.count}`);
        console.log(`总耗时: ${stat.total.toFixed(2)}ms`);
        console.log(`平均耗时: ${stat.average.toFixed(2)}ms`);
        console.log(`最快: ${stat.min.toFixed(2)}ms`);
        console.log(`最慢: ${stat.max.toFixed(2)}ms`);
        
        // 显示最新一次的额外信息
        if (stat.latest && Object.keys(stat.latest).length > 1) {
          const extraInfo = Object.entries(stat.latest)
            .filter(([k, v]) => k !== 'duration' && k !== 'timestamp' && v !== undefined)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          if (extraInfo) {
            console.log(`最新操作信息: ${extraInfo}`);
          }
        }
        console.groupEnd();
      }
    });
    
    console.groupEnd();
    
    // 如果有性能问题，给出建议
    const slowOperations = Object.entries(stats).filter(([key, stat]) => stat && stat.average > 500);
    if (slowOperations.length > 0) {
      console.group('💡 性能优化建议');
      slowOperations.forEach(([key, stat]) => {
        console.log(`🔧 ${key}: 平均耗时${stat.average.toFixed(2)}ms，建议检查配置或优化算法`);
      });
      console.groupEnd();
    }
  }
}

// 全局实例
export const performanceMonitor = new PerformanceMonitor();

// 装饰器函数，用于自动监控函数执行时间
export function monitor(key) {
  return function(target, propertyName, descriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args) {
      performanceMonitor.start(key);
      try {
        const result = await method.apply(this, args);
        performanceMonitor.end(key, { success: true });
        return result;
      } catch (error) {
        performanceMonitor.end(key, { success: false, error: error.message });
        throw error;
      }
    };
    
    return descriptor;
  };
} 