export const getChatTemplate = ()=>{
    return {
        role:null,
        content:null,
        created:null,
        id:null,
        model:null,
        object:null,
        usage:null,
        chatId:null,
        searchConditionId:null,
        // streamChat 可能带：上一次搜索任务 id。AI 职位画像卡片有这个 + searchConditionId 时，
        // 底部按钮从「启动聚合搜索」切成「清空重新搜索 / 保留增量搜索」。
        previousSearchTaskId:null,
        userId:null
    }
}