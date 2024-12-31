

export default {
    state: () => ({
        testSwitch: null,
    }),
    mutations: {
        changeTestSwitch(state) {
            state.testSwitch = !state.testSwitch;
        },
    },
    actions: {},
    getters: {
        getTestSwitch(state) {
            return state.testSwitch;
        },
    },
};
