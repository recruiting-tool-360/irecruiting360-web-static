import { queryScoreList } from 'src/api/jobList/JobListApi';

/**
 * 分数自动更新器 - 定时查询简历评分并更新数据
 */
class ScoreAutoUpdater {
  constructor() {
    this.timer = null;
    this.interval = 8000; // 5秒查询一次
    this.maxRetries = 50; // 最大查询次数
    this.retryCount = 0;
    this.pendingResumeIds = new Set(); // 待查询的简历ID集合
    this.ignoredResumeIds = new Set(); // 超过最大查询次数后忽略的ID
    this.channelKey = ''; // 当前渠道
    this.searchId = ''; // 搜索ID
    this.updateCallback = null; // 数据更新回调
  }

  /**
   * 启动自动更新
   * @param {Array} resumeList 简历列表
   * @param {string} channelKey 渠道标识
   * @param {string} searchId 搜索ID
   * @param {Function} updateCallback 数据更新后的回调函数
   * @returns {boolean} 是否启动成功
   */
  start(resumeList, channelKey, searchId, updateCallback) {
    if (!resumeList || !channelKey || !searchId || !updateCallback) {
      console.error('缺少必要参数，无法启动分数自动更新', {
        resumeList: !!resumeList,
        channelKey,
        searchId,
        updateCallback: !!updateCallback
      });
      return false;
    }

    // 先清除定时器，但不清空数据
    this.clearTimer();

    // 重置状态计数器
    this.retryCount = 0;
    this.pendingResumeIds.clear();
    this.ignoredResumeIds.clear();

    // 设置参数
    this.channelKey = channelKey;
    this.searchId = searchId;
    this.updateCallback = updateCallback;

    console.log('准备收集需要查询分数的简历', resumeList.length);

    // 筛选出没有分数的简历ID
    this.collectResumesWithoutScore(resumeList);

    // 如果没有需要查询的ID，直接返回
    if (this.pendingResumeIds.size === 0) {
      console.log('所有简历都已有分数，无需启动自动更新');
      return false;
    }

    // 启动定时器
    this.startTimer();
    console.log(`已启动分数自动更新，待查询${this.pendingResumeIds.size}条简历`, Array.from(this.pendingResumeIds));
    return true;
  }

  /**
   * 仅清除定时器，不清空数据
   */
  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('已清除定时器');
    }
  }

  /**
   * 停止自动更新并清空所有数据
   */
  stop() {
    this.clearTimer();

    // 清空所有状态
    this.retryCount = 0;
    this.pendingResumeIds.clear();
    this.ignoredResumeIds.clear();

    // 清空参数
    this.channelKey = '';
    this.searchId = '';
    this.updateCallback = null;

    console.log('分数自动更新器已完全重置');
  }

  /**
   * 收集没有分数的简历ID
   * @param {Array} resumeList 简历列表
   */
  collectResumesWithoutScore(resumeList) {
    console.log('开始收集无分数简历ID，列表长度:', resumeList.length);

    // 添加遍历记录，记录每个简历的ID和分数状态
    let withScoreCount = 0;
    let withoutScoreCount = 0;

    resumeList.forEach(resume => {
      // 确保简历对象有效
      if (!resume || typeof resume !== 'object') {
        console.warn('无效的简历对象:', resume);
        return;
      }

      // 打印简历ID和分数，便于调试
      // console.log(`简历ID: ${resume.id}, 分数: ${resume.score}`);

      // 检查分数状态：
      // 1. 需要查询的情况：score为null/undefined或score小于0但不等于-2
      // 2. 不需要查询的情况：score为有效值(>=0)或score等于-2(表示无法获取渠道信息)
      if (resume.score === null || resume.score === undefined || 
         (typeof resume.score === 'number' && resume.score < 0 && resume.score !== -2)) {
        if (resume.id) {
          this.pendingResumeIds.add(resume.id);
          withoutScoreCount++;
          // console.log(`添加到待查询列表: ${resume.id}`);
        } else {
          console.warn('简历缺少ID:', resume);
        }
      } else {
        // score >= 0 或 score === -2 的情况，都视为已有有效分数
        withScoreCount++;
      }
    });

    console.log(`简历分析完成: 有分数=${withScoreCount}, 无分数=${withoutScoreCount}, 待查询IDs=${Array.from(this.pendingResumeIds)}`);
    return withoutScoreCount;
  }

  /**
   * 启动定时器
   */
  startTimer() {
    // 仅清除定时器，不清空数据
    this.clearTimer();

    // 检查是否有待查询的ID
    if (this.pendingResumeIds.size === 0) {
      console.log('没有需要查询的简历ID，不启动定时器');
      return;
    }

    console.log(`启动定时器前检查: 待查询ID数量=${this.pendingResumeIds.size}`);

    // 立即执行一次查询
    this.queryScores();

    // 设置定时器
    this.timer = setInterval(() => {
      this.queryScores();
    }, this.interval);

    console.log('定时器已启动');
  }

  /**
   * 查询分数
   */
  async queryScores() {
    // 检查是否有待查询ID
    if (this.pendingResumeIds.size === 0) {
      console.log('没有需要查询的简历ID，停止查询');
      this.clearTimer(); // 只清除定时器，不清空数据
      return;
    }

    this.retryCount++;

    // 如果超过最大重试次数，将不再查询未获取到分数的简历
    if (this.retryCount > this.maxRetries) {
      console.log(`已达到最大查询次数(${this.maxRetries})，停止查询`);
      this.clearTimer(); // 只清除定时器，不清空数据
      return;
    }

    try {
      // 转换Set为数组
      const ids = Array.from(this.pendingResumeIds);

      console.log(`正在进行第${this.retryCount}次查询，查询${ids.length}条简历分数`);
      console.log('查询参数:', {
        resumeBlindIds: ids,
        channel: this.channelKey,
        searchId: this.searchId
      });

      // 调用API获取评分
      const { data } = await queryScoreList({
        resumeBlindIds: ids,
        channel: this.channelKey,
        searchId: this.searchId
      });

      console.log('API返回结果:', data);

      // 处理返回的分数
      if (data && Array.isArray(data) && data.length > 0) {
        // 更新已获取到分数的简历
        const updatedIds = new Set();

        data.forEach(item => {
          // 处理API返回的每个分数数据
          // 只要有返回值(包括-2)都视为有效，从待查询列表中移除
          if (item.resumeBlindId && (item.score !== null && item.score !== undefined)) {
            updatedIds.add(item.resumeBlindId);
            console.log(`获取到分数: ID=${item.resumeBlindId}, 分数=${item.score}`);
          }
        });

        // 从待查询集合中移除已有分数的ID
        updatedIds.forEach(id => {
          this.pendingResumeIds.delete(id);
        });

        // 调用回调函数更新数据
        if (this.updateCallback && updatedIds.size > 0) {
          this.updateCallback(data);
        }

        console.log(`本次查询成功获取${updatedIds.size}条分数，还有${this.pendingResumeIds.size}条待查询`);

        // 如果所有ID都已获取分数，停止定时器
        if (this.pendingResumeIds.size === 0) {
          console.log('所有简历都已获取到分数或确认无法获取渠道信息，停止查询');
          this.clearTimer(); // 只清除定时器，不清空数据
        }
      } else {
        console.log('本次查询未获取到新分数');
      }
    } catch (error) {
      console.error('查询分数时出错:', error);
    }
  }

  /**
   * 当新简历加入时，更新查询列表
   * @param {Array} newResumeList 新的简历列表
   */
  updateResumeList(newResumeList) {
    if (!newResumeList || !Array.isArray(newResumeList)) {
      console.warn('无效的简历列表传入updateResumeList:', newResumeList);
      return;
    }

    console.log(`更新简历列表: 新列表长度=${newResumeList.length}, 当前待查询=${this.pendingResumeIds.size}`);

    // 收集新的无分数简历ID
    const newIdsCount = this.collectResumesWithoutScore(newResumeList);

    // 如果定时器已停止且有新的简历需要查询，则重新启动
    if (!this.timer && this.pendingResumeIds.size > 0) {
      console.log(`发现${this.pendingResumeIds.size}条新简历需要查询分数，重新启动查询`);
      this.startTimer();
    } else {
      console.log(`当前定时器状态: ${this.timer ? '运行中' : '已停止'}, 待查询简历数: ${this.pendingResumeIds.size}`);
    }
  }
}

// 创建单例
const scoreUpdater = new ScoreAutoUpdater();

export default scoreUpdater;
