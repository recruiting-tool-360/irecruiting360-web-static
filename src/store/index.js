import { createStore } from "vuex";
import TestConfig from "@/store/modules/TestConfig";
import PluginConfig from "@/store/modules/PluginConfig";
import ChatConfig from "@/store/modules/ChatConfig";
import AiSerachConfig from "@/store/modules/AiSerachConfig";
import ChannelConfig from "@/store/modules/ChannelConfig";
import createPersistedState from "vuex-persistedstate";

export default createStore({
  state: {},
  getters: {},
  mutations: {},
  actions: {},
  modules: {
    TestConfig,PluginConfig,ChatConfig,AiSerachConfig,ChannelConfig
  },
  plugins: [
    createPersistedState({
      key: "vuex", // 存储键名
      storage: window.localStorage,
      paths: [
        "TestConfig.testSwitch",
        "PluginConfig.pluginSwitch",
        "ChatConfig.localUserChatId",
        "ChatConfig.searchConditionId",
        "ChatConfig.chatMsg",
      ],
    })
  ],
});

