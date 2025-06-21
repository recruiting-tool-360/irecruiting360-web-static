import { computed } from 'vue';
import { useStore } from 'vuex';

/**
 * 批量更新简历三方状态 - 添加resumeThirdPartyInfo信息
 * @returns {Function} update - 更新函数
 */
export function useUpdateResumeStatus() {
  
  const store = useStore();

  const allResume = computed(() => store.getters?.getChannelConfByChannel("ALL"));
 
  /**
   * 更新状态 - 添加resumeThirdPartyInfo信息
   * @param {Array} resumeInfoArray 包含 {id, type, status, errorMsg} 的数组
   */
  const update = (resumeInfoArray) => {
    if(!Array.isArray(resumeInfoArray) || resumeInfoArray.length <= 0) {
      return false;
    }

    // 创建一个映射表，方便快速查找
    const resumeInfoMap = resumeInfoArray.reduce((map, item) => {
      map[item.id] = {
        id: item.id,
        type: item.type,
        status: item.status,
        errorMsg: item.errorMsg
      };
      return map;
    }, {});

    // 更新allResume数据
    const data = allResume.value.data.map(item => {
      // 如果当前简历的id在要更新的数组中
      if (resumeInfoMap[item?.id]) {
        return {
          ...item,
          resumeThirdPartyInfo: resumeInfoMap[item.id]
        };
      }
      return item;
    });

    // 提交到store
    store.commit('changeChannelConfData', {key: 'ALL', value: data});
    return true;
  };

  return { update };
}