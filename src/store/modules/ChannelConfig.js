

export default {
    state: () => ({
        channelConf: {
            ALL:{
                key:"ALL",
                name:"渠道聚合",
                disable:true,
                dataSize:0
            },
            BOSS:{
                key:"BOSS",
                login:false,
                loading:false,
                name:"boss直聘",
                disable:true,
                dataSize:0
            },
            ZHILIAN:{
                key:"ZHILIAN",
                login:false,
                loading:false,
                name:"智联招聘",
                disable:true,
                dataSize:0
            },
            Collect:{
                key:"Collect",
                name:"我的收藏",
                disable:true,
                dataSize:0
            },
        },
    }),
    mutations: {
        changeChannelConfDisable(state,{key,value}) {
            state.channelConf[key].disable=value;
        },
        changeChannelConfLoading(state,{key,value}) {
            state.channelConf[key].loading=value;
        },
        changeChannelConfLogin(state,{key,value}) {
            state.channelConf[key].login=value;
        },
        changeChannelConfDataSize(state,{key,value}) {
            state.channelConf[key].dataSize=value;
        },
    },
    actions: {},
    getters: {
        getChannelConf(state) {
            return state.channelConf;
        },
        getChannelConfByChannel: (state) => (key) => {
            return state.channelConf[key];
        },
    },
};
