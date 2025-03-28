import request from "../request";

//获取搜索条件
export const generateSearchCondition = (resumeBlindId,searchId) => {
    return request({
        method:'GET',
        url:'/research/generateSearchCondition2?resumeBlindId='+resumeBlindId+'&searchId='+searchId
    });
}

export const compareResumeSimilarity = (data) => {
    return request({
        method:'POST',
        url:'/research/compareResumeSimilarity2',
        data:data
    });
}

