import notify from "src/util/notify";

export const fetchStream = async (url, data, onMessage, onError, endStream, abortController) => {
    try {
        // 构建 fetch 配置
        const fetchConfig = {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify(data),
        };

        // 如果有 abortController，添加 signal
        if (abortController) {
            fetchConfig.signal = abortController.signal;
        }

        const response = await fetch(url, fetchConfig);

        if (response.status !== 200 || !response.body) {
            throw new Error("ReadableStream not supported or body is null.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("UTF-8");

        let done = false;
        let buffer = ""; // 缓存数据，避免分割时丢失

        while (!done) {
            // 检查是否已中断
            if (abortController && abortController.signal.aborted) {
                console.log('🛑 检测到请求已中断，停止读取流');
                reader.cancel(); // 取消读取器
                break;
            }

            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk; // 将每次读取的数据追加到缓冲区

                let lines = buffer.split("\n");
                buffer = lines.pop(); // 将最后一行数据保留在缓冲区

                for (const message of lines) {
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
        console.log(error);

        // 检查是否是中断错误
        if (error.name === 'AbortError') {
            console.log('📡 流请求被用户中断');
            // 不显示错误通知，因为是正常的中断操作
            return;
        }

        if (onError) {
            onError(error);
        } else {
            console.error("Stream error:", error);
        }
        notify.error('AI服务异常，请联系管理员');
    }
};