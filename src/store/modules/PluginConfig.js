export default {
    state: () => ({
        pluginSwitch: false,
        pluginInstall: false,
        pluginDownloadDialogVisible: false,
        forceUpdateVisible: false,
        // 客户端模式下 i 人事 manage 系统认证过期 / 未登录时弹的"i 人事账号授权"框
        // 由 electronMessengerShim 检测到 ihrBridge 返回 NOT_LOGGED_IN 时打开
        ihrAuthModalVisible: false,
        resumeIndexVisible: false,
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
        setForceUpdateVisible(state, payload) {
            state.forceUpdateVisible = payload;
        },
        setIhrAuthModalVisible(state, payload) {
            state.ihrAuthModalVisible = !!payload;
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
        getForceUpdateVisible(state) {
            return state.forceUpdateVisible;
        },
        getIhrAuthModalVisible(state) {
            return state.ihrAuthModalVisible;
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
