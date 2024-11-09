import axios from "axios";
import {ElMessage,ElNotification} from "element-plus";
import store from '@/store';

const service=axios.create({
    baseURL: '/api',
    timeout:5000,
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
        new Error("服务异常,请联系管理员")
    }
)

const errorAlert=(title,message)=>{
    ElNotification({
        title: title,
        duration: 3000,
        customClass:"notice",
        message: message,
        type: 'error',
    })
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