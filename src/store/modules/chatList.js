const state = {
  activeChatId: '', // 当前激活的聊天 ID
  needRefreshList: false, // 是否需要刷新列表
  latestChatId: '',//最新chatId
  SET_LATEST_POSITION_ID: '',
}

const mutations = {
  SET_ACTIVE_CHAT_ID(state, chatId) {
    state.activeChatId = chatId
  },
  SET_LATEST_CHAT_ID(state, chatId) {
    state.latestChatId = chatId
  },
  SET_NEED_REFRESH_LIST(state, status) {
    state.needRefreshList = status
  }
}

const actions = {

}

const getters = {
  getActiveChatId: state => state.activeChatId,
  getLatestChatId: state => state.latestChatId,
  getNeedRefreshList: state => state.needRefreshList,
}

export default {
  state,
  mutations,
  actions,
  getters
} 