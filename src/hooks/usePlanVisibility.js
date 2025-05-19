/**
 *  const { isHidden } = usePlanVisibility({
 *    hiddenForPlans: ['companyA', 'companyB']
 *  });
 *  
 *  或者，只对特定企业显示  
 *  const { isHidden } = usePlanVisibility({
 *    visibleForPlans: ['companyC', 'companyD'],
 *    defaultVisible: false  // 其他企业默认隐藏
 *  });
 * 
 *  混合使用，更精细控制
 *  const { isHidden, isVisible, currentPlan } = usePlanVisibility({
 *    hiddenForPlans: ['companyA', 'companyB'],   // 这些企业必定隐藏
 *    visibleForPlans: ['companyC', 'companyD'],  // 这些企业显示（除非在 hiddenForPlans 中）
 *    defaultVisible: true                        // 其他企业或无匹配企业默认显示
 *  });
 * 
 *  你也可以获取当前 plan 进行其他逻辑
 *  console.log(`当前企业类型: ${currentPlan.value}`);
 */

import { computed } from 'vue';
import { useStore } from 'vuex';

/**
 * 根据企业 plan 配置决定是否隐藏  
 * @param {Object} options - 配置选项（可选）
 * @param {Array} options.hiddenForPlans - 需要隐藏的 plan 值数组 
 * @param {Array} options.visibleForPlans - 需要显示的 plan 值数组（优先级低于 hiddenForPlans）
 * @param {Boolean} options.defaultVisible - 当无法获取 plan 或 plan 不在配置中时的默认可见性，默认为 true
 * @returns {Object} { 
 *  isHidden, 为 true 表示应该隐藏
 *  isVisible, 为 true 表示应该显示 
 *  currentPlan 当前企业的 plan
 *  }
 */
export function usePlanVisibility(options = {}) {
  const store = useStore();
  
  // 默认配置
  const config = {
    hiddenForPlans: [], // 需要隐藏
    visibleForPlans: [], // 需要显示
    defaultVisible: true, // 默认可见性
    ...options
  };
  
  // 获取当前企业 plan
  const currentPlan = computed(() => {
    return store.getters.getUserInfo?.extendData?.plan || null;
  });
  
  // 是否隐藏  
  const isHidden = computed(() => {
    const plan = currentPlan.value;
    
    // 无法获取 plan 时使用默认值
    if (!plan) return !config.defaultVisible;
    
    // 优先检查是否在"隐藏"列表中
    if (config.hiddenForPlans.includes(plan)) {
      return true;
    }
    
    // 再检查是否在"显示"列表中
    if (config.visibleForPlans.length > 0) {
      return !config.visibleForPlans.includes(plan);
    }
    
    // 如果两个列表都没找到匹配，使用默认值
    return !config.defaultVisible;
  });
  
  // 方便模板使用的反向值
  const isVisible = computed(() => !isHidden.value);
  
  return {
    isHidden,
    isVisible,
    currentPlan
  };
}


//是否显示
export const isVisibleThirdA = ()=>{
  const store = useStore();
  const planList = ['PlanA'];
  // 获取当前企业 plan
  const currentPlan = computed(() => {
    return store.getters.getUserInfo?.extendData?.plan || '';
  });
  console.log('currentPlan',currentPlan.value)
  return planList.includes(currentPlan.value);
}


// 是否来自于菜单的开关
export const isFromMenu = () => {
  // 也可以从用户信息中获取来源
  const store = useStore();
  const userInfo = computed(() => store.getters.getUserInfo || {});
  return computed(() => userInfo.value?.extendData?.from === 'recruit-assistant');
}

// 是否来自于候选人列表的开关
export const isFromCandidateList = () => {
  // 也可以从用户信息中获取来源
  const store = useStore();
  const userInfo = computed(() => store.getters.getUserInfo || {});
  return computed(() => userInfo.value?.extendData?.from === 'recruit-workflow');
}


