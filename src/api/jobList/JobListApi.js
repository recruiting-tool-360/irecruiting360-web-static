import request from "../request";

//保存列表信息
export const saveJobList = (data) => {
    return request({
        method:'POST',
        url:'/search/saveSearch',
        data:data
    });
}

//保存列表信息
export const saveSearchPlus = (data) => {
  return request({
    method:'POST',
    url:'/search/saveSearchPlus',
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
export const saveResumeDetailPlus = (data) => {
  return request({
    method:'POST',
    url:'/resume/saveResumeDetailPlus',
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

export const queryScoreList = (data) => {
    return request({
        method:'POST',
        url:'/resume/queryScoreList',
        data:data
    });
}

export const setNotScore = (data) => {
  return request({
    method:'POST',
    url:'/resume/setNotScore',
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

//获取ai评估
export const getScoreListDetailed = (resumeBlindIds) => {
    return request({
        method: 'POST',
        url: '/resume/getScoreListDetailed',
        data: resumeBlindIds
    });
}

export const getScoreListDetailedPlus = (data) => {
    return request({
        method:'POST',
        url:'/resume/getScoreListDetailedPlus',
        data:data
    });
}


export const getResumeBlindList = (data) => {
    return request({
        method:'POST',
        url:'/resume/queryResumeDetailList',
        data:data
    });
}



