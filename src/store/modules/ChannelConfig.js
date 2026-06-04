/**
 * 从 ALL.data 重算各搜索渠道的 badge 数量（dataSize）。
 *
 * 渠道组件（BossJobInfo / ZHILIANJobInfo / ...）按 `item.channel === channelConf[ch].desc`
 * 过滤 ALL.data 得到本渠道列表，tab 右上角红色 badge 也应按同口径计数。
 * 之前 dataSize 只在 handleViewResults（重新进入结果页）时设，导致 loadMore 追加数据后
 * badge 不刷新。append 到 ALL.data 时调用本函数即可让 badge 实时跟上。
 */
function recomputeChannelDataSizesFromAll(state) {
  const all = state.channelConf?.ALL?.data || [];
  for (const ch of ["BOSS", "ZHILIAN", "JOB51", "LIEPIN"]) {
    const conf = state.channelConf?.[ch];
    if (!conf) continue;
    const desc = conf.desc;
    conf.dataSize = all.filter((item) => item && item.channel === desc).length;
  }
}

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

    /**
     * BOSS 登录态是否由「常驻登录监视」(bossResidentWatcher / main 进程 bossLoginWatcher) 接管。
     *
     * 客户端模式下常驻隐藏窗口加载 BOSS 职位列表页，用导航/接口判定登录态，是最可靠的 BOSS
     * 登录信号。开启后 AISearch 的 checkAuth 轮询（checkChannelLoginStatus / 静默 refreshChannelLogin）
     * 不再覆盖 BOSS 登录态 —— 否则 checkAuth 偶发返回 Success 会把常驻监视判定的「已失效」又冲回
     * 「已登录」，导致 header 不更新。
     */
    bossLoginWatcherActive: false,

    /**
     * 51job 登录态是否由「get_user_info 10s 轮询监视」(job51LoginWatcher) 接管。
     * 开启后 AISearch 的 checkChannelLoginStatus / 静默 refreshChannelLogin 不再覆盖 JOB51 登录态，
     * 避免老的 job51UserStatus（property/签名校验）偶发失败把轮询判定的"已登录"冲回"未登录"。
     */
    job51LoginWatcherActive: false,

    /**
     * 智联 登录态是否由「zhiLianUserStatus 10s 轮询监视」(zhilianLoginWatcher) 接管。
     * 同 job51LoginWatcherActive：开启后 AISearch 的 checkChannelLoginStatus / 静默 refreshChannelLogin
     * 不再覆盖 ZHILIAN 登录态。
     */
    zhilianLoginWatcherActive: false,

    /**
     * 是否正在"重新分析 AI 分析异常的简历"（渠道重新登录后触发）。
     * 开启窗口内：JobInfo.onWaitingCallback 即使任务已停止也不要急着把 WAITING 简历标成 -2，
     * 给重新提交的 detail 留出被后端打分的时间。由 reAnalyzeFailedResumes 设置 + 定时清除。
     */
    reAnalyzingActive: false,
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
        /**
         * 把所有"还没评分"的简历直接标为「分析异常」（score=-2 → UI 显示"AI分析失败/渠道数据异常"）。
         *
         * 用途：用户手动停止任务后，残留的未评分简历不该一直停在"AI分析中"+ 触发 scoreAutoUpdater
         * 无限轮询 queryTaskScoreList。标成 -2（终态）后：
         *   - UI 立刻显示"分析异常"，不再转圈
         *   - scoreAutoUpdater.collectResumesWithoutScore 视 -2 为终态 → 不再加入 pending → 轮询停
         *
         * "未评分"判定跟 scoreAutoUpdater.collectResumesWithoutScore 一致：
         *   score 为 null/undefined，或 score<0 且 !==-2。
         */
        markUnscoredAsFailed(state) {
            const isUnscored = (r) =>
                r && (r.score === null || r.score === undefined ||
                    (typeof r.score === 'number' && r.score < 0 && r.score !== -2));
            for (const key of Object.keys(state.channelConf)) {
                const arr = state.channelConf[key]?.data;
                if (!Array.isArray(arr)) continue;
                for (const r of arr) {
                    if (isUnscored(r)) {
                        r.score = -2;
                        if (r.scoreStatus !== undefined) r.scoreStatus = 'FAILED';
                    }
                }
            }
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
          // ★ 追加到 ALL.data 后同步重算各渠道 tab 右上角 badge 数量（dataSize）。
          //   渠道组件按 item.channel === channelConf[ch].desc 过滤 ALL.data，badge 同口径。
          //   修复 loadMore 追加数据后 badge 不刷新（之前 dataSize 仅在 handleViewResults 重进时设）。
          if (key === 'ALL') {
            recomputeChannelDataSizesFromAll(state);
          }
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
        setBossLoginWatcherActive(state, value) {
            state.bossLoginWatcherActive = !!value;
        },
        setJob51LoginWatcherActive(state, value) {
            state.job51LoginWatcherActive = !!value;
        },
        setZhilianLoginWatcherActive(state, value) {
            state.zhilianLoginWatcherActive = !!value;
        },
        setReAnalyzingActive(state, value) {
            state.reAnalyzingActive = !!value;
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
        getBossLoginWatcherActive(state) {
            return state.bossLoginWatcherActive === true;
        },
        getJob51LoginWatcherActive(state) {
            return state.job51LoginWatcherActive === true;
        },
        getZhilianLoginWatcherActive(state) {
            return state.zhilianLoginWatcherActive === true;
        },
        getReAnalyzingActive(state) {
            return state.reAnalyzingActive === true;
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
