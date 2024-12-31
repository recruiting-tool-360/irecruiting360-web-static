

export default {
    state: () => ({
        pluginSwitch: null,
    }),
    mutations: {
        changePluginSwitch(state,payload) {
            state.pluginSwitch = payload;
        },
    },
    actions: {},
    getters: {
        getPluginSwitch(state) {
            return state.pluginSwitch;
        },
    },
};
