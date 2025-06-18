import { unref, computed, getCurrentInstance } from 'vue';
import { useStore } from 'vuex';
import { mergeBase64ToFile } from 'src/pluginSrc/channels/ImageChannel';
import { formatName, bossDomGenerator } from 'src/hooks/bossDomGenerator';
import { enableImageCapture } from 'src/pluginSrc/channels/ImageChannel';
import {getChannelUrl} from "src/pluginSrc/util/ChannelUrlUtil";
import { zhiLianFindJobDetail } from 'src/pluginSrc/channels/ZhiLianJobInfoManager.js';

/**
 * 用于发送简历信息到父页面的 hook
 * @param {string} messageType - 要发送的消息类型
 * @returns {Function} sendResume
 */
export function useSendResume(messageType = 'resumeList') {
  if (typeof messageType !== 'string') {
    throw new Error('messageType 必须为字符串类型');
  }
  const { proxy } = getCurrentInstance();

  // 解构修复后的函数
  const { resumeGenerateBase64s } = bossDomGenerator();

  const store = useStore();

  const getLatestPositionId = computed(() => store.getters.getLatestPositionId ?? '');

  const channelsEnum = {
    "boss直聘": "BOSS直聘",
    "猎聘": "猎聘",
    "前程无忧": "前程无忧",
    "智联招聘": "智联招聘",
  }
  
  /**
   * 发送简历信息到父页面
   * @param {Array|string} ids - 简历ID数组或单个ID
   * @param {Object} extraParams - 额外参数对象
   * @returns {Promise}
   */
  const sendResume = async (res, extraParams = {}) => {
    const iframeMessenger = proxy?.$iframeMessenger;
    if (!iframeMessenger) {
      throw new Error('iframeMessenger 未初始化');
    }
    console.log(res, "result-1");
    
    let results = [];
    if(Object.entries(res).length > 0) {
      // 遍历 res 对象
      for (const [id, obj] of Object.entries(res)) {
        const { base64, channel, name, gender, ...args } = obj
        // console.log(base64, 'base64');
        
        // 解析字符串为数组
        const base64Array = Array.isArray(base64) ? base64 : JSON.parse(base64);
        console.log(base64Array, 'base64Array');
        
        const fileName = `${channel}-${formatName({ name, gender })}.png`;
        console.log(fileName, 'fileName');
      
        // 调用合并函数
        const file = await mergeBase64ToFile(
          base64Array,
          fileName
        );

        results.push({
          id,
          file,
          channel: channelsEnum[channel],
          ...args,
          // type: "similar" // 测试使用 使所选简历配型变为相似简历
        });
      }
    }

    const payload = {
      positionId: unref(getLatestPositionId),
      resumeFile: results,
      ...extraParams
    };

    return iframeMessenger.post(messageType, payload);
  };


  /**
   * 处理简历，主要功能是过滤出boss渠道和其他渠道。
   * boss渠道本地生成简历，其他渠道插件获取简历（智联做特殊处理。查看当前是否有查看简历次数）
   * @param {*} allResume 
   * @param {*} isSingle 是否是单个导入查询相似简历
   */
  const handleResume = async (allResume, isSingle) => {
    const params = await Promise.all(allResume.map(async (resume) => {
      const url = getChannelUrl(resume);
      const { id, name, channel, type, gender, originalResumeUrlInfo } = resume;
      return { url, id, channel, type, name, gender, originalResumeUrlInfo };
    }));

    console.log(params, 'params');

    let zlCount = 0;
    // 分离boss直聘和其他渠道的数据
    const bossParams = params.filter(param => param.channel === 'boss直聘');
    console.log(bossParams, 'bossParams');

    // 先处理所有参数
    const paramPromises = params.map(async (param) => {
      if (param.channel === '智联招聘') {
        const result = await zhiLianFindJobDetail(param);
        if(!result) {
          zlCount ++;
        }
        console.log(result, '判断智联招聘是否能查看简历', !!result);
        return { param, isValid: !!result };
      } else if (param.channel !== 'boss直聘') {
        return { param, isValid: true };
      }
      return { param, isValid: false };
    });

    console.log(paramPromises, 'paramPromises');


    // 等待所有 Promise 完成并过滤
    const results = await Promise.all(paramPromises);
    const otherParams = results
      .filter(({ isValid }) => isValid)
      .map(({ param }) => param);
    
    console.log(results, 'results');
      
    
    // 并行执行两个异步操作，避免阻塞
    const [otherRes, bossRes] = await Promise.all([
      otherParams?.length > 0 ? enableImageCapture(otherParams).catch(error => {
        console.error('enableImageCapture 失败:', error);
        return {}; // 返回默认值
      }) : Promise.resolve({}),
      bossParams?.length > 0 ? resumeGenerateBase64s(bossParams, isSingle).catch(error => {
        console.error('enableImageCapture 失败:', error);
        return {}; // 返回默认值
      }) : Promise.resolve({})
    ]);
    console.log(bossRes, otherRes, '结果');
    
    return {
      data: Object.assign(bossRes, otherRes),
      filterZhiLianCount: zlCount
    }
  }

  return { sendResume, handleResume };
}