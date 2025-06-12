import { unref, computed, getCurrentInstance } from 'vue';
import { useStore } from 'vuex';
import { mergeBase64ToFile } from 'src/pluginSrc/channels/ImageChannel';
import { formatName } from 'src/hooks/bossDomGenerator';
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
        // 解析字符串为数组
        const base64Array = Array.isArray(base64) ? base64 : JSON.parse(base64);
        
        const fileName = `${channel}-${formatName({ name, gender })}.png`;
      
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

  return { sendResume };
}