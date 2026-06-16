/**
 * 任务专用 SSE 客户端（**Phase B：noop 占位**）
 *
 * 历史：之前对接 `/sseManager/task/connect?taskChannelId=...`，给任务推 AI_TASK 消息。
 * 现状：后端已下架该接口（返回 404），AI_TASK 消息改走通用通道 `/sseManager/connect`
 *       —— 那条连接由 `src/api/sse.js` 全局管理，不需要本类再开第二条 EventSource。
 *
 * runTask 也已经改成"主动驱动"（runTask 内部直接调聚合搜索 + 接口落库），不再依赖
 * SSE 推送 STEP_COMMAND。所以这里完全 noop 就够了。
 *
 * 保留这个类的目的：让 SearchTasks store 里 `taskSse.connect()` / `taskSse.disconnect()`
 * 等调用点不必改签名，避免一次性扇出修改。
 *
 * 后续如果需要监听 AI_TASK 消息，应该挂到通用 SSE 的 message 流上过滤 scenario=AI_TASK。
 */

/** 全局单例：同一时间最多一个任务 SSE 连接（业务串行约束） */
class TaskSseClient {
  constructor() {
    /** @type {EventSource | null} */
    this.eventSource = null;
    /** @type {string | null} 当前连接绑定的 taskChannelId */
    this.taskChannelId = null;
    /** 监听器：{ message, heartbeat, error, open } */
    this.listeners = {};
    /** 最后收到任意 SSE 消息的时间，用于健康检查 */
    this.lastMessageTime = 0;
  }

  /** 是否当前已连接 / 正在连接 */
  isOpen() {
    return !!this.eventSource && this.eventSource.readyState !== 2; // 2=CLOSED
  }

  /** 当前连接绑定的 taskChannelId（外部检查用） */
  getActiveTaskChannelId() {
    return this.taskChannelId;
  }

  /**
   * 建立 SSE 连接。已连同一 taskChannelId 时立即 resolve；连不同 taskChannelId 时先 disconnect。
   *
   * @param {object} opts
   * @param {string} opts.taskChannelId
   * @param {string} [opts.satoken]  显式指定 satoken；不传时自动从 cookie 读
   * @returns {Promise<void>}  open 事件 / 第一条 message 到达时 resolve；error / 5s 超时 reject
   */
  /**
   * 建立 SSE 连接（**Phase B noop 版**）。
   *
   * 后端已下架 /sseManager/task/connect（404）。AI_TASK 消息现在改走通用通道
   * /sseManager/connect —— 这条通道**已经由 src/api/sse.js 全局连接**，本类不需要再开第二条。
   *
   * runTask 也已经改成主动驱动模式（不依赖 SSE 推 STEP_COMMAND 才动作），所以 taskSse.connect()
   * 在新协议下可以完全 noop：保留方法签名 + 立即 resolve，让 SearchTasks 里
   * `taskSse.connect().then(...).catch(...)` 的调用点不用改。
   *
   * 如果将来 AI_TASK 消息需要监听，应该在通用 SSE 的 message 流里过滤 scenario=AI_TASK
   * 转发到这里的 listeners，而不是在这里建独立 EventSource。
   */
  connect({ taskChannelId } = {}) {
    if (!taskChannelId) {
      return Promise.reject(new Error("taskChannelId required"));
    }
    console.log(
      `[taskSse] connect noop（task/connect 已下架；runTask 走主动驱动，不依赖 SSE）taskChannelId=${taskChannelId}`
    );
    this.taskChannelId = taskChannelId; // 记录绑定，让 disconnect/isOpen 调用兼容
    // 立刻触发 open 事件，让 SearchTasks 中可能注册的 open 监听器收到
    setTimeout(() => this._emit("open", { taskChannelId }), 0);
    return Promise.resolve();
  }

  disconnect() {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        /* ignore */
      }
      this.eventSource = null;
    }
    this.taskChannelId = null;
  }

  /**
   * 监听事件。回调签名：
   *   'open'      → ({ taskChannelId })
   *   'message'   → (sseMessage)
   *   'heartbeat' → null
   *   'error'     → ({ taskChannelId, raw })
   */
  on(event, callback) {
    if (typeof callback !== "function") return () => {};
    (this.listeners[event] ||= []).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    if (!callback) {
      delete this.listeners[event];
      return;
    }
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  _emit(event, payload) {
    if (!this.listeners[event]) return;
    for (const cb of this.listeners[event]) {
      try {
        cb(payload);
      } catch (e) {
        console.error(`[taskSse] listener of '${event}' threw:`, e);
      }
    }
  }
}

export default new TaskSseClient();
