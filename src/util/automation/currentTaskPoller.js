/**
 * /search/task/current 轮询器（单例）
 *
 * 触发场景：客户端启动时拿到的状态是
 *   - 后端 queue 非空（state.taskQueue.items.length > 0）
 *   - 但 current 接口没返回可执行 task（resumeFromCurrent 没 enqueue 任何东西）
 *
 *   说明本客户端这次没轮到（可能在等工作时间窗 OUT_OF_WORK_PERIOD，或前面有别 client 在跑）。
 *   不开 poller 的话用户得手动刷新页面才能拿到新 task。
 *
 * 工作机制：每 10s 一个 tick：
 *   1. 先 dispatch('SearchTasks/fetchTaskQueue') 刷新后端排队信息（state.taskQueue），
 *      让 LeftMenu 的"预计开始/结束时间"、队列位置等随轮询保持最新（不用等用户手动刷新）
 *   2. 再调 /search/task/current：
 *      - 拿到 task → dispatch('SearchTasks/resumeFromCurrent') → 内部 enqueue + processQueue 触发执行 → poller stop
 *      - 仍为空 → 继续等
 *   - 检测到 state.runningTaskId / state.queue 已经有别的来源触发了任务 → 也 stop（避免冗余轮询）
 *   - 总轮询上限 maxTicks（默认 360 次 ≈ 60 分钟）兜底防止 forever loop
 *
 * 单例：同进程同时只有一条 poller 在跑，start() 幂等。
 *
 * 用法：
 *   import currentTaskPoller from 'src/util/automation/currentTaskPoller';
 *   currentTaskPoller.start({ store, taskApi });        // 开
 *   currentTaskPoller.stop('user-stop');                // 显式停
 *   currentTaskPoller.isRunning();                      // 看状态
 */
class CurrentTaskPoller {
  constructor() {
    /** @type {ReturnType<typeof setInterval> | null} */
    this.timer = null;
    /** 轮询间隔（ms），默认 10s */
    this.intervalMs = 10_000;
    /** 安全上限：最多轮询多少次（默认 360 ≈ 60 分钟），防止 forever loop */
    this.maxTicks = 360;
    /** 已经 tick 的次数 */
    this.tickCount = 0;
    /** 启动时间戳（log 用） */
    this.startedAt = 0;
    /** @type {object | null} Vuex store 引用 */
    this._store = null;
    /** @type {object | null} searchTaskApi 模块 */
    this._taskApi = null;
  }

  isRunning() {
    return !!this.timer;
  }

  /**
   * 启动轮询。幂等：已在跑就忽略并 log。
   *
   * @param {object} opts
   * @param {object} opts.store - Vuex store 实例（用来 dispatch resumeFromCurrent + 读 state）
   * @param {object} opts.taskApi - searchTaskApi 模块（用来调 getCurrentSearchTask）
   * @param {number} [opts.intervalMs=10000]   每 tick 间隔
   * @param {number} [opts.maxTicks=360]       最大 tick 次数兜底（10s × 360 ≈ 60min）
   */
  start(opts = {}) {
    if (this.timer) {
      console.log("[CurrentTaskPoller] 已在跑（tickCount=" + this.tickCount + "），跳过 start");
      return;
    }
    const { store, taskApi, intervalMs, maxTicks } = opts;
    if (!store || !taskApi) {
      console.warn("[CurrentTaskPoller] 缺 store / taskApi，跳过 start");
      return;
    }
    this._store = store;
    this._taskApi = taskApi;
    this.intervalMs = Number(intervalMs) > 0 ? Number(intervalMs) : 10_000;
    this.maxTicks = Number(maxTicks) > 0 ? Number(maxTicks) : 360;
    this.startedAt = Date.now();
    this.tickCount = 0;
    console.log(
      "[CurrentTaskPoller] 启动 intervalMs=" + this.intervalMs + " maxTicks=" + this.maxTicks
    );
    // 不立即跑一次，等 intervalMs 后才第一次 tick（开机时刚跑过 resumeFromCurrent，
    // 立刻再跑一次没意义）
    this.timer = setInterval(() => this._tick(), this.intervalMs);
  }

  /**
   * 停止轮询并清理。
   * @param {string} [reason='manual']  停止原因，仅用于 log
   */
  stop(reason = "manual") {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    const elapsed = Date.now() - this.startedAt;
    console.log(
      "[CurrentTaskPoller] 停止 reason=" +
        reason +
        " tickCount=" +
        this.tickCount +
        " elapsed=" +
        elapsed +
        "ms"
    );
    this._store = null;
    this._taskApi = null;
  }

  /**
   * 单次轮询动作：检查 state → 调 API → 决定继续还是停。
   * 内部 try/catch 吞掉所有错（让 timer 继续，下一轮再试）。
   */
  async _tick() {
    this.tickCount++;
    if (!this._store || !this._taskApi) {
      // 安全检查：理论上 start 已校验，这里兜底
      this.stop("store-or-api-gone");
      return;
    }

    // 超过上限直接停
    if (this.tickCount > this.maxTicks) {
      console.warn(
        "[CurrentTaskPoller] 达到 maxTicks=" +
          this.maxTicks +
          "，自动停（" +
          this.tickCount +
          " ticks 都没拿到 current task）"
      );
      this.stop("max-ticks");
      return;
    }

    // 状态预检：如果在轮询期间任务已通过别的途径开始跑（比如用户手动新建任务），
    // 没必要再轮询 current 了，停掉
    try {
      const st = this._store.state?.SearchTasks;
      const runningTaskId = st?.runningTaskId;
      const queueLen = Array.isArray(st?.queue) ? st.queue.length : 0;
      if (runningTaskId || queueLen > 0) {
        console.log(
          "[CurrentTaskPoller] tick " +
            this.tickCount +
            ": 本地已有活跃任务 (running=" +
            runningTaskId +
            " queue=" +
            queueLen +
            ")，停轮询"
        );
        this.stop("local-task-active");
        return;
      }
    } catch (e) {
      console.warn("[CurrentTaskPoller] 读 state 异常（继续轮询）:", e?.message || e);
    }

    // 每 tick 顺带刷新后端排队信息（state.taskQueue）——让 LeftMenu 的"预计开始/结束时间"、
    // 队列位置随轮询保持最新，不用等用户手动刷新页面。
    // 注意：fetchTaskQueue 内部可能再调 poller.start()，但 start() 幂等（timer 已存在直接跳过），安全。
    try {
      await this._store.dispatch("SearchTasks/fetchTaskQueue");
    } catch (e) {
      console.warn(
        "[CurrentTaskPoller] tick " + this.tickCount + " 刷新 queue 异常（继续轮询 current）:",
        e?.message || e
      );
    }

    // 主流程：调 current
    try {
      const resp = await this._taskApi.getCurrentSearchTask();
      const data = resp?.data || resp;
      const taskId = data?.taskId;
      if (taskId) {
        console.log(
          "[CurrentTaskPoller] tick " +
            this.tickCount +
            ": 拿到 current taskId=" +
            taskId +
            "，触发 resumeFromCurrent 入队执行 + 停轮询"
        );
        // dispatch resumeFromCurrent 让 store 走完整的入队 + processQueue 逻辑
        // （它内部包含 channel 过滤 / hydrate tasksById / enqueue 等完整处理）
        try {
          await this._store.dispatch("SearchTasks/resumeFromCurrent");
        } catch (e) {
          console.warn(
            "[CurrentTaskPoller] resumeFromCurrent 异常（但 poller 仍 stop）:",
            e?.message || e
          );
        }
        this.stop("got-current");
      } else {
        console.log(
          "[CurrentTaskPoller] tick " +
            this.tickCount +
            ": current 仍为空（后端排队中本客户端没轮到），继续等下一轮"
        );
      }
    } catch (e) {
      console.warn(
        "[CurrentTaskPoller] tick " + this.tickCount + " 调 current 异常（继续轮询）:",
        e?.message || e
      );
    }
  }
}

// 单例 + 默认导出
const currentTaskPoller = new CurrentTaskPoller();

export default currentTaskPoller;
export { CurrentTaskPoller };
