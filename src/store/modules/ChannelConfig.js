

export default {
    state: () => ({
        channelConf: {
            ALL:{
                key:"ALL",
                name:"渠道聚合",
                disable:true
            },
            BOSS:{
                key:"BOSS",
                login:false,
                loading:false,
                name:"boss直聘",
                disable:true
            },
            Collect:{
                key:"Collect",
                name:"我的收藏",
                disable:true
            },
        },
    }),
    mutations: {
        changeChannelConfDisable(state,{key,value}) {
            state.channelConf[key].disable=value;
        },
    },
    actions: {},
    getters: {
        getChannelConf(state) {
            return state.channelConf;
        },
    },
};
