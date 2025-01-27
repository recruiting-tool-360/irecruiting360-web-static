import axios from "axios";
import {ElMessage,ElNotification} from "element-plus";
import store from '@/store';

const service=axios.create({
    baseURL: '/api',
    timeout:15000,
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

// const errorAlert=(title,message)=>{
//     ElNotification({
//         title: title,
//         duration: 3000,
//         customClass:"notice",
//         message: message,
//         type: 'error',
//     })
// }
const errorAlert=(title,message)=>{
    // ElNotification({
    //     title: title,
    //     duration: 3000,
    //     customClass:"notice",
    //     message: message,
    //     type: 'error',
    // })
    ElMessage.error(title,message);
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

// 添加流接口支持
// service.stream = (url, data, onMessage, onError) => {
//     const source = axios.CancelToken.source();
//     axios({
//         method: 'POST',
//         url,
//         data,
//         responseType: 'stream', // 确保流的支持
//         cancelToken: source.token,
//     })
//         .then(response => {
//             console.log("stream结果集：",response)
//             const reader = response.data.getReader();
//             const decoder = new TextDecoder('utf-8');
//
//             const read = () => {
//                 reader.read().then(({ done, value }) => {
//                     if (done) {
//                         console.log("Stream finished");
//                         return;
//                     }
//                     const text = decoder.decode(value);
//                     onMessage(text); // 回调处理流数据
//                     read(); // 继续读取
//                 }).catch(err => {
//                     console.error("Error reading stream", err);
//                     if (onError) onError(err);
//                 });
//             };
//
//             read();
//         })
//         .catch(error => {
//             console.error("Streaming error", error);
//             if (onError) onError(error);
//         });
//
//     return source; // 返回用于取消请求的 source
// };

// 添加流式请求方法
// service.stream = (url, data, onMessage, onError) => {
//     const source = new AbortController(); // 用于取消请求
//     axios
//         .post(url, data, {
//             signal: source.signal, // 绑定取消信号
//             responseType: "stream", // 标记为流式响应
//         })
//         .then((response) => {
//             console.log("结果集data：",response)
//             const reader = response.data.getReader();
//             console.log("结果集data：",reader)
//             const decoder = new TextDecoder("utf-8");
//
//             const processStream = () => {
//                 reader.read().then(({ done, value }) => {
//                     if (done) return;
//
//                     const chunk = decoder.decode(value, { stream: true });
//                     onMessage(chunk); // 处理每个消息块
//
//                     processStream(); // 递归读取
//                 });
//             };
//
//             processStream();
//         })
//         .catch((error) => {
//             if (onError) {
//                 onError(error);
//             } else {
//                 console.error("Streaming error", error);
//             }
//         });
//
//     return {
//         cancel: () => source.abort(),
//     };
// };

export default service