import {getScoreList} from "@/api/jobList/JobListApi";
import {querySearchConditionCollection} from "@/api/search/SearchApi";


export default {
    state: () => ({
        allChannelCount: 0,
        bossChannelCount: 0,
        scoreList:[],
        jobALlData:[],
        searchConditionList:[]
    }),
    mutations: {
        changeAllChannelCount(state,payload) {
            state.allChannelCount = payload;
        },
        changeBossChannelCount(state,payload) {
            state.bossChannelCount = payload;
        },
        setJobALlData(state,payload) {
            if(payload){
                state.jobALlData = payload;
            }else{
                state.jobALlData = [];
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
            const foundObject = state.scoreList.find(item => item.id === data);
            if(!foundObject){
                // 添加新消息到队尾
                state.scoreList.push(data);
            }
        },
        deleteScoreConfigById(state,id) {
            state.scoreList = state.scoreList.filter(item => item !== id);
        }
    },
    actions: {
        async fetchAndUpdateScore({ commit, state }) {
            if(state.scoreList.length>0){
                let requestData = state.scoreList.map(item => item);
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
                    commit("changeJobALlData", map);
                }
            }
        },
        async findSearchCondition({ commit, state },userId) {
            try {
                let {data} = await querySearchConditionCollection(userId);
                commit("setSearchConditionList", data);
            }catch (e){
                console.log(e)
                throw new Error("getScoreList service error");
            }
        }
    },
    getters: {
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
        getSearchConditionList(state) {
            return state.searchConditionList;
        },
    },
};
