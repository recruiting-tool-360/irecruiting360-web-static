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

//已读标识
export const markResumeBlindReadStatus = (resumeBlindIds, readStatus) => {
    const basseUrl='/resume/markResumeBlindReadStatus';
    return request({
        method: 'POST',
        url: basseUrl,
        data: {                            // 查询参数
            resumeBlindIds: resumeBlindIds,
            status: readStatus
        }
    });
}


export const userCollectResume = (data)=>{
    const basseUrl='/resume/userCollectResume';
    return request({
        method: 'POST',
        url: basseUrl,
        data: data
    });
}



