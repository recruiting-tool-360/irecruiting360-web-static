export default {
    state: () => ({
        pluginSwitch: false,
        pluginInstall: false,
        pluginDownloadDialogVisible: false,
        resumeIndexVisible: true,
        fixedPanelPosition: {
            right: 10,
            top: 60,
            height: 140,
            width: 48,
            buttons: 3
        },
        headerVisible: true,
        headerHeight: 48,
    }),
    mutations: {
        changePluginSwitch(state,payload) {
            state.pluginSwitch = payload;
        },
        changePluginInstall(state,payload) {
            state.pluginInstall = payload;
        },
        togglePluginDownloadDialog(state) {
            state.pluginDownloadDialogVisible = !state.pluginDownloadDialogVisible;
        },
        setPluginDownloadDialogVisible(state, payload) {
            state.pluginDownloadDialogVisible = payload;
        },
        toggleResumeIndexVisible(state) {
            state.resumeIndexVisible = !state.resumeIndexVisible;
        },
        setResumeIndexVisible(state, payload) {
            state.resumeIndexVisible = payload;
        },
        updateFixedPanelPosition(state, payload) {
            state.fixedPanelPosition = { ...state.fixedPanelPosition, ...payload };
        },
        setHeaderVisible(state, payload) {
            state.headerVisible = payload;
        },
        setHeaderHeight(state, payload) {
            state.headerHeight = payload;
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
        getPluginDownloadDialogVisible(state) {
            return state.pluginDownloadDialogVisible;
        },
        getResumeIndexVisible(state) {
            return state.resumeIndexVisible;
        },
        getFixedPanelPosition(state) {
            return state.fixedPanelPosition;
        },
        getHeaderVisible(state) {
            return state.headerVisible;
        },
        getHeaderHeight(state) {
            return state.headerHeight;
        },
    },
};
