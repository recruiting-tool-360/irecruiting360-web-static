import {getScoreList} from "src/api/jobList/JobListApi";
import {createSearchState} from "src/pjo/dto/request/SearchStateConfig";


export default {
    state: () => ({
        leftLoadingSwitch:false,
        searchConditionChannelRequestData:null,
        allChannelCount: 0,
        bossChannelCount: 0,
        scoreList:[],
        jobALlData:[],
        searchConditionList:[],
        channelData:{
            ALL:[],
            BOSS:[],
            ZHILIAN:[],
            LIEPIN:[],
            JOB51:[],
            Collect:[]
        },
        searchStateConfig:createSearchState(),
        unreadCheckBoxV:false,
        aiSearchRef:null,
      jobSearchFilterRef:null,
      chatCardRef:null,
      /**
       * 聚合搜索执行器（一个 async 函数）—— 由 IndexPage 在 onMounted 时 commit。
       *
       * 签名：(opts: { chatId, selectedModules?, matchedBossJobId?, resumeCount? }) => Promise<void>
       *
       * 用途：让 SearchTasks store 的 actionRunner 收到后端 STEP_COMMAND 时，
       *      能"代用户"启动一次真实的聚合搜索流程（refreshSearchCondition + executeSearch + 可选推荐）。
       *      跑完返回 resolved promise，actionRunner 用这个信号 postCommandResult({status:'SUCCESS'})。
       */
      aggregateSearchExecutor: null,
      /**
       * 防重入 flag：聚合搜索任务正在跑时为 true（不论用户手动触发还是 SSE 触发）。
       * Phase A：actionRunner 看到 true 时跳过本次任务（SUCCESS but skipped），避免双触发。
       */
      aggregateSearchInFlight: false,
      /**
       * AI 评分 + AI 任务队列状态（合起来代表"整个 AI 分析阶段还在跑"）
       *
       * 两路独立信号：
       *   - aiScoringActive / aiScoringPending：scoreAutoUpdater 推送的"评分轮询"状态
       *   - aiTaskQueueActive / aiTaskQueuePending：AsyncTaskQueueManager 推送的"详情解析等
       *     后台 AI 任务队列"状态（即"AI 任务状态监视器"看到的那个）
       *
       * 合并 getter getAiAnalyzingActive = aiScoringActive || aiTaskQueueActive
       * 给 TaskStatusCard / canCreateForChat / getJobAggregateStatus 用：
       *   - 任意一路在跑 → 视为"AI 分析进行中"
       *   - 两路都歇了 → 视为"AI 分析完成"
       *
       * 之前只看 scoreAutoUpdater 漏了 saveResumeDetailPlus 等任务队列阶段。
       */
      aiScoringActive: false,
      aiScoringPending: 0,
      aiTaskQueueActive: false,
      aiTaskQueuePending: 0,
      /**
       * 当前正在跑 AI 评分/任务队列的"绑定 chatId"——解决全局 active 信号跨 chat 串扰：
       *
       * 旧版（仅有 active 布尔）：用户在 chat A 跑完搜索 → AI 评分中 → 切到 chat B →
       *   AI 还在为 A 跑，但 LeftMenu 看到全局 active=true，会把 chat B（如果其 latest task
       *   也是 COMPLETED）也判定为"进行中"，出现"两个职位同时进行中"假象。
       *
       * 新版：scoreAutoUpdater.start() / AsyncTaskQueueManager 在把 active 推 true 时**快照**
       *   当时的 latestChatId（= 这一路 AI 真正服务的 chat）。getAiAnalyzingChatId 返回
       *   两路里任意一路 active 的 chatId。isAiAnalyzingForChat(chatId) 据此判断"AI 是不是
       *   正在为本 chat 跑"，不再依赖动态变化的 latestChatId。
       *
       * null 表示该路 AI 当前没在跑。
       */
      aiScoringChatId: null,
      aiTaskQueueChatId: null,
      searchCount:0,
      showQueueMonitor: false,
      showFilterPanel: false,
      /**
       * 全局"职位列表静默刷新"信号 —— 自增整数。
       *
       * 谁会写：客户端运行中收到同用户 deep link（MainLayout 全局 deep link handler）
       *         调 store.commit('triggerChatListRefresh') 把它 +1，让 LeftMenu watch 触发
       *         loadChatList，不需要主进程 navigate / SPA 路由跳转，UI 无感刷新职位列表。
       *
       * 谁会读：LeftMenu watch(getChatListRefreshSignal) 触发 loadChatList()
       *
       * 不持久化（仅运行态信号）。
       */
      chatListRefreshSignal: 0,
      /**
       * 用户上次在 AIProfileActionPanel 勾选的"搜索/推荐"模块状态。
       *
       * 用途：每次新的 AIProfileActionPanel 实例化（用户选了新的职位、收到新的 AI 卡片）时
       * 从这里读初始值，避免每次都强制回到默认 —— 用户可能习惯只勾搜索 / 只勾推荐，
       * 记住偏好下次自动应用。
       *
       * 写入时机：用户主动点击切换勾选（toggleModule）。
       * **不写入时机**：BOSS 渠道禁用时 watch 强制收敛到 { search:true, recommend:false }
       * —— 那是系统行为不是用户偏好，BOSS 重启后还要回到用户上次的真正选择。
       *
       * **首次默认（localStorage 无任何缓存时）**：`{ search: true, recommend: false }`
       * —— 仅勾"搜索牛人"，避免新用户首次启动就触发 BOSS 推荐（推荐受风控影响，
       * 应该让用户明确勾选才走）。
       *
       * 永久持久化（vuex-persistedstate paths 配置在 store/index.js）。
       */
      lastSelectedModules: { search: true, recommend: false },
    }),
    mutations: {
        changeLeftLoadingSwitch(state,payload) {
            state.leftLoadingSwitch = payload;
        },
        changeSearchChannelConditionRequestData(state,payload) {
            state.searchConditionChannelRequestData = payload;
        },
        setSearchChannelConditionRequestData(state, {key, config}) {
            console.log("setSearchChannelConditionRequestData",key,config)
          if (state.searchConditionChannelRequestData && state.searchConditionChannelRequestData.config) {
            // 查找是否已存在该渠道的配置
            const existingConfigIndex = state.searchConditionChannelRequestData.config.findIndex(item => item.channelKey === key);

            if (existingConfigIndex !== -1) {
              // 如果已存在，则更新该渠道的配置
              state.searchConditionChannelRequestData.config[existingConfigIndex] = {
                ...state.searchConditionChannelRequestData.config[existingConfigIndex],
                ...config
              };
            } else {
              // 如果不存在，则添加新的渠道配置
              state.searchConditionChannelRequestData.config.push({
                channelDataTotal: config.channelDataTotal || 0,
                channelPage: config.channelPage || 0,
                channelCountSize: config.channelCountSize || 0,
                totalPage: config.totalPage || 0,
                channelKey: key,
                dataList: config.dataList || []
              });
            }
          } else if (state.searchConditionChannelRequestData) {
            // 如果存在searchConditionChannelRequestData但没有config属性，则创建config数组
            state.searchConditionChannelRequestData.config = [{
              channelDataTotal: config.channelDataTotal || 0,
              channelPage: config.channelPage || 0,
              channelCountSize: config.channelCountSize || 0,
              totalPage: config.totalPage || 0,
              channelKey: key,
              dataList: config.dataList || []
            }];
          }
        },
        changeAiSearchRef(state,payload) {
            state.aiSearchRef = payload;
        },
        changeJobSearchFilterRef(state,payload) {
          state.jobSearchFilterRef = payload;
        },
        changeChatCardRef(state,payload) {
          state.chatCardRef = payload;
        },
        /** 由 IndexPage 注入聚合搜索执行器（payload 是 async 函数） */
        setAggregateSearchExecutor(state, payload) {
          state.aggregateSearchExecutor = typeof payload === 'function' ? payload : null;
        },
        /** actionRunner / handleAggregateSearch 跑搜索前后调，标记正在跑 */
        setAggregateSearchInFlight(state, val) {
          state.aggregateSearchInFlight = !!val;
        },
        /**
         * scoreAutoUpdater 推送评分状态（pending=0 且 active=false 表示评分完成）
         *
         * chatId（可选）：active=true 时由调用方传入"AI 正在为哪个 chat 跑"的快照，
         * 解决跨 chat 串扰；active=false 时显式置 null（清除"曾经在为某 chat 跑"的痕迹）。
         */
        setAiScoringState(state, { active, pending, chatId }) {
          state.aiScoringActive = !!active;
          state.aiScoringPending = Number(pending) || 0;
          state.aiScoringChatId = active ? (chatId || null) : null;
        },
        /** AsyncTaskQueueManager 推送任务队列状态（AI 详情解析等后台任务） */
        setAiTaskQueueState(state, { active, pending, chatId }) {
          state.aiTaskQueueActive = !!active;
          state.aiTaskQueuePending = Number(pending) || 0;
          state.aiTaskQueueChatId = active ? (chatId || null) : null;
        },
        setSearchChannelConditionConfigData(state, {key, config}) {
            if (!state.searchConditionChannelRequestData) {
                return;
            }
            const getTotalPages = (totalItems, itemsPerPage) => {
                return Math.ceil(totalItems / itemsPerPage);
            };
            if (config && state.searchConditionChannelRequestData.config) {
                const channelConfig = state.searchConditionChannelRequestData.config.find(item => item.channelKey === key);
                if (channelConfig) {
                    channelConfig.totalPage = getTotalPages(config.channelDataTotal, config.channelCountSize);
                    channelConfig.channelDataTotal = config.channelDataTotal;
                    channelConfig.channelPage = config.channelPage;
                    channelConfig.channelCountSize = config.channelCountSize;
                }
            }
        },
        changeAllChannelCount(state,payload) {
            state.allChannelCount = payload;
        },
        changeBossChannelCount(state,payload) {
            state.bossChannelCount = payload;
        },
        changeSearchStateConfig(state,payload) {
            state.searchStateConfig = payload;
        },
        changeUnreadCheckBoxV(state,payload) {
            state.unreadCheckBoxV = payload;
        },
        updateIsReadStatus(state,id) {
            for (let channelDataKey in state.channelData) {
                const channelData = state.channelData[channelDataKey];
                for (let i = 0; i < channelData.length; i++) {
                    if (channelData[i].id === id) {
                        channelData[i].isRead = 1;
                    }
                }
            }
            // if(state.channelData['ALL'].length>0){
            //     state.channelData['ALL'].forEach(item => {
            //         if (item.id === id) {
            //             item.isRead = 1;
            //         }
            //     });
            // }
            // if(state.channelData['Collect'].length>0){
            //     state.channelData['Collect'].forEach(item => {
            //         if (item.id === id) {
            //             item.isRead = 1;
            //         }
            //     });
            // }
        },
        setJobALlData(state,payload) {
            if(payload){
                state.jobALlData = payload;
            }else{
                state.jobALlData = [];
            }
        },
        setChannelData(state,{key,value}) {
            const allData = state.channelData[key];
            if(allData&&value){
                state.channelData[key] = value;
            }else{
                state.channelData[key] = [];
            }
        },
        setSearchConditionList(state,payload) {
            if(payload){
                state.searchConditionList = payload;
            }else{
                state.searchConditionList = [];
            }
        },
        changeJobALlData(state,map) {
            state.jobALlData.forEach(updatedItem => {
                if (map.has(updatedItem.id)) {
                    const item = map.get(updatedItem.id);
                    updatedItem.score = item.score; // 更新 score 值
                    if(item.score&&item.score>=-1){
                        this.commit("deleteScoreConfigById", updatedItem.id);
                    }
                }
            });
        },
        changeChannelALlData(state,map) {
            Object.entries(state.channelData).forEach(([key, array]) => {
                const allData = state.channelData[key];
                if (allData&&allData.length > 0) {
                    allData.forEach(updatedItem => {
                        if (map.has(updatedItem.id)) {
                            const item = map.get(updatedItem.id);
                            updatedItem.score = item.score; // 更新 score 值
                            updatedItem.cc = item;//设置分数对象
                            if(item.score&&item.score>=0){
                                this.commit("deleteScoreConfigById", updatedItem.id);
                            }else{
                                if(updatedItem.reflashAIScore!==undefined&&updatedItem.reflashAIScore!==null){
                                    updatedItem.reflashAIScore++;
                                    if(updatedItem.reflashAIScore>10){
                                        this.commit("deleteScoreConfigById", updatedItem.id);
                                    }
                                }else{
                                    updatedItem.reflashAIScore = 0;
                                }
                            }
                        }
                    });
                }

            });
            state.jobALlData.forEach(updatedItem => {
                if (map.has(updatedItem.id)) {
                    const item = map.get(updatedItem.id);
                    updatedItem.score = item.score; // 更新 score 值
                    if(item.score&&item.score>=0){
                        this.commit("deleteScoreConfigById", updatedItem.id);
                    }
                }
            });
        },
        addScoreConfigToQueue(state,data) {
            if (state.scoreList.length >= 1000) {
                // 队列满了，移除队首元素
                state.scoreList.shift();
            }
            const foundObject = state.scoreList.find(item => item.id === data.id);
            if(!foundObject){
                // 添加新消息到队尾
                state.scoreList.push(data);
            }
        },
        deleteScoreConfigById(state,id) {
            state.scoreList = state.scoreList.filter(item => item.id !== id);
        },
      changeSearchCount(state) {
        state.searchCount += 1;
      },
      toggleQueueMonitor(state) {
        state.showQueueMonitor = !state.showQueueMonitor;
      },
      openQueueMonitor(state) {
        state.showQueueMonitor = true;
      },
      toggleFilterPanel(state) {
        state.showFilterPanel = !state.showFilterPanel;
      },
      setFilterPanel(state, payload) {
        state.showFilterPanel = payload;
      },
      /**
       * 触发一次全局"职位列表静默刷新"信号 —— LeftMenu watch 到自增就 loadChatList。
       * 当前用法：MainLayout 收到同用户 deep link 时调，让 LeftMenu 拿到 incoming 的最新职位。
       */
      triggerChatListRefresh(state) {
        state.chatListRefreshSignal = (state.chatListRefreshSignal || 0) + 1;
      },
      /**
       * 写"用户上次勾选的模块"——AIProfileActionPanel.toggleModule 调用。
       * 仅记录用户主动选择，BOSS 禁用时的强制收敛不调本 mutation。
       *
       * @param {{search: boolean, recommend: boolean}} payload
       */
      setLastSelectedModules(state, payload) {
        state.lastSelectedModules = {
          search: !!payload?.search,
          recommend: !!payload?.recommend
        };
      },
    },
    actions: {
        async fetchAndUpdateScore({ commit, state }) {
            if(state.scoreList.length>0){
                let requestData = state.scoreList.map(item => item.id);
                let rtScoreList =[];
                try {
                    let {data} = await getScoreList(requestData);
                    rtScoreList=data;
                }catch (e){
                    console.log(e)
                    throw new Error("getScoreList service error");
                }
                let map = new Map(rtScoreList.map(item => [item.resumeBlindId, item]));
                if(map&&map.size > 0){
                    commit("changeChannelALlData", map);
                }
            }
        },
        async findSearchCondition({ commit, state },userId) {
            await commit("changeLeftLoadingSwitch", true);
            try {
                let {data} = await querySearchConditionCollection(userId);
                if(data){
                    await commit("setSearchConditionList", data);
                }
            }catch (e){
                console.log(e)
                await commit("changeLeftLoadingSwitch", false);
            }
            await commit("changeLeftLoadingSwitch", false);
        }
    },
    getters: {
        getLeftLoadingSwitch(state) {
            return state.leftLoadingSwitch;
        },
        getSearchChannelConditionRequestData(state) {
            return state.searchConditionChannelRequestData;
        },
        getAllChannelCount(state) {
            return state.allChannelCount;
        },
        getBossChannelCount(state) {
            return state.bossChannelCount;
        },
        getScoreConfigList(state) {
            return state.scoreList;
        },
        getJobALlData(state) {
            return state.jobALlData;
        },
        getChannelALlData: (state) => (key) => {
            return state.channelData[key] || [];
        },
        getSearchConditionList(state) {
            return state.searchConditionList;
        },
        getSearchStateConfig(state) {
            return state.searchStateConfig;
        },
        getUnreadCheckBoxV(state) {
            return state.unreadCheckBoxV;
        },
        getAiSearchRefValue(state) {
            return state.aiSearchRef;
        },
        getAggregateSearchExecutor(state) {
            return state.aggregateSearchExecutor;
        },
        getAggregateSearchInFlight(state) {
            return !!state.aggregateSearchInFlight;
        },
        getAiScoringActive(state) {
            return !!state.aiScoringActive;
        },
        getAiScoringPending(state) {
            return Number(state.aiScoringPending) || 0;
        },
        getAiTaskQueueActive(state) {
            return !!state.aiTaskQueueActive;
        },
        getAiTaskQueuePending(state) {
            return Number(state.aiTaskQueuePending) || 0;
        },
        /**
         * 返回当前两路 AI 信号里**任意一路**绑定的 chatId（评分优先于任务队列），都 null
         * 时返回 null。专门给 SearchTasks.isAiAnalyzingForChat 用，做"AI 是不是为本 chat 跑"
         * 的精准判定，解决跨 chat 串扰。
         */
        getAiAnalyzingChatId(state) {
            if (state.aiScoringActive && state.aiScoringChatId) return state.aiScoringChatId;
            if (state.aiTaskQueueActive && state.aiTaskQueueChatId) return state.aiTaskQueueChatId;
            return null;
        },
        /** 合并信号：评分 OR 任务队列任一在跑 → AI 分析进行中 */
        getAiAnalyzingActive(state) {
            return !!state.aiScoringActive || !!state.aiTaskQueueActive;
        },
        getAiAnalyzingPending(state) {
            return (Number(state.aiScoringPending) || 0) + (Number(state.aiTaskQueuePending) || 0);
        },
        getJobSearchFilterRefValue(state) {
          return state.jobSearchFilterRef;
        },
        getChatCardRefValue(state) {
          return state.chatCardRef;
        },
        getSearchCount(state){
          return state.searchCount;
        },
        getShowQueueMonitor(state) {
            return state.showQueueMonitor;
        },
        getShowFilterPanel(state) {
            return state.showFilterPanel;
        },
        /**
         * 用户上次勾选的模块（搜索/推荐）—— AIProfileActionPanel 初始化时读，
         * 没有持久化记录时返回默认 { search:true, recommend:true }
         */
        getLastSelectedModules(state) {
            return state.lastSelectedModules || { search: true, recommend: false };
        },
        /** 职位列表静默刷新信号自增数（LeftMenu watch 它触发 loadChatList） */
        getChatListRefreshSignal(state) {
            return Number(state.chatListRefreshSignal) || 0;
        },
    },
};
