/**
 * 任务时长 / 排队时间估算 —— 给 RetryConfigCard 等 "启动前预览" UI 使用。
 *
 * 1:1 移植 ihraisaas/src/lib/scheduleUtils.ts 的简化版：
 *   - 不引 date-fns（项目没装），用原生 Date
 *   - 不需要后端 /ai/runtimePolicy/config，固定用 WORK_SLOTS 全启用兜底
 *     （用户在 SettingsModal 关掉某段后估算会略偏乐观，可接受；准确值以任务真实跑完为准）
 *
 * 数据源 / 算法：
 *   - 预计本次时长 = ceil(count * RESUME_PROCESSING_TIME_SECONDS / 3600 * 2) / 2 小时
 *     纯搜索（无推荐）固定 0.2 小时
 *   - 预计开始时间 = max(now, 当前队列最后一个任务的 estimatedEndTime) 推到下一个工作时段
 *   - 预计结束时间 = 开始时间 + 时长（向后跨工作时段简化处理：单段直接 + 时长）
 */

/**
 * 每份简历的平均处理时间（秒）。
 * BOSS 推荐流程：进入 tab + 滚列表 + 点详情卡 + 关弹框 ≈ 3-4min/人。
 * 跟 ihraisaas 同步保持 240s。
 */
export const RESUME_PROCESSING_TIME_SECONDS = 240;

/** 默认工作时段（早 9-12 / 午 13-18 / 晚 19-23），跟 SettingsModal WORK_SLOTS 同步 */
export const DEFAULT_WORK_SLOTS = [
  { id: "morning", start: "09:00", end: "12:00", duration: 3 },
  { id: "afternoon", start: "13:00", end: "18:00", duration: 5 },
  { id: "evening", start: "19:00", end: "23:00", duration: 4 }
];

/**
 * 计算预计耗时（小时，0.5 步进上取整）。
 *
 * @param {number} resumeCount
 * @param {boolean} [isSearchOnly=false] 纯搜索（无推荐）→ 固定 0.2h
 * @returns {number}
 */
export function calculateEstimatedDuration(resumeCount, isSearchOnly = false) {
  if (isSearchOnly) return 0.2;
  const n = Number(resumeCount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const hours = (n * RESUME_PROCESSING_TIME_SECONDS) / 3600;
  return Math.ceil(hours * 2) / 2;
}

/**
 * 给当前时间找"下一个可工作的起始时刻"。
 *
 * 规则：
 *   - 当前在某个 slot 内 → 直接返回 baseTime
 *   - 当前在 slot 间隙 → 推到下一个 slot 的 start
 *   - 今天所有 slot 都过了 → 跨天到明天第一个 slot 的 start
 *
 * @param {Date} baseTime
 * @param {Array<{start:string,end:string}>} [slots]
 * @returns {Date}
 */
export function getNextAvailableStartTime(baseTime, slots = DEFAULT_WORK_SLOTS) {
  if (!Array.isArray(slots) || slots.length === 0) {
    // 没有任何 slot：默认明天 9 点
    const tomorrow = new Date(baseTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  // 复制并按 start 升序，避免输入未排序导致跳段
  const sorted = [...slots].sort((a, b) => parseHHmm(a.start) - parseHHmm(b.start));

  const baseMinutes = baseTime.getHours() * 60 + baseTime.getMinutes();
  for (const slot of sorted) {
    const sm = parseHHmm(slot.start);
    const em = parseHHmm(slot.end);
    if (baseMinutes >= sm && baseMinutes < em) {
      return baseTime; // 已在工作时段内
    }
    if (baseMinutes < sm) {
      const d = new Date(baseTime);
      d.setHours(Math.floor(sm / 60), sm % 60, 0, 0);
      return d;
    }
  }
  // 今天 slot 全过了 → 明天第一个 slot
  const tomorrow = new Date(baseTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const first = sorted[0];
  tomorrow.setHours(Math.floor(parseHHmm(first.start) / 60), parseHHmm(first.start) % 60, 0, 0);
  return tomorrow;
}

function parseHHmm(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * 完整预估：返回 { durationHours, startTime, endTime }。
 *
 * @param {object} opts
 * @param {number} opts.resumeCount
 * @param {boolean} [opts.isSearchOnly=false]
 * @param {Date} [opts.baseTime=new Date()]
 * @param {string|Date} [opts.existingQueueEndTime] 当前队列最后一个 queued/processing
 *   任务的 estimatedEndTime（让本次任务排在它后面）
 * @param {Array} [opts.workSlots] 默认 DEFAULT_WORK_SLOTS
 * @returns {{ durationHours: number, startTime: Date, endTime: Date }}
 */
export function predictSchedule({
  resumeCount,
  isSearchOnly = false,
  baseTime = new Date(),
  existingQueueEndTime,
  workSlots
} = {}) {
  const durationHours = calculateEstimatedDuration(resumeCount, isSearchOnly);

  let baseline = baseTime;
  if (existingQueueEndTime) {
    const t = new Date(existingQueueEndTime);
    if (!Number.isNaN(t.getTime()) && t.getTime() > baseline.getTime()) {
      baseline = t;
    }
  }

  const startTime = getNextAvailableStartTime(baseline, workSlots);
  const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
  return { durationHours, startTime, endTime };
}

/**
 * 格式化为 "MM-dd HH:mm"（跟 ihraisaas ConfigCard format(_, "MM-dd HH:mm") 一致）。
 *
 * @param {Date|string|number} d
 * @returns {string}
 */
export function formatScheduleTime(d) {
  if (!d) return "--:--";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "--:--";
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${MM}-${dd} ${HH}:${mm}`;
}
