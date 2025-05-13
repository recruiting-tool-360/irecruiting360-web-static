import request from "../request";

//查询用户详情
export const getUserInfo = () => {
    const basseUrl='/user/getUserInfo';
    return request({
        method:'POST',
        url:basseUrl
    });
}


//退出登陆
export const userlogout = () => {
    const basseUrl='/user/logout';
    return request({
        method:'POST',
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

export const wechatLogin = (data) => {
  const basseUrl='/user/wechat/login';
  return request({
    method:'POST',
    url:basseUrl,
    params:data
  });
}


//下载插件
export const getDownloadUrl = () => {
    const basseUrl='/plugin/getDownloadUrl';
    return request({
        method:'GET',
        url:basseUrl
    });
}


// SSO生成令牌
export const generateSsoToken = (data) => {
  const basseUrl = '/sso/generateToken';
  return request({
    method: 'POST',
    url: basseUrl,
    data: data
  });
}

// SSO登录
export const ssoLogin = (token) => {
  const basseUrl = '/sso/login';
  return request({
    method: 'POST',
    url: basseUrl,
    params: { token }
  });
}


