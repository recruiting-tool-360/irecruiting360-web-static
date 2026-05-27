

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
    /**
     * ★ 当前发生"账号异常/已下线"的渠道展示名（如 "boss直聘" / "智联招聘" / "前程无忧"）。
     *   - null：无异常 → ClientHeader 显示常规提示横幅
     *   - 有值：ClientHeader 切红色错误横幅 "检测到「xxx」账号异常/已下线..."，对应 channel 按钮变红
     *
     * 写入时机：
     *   - 任务执行前 recheck 失败 → markChannelExpired(key)
     *   - 任务运行中接口返回 LOGIN_EXPIRED → 同上 + dispatch SearchTasks/stopForChat
     * 清除时机：
     *   - 用户点 "恢复任务" → ClientHeader 内 refreshChannelLogin 成功 → clearChannelError
     *   - 用户新建/重启任务前 recheck 成功 → 自动清
     *
     * 详见 src/util/channelLoginGuard.js
     */
    channelError: null,
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
            if (key === 'ALL' && (!value || value.length === 0) && state.channelConf[key].data.length > 0) {
                console.warn('⚠️⚠️ ALL.data 被清空！调用栈：', new Error().stack.split('\n').slice(1,6).join('\n'));
            }
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
        /**
         * 设置当前异常渠道（展示名，如 "boss直聘"）。null 表示清除异常。
         * 顺手把对应 channelConf[key].login 标 false，让"渠道未登录"在所有 UI（红按钮 +
         * LoginRequiredPanel + 渠道 tab badge）保持一致状态。
         *
         * @param {string|null} name 渠道展示名（channelConf[key].name），或 null
         */
        setChannelError(state, name) {
            state.channelError = name || null;
            if (name) {
                for (const key of Object.keys(state.channelConf)) {
                    if (state.channelConf[key]?.name === name) {
                        state.channelConf[key].login = false;
                        break;
                    }
                }
            }
        },
        clearChannelError(state) {
            state.channelError = null;
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
        /** 当前异常渠道展示名（null = 无异常） */
        getChannelError(state) {
            return state.channelError;
        },
    },
};
