import { v4 as uuidv4 } from 'uuid';
const actions = ['HasPluginInstalled','BoosGetJobList','BoosGeekInfo'];
export default class PluginMessenger {
    static sendMessage(action, payload, timeout = 5000) {
        if(!actions.includes(action)){
            new Error(action+'is not action')
        }
        return new Promise((resolve, reject) => {
            const messageId = uuidv4(); // 唯一标识符
            payload.id = messageId;
            payload.action = action;
            // 响应处理函数
            const responseHandler = (event) => {
                console.log("event.data.action:",event)
                if (event.data&&event.data.action&&!event.data.action.startsWith("response")) {
                    return;
                }
                if (event.source !== window) return;
                if (event.origin !== window.location.origin) return;
                const responseId=event.data?event.data.id:undefined;
                if (event.data.action === ('response'+action) && responseId!==undefined && responseId=== messageId) {
                    cleanup();
                    resolve(event.data);
                }
            };

            // 添加事件监听器
            window.addEventListener('message', responseHandler);

            // 设置超时
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Request timed out'));
            }, timeout);

            // 发送消息
            //window.postMessage({ action, payload, id: messageId }, window.location.origin);
            window.postMessage(payload, window.location.origin);

            // 清理函数
            const cleanup = () => {
                window.removeEventListener('message', responseHandler);
                clearTimeout(timer);
            };
        });
    }
}