

export default {
    state: () => ({
        channelConf: {
            ALL:{
                key:"ALL",
                name:"渠道聚合",
                desc:"全渠道",
                disable:true,
                dataSize:0,
                aiSort:false,
                cardInfoRef:null
            },
            BOSS:{
                key:"BOSS",
                login:false,
                loading:false,
                name:"boss直聘",
                desc:"boss直聘",
                pageSearch:true,
                disable:true,
                dataSize:0,
                aiSort:false,
                cardInfoRef:null
            },
            ZHILIAN:{
                key:"ZHILIAN",
                login:false,
                loading:false,
                name:"智联招聘",
                desc:"智联招聘",
                pageSearch:true,
                disable:true,
                dataSize:0,
                aiSort:false,
                cardInfoRef:null
            },
            JOB51:{
                key:"JOB51",
                login:false,
                loading:false,
                name:"前程无忧",
                desc:"前程无忧",
                pageSearch:true,
                disable:true,
                dataSize:0,
                aiSort:false,
                cardInfoRef:null
            },
            Collect:{
                key:"Collect",
                name:"我的收藏",
                desc:"我的收藏",
                disable:true,
                dataSize:0,
                aiSort:false,
                cardInfoRef:null
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
        changeChannelCardInfoRef(state,{key,value}) {
            state.channelConf[key].cardInfoRef=value;
        },
        changeAiSortSwitch(state,{key,value}) {
            state.channelConf[key].aiSort=value;
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
