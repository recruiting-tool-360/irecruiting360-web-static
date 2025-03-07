const state = {
  activeChatId: '', // 当前激活的聊天 ID
  needRefreshList: false, // 是否需要刷新列表
}

const mutations = {
  SET_ACTIVE_CHAT_ID(state, chatId) {
    state.activeChatId = chatId
  },
  SET_NEED_REFRESH_LIST(state, status) {
    state.needRefreshList = status
  }
}

const actions = {

}

const getters = {
  getActiveChatId: state => state.activeChatId,
  getNeedRefreshList: state => state.needRefreshList,
}

export default {
  state,
  mutations,
  actions,
  getters
} 