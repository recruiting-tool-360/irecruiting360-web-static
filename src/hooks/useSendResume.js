import { unref, computed, getCurrentInstance } from 'vue';
import { getResumeBlindList } from 'src/api/jobList/JobListApi';
import { useStore } from 'vuex';

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

  const getLatestChatId = computed(() => store.getters.getLatestChatId ?? '');

  /**
   * 发送简历信息到父页面
   * @param {Array|string} ids - 简历ID数组或单个ID
   * @param {Object} extraParams - 额外参数对象
   * @returns {Promise}
   */
  const sendResume = async (ids, extraParams = {}) => {
    const iframeMessenger = proxy?.$iframeMessenger;
    if (!iframeMessenger) {
      throw new Error('iframeMessenger 未初始化');
    }

    let resumeList = [];
    // 检查ids是否为空
    if (ids && (Array.isArray(ids) ? ids.length > 0 : true)) {
      try {
        const res = await getResumeBlindList(Array.isArray(ids) ? ids : [ids]);
        if (res && res.data) {
          resumeList = res.data;
        }
      } catch (e) {
        console.error('获取简历详情失败:', e);
        throw e;
      }
    }

    const payload = {
      resumes: resumeList,
      positionId: unref(getLatestChatId),
      ...extraParams
    };

    return iframeMessenger.post(messageType, payload);
  };

  return { sendResume };
}