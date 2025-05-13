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
