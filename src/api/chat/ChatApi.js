import request from "../request";

const streamService = {
    /**
     * 通用流接口调用方法
     * @param {string} url - 请求的接口地址
     * @param {Object} data - 请求参数
     * @param {Function} onMessage - 消息处理回调
     * @param {Function} [onError] - 错误处理回调（可选）
     * @returns {Object} - 返回一个包含取消流请求的方法
     */
    streamRequest(url, data, onMessage, onError) {
        const source = request.stream(
            url,
            data,
            (message) => {
                if (onMessage && typeof onMessage === "function") {
                    onMessage(message);
                }
            },
            (error) => {
                if (onError && typeof onError === "function") {
                    onError(error);
                } else {
                    console.error("Stream error:", error);
                }
            }
        );

        return {
            cancel: () => source.cancel("Request cancelled by user"),
        };
    },
};

export default streamService;

/**
 * 调用流式chat接口 TODO: 暂时不用流式
 * 如果没有传chatId，后端会自己生成一个
 * @param ChatRequest
 * @return https://cookbook.openai.com/examples/how_to_stream_completions
 * resp json 额外增加了生成的chatId作为返回
 */
// export const streamChat = (data) => {
//     return request({
//         method:'POST',
//         url:'/ihire/chat/streamChat',
//         data:data
//     });
// }

