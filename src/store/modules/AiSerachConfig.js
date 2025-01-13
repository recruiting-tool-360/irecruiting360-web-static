import {getScoreList} from "@/api/jobList/JobListApi";
import {querySearchConditionCollection} from "@/api/search/SearchApi";
import {ElMessage} from "element-plus";


export default {
    state: () => ({
        leftLoadingSwitch:false,
        searchConditionRequestData:null,
        allChannelCount: 0,
        bossChannelCount: 0,
        scoreList:[],
        jobALlData:[],
        searchConditionList:[],
        channelData:{
            ALL:[],
            BOSS:[],
            ZHILIAN:[],
            Collect:[]
        }
    }),
    mutations: {
        changeLeftLoadingSwitch(state,payload) {
            state.leftLoadingSwitch = payload;
        },
        changeSearchConditionRequestData(state,payload) {
            state.searchConditionRequestData = payload;
        },
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
                            if(item.score&&item.score>=0){
                                this.commit("deleteScoreConfigById", updatedItem.id);
                            }else{
                                if(updatedItem.reflashAIScore!==undefined&&updatedItem.reflashAIScore!==null){
                                    updatedItem.reflashAIScore++;
                                    if(updatedItem.reflashAIScore>3){
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
        }
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
                ElMessage.error('服务异常,请联系管理员');
            }
            await commit("changeLeftLoadingSwitch", false);
        }
    },
    getters: {
        getLeftLoadingSwitch(state) {
            return state.leftLoadingSwitch;
        },
        getSearchConditionRequestData(state) {
            return state.searchConditionRequestData;
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
    },
};
