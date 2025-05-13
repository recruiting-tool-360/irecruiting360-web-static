import notify from "src/util/notify";
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
        let buffer = ""; // 缓存数据，避免分割时丢失

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk; // 将每次读取的数据追加到缓冲区

                let lines = buffer.split("\n");
                buffer = lines.pop(); // 将最后一行数据保留在缓冲区
                // const messages = chunk.split("\n").filter(Boolean); // 按行分隔消息
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
        console.log(error)
        if (onError) {
            onError(error);
        } else {
            console.error("Stream error:", error);
        }
        notify.error('AI服务异常，请联系管理员')
    }
};
