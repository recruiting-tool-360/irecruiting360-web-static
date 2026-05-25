/**
 * 运行策略配置 HTTP API（对接 ihire-solution）
 *
 * 协议见 docs/05-api-contract.md §「查询/保存运行策略配置」（line 334-410）。
 *
 *   - GET  /ai/runtimePolicy/config  查询当前工作时段 + 系统固定策略
 *   - PUT  /ai/runtimePolicy/config  保存工作时段（其它字段后端忽略）
 *
 * 仅 `workPeriods` 可前端修改；`allowWeekend / allowHoliday / strategy` 后端硬编码。
 * 当前存在 `RUNNING` 任务时后端会拒绝 PUT（业务保护，前端也应阻止用户提交）。
 */

import service from "src/api/request";

/**
 * 查询运行策略配置。
 *
 * @returns {Promise<{ data: {
 *   companyId: string,
 *   workPeriods: Array<{ startTime: string, endTime: string }>,
 *   allowWeekend: boolean,
 *   allowHoliday: boolean,
 *   strategy: {
 *     boundaryJitterMinutes: number,
 *     microRestMinutesRange: [number, number],
 *     avgSecondsPerResume: number,
 *     executionMode: 'SERIAL' | string,
 *     stopConditions: string[]
 *   },
 *   editableFields: string[]
 * } }>}
 */
export function getRuntimePolicyConfig() {
  return service.get("/ai/runtimePolicy/config");
}

/**
 * 保存工作时段。
 *
 * 校验由后端强制（前端先做一遍以提前反馈）：
 *   1. workPeriods 至少 1 段，最多 2 段
 *   2. startTime / endTime 必须 `HH:mm` 24h
 *   3. 每段 startTime < endTime
 *   4. 多段不重叠
 *   5. 当前有 RUNNING 任务时拒绝
 *
 * @param {object} payload
 * @param {Array<{ startTime: string, endTime: string }>} payload.workPeriods
 * @returns {Promise<{ data: object }>}
 */
export function putRuntimePolicyConfig(payload) {
  return service.put("/ai/runtimePolicy/config", payload);
}
