

export default {
  state: () => ({
    channelConf: {
      ALL:{
        key:"ALL",
        name:"渠道聚合",
        desc:"全渠道",
        disable:true,
        pageConfig:{},
        dataSize:0,
        data:[],
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
        data:[],
        aiSort:false,
        logo:'/index/header/searchPage/boss.ico',
        cardInfoRef:null
      },
      LIEPIN:{
        key:"LIEPIN",
        login:false,
        loading:false,
        name:"猎聘",
        desc:"猎聘",
        pageSearch:true,
        disable:true,
        dataSize:0,
        data:[],
        aiSort:false,
        logo:'/index/header/searchPage/liepin.svg',
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
        data:[],
        aiSort:false,
        logo:'/index/header/searchPage/job51.svg',
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
        data:[],
        aiSort:false,
        logo:'/index/header/searchPage/zhilian.svg',
        cardInfoRef:null
      },
      Collect:{
        key:"Collect",
        name:"我的收藏",
        desc:"我的收藏",
        disable:true,
        pageConfig:{},
        dataSize:0,
        data:[],
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
        changeChannelConfData(state,{key,value}) {
            state.channelConf[key].data=value;
        },
        addChannelConfData(state,{key,value}) {
          state.channelConf[key].data.push(...value)
        },
        updateChannelConfIndex(state, {key,index,data}) {
          state.channelConf[key].data[index] = data;
        },
        setPageConfigData(state, {key, config}) {
          const getTotalPages = (totalItems, itemsPerPage) => {
            return Math.ceil(totalItems / itemsPerPage);
          };
          const channelConfig = state.channelConf[key].pageConfig;
          if (channelConfig) {
            channelConfig.totalPage = getTotalPages(config.channelDataTotal, config.channelCountSize);
            channelConfig.channelDataTotal = config.channelDataTotal;
            channelConfig.channelPage = config.channelPage;
            channelConfig.channelCountSize = config.channelCountSize;
          }
        },
    },
    actions: {
      updateChannelConf(store, payload) { // 第一个参数是vuex固定的参数，不需要手动去传递
        store.commit("updateChannelConfIndex", payload)
      },
    },
    getters: {
        getChannelConf(state) {
            return state.channelConf;
        },
        getChannelConfByChannel: (state) => (key) => {
            return state.channelConf[key];
        },
        getChannelConfByAll(state) {
          return state.channelConf['ALL'];
        },
        getChannelConfByChannelData: (state) => (key) => {
            return state.channelConf[key].data;
        },
    },
};
