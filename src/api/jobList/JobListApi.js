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

// 加入三方成功回调
export const importResumeCallback = (data) => {
    return request({
        method:'POST',
        url:'/resume/import/batch/rList',
        data:data
    });
}

// 加入三方成功回调升级版
//传参格式
//其中id是简历id（resumeId）是列表id
/**
 * [
 *         {
 *             "id": "1935636747962683393",
 *             "type": "ASSIGN_POSITIONS",
 *             "status": "1",
 *             "errorMsg": "分配职位成功"
 *         },
 *         {
 *             "id": "1935636747736190976",
 *             "type": "ASSIGN_POSITIONS",
 *             "status": "1",
 *             "errorMsg": "分配职位成功"
 *         },
 *         {
 *             "id": "1935636747526475776",
 *             "type": "ASSIGN_POSITIONS",
 *             "status": "1",
 *             "errorMsg": "分配职位成功"
 *         }
 *       ]
 */
export const importResumeCallbackPlus = (data) => {
    return request({
        method:'POST',
        url:'/resume/import/batch/importResume',
        data:data
    });
}


