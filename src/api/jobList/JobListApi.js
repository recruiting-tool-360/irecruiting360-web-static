import request from "../request";

//保存列表信息
export const saveJobList = (data) => {
    return request({
        method:'POST',
        url:'/search/saveSearch2',
        data:data
    });
}

