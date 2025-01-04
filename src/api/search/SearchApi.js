import request from "../request";

//保存搜索条件
export const saveCondition = (data) => {
    return request({
        method:'POST',
        url:'/search/saveCondition',
        data:data
    });
}

//分页查询列表
export const querySearch = (data) => {
    return request({
        method:'POST',
        url:'/search/querySearchResult',
        data:data
    });
}


//分页查询列表
export const addSearchConditionCollection = (searchConditionId,collectedName) => {
    return request({
        method:'POST',
        url:'/search/addSearchConditionCollection?searchConditionId='+searchConditionId+'&collectedName='+collectedName
    });
}

//查询搜索条件
export const querySearchConditionCollection = (userId,keyword) => {
    const basseUrl='/search/querySearchConditionCollection?';
    return request({
        method:'GET',
        url:keyword?basseUrl+'userId='+userId+'&keyword='+keyword:basseUrl+'userId='+userId
    });
}

//查询搜详细简历
export const getGeekDetail = (id) => {
    const basseUrl='/test5';
    return request({
        method:'GET',
        url:basseUrl
    });
}
