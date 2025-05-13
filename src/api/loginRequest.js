import axios from 'axios'
import Cookies from "js-cookie";
import notify from "../util/notify";

// 直接使用硬编码的基础URL，因为环境变量可能不可用
const baseURL = process.env.VUE_APP_API_BASE_URL;
const env = process.env.NODE_ENV

console.log('Using API base URL2:', baseURL,env)

const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
})

// Response interceptor
api.interceptors.response.use(
  response => {
      return response.data;
  },
  error => {
    // notify.error(error.response?.data?.msg || '请求失败')
    return Promise.reject(error)
  }
)

export default api
