import { createStore } from "vuex";
import TestConfig from "src/store/modules/TestConfig";
import PluginConfig from "src/store/modules/PluginConfig";
import ChatConfig from "src/store/modules/ChatConfig";
import AiSerachConfig from "src/store/modules/AiSerachConfig";
import ChannelConfig from "src/store/modules/ChannelConfig";
import UserConfig from "src/store/modules/UserConfig";
import createPersistedState from "vuex-persistedstate";
import chatList from './modules/chatList'

// 创建一个store实例
const store = createStore({
  state: {},
  getters: {},
  mutations: {},
  actions: {},
  modules: {
    TestConfig,PluginConfig,ChatConfig,AiSerachConfig,ChannelConfig,UserConfig,chatList
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
        "UserConfig.userInfo",
        "UserConfig.userColor",
        "UserConfig.userChannelConfig",
      ],
    })
  ],
});

// 作为默认导出
export default store;



