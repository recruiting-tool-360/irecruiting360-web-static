const state = {
  activeChatId: '', // 当前激活的聊天 ID
  needRefreshList: false, // 是否需要刷新列表
  latestChatId: '',//最新chatId
  latestPositionId: '', // 最新职位ID
  /**
   * 用户从左侧菜单**主动选中**的职位 id（chat.positionId 或 chat.id），
   * 跟业务用的 latestChatId 解耦。
   *
   *   - 默认空字符串
   *   - LeftMenu selectChat 时设置
   *   - UI 空状态（ChatEmptyState）的唯一判定依据
   *   - 持久化到 localStorage（vuex-persistedstate paths 配置）
   */
  chosenJobId: '',
  chatListData: [], // 聊天列表数据
  /**
   * 职位 ID → JD 文本缓存（Plain Object，key=positionId, value=jd 文本）。
   *
   * 来源：
   *   1. 浏览器模式 SSO 流：父页 ihr360-recruit-static iframeMsg.post('init', { positionList:[{positionId, jd, ...}] })
   *      → SSOLogin.vue 收到后 commit 'SET_POSITION_JD_CACHE' 全量覆盖
   *   2. 客户端模式 deep-link 流：暂未填 jd（SSOLogin.rebuildPositionList 注释 TODO），
   *      由 LeftMenu hydrateJobDescriptionsFromIhr 后端拉详情现算 → commit 'PATCH_POSITION_JD_CACHE' 单条
   *
   * 用途：
   *   LeftMenu.loadChatList 拿到的 chatList 后端**不返 jd 字段**，
   *   需要按 positionId 在本 cache 里查 jd 文本回填到 chat item，
   *   让"选中职位自动发 JD"功能能拿到内容。
   */
  positionJdCache: {},
  /**
   * 服务端通过 SSE (scenario='CHAT') 主动推过来的消息事件（瞬时）。
   *
   * 形态：{ chatId, message: { id, role, content, timestamp, messageType }, _ts }
   *   - _ts: commit 时间戳，让同样 message.id 重复推也能触发 watch（手动改成单调递增的 ts）
   *
   * 用途：ChatCard 监听这个字段，命中当前 chatId 时把 message push 到 internalMessages，
   *      用 v-html 渲染 content（messageType=TASK_COMPLETION_CARD 等富文本消息）。
   *
   * 不持久化：这是个事件触发器，每次 SSE 推完就重置（commit 新值）即可。
   */
  serverPushedMessage: null,
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
  SET_CHOSEN_JOB_ID(state, jobId) {
    state.chosenJobId = jobId || ''
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
  },
  /**
   * 服务端 SSE 推来的聊天消息事件（ChatCard watch 触发渲染）。
   * @param {{ chatId: string, message: object }} payload
   */
  SET_SERVER_PUSHED_MESSAGE(state, payload) {
    if (!payload || !payload.chatId || !payload.message) return
    state.serverPushedMessage = {
      chatId: payload.chatId,
      message: payload.message,
      _ts: Date.now() // 让相同 message.id 重复推时 watch 仍能触发
    }
  },
  /**
   * 全量覆盖 positionJdCache。
   * @param {Array<{ positionId: string|number, jd: string }>} list
   */
  SET_POSITION_JD_CACHE(state, list) {
    if (!Array.isArray(list)) return
    const next = {}
    for (const item of list) {
      if (!item || !item.positionId) continue
      if (typeof item.jd === 'string' && item.jd.trim() !== '') {
        next[String(item.positionId)] = item.jd
      }
    }
    state.positionJdCache = next
  },
  /**
   * 单条 patch（追加 / 覆盖某个 positionId 的 jd）
   * @param {{ positionId: string|number, jd: string }} entry
   */
  PATCH_POSITION_JD_CACHE(state, entry) {
    if (!entry || !entry.positionId) return
    if (typeof entry.jd !== 'string' || entry.jd.trim() === '') return
    state.positionJdCache = {
      ...state.positionJdCache,
      [String(entry.positionId)]: entry.jd
    }
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
      commit('SET_CHOSEN_JOB_ID', '')
    }
  }
}

const getters = {
  getActiveChatId: state => state.activeChatId,
  getLatestChatId: state => state.latestChatId,
  getLatestPositionId: state => state.latestPositionId,
  getChosenJobId: state => state.chosenJobId,
  getNeedRefreshList: state => state.needRefreshList,
  getChatList: state => state.chatListData,
  // 获取指定ID的聊天
  getChatById: state => chatId => {
    return state.chatListData.find(chat => chat.id === chatId) || null
  },
  /** 按 positionId 查 JD 文本；缺失返回 '' */
  getJdByPositionId: state => positionId => {
    if (!positionId) return ''
    return state.positionJdCache[String(positionId)] || ''
  },
  getPositionJdCache: state => state.positionJdCache,
}

export default {
  state,
  mutations,
  actions,
  getters
} 