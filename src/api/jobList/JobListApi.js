import request from "../request";

//保存列表信息
export const saveJobList = (data) => {
    return request({
        method:'POST',
        url:'/search/saveSearch2',
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



