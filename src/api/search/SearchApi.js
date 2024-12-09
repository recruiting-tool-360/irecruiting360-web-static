import request from "../request";

//保存搜索条件
export const saveCondition = (data) => {
    return request({
        method:'POST',
        url:'/search/saveCondition2',
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

