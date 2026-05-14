import { createStore } from "vuex";
import TestConfig from "src/store/modules/TestConfig";
import PluginConfig from "src/store/modules/PluginConfig";
import ChatConfig from "src/store/modules/ChatConfig";
import AiSerachConfig from "src/store/modules/AiSerachConfig";
import ChannelConfig from "src/store/modules/ChannelConfig";
import UserConfig from "src/store/modules/UserConfig";
import SimilarResumeConfig from "src/store/modules/SimilarResumeConfig";
import BossData from "src/store/modules/BossData";
import PinnedJobs from "src/store/modules/PinnedJobs";
import createPersistedState from "vuex-persistedstate";
import chatList from './modules/chatList'

// 创建一个store实例
const store = createStore({
  state: {},
  getters: {},
  mutations: {},
  actions: {},
  modules: {
    TestConfig,PluginConfig,ChatConfig,AiSerachConfig,ChannelConfig,UserConfig,chatList,SimilarResumeConfig,BossData,PinnedJobs
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
        "SimilarResumeConfig.cooldownStartTime",
        "SimilarResumeConfig.cooldownEndTime",
        // BOSS 我的职位列表（隐藏窗口静默抓取）：跨会话保留，避免每次进主页都等
        "BossData.jobList",
        "BossData.totalSize",
        "BossData.lastFetchedAt",
        // 左侧职位列表的置顶状态（参考 ihraisaas JobList.isPinned）
        "PinnedJobs.pinnedJobIds",
      ],
    })
  ],
});

// 作为默认导出
export default store;



