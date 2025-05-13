export const createPageSearchRequest = ()=>{
    return {
        filterByRead:false,
        orderByScore:true,
        searchConditionId:null,
        chatId:null,
        channel:"",
        offset:1,
        size:10
    }
}