import axios from "axios";
import { Notify, Dialog } from 'quasar';
import notify from "../util/notify";
import Cookies from "js-cookie";

// 直接使用硬编码的基础URL，因为环境变量可能不可用
const baseURL = process.env.VUE_APP_API_BASE_URL;
const env = process.env.NODE_ENV

console.log('Using API base URL:', baseURL,env)

const service = axios.create({
    baseURL: baseURL,
    timeout: 15000,
    withCredentials: true
})

// ✅ 请求拦截器：每次请求都加上 satoken
service.interceptors.request.use(config => {
  const token = Cookies.get('satoken')
  if (token) {
    config.headers['satoken'] = token  // 你也可以用 Authorization 或其他名称
  }
  return config
}, error => {
  return Promise.reject(error)
})

// 结果集处理器
service.interceptors.response.use(
    res => {
        if(res.status===200){
            return validateError(res.data);
        }else{
            console.log("服务异常,请联系管理员")
            return Promise.reject(new Error("服务异常,请联系管理员"))
        }
    },
    err => {
        console.log("服务异常,请联系管理员")
        errorAlert("服务异常","请联系管理员");
        return Promise.reject(err);
    }
)

// 使用通知组件
const errorAlert = (title, message) => {
    notify.error(message || title);
}

/**
 * "登录态过期 / token 失效"业务错误判定：success!=='success' + errorMessage 含 'token'
 *   - 客户端模式 → 拦截，弹 IhrAuthModal（i 人事登录授权弹框）
 *   - 浏览器模式 → redirectToLogin 内部仍然走 /login 跳转
 *
 * 典型后端响应：
 *   { success: 'fail', errorCode: 'USER_001', errorMessage: '未能读取到有效 token' }
 *
 * 跟通用业务失败区分：业务失败弹"服务异常"通用提示，token 失效弹登录授权框，UX 更准确。
 */
function isTokenInvalidError(responseData) {
  if (!responseData || responseData.success === 'success') return false;
  const msg = String(responseData.errorMessage || '').toLowerCase();
  return msg.includes('token');
}

//校验结果集
const validateError=(responseData)=>{
//响应结果
    if(responseData){
        if(responseData.success==='success'){
            return responseData;
        }else{
            // 业务侧失败：把后端真实响应打到 console，方便排查（拦截器之前只 log 通用文案，
            // 业务方拿到的是 undefined，看不到 code/message/data 之类的具体错误原因）
            console.warn(
              '[request.js] 后端业务失败 success!==success | 完整响应=',
              responseData
            );

            // token 失效 → 弹 IhrAuthModal 让用户重新授权（客户端模式）
            // 浏览器模式 redirectToLogin 内部跳 /login
            if (isTokenInvalidError(responseData)) {
              console.warn(
                '[request.js] 检测到 token 失效，触发 redirectToLogin',
                { errorCode: responseData.errorCode, errorMessage: responseData.errorMessage }
              );
              // 动态 import 避免顶层循环依赖（redirectToLogin 内部 dynamic import store）
              import("../util/redirectToLogin").then((m) => {
                const fn = m.redirectToLogin || m.default;
                if (typeof fn === 'function') {
                  fn({ reason: `api_token_invalid:${responseData.errorCode || ''}` });
                }
              }).catch((e) => {
                console.warn('[request.js] 加载 redirectToLogin 异常:', e?.message || e);
              });
              // 不再额外弹"服务异常"通用提示，避免双 notify 干扰
              return;
            }

            errorAlert("服务异常","请联系管理员");
        }
    }else{
        console.log("服务异常,请联系管理员")
        errorAlert("服务异常","请联系管理员");
    }
}

export default service
