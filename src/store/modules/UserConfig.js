export default {
    state: () => ({
        userInfo: null,
        downloadUrl: ''
    }),
    mutations: {
        changeUserInfo(state, user) {
            state.userInfo = user;
        },
        setDownloadUrl(state, url) {
            state.downloadUrl = url;
        }
    },
    actions: {},
    getters: {
        getUserInfo(state) {
            return state.userInfo;
        },
        getDownloadUrl(state) {
            return state.downloadUrl;
        }
    },
};
