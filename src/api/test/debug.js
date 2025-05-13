import { getChatList, deleteChat, renameChat } from '../chat/ChatApi';

// 测试获取聊天列表
async function testGetChatList() {
  try {
    console.log('测试获取聊天列表...');
    const response = await getChatList();
    console.log('聊天列表响应:', response);
    return response;
  } catch (error) {
    console.error('获取聊天列表失败:', error);
  }
}

// 测试重命名聊天
async function testRenameChat(chatId, newName) {
  try {
    console.log(`测试重命名聊天 ${chatId} 为 ${newName}...`);
    const response = await renameChat(chatId, newName);
    console.log('重命名响应:', response);
    return response;
  } catch (error) {
    console.error('重命名聊天失败:', error);
  }
}

// 测试删除聊天
async function testDeleteChat(chatId) {
  try {
    console.log(`测试删除聊天 ${chatId}...`);
    const response = await deleteChat(chatId);
    console.log('删除响应:', response);
    return response;
  } catch (error) {
    console.error('删除聊天失败:', error);
  }
}

// 运行测试
async function runTests() {
  const chatList = await testGetChatList();
  
  if (chatList && chatList.data && chatList.data.length > 0) {
    const firstChat = chatList.data[0];
    console.log('首个聊天:', firstChat);
    
    // 测试重命名
    await testRenameChat(firstChat.chatId, `测试-${new Date().toISOString()}`);
    
    // 不实际删除聊天
    // await testDeleteChat(firstChat.chatId);
  }
}

// 导出用于调试的函数
export { 
  testGetChatList, 
  testRenameChat, 
  testDeleteChat,
  runTests
};
