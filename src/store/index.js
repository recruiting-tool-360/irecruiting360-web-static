import { createStore } from "vuex";
import TestConfig from "@/store/modules/TestConfig";
import createPersistedState from "vuex-persistedstate";

export default createStore({
  state: {},
  getters: {},
  mutations: {},
  actions: {},
  modules: {
    TestConfig,
  },
  plugins: [
    createPersistedState({
      key: "vuex", // 存储键名
      storage: window.localStorage,
      paths: ["TestConfig.testSwitch"], // 持久化 TestConfig 模块的 testSwitch 字段
    }),
  ],
});

