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
// ViewingResults：查看历史 task 结果时按 taskId 隔离的渲染 store，
// 跟 runtime ChannelConfig 完全解耦（详见模块顶部注释）
import ViewingResults from "src/store/modules/ViewingResults";
import createPersistedState from "vuex-persistedstate";
import chatList from './modules/chatList'

// 创建一个store实例
const store = createStore({
  state: {},
  getters: {},
  mutations: {},
  actions: {},
  modules: {
    TestConfig,PluginConfig,ChatConfig,AiSerachConfig,ChannelConfig,UserConfig,chatList,SimilarResumeConfig,BossData,BossRecommendData,PinnedJobs,SearchTasks,ViewingResults
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
        // 上次成功 SSO 登录的 ssoConfig.userConfig 序列化字符串：
        // 客户端运行中收到 deep link 时判断 incoming 用户是否跟当前登录用户一致，
        // 一致则静默刷新职位，不一致则整页重走 /sso-login。详见 UserConfig.js 注释。
        "UserConfig.lastSsoUserKey",
        // 用户上次在 AIProfileActionPanel 勾选的"搜索/推荐"模块状态：跨会话保留，
        // 避免每次新 AI 卡片都强制回到默认 { search:true, recommend:true } —— 用户可能
        // 习惯只勾搜索 / 只勾推荐，记住偏好下次自动应用。详见 AiSerachConfig.js state 注释。
        "AiSerachConfig.lastSelectedModules",
        // 每个职位（chatId）上次填写的"简历份数"：跨会话保留，下次新 AI 卡片默认上次值。
        "AiSerachConfig.lastResumeCountByChatId",
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
        // ⚠️ SearchTasks 完全不持久化（2026-05-25 改）：
        //   旧版持久化 tasksById / chatTaskIdx 让刷新 / 重启后 LeftMenu badge 立刻有状态，
        //   但是会出现"后端 queue 已经空了，本地 tasksById 还残留一个 WAITING/RUNNING task →
        //   LeftMenu 一直显示排队中"的 stale 状态。
        //   后端 task 状态变了（任务被别的 client 接管 / 后端清理 / 出 STOPPED）前端拿不到通知。
        //   改成不持久化：启动时通过 cleanupOrphanRunningAndResume（含 fetchTaskQueue +
        //   resumeFromCurrent）+ currentTaskPoller 拉真实状态，跟后端永远一致。
        //   trade-off：启动时 LeftMenu 会有短暂空白（几百 ms），等接口回来后填充。
      ],
    })
  ],
});

// 作为默认导出
export default store;



