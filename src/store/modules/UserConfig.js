import {hexToRgb} from "src/util/index";

export default {
    state: () => ({
        userInfo: null,
        downloadUrl: '',
        userColor: '#1F7CFFFF',
        userChannelConfig: [],
        resumeBatchMode: false,
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
    },

};
