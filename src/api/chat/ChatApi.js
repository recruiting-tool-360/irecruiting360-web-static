import request from "../request";

//查询当前User是否有对话
export const getChatIdByUserId = (userId) => {
    return request({
        method:'GET',
        url:'/ihire/chat/getChatId?userId='+userId
    });
}


//查询历史对话
export const getChatHistory = (chatId,userId) => {
    return request({
        method:'GET',
        url:'/ihire/chat/getChatHistory?chatId='+chatId+"&userId="+userId
    });
}

/**
 * 清理历史对话（保留 chatId，只清这个 chat 下的消息历史）
 *
 * 后端：@RequestMapping(value = "/ihire/chat/clearChatHistory", method = {GET, POST})
 *        Response<String> clearChatHistory(@RequestParam("chatId") String chatId)
 *
 * - 只要 chatId（不需要 userId，后端从登录态拿）
 * - 用 POST + params（chatId 走 query string，跟后端 @RequestParam 对应）
 * - 用 axios `params` 让 chatId 安全 encode，避免含 `+ / & =` 等特殊字符时出 bug
 */
export const clearChatHistory = (chatId) => {
    return request({
        method: 'POST',
        url: '/ihire/chat/clearChatHistory',
        params: { chatId }
    });
}

//查询搜索条件
export const getCurrentConditionByChatId = (chatId) => {
    return request({
        method:'GET',
        url:'/ihire/chat/getCurrentConditionByChatId?chatId='+chatId
    });
}

/**
 * 获取聊天列表
 * @returns {Promise} 返回聊天列表数据
 */
export const getChatList = () => {
  return request({
    url: '/ihire/chat/chatList',
    method: 'GET'
  })
}

/**
 * 删除聊天记录
 * @param {string} chatId - 聊天ID
 * @returns {Promise} 返回删除操作的结果
 */
export const deleteChat = (chatId) => {
  return request({
    url: `/ihire/chat/deleteChat`,
    method: 'POST',
    params: {
      chatId
    }
  })
}

/**
 * 重命名聊天
 * @param {string} chatId - 聊天ID
 * @param {string} newName - 新名称
 * @returns {Promise} 返回重命名操作的结果
 */
export const renameChat = (chatId, newName) => {
  return request({
    url: '/ihire/chat/renameChat',
    method: 'POST',
    params: {
      chatId,
      newName
    }
  })
}

/**
 * 创建新聊天
 * @param {Array} conversationHistoryList - 对话历史记录列表
 * @returns {Promise} 返回创建聊天的结果
 */
export const createChat = (conversationHistoryList) => {
  return request({
    url: '/ihire/chat/createChatPlus',
    method: 'POST',
    data: conversationHistoryList
  })
}

