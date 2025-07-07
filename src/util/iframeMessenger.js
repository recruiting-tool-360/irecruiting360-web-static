/**
 * iframeMessenger.js
 * 双向 iframe 通信工具，用于主页面（A）与嵌套 iframe 页面（B）之间的消息收发。
 * 支持异步消息通信，可以等待接收方返回消息。
 */

class IframeMessenger {
  constructor({
    targetWindow,
    targetOrigin = "*",
    sourceName = "default-source", 
    timeout = 15000 // 默认超时时间15秒
  }) {
    this.targetWindow = targetWindow;
    // 将 targetOrigin 转换为数组格式
    this.targetOrigins = Array.isArray(targetOrigin) 
      ? targetOrigin 
      : [targetOrigin];
    this._lastReceivedOrigin = null; // 添加属性来存储最后一次接收到消息的域名
    this.sourceName = sourceName;
    this.timeout = timeout;
    this.handlers = new Map();
    this.pendingMessages = new Map();
    this.messageListener = this.handleMessage.bind(this);
    this.isConnected = false;
    window.addEventListener("message", this.messageListener);
  }

  validateMessage(data) {
    return (
      typeof data === "object" &&
      data !== null &&
      typeof data.type === "string" &&
      typeof data.from === "string"
    );
  }

  async handleMessage(event) {
    try {
      // 调试日志
      console.group('IframeMessenger 收到消息');
      console.log('Origin:', event.origin);
      console.log('Data:', event.data);
      console.log('Source:', event.source);
      console.groupEnd();

      // 检查是否来自允许的域名
      const isValidOrigin =
        this.targetOrigins.some(originRule => {
          if (originRule === '*') return true;
          if (originRule instanceof RegExp) return originRule.test(event.origin);
          return originRule === event.origin;
        });

      if (!isValidOrigin) {
        console.warn(`Message from unauthorized origin: ${event.origin}`);
        return;
      }

      // 记录最后一次接收到消息的域名
      this._lastReceivedOrigin = event.origin;

      if (!event.data) {
        console.warn("Received empty message");
        return;
      }

      if (!this.validateMessage(event.data)) {
        console.warn("Invalid message format received");
        return;
      }

      const { type, data, from, messageId, isResponse } = event.data;

      // 处理响应消息
      if (isResponse && messageId && this.pendingMessages.has(messageId)) {
        const { resolve, timer } = this.pendingMessages.get(messageId);
        clearTimeout(timer); // 清除超时定时器
        this.pendingMessages.delete(messageId);
        resolve({ data });
        return;
      }

      // 处理普通消息
      if (!type || !this.handlers.has(type)) {
        console.warn(`No handler registered for message type: ${type}`);
        return;
      }

      const handler = this.handlers.get(type);
      if (handler) {
        // 执行处理器并获取返回结果
        const result = await handler(data, { from, origin: event.origin, sourceName: this.sourceName });

        // 如果有messageId,需要返回响应
        if (messageId) {
          // 如果返回值为null或undefined,则不发送响应消息
          if (result === null || result === undefined) {
            return Promise.reject("Response result is null or undefined");
          }

          // 使用发送消息来源的域名作为目标域名
          this.targetWindow?.postMessage(
            {
              type,
              data: result,
              from: this.sourceName,
              messageId,
              isResponse: true,
            },
            event.origin
          );
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  on(type, callback) {
    this.handlers.set(type, callback);
  }

  off(type) {
    this.handlers.delete(type);
  }

  async post(type, data) {
    if (!this.isConnected) {
      throw new Error("Connection is closed, please connect first");
    }

    if (!this.targetWindow) {
      throw new Error("Target window is null");
    }

    return new Promise((resolve, reject) => {
      const messageId = Math.random().toString(36).substr(2, 9);

      // 设置超时定时器,connect和disconnect消息不需要等待响应
      if (type !== "connect" && type !== "disconnect") {
        const timer = setTimeout(() => {
          if (this.pendingMessages.has(messageId)) {
            this.pendingMessages.delete(messageId);
            reject(`${type} Message response timeout`);
          }
        }, this.timeout);

        // 存储pending的消息和定时器
        this.pendingMessages.set(messageId, { resolve, reject, timer });
      }

      // 获取最后一次接收到消息的域名
      const lastReceivedOrigin = this._lastReceivedOrigin;
      
      // 如果有最后接收到的域名，优先使用该域名发送
      if (lastReceivedOrigin && this.targetOrigins.some(originRule => {
        if (originRule === '*') return true;
        if (originRule instanceof RegExp) return originRule.test(lastReceivedOrigin);
        return originRule === lastReceivedOrigin;
      })) {
        this.targetWindow.postMessage(
          {
            type,
            data,
            from: this.sourceName,
            messageId,
          },
          lastReceivedOrigin
        );
      } else {
        // 如果没有最后接收到的域名或域名不在白名单中，则使用通配符
        this.targetWindow.postMessage(
          {
            type,
            data,
            from: this.sourceName,
            messageId,
          },
          "*"
        );
      }

      // connect和disconnect消息直接resolve
      if (type === "connect" || type === "disconnect") {
        resolve({ data: null });
      }
    });
  }

  connect() {
    this.isConnected = true;
    // 如果有最后接收到的域名，优先使用
    if (this._lastReceivedOrigin) {
      this.targetWindow?.postMessage(
        {
          type: "connect", 
          data: { status: "connected" },
          from: this.sourceName,
        },
        this._lastReceivedOrigin
      );
    } else {
      // 没有最后接收到的域名，使用通配符发送
      this.targetWindow?.postMessage(
        {
          type: "connect",
          data: { status: "connected" },
          from: this.sourceName,
        },
        "*"
      );
    }
  }

  disconnect() {
    this.isConnected = false;
    // 如果有最后接收到的域名，优先使用
    if (this._lastReceivedOrigin) {
      this.targetWindow?.postMessage(
        {
          type: "disconnect", 
          data: { status: "disconnected" },
          from: this.sourceName,
        },
        this._lastReceivedOrigin
      );
    } else {
      // 没有最后接收到的域名，使用通配符发送
      this.targetWindow?.postMessage(
        {
          type: "disconnect",
          data: { status: "disconnected" },
          from: this.sourceName,
        },
        "*"
      );
    }
  }

  destroy() {
    this.disconnect();
    window.removeEventListener("message", this.messageListener);
    this.handlers.clear();
    // 清除所有未完成的定时器
    this.pendingMessages.forEach(({ timer }) => clearTimeout(timer));
    this.pendingMessages.clear();
  }
}

export default IframeMessenger;
