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
      searchCount:0,
      showQueueMonitor: false,
      showFilterPanel: true,
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
    },
};
