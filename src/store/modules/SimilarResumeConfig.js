const SimilarResumeConfig = {
  state: {
    // 相似简历搜索冷却时间
    similarSearchCooldown: 0,
    // 定时器ID
    similarSearchTimer: null,
    // 可配置的倒计时时间（秒）
    cooldownDuration: 5,
    // 倒计时开始的时间戳
    cooldownStartTime: null,
    // 倒计时结束的时间戳
    cooldownEndTime: null
  },
  getters: {
    // 获取相似简历搜索冷却时间
    getSimilarSearchCooldown: state => state.similarSearchCooldown,
    // 检查是否在冷却中
    isSimilarSearchDisabled: state => {
      return state.similarSearchCooldown > 0;
    },
    // 获取按钮显示文本
    getSimilarSearchButtonText: state => {
      if (state.similarSearchCooldown > 0) {
        return `相似简历(${state.similarSearchCooldown}s)`;
      }
      return '相似简历';
    },
    // 获取倒计时时长配置
    getCooldownDuration: state => state.cooldownDuration
  },
  mutations: {
    // 设置冷却时间
    SET_SIMILAR_SEARCH_COOLDOWN(state, cooldown) {
      state.similarSearchCooldown = cooldown;
    },
    // 设置定时器ID
    SET_SIMILAR_SEARCH_TIMER(state, timerId) {
      // 清除之前的定时器
      if (state.similarSearchTimer) {
        clearInterval(state.similarSearchTimer);
      }
      state.similarSearchTimer = timerId;
    },
    // 减少冷却时间
    DECREASE_SIMILAR_SEARCH_COOLDOWN(state) {
      if (state.similarSearchCooldown > 0) {
        state.similarSearchCooldown--;
      }
    },
    // 清除定时器
    CLEAR_SIMILAR_SEARCH_TIMER(state) {
      if (state.similarSearchTimer) {
        clearInterval(state.similarSearchTimer);
        state.similarSearchTimer = null;
      }
    },
    // 设置倒计时时长
    SET_COOLDOWN_DURATION(state, duration) {
      state.cooldownDuration = duration;
    },
    // 设置倒计时开始时间
    SET_COOLDOWN_START_TIME(state, startTime) {
      state.cooldownStartTime = startTime;
    },
    // 设置倒计时结束时间
    SET_COOLDOWN_END_TIME(state, endTime) {
      state.cooldownEndTime = endTime;
    },
    // 清除倒计时时间戳
    CLEAR_COOLDOWN_TIMESTAMPS(state) {
      state.cooldownStartTime = null;
      state.cooldownEndTime = null;
    }
  },
  actions: {
    // 初始化倒计时状态（页面加载时调用）
    initializeCooldownState({ commit, state, dispatch }) {
      if (state.cooldownEndTime) {
        const now = Date.now();
        const remainingMs = state.cooldownEndTime - now;
        
        if (remainingMs > 0) {
          // 还在冷却期内，重新启动定时器
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          commit('SET_SIMILAR_SEARCH_COOLDOWN', remainingSeconds);
          dispatch('startCooldownTimer');
        } else {
          // 冷却期已过，清除状态
          dispatch('clearSimilarSearchCooldown');
        }
      }
    },
    // 启动倒计时定时器
    startCooldownTimer({ commit, state }) {
      const timerId = setInterval(() => {
        const now = Date.now();
        
        if (state.cooldownEndTime && now >= state.cooldownEndTime) {
          // 倒计时结束
          console.log('倒计时结束');
          commit('CLEAR_SIMILAR_SEARCH_TIMER');
          commit('SET_SIMILAR_SEARCH_COOLDOWN', 0);
          commit('CLEAR_COOLDOWN_TIMESTAMPS');
        } else {
          // 更新显示的倒计时
          const remainingMs = state.cooldownEndTime - now;
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          const newCooldown = Math.max(0, remainingSeconds);
          console.log('更新倒计时:', newCooldown);
          commit('SET_SIMILAR_SEARCH_COOLDOWN', newCooldown);
        }
      }, 1000);
      
      commit('SET_SIMILAR_SEARCH_TIMER', timerId);
    },
    // 启动相似简历搜索冷却倒计时
    startSimilarSearchCooldown({ commit, state, dispatch }) {
      // 如果正在冷却中，直接返回
      if (state.cooldownEndTime && Date.now() < state.cooldownEndTime) {
        console.log('已在冷却中，忽略请求');
        return;
      }

      // 使用自定义时间或默认配置时间
      const duration = state.cooldownDuration;
      const now = Date.now();
      const endTime = now + (duration * 1000);
      
      console.log('启动倒计时:', duration, '秒');
      
      commit('SET_SIMILAR_SEARCH_COOLDOWN', duration);
      commit('SET_COOLDOWN_START_TIME', now);
      commit('SET_COOLDOWN_END_TIME', endTime);
      
      // 启动定时器
      dispatch('startCooldownTimer');
    },
    // 设置倒计时时长
    setCooldownDuration({ commit }, duration) {
      commit('SET_COOLDOWN_DURATION', duration);
    },
    // 清除倒计时（可选，用于组件销毁时清理）
    clearSimilarSearchCooldown({ commit }) {
      commit('SET_SIMILAR_SEARCH_COOLDOWN', 0);
      commit('CLEAR_SIMILAR_SEARCH_TIMER');
      commit('CLEAR_COOLDOWN_TIMESTAMPS');
    }
  }
};

export default SimilarResumeConfig; 