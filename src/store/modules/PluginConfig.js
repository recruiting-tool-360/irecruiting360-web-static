

export default {
    state: () => ({
        pluginSwitch: false,
        pluginInstall: false,
    }),
    mutations: {
        changePluginSwitch(state,payload) {
            state.pluginSwitch = payload;
        },
        changePluginInstall(state,payload) {
            state.pluginInstall = payload;
        },
    },
    actions: {},
    getters: {
        getPluginSwitch(state) {
            return state.pluginSwitch;
        },
        getPluginInstall(state) {
            return state.pluginInstall;
        },
    },
};
