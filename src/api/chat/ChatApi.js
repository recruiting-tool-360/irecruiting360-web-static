import request from "../request";
import { traceApiCall } from "src/util/apiTrace";

//查询当前User是否有对话
export const getChatIdByUserId = (userId) => {
    return request({
        method:'GET',
        url:'/ihire/chat/getChatId?userId='+userId
    });
}


/**
 * 查询历史对话
 *
 * 两种模式：
 *   1) 不传 pagination → 走旧逻辑，返回最近 count 轮（默认 10）
 *   2) 传 { pageNo, pageSize } → 启用分页
 *       - pageNo=1 返回**最新一页**（页内时间正序：旧→新）
 *       - pageNo=2 返回更早一页（用于"向上滚动加载更老消息"）
 *       - 返回结构多 { pageNo, pageSize, total, totalPage, hasNext, hasPrevious }
 *
 * @param {string} chatId
 * @param {string|number} userId
 * @param {{ pageNo?: number, pageSize?: number }} [pagination]
 */
export const getChatHistory = (chatId, userId, pagination) => {
    const params = { chatId, userId };
    if (pagination?.pageNo != null) params.pageNo = pagination.pageNo;
    if (pagination?.pageSize != null) params.pageSize = pagination.pageSize;
    return request({
        method: 'GET',
        url: '/ihire/chat/getChatHistory',
        params
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


const HARNESS_PROFILE_SOURCE = "IHIRE_CHAT_PROFILE_EDIT";

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (_e) {
        // 非 JSON 字符串不属于画像数组，继续找下一个候选值。
      }
    }
  }
  return [];
}

/**
 * 兼容调用方曾误传的扁平结构，但对外始终只发送后端约定的嵌套结构。
 */
export function buildUpdateHarnessProfilePayload(data = {}) {
  const profile = data?.profile && typeof data.profile === "object" ? data.profile : {};
  return {
    chatId: data?.chatId,
    source: HARNESS_PROFILE_SOURCE,
    profile: {
      structured: firstArray(
        profile.structured,
        profile.structuredContent,
        data?.structured,
        data?.structuredContent
      ),
      tagContent: firstArray(profile.tagContent, data?.tagContent)
    }
  };
}

/**
 * 保存职位画像（基础评估标准）。
 *
 * 后端约定：
 *   - 请求体为 { chatId, source, profile: { structured, tagContent } }
 *   - structured / tagContent 直接传数组（不是 JSON 字符串）
 *   - 完整对象原样回写，只改 rule_type / weight / display_value / dataTypeValue
 *   - source 固定 IHIRE_CHAT_PROFILE_EDIT
 *
 * @param {{chatId: string|number, source: string, profile: {structured: Array, tagContent: Array}}} data
 */
export const updateHarnessProfile = (data) => {
  const payload = buildUpdateHarnessProfilePayload(data)
  return traceApiCall({
    tag: 'portrait-api',
    method: 'POST',
    path: '/ihire/chat/updateHarnessProfile',
    payload,
    run: () =>
      request({
        url: '/ihire/chat/updateHarnessProfile',
        method: 'POST',
        data: payload
      })
  })
}
