import { createStore } from "vuex";
import TestConfig from "src/store/modules/TestConfig";
import PluginConfig from "src/store/modules/PluginConfig";
import ChatConfig from "src/store/modules/ChatConfig";
import AiSerachConfig from "src/store/modules/AiSerachConfig";
import ChannelConfig from "src/store/modules/ChannelConfig";
import UserConfig from "src/store/modules/UserConfig";
import SimilarResumeConfig from "src/store/modules/SimilarResumeConfig";
import BossData from "src/store/modules/BossData";
import BossRecommendData from "src/store/modules/BossRecommendData";
import PinnedJobs from "src/store/modules/PinnedJobs";
import SearchTasks from "src/store/modules/SearchTasks";
import createPersistedState from "vuex-persistedstate";
import chatList from './modules/chatList'

// 创建一个store实例
const store = createStore({
  state: {},
  getters: {},
  mutations: {},
  actions: {},
  modules: {
    TestConfig,PluginConfig,ChatConfig,AiSerachConfig,ChannelConfig,UserConfig,chatList,SimilarResumeConfig,BossData,BossRecommendData,PinnedJobs,SearchTasks
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
        /*
          客户端模式下记住"用户主动选中的职位"，刷新 / 重启后自动恢复。
          仅持久化 chosenJobId（UI 状态），不持久化 latestChatId（业务态由业务流程自己管）。
          复现"请先从左侧列表选择一个职位"空状态：localStorage 清掉 vuex.chatList.chosenJobId 即可。
        */
        "chatList.chosenJobId",
        // 职位 JD 缓存（按 positionId 索引）：父页 SSO 推过来 / 客户端拉详情 现算 后回写。
        // 跨会话保留，避免刷新后丢失导致"选中职位自动发送 JD"失效。下次 SSO 进来会全量覆盖更新。
        "chatList.positionJdCache",
        "UserConfig.userInfo",
        "UserConfig.userColor",
        "UserConfig.userChannelConfig",
        "SimilarResumeConfig.cooldownStartTime",
        "SimilarResumeConfig.cooldownEndTime",
        // BOSS 我的职位列表（隐藏窗口静默抓取）：跨会话保留，避免每次进主页都等
        "BossData.jobList",
        "BossData.totalSize",
        "BossData.lastFetchedAt",
        // BOSS 推荐牛人列表（按 encryptJobId 分桶）：跨会话保留，进推荐 tab 立刻有数据
        "BossRecommendData.byJobId",
        "BossRecommendData.currentJobId",
        // 左侧职位列表的置顶状态（参考 ihraisaas JobList.isPinned）
        "PinnedJobs.pinnedJobIds",
        // 任务化搜索（按 chatId / taskId 分桶）：跨会话保留，刷新 / 重启后职位 badge 状态 +
        // 已采集的搜索结果都能立即恢复。runtime 字段（queue / runningTaskId / activeSseContext）
        // **不持久化**，启动时会通过 SearchTasks/resumeFromCurrent 重新拉服务端真实状态。
        "SearchTasks.tasksById",
        "SearchTasks.chatTaskIdx",
      ],
    })
  ],
});

// 作为默认导出
export default store;



