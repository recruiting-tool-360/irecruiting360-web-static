import request from "../request";

//保存列表信息
export const saveJobList = (data) => {
    return request({
        method:'POST',
        url:'/search/saveSearch',
        data:data
    });
}

//保存详细简历信息
export const saveResumeDetail = (data) => {
    return request({
        method:'POST',
        url:'/resume/saveResumeDetail',
        data:data
    });
}

//保存详细简历信息
export const getScoreList = (data) => {
    return request({
        method:'POST',
        url:'/resume/getScoreList',
        data:data
    });
}

//查询搜详细简历
export const getGeekDetail = (id) => {
    const basseUrl='/resume/queryResumeDetailByResumeBlindId?resumeBlindId=';
    return request({
        method:'GET',
        url:basseUrl+id
    });
}



