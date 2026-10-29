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

    let ended = false;
    const finishStream = () => {
      if (ended) return;
      ended = true;
      if (typeof endStream === "function") endStream();
    };

    /**
     * 兼容两种后端响应：
     *   1. 标准 SSE：data: {...}\n\n / data: [DONE]\n\n
     *   2. 原始 JSON：{...}（部分环境不会补 data: 前缀或末尾换行）
     *
     * @returns {boolean} true 表示收到 [DONE]
     */
    const consumePayload = (raw) => {
      let payload = String(raw ?? "").trim();
      if (!payload || payload.startsWith(":") || /^(event|id|retry):/.test(payload)) {
        return false;
      }
      if (payload.startsWith("data:")) payload = payload.slice(5).trim();
      if (!payload) return false;
      if (payload === "[DONE]") return true;

      // 只把 JSON 数据交给调用方；忽略 SSE 注释和异常文本行。
      if (payload.startsWith("{") || payload.startsWith("[")) {
        onMessage(payload);
      }
      return false;
    };

    // 普通 JSON 响应直接整体解析，避免多行 pretty JSON 被逐行截断。
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await response.text();
      consumePayload(body);
      finishStream();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("UTF-8");
    let buffer = "";
    let done = false;

    while (!done) {
      // 检查是否已中断
      if (abortController && abortController.signal.aborted) {
        console.log("🛑 检测到请求已中断，停止读取流");
        reader.cancel();
        break;
      }

      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (consumePayload(line)) {
            done = true;
            finishStream();
            break;
          }
        }
      }
    }

    if (abortController?.signal.aborted) return;

    // 关键兜底：服务端最后一行没有换行时，也要在流结束时处理缓冲区。
    buffer += decoder.decode();
    if (buffer.trim() && consumePayload(buffer)) {
      finishStream();
      return;
    }

    finishStream();
  } catch (error) {
    console.log(error);

    // 检查是否是中断错误
    if (error.name === "AbortError") {
      console.log("📡 流请求被用户中断");
      // 不显示错误通知，因为是正常的中断操作
      return;
    }

    if (onError) {
      onError(error);
    } else {
      console.error("Stream error:", error);
    }
    notify.error("AI服务异常，请联系管理员");
  }
};
