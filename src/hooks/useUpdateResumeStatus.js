import { computed } from 'vue';
import { useStore } from 'vuex';

/**
 * 批量更新简历三方状态
 * @param {string} key 修改的key 默认-resumeThirdPartyStatus
 * @returns {Function} sendResume
 */
export function useUpdateResumeStatus(key = "resumeThirdPartyStatus") {
  
  const store = useStore();

  const allResume = computed(() => store.getters?.getChannelConfByChannel("ALL"));
 
  /**
   * 更新状态
   * @param {*} resumeIds 简历ids
   * @param {*} status 状态
   */
  const update = (resumeIds, status = 'success') => {
    if(resumeIds.length <= 0) {
      return false;
    }
    const data = allResume.value.data.map(item => {
      if(resumeIds.includes(item?.id)) {
        return {
          ...item,
          [key]: status
        };
      }
      return item;
    })
    store.commit('changeChannelConfData', {key: 'ALL', value: data});
  };

  return { update };
}