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
   *
   * 同时更新两个数据源：
   *   1) ChannelConfig.ALL.data —— 搜索通道的 ResumeCard 渲染依据
   *   2) BossRecommendData.byJobId[*].geekList —— 推荐通道的 ResumeCard 渲染依据
   *
   * 之前只更新 ALL.data，推荐通道点"加入人才库"成功后按钮不变成"已加入人才库"
   * （因为推荐 geek 在 BossRecommendData 里，跟 ALL.data 是两个数据源）。
   * 这里两边都 patch 保证两个 tab 的 UI 都同步。
   */
  const update = (resumeInfoArray) => {
    if(!Array.isArray(resumeInfoArray) || resumeInfoArray.length <= 0) {
      return false;
    }

    // 创建一个映射表，方便快速查找（key 是 resumeBlindId）
    const resumeInfoMap = resumeInfoArray.reduce((map, item) => {
      map[item.id] = {
        id: item.id,
        type: item.type,
        status: item.status,
        errorMsg: item.errorMsg
      };
      return map;
    }, {});

    // (1) 更新 ChannelConfig.ALL.data（搜索通道）
    const data = allResume.value.data.map(item => {
      if (resumeInfoMap[item?.id]) {
        return {
          ...item,
          resumeThirdPartyInfo: resumeInfoMap[item.id]
        };
      }
      return item;
    });
    store.commit('changeChannelConfData', {key: 'ALL', value: data});

    // (2) 同时更新 BossRecommendData.byJobId[*].geekList（推荐通道）
    // 按 resumeBlindId 反查每个 bucket 里的 geek，找到就 patch resumeThirdPartyInfo
    const byJobId = store.state?.BossRecommendData?.byJobId || {};
    for (const jobId of Object.keys(byJobId)) {
      const bucket = byJobId[jobId];
      const geekList = Array.isArray(bucket?.geekList) ? bucket.geekList : [];
      for (const g of geekList) {
        const blindId = g?.resumeBlindId;
        if (!blindId) continue;
        const info = resumeInfoMap[String(blindId)] || resumeInfoMap[blindId];
        if (info) {
          store.commit('patchBossRecommendGeek', {
            jobId,
            resumeBlindId: String(blindId),
            patch: { resumeThirdPartyInfo: info }
          });
        }
      }
    }

    return true;
  };

  return { update };
}