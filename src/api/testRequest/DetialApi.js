import axios from 'axios';
import {ElMessage} from "element-plus";

//调用接口获取html文本
export const getHTMlDom = async (url) => {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            headers: {'Content-Type': 'text/html; charset=utf-8'},
            responseType: 'text', // 返回文本数据
        });

        return response.data; // 返回 HTML 文本
    } catch (error) {
        console.error('Error fetching HTML content:', error);
        ElMessage.error("服务异常","请联系管理员");
        throw error; // 抛出错误，便于外部捕获
    }
}