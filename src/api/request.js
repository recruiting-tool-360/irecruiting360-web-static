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

//校验结果集
const validateError=(responseData)=>{
//响应结果
    if(responseData){
        if(responseData.success==='success'){
            return responseData;
        }else{
            console.log("服务异常,请联系管理员")
            errorAlert("服务异常","请联系管理员");
        }
    }else{
        console.log("服务异常,请联系管理员")
        errorAlert("服务异常","请联系管理员");
    }
}

export default service
