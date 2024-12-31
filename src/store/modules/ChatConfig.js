

export default {
    state: () => ({
        localUserChatId: null,
        searchConditionId:null,
        chatMsg:[]
    }),
    mutations: {
        changeLocalUserChatId(state,chatId) {
            state.localUserChatId = chatId;
        },
        changeSearchConditionId(state,conditionId) {
            state.searchConditionId = conditionId;
        },
        addMessageToQueue(state,msg) {
            if (state.chatMsg.length >= 50) {
                // 队列满了，移除队首元素
                state.chatMsg.shift();
            }
            // 添加新消息到队尾
            state.chatMsg.push(msg);
        },
    },
    actions: {},
    getters: {
        getLocalUserChatId(state) {
            return state.localUserChatId;
        },
        getSearchConditionId(state) {
            return state.searchConditionId;
        },
        getChatMassages(state) {
            return state.chatMsg;
        },
    },
};
