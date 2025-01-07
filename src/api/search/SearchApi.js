import request from "../request";

//生成搜索条件
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


//插入搜索条件
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

//校验搜索条件名称
export const collectedConditionNameExists = (userId,collectedConditionName) => {
    const basseUrl='/search/collectedConditionNameExists?';
    return request({
        method:'GET',
        url:basseUrl+'userId='+userId+'&collectedConditionName='+collectedConditionName
    });
}

//修改搜索条件
export const updateSearchConditionCollection = (userId,collectedConditionName,searchConditionId) => {
    const basseUrl='/search/updateSearchConditionCollection?';
    return request({
        method:'POST',
        url:basseUrl+'userId='+userId+'&collectedConditionName='+collectedConditionName+'&searchConditionId='+searchConditionId
    });
}

//删除搜索条件
export const cancelSearchConditionCollection = (searchConditionId) => {
    const basseUrl='/search/cancelSearchConditionCollection?';
    return request({
        method:'POST',
        url:basseUrl+'searchConditionId='+searchConditionId
    });
}

//获取页面搜索条件配置
export const getSearchConditionDefaultDicts = () => {
    const basseUrl='/search/getSearchConditionDefaultDicts';
    return request({
        method:'GET',
        url:basseUrl
    });
}
//查询搜详细简历
export const getGeekDetail2 = (id) => {
    const basseUrl='/test5';
    return request({
        method:'GET',
        url:basseUrl
    });
}
