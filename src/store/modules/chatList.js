const state = {
  activeChatId: '', // 当前激活的聊天 ID
  needRefreshList: false, // 是否需要刷新列表
  latestChatId: '',//最新chatId
  latestPositionId: '', // 最新职位ID
  chatListData: [], // 聊天列表数据
}

const mutations = {
  SET_ACTIVE_CHAT_ID(state, chatId) {
    state.activeChatId = chatId
  },
  SET_LATEST_CHAT_ID(state, chatId) {
    state.latestChatId = chatId
  },
  SET_LATEST_POSITION_ID(state, positionId) {
    state.latestPositionId = positionId
  },
  SET_NEED_REFRESH_LIST(state, status) {
    state.needRefreshList = status
  },
  SET_CHAT_LIST(state, list) {
    state.chatListData = list
  },
  // 添加单个聊天到列表中
  ADD_CHAT(state, chat) {
    state.chatListData.unshift(chat) // 添加到列表顶部
  },
  // 更新聊天名称
  UPDATE_CHAT_NAME(state, { chatId, newName }) {
    const chat = state.chatListData.find(item => item.id === chatId)
    if (chat) {
      chat.name = newName
    }
  },
  // 从列表中删除聊天
  REMOVE_CHAT(state, chatId) {
    state.chatListData = state.chatListData.filter(chat => chat.id !== chatId)
  }
}

const actions = {
  // 加载聊天列表
  updateChatList({ commit }, chatList) {
    commit('SET_CHAT_LIST', chatList)
  },
  // 添加新的聊天
  addChat({ commit }, chat) {
    commit('ADD_CHAT', chat)
  },
  // 更新聊天名称
  renameChatAction({ commit }, { chatId, newName }) {
    commit('UPDATE_CHAT_NAME', { chatId, newName })
  },
  // 删除聊天
  deleteChatAction({ commit, state }, chatId) {
    commit('REMOVE_CHAT', chatId)
    
    // 如果删除的是当前选中的聊天，清除当前选中状态
    if (state.latestChatId === chatId) {
      commit('SET_LATEST_CHAT_ID', '')
      commit('SET_LATEST_POSITION_ID', '')
    }
  }
}

const getters = {
  getActiveChatId: state => state.activeChatId,
  getLatestChatId: state => state.latestChatId,
  getLatestPositionId: state => state.latestPositionId,
  getNeedRefreshList: state => state.needRefreshList,
  getChatList: state => state.chatListData,
  // 获取指定ID的聊天
  getChatById: state => chatId => {
    return state.chatListData.find(chat => chat.id === chatId) || null
  }
}

export default {
  state,
  mutations,
  actions,
  getters
} 