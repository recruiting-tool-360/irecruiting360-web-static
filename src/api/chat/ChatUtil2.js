export const fetchStream = async (url, data, onMessage, onError) => {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        if (!response.body) {
            throw new Error("ReadableStream not supported or body is null.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let done = false;

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                onMessage(chunk); // 将每次接收到的数据块传递给回调
            }
        }
    } catch (error) {
        if (onError) {
            onError(error);
        } else {
            console.error("Stream error:", error);
        }
    }
};
