export default {
  state: () => ({
    isSingleSignOn: false, // 是否单点登录
    sourceKey: '', // 来源key
  }),
  mutations: {
    changeAppStatus(state, payload) {
      state.isSingleSignOn = payload.isSingleSignOn;
      state.sourceKey = payload.sourceKey;
    },
  },
  actions: {},
  getters: {
    getIsSingleSignOn(state) {
      return state.isSingleSignOn;
    },
    getSourceKey(state) {
      return state.sourceKey;
    },
  },
};
