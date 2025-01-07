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
        url:'ihire/chat/getChatHistory?chatId='+chatId+"&userId="+userId
    });
}

//清理历史对话
export const clearChatHistory = (chatId,userId) => {
    return request({
        method:'GET',
        url:'ihire/chat/clearChatHistory?chatId='+chatId+"&userId="+userId
    });
}

//查询搜索条件
export const getCurrentConditionByChatId = (chatId) => {
    return request({
        method:'GET',
        url:'ihire/chat/getCurrentConditionByChatId?chatId='+chatId
    });
}

