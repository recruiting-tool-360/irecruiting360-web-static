import axios from 'axios'
import { ElMessage } from 'element-plus'
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: 'http://localhost:8087',
  timeout: 5000,
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
    ElMessage.error(error.response?.data?.msg || '请求失败')
    return Promise.reject(error)
  }
)

export default api 