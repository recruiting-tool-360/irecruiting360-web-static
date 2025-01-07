import { ElMessage } from 'element-plus'
export const fetchStream = async (url, data, onMessage, onError,endStream) => {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify(data),
        });

        if (response.status!==200 || !response.body) {
            throw new Error("ReadableStream not supported or body is null.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("UTF-8");

        let done = false;

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                const messages = chunk.split("\n").filter(Boolean); // 按行分隔消息
                for (const message of messages) {
                    if (message.startsWith("data:")) {
                        const data = message.substring(5).trim();
                        if (data === "[DONE]") {
                            // 流结束
                            done = true;
                            endStream();
                            break;
                        }
                        onMessage(data); // 将每次接收到的数据块传递给回调
                    }
                }
            }
        }
    } catch (error) {
        console.log(error)
        if (onError) {
            onError(error);
        } else {
            console.error("Stream error:", error);
        }
        ElMessage.error('AI服务异常，请联系管理员');
    }
};
