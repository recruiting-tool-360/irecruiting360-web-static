export default {
    state: () => ({
        testSwitch: true
    }),
    mutations: {
        changeTestSwitch(state) {
            state.testSwitch = !state.testSwitch;
            console.log("开关值：",state.testSwitch)
        }
    },
    actions: {

    },
    getters: {
        getTestSwitch(state) {
            return state.testSwitch;
        }
    }
};