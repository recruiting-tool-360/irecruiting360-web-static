const state = {
  // ... 其他状态
  needRefreshChatList: false,
}

const mutations = {
  // ... 其他 mutations
  SET_NEED_REFRESH_CHAT_LIST(state, value) {
    state.needRefreshChatList = value
  },
}

const actions = {

}

const getters = {
  // ... 其他 getters
  getNeedRefreshChatList: state => state.needRefreshChatList,
}

export default {
  state,
  mutations,
  actions,
  getters
} 