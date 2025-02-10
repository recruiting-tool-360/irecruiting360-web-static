

export default {
    state: () => ({
        userInfo: null
    }),
    mutations: {
        changeUserInfo(state,user) {
            state.userInfo = user;
        }
    },
    actions: {},
    getters: {
        getUserInfo(state) {
            return state.userInfo;
        }
    },
};
