export const createPageSearchRequest = ()=>{
    return {
        filterByRead:false,
        searchConditionId:null,
        channel:"",
        offset:1,
        size:10
    }
}