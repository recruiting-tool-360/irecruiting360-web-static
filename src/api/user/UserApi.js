import request from "../request";

//获取页面搜索条件配置
export const getUser = () => {
    const basseUrl='/user/getUserInfo';
    return request({
        method:'GET',
        url:basseUrl
    });
}

export const isLogin = () => {
    const basseUrl='/user/isLogin';
    return request({
        method:'GET',
        url:basseUrl
    });
}

export const userLogin = (data) => {
    const basseUrl='/user/doLogin';
    return request({
        method:'POST',
        url:basseUrl,
        params:data
    });
}

