import createPersistedState from "vuex-persistedstate";

export default {
    state: () => ({
        testSwitch: null,
    }),
    mutations: {
        changeTestSwitch(state) {
            state.testSwitch = !state.testSwitch;
            console.log("开关值：", state.testSwitch);
        },
    },
    actions: {},
    getters: {
        getTestSwitch(state) {
            return state.testSwitch;
        },
    },
    plugins: [
        createPersistedState({
            key: "test-config", // 存储的键名
            storage: window.localStorage, // 使用 localStorage
            paths: ["testSwitch"], // 明确指定需要持久化的路径
        }),
    ],
};
