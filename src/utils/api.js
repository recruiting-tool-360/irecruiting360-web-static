import axios from 'axios'
import { ElMessage } from 'element-plus'
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: process.env.VUE_APP_API_BASE_URL,
  timeout: 5000,
  withCredentials:true
})

// Response interceptor
api.interceptors.response.use(
  response => {
      return response.data;
  },
  error => {
    ElMessage.error(error.response?.data?.msg || '请求失败')
    return Promise.reject(error)
  }
)

export default api 