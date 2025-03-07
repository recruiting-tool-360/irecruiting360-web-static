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

//清理历史对话
export const clearChatHistory = (chatId,userId) => {
    return request({
        method:'GET',
        url:'/ihire/chat/clearChatHistory?chatId='+chatId+"&userId="+userId
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

