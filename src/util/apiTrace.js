/**
 * 任务链路接口日志工具。
 *
 * 统一格式（便于在控制台按 `[task-api]` / `[portrait-api]` 过滤）：
 *   [task-api] >>> POST /xxx | payload=...
 *   [task-api] <<< POST /xxx ok 123ms | response=...
 *   [task-api] !!! POST /xxx failed 123ms | error=...
 *
 * 目的：
 *   - 排查"接口成功但数据没落库 / 任务卡住 / SSE 等不到"这类链路问题时，
 *     能在一个地方看到请求参数、响应摘要、耗时、失败原因；
 *   - 简历 content / rawResume 这类大字段只打长度和关键 ID，避免控制台刷屏。
 */

const MAX_STRING = 300;
const MAX_ARRAY = 10;
const MAX_DEPTH = 4;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarizeResultItem(item) {
  if (!isPlainObject(item)) return summarizeValue("", item, 2);
  const out = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "rawResume" || key === "resume") continue;
    out[key] = summarizeValue(key, value, 2);
  }
  const raw = item.rawResume || item.resume;
  if (raw && typeof raw === "object") {
    out[item.rawResume ? "rawResume" : "resume"] = `<object keys=${Object.keys(raw).length}>`;
  }
  return out;
}

function summarizeTaskResumeRow(row) {
  if (!isPlainObject(row)) return row;
  return {
    taskResumeId: row.taskResumeId,
    resumeBlindId: row.resumeBlindId ?? row?.resume?.resumeBlindId ?? row?.resume?.id,
    outId: row.outId ?? row.channelResumeId,
    duplicateFlag: row.duplicateFlag,
    visibleInResultSet: row.visibleInResultSet
  };
}

function summarizeValue(key, value, depth) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (key === "content" || value.length > MAX_STRING) {
      return `<string len=${value.length}>`;
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? `<array len=${value.length}>` : "<object>";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => {
      if (key === "resultItems") return summarizeResultItem(item);
      if (key === "taskResumes") return summarizeTaskResumeRow(item);
      return summarizeValue("", item, depth + 1);
    });
    if (value.length > MAX_ARRAY) items.push(`…(+${value.length - MAX_ARRAY})`);
    return items;
  }

  if (key === "rawResume") return `<object keys=${Object.keys(value).length}>`;

  const out = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = summarizeValue(childKey, childValue, depth + 1);
  }
  return out;
}

/** 把一个请求/响应对象转成适合打日志的摘要（大字段折叠、超长数组截断）。 */
export function summarizePayload(payload) {
  if (payload === undefined) return undefined;
  return summarizeValue("", payload, 0);
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

/**
 * 包裹一次接口调用并打印请求 / 响应 / 异常。
 *
 * @param {object} opts
 * @param {string} [opts.tag]       日志前缀，默认 `task-api`
 * @param {string} [opts.method]    HTTP method，默认 POST
 * @param {string} opts.path        接口路径（打印用）
 * @param {*} [opts.payload]        请求参数（会经过 summarizePayload）
 * @param {Function} opts.run       实际发起请求的函数，返回 Promise
 * @param {Function} [opts.summarize] 自定义 response 摘要函数
 */
export async function traceApiCall({
  tag = "task-api",
  method = "POST",
  path,
  payload,
  run,
  summarize
}) {
  const startedAt = nowMs();
  console.log(`[任务流程] [${tag}] >>> ${method} ${path} | payload=`, summarizePayload(payload));
  try {
    const resp = await run();
    const cost = Math.round(nowMs() - startedAt);
    if (resp === undefined || resp === null) {
      console.warn(
        `[任务流程] [${tag}] <<< ${method} ${path} undefined ${cost}ms | 后端业务失败 success!=='success'（完整响应见 [request.js] 日志）`
      );
      return resp;
    }
    const summary = summarize ? summarize(resp) : summarizePayload(resp);
    console.log(`[任务流程] [${tag}] <<< ${method} ${path} ok ${cost}ms | response=`, summary);
    return resp;
  } catch (e) {
    const cost = Math.round(nowMs() - startedAt);
    console.warn(
      `[任务流程] [${tag}] !!! ${method} ${path} failed ${cost}ms | error=`,
      e?.message || e,
      e
    );
    throw e;
  }
}

export default {
  summarizePayload,
  traceApiCall
};
