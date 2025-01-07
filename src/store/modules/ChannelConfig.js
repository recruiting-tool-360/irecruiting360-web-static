

export default {
    state: () => ({
        channelConf: {
            ALL:{
                name:"渠道聚合",
                disable:true
            },
            BOSS:{
                login:false,
                loading:false,
                name:"boss直聘",
                disable:true
            },
            Collect:{
                name:"我的收藏",
                disable:true
            },
        },
    }),
    mutations: {
        changeTestSwitch(state) {
            state.channelConf = !state.channelConf;
        },
    },
    actions: {},
    getters: {
        getChannelConf(state) {
            return state.channelConf;
        },
    },
};
