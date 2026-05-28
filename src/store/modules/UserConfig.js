import {hexToRgb} from "src/util/index";

export default {
    state: () => ({
        userInfo: null,
        downloadUrl: '',
        userColor: '#1F7CFFFF',
        userChannelConfig: [],
        resumeBatchMode: false,
        /**
         * 上一次成功 SSO 登录使用的 ssoConfig.userConfig 序列化字符串。
         *
         * 用途：客户端运行中收到新的 deep link 时，判断 incoming 用户跟当前登录用户是否一致：
         *   - 一致 → 静默走（accessToken 已由主进程注入 ihrBridge）+ 刷新职位列表
         *   - 不一致 → router.replace('/sso-login') 整页重走（清干净旧用户状态）
         *
         * 用 JSON.stringify(ssoConfig.userConfig) 作 key —— ssoConfig.userConfig 是 i 人事工作台
         * 推给客户端的用户身份载荷，跟前端 store.userInfo.id（ihr 后端 user.id）不一定能直接比，
         * 所以用 i 人事侧载荷的完整序列化做"上次=本次"判定最稳。
         *
         * 永久持久化（vuex-persistedstate paths 配在 store/index.js）。
         */
        lastSsoUserKey: '',
    }),
    mutations: {
        changeUserInfo(state, user) {
            state.userInfo = user;
        },
        setDownloadUrl(state, url) {
            state.downloadUrl = url;
        },
        setUserColor(state, color) {
            state.userColor = color;
        },
        setUserChannelConfig(state, config) {
            state.userChannelConfig = config;
        },
        setResumeBatchMode(state, val) {
            state.resumeBatchMode = val;
        },
        setLastSsoUserKey(state, key) {
            state.lastSsoUserKey = typeof key === 'string' ? key : '';
        },
        updateSsoThemeColor(state, color) {
            state.userColor = color;
            document.documentElement.style.setProperty('--q-primary', color);
            // 将HEX转换为RGB并更新CSS变量
            const rgb = hexToRgb(color);
            if (rgb) {
              document.documentElement.style.setProperty(
                '--q-primary-rgb',
                `${rgb.r}, ${rgb.g}, ${rgb.b}`
              );
            }
        },
    },
    actions: {},
    getters: {
        getUserInfo(state) {
            return state.userInfo;
        },
        getDownloadUrl(state) {
            return state.downloadUrl;
        },
        getUserColor(state) {
            return state.userColor;
        },
        getUserChannelConfig(state) {
            return state.userChannelConfig;
        },
        getResumeBatchMode(state) {
            return state.resumeBatchMode;
        },
        getLastSsoUserKey(state) {
            return state.lastSsoUserKey || '';
        },
    },

};
