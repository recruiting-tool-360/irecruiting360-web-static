/**
 * 画像评分批次工具。
 *
 * 后端契约（2026-05 第二版）：
 *   - /search/taskChannel/{id}/results 用 scoreBatchNo 标记第几批；
 *   - 一批候选人列表全部上传后，再调一次 /results：resultItems=[] + scoreBatchComplete=true 封批；
 *   - 封批后后端异步评分，当前批全部进入终态后通过 SSE 推送
 *     scenario=RESUME_SCORE_BATCH_COMPLETED；
 *   - 前端只根据 shouldContinue 决定是否继续抓下一批。
 *
 * 本模块只负责「封批」和「等 SSE」，不关心 BOSS 页面抓取细节。
 */
import sseClient from "src/api/sse";
import { postSearchResults } from "src/api/searchTaskApi";

export const SCORE_BATCH_EVENT = "RESUME_SCORE_BATCH_COMPLETED";

/** 当前批次封批（空结果 + scoreBatchComplete=true） */
export async function sealScoreBatch({
  taskChannelId,
  chatId,
  taskId,
  searchConditionId,
  businessChannel,
  channelSubType,
  serializeChannel,
  scoreBatchNo
}) {
  if (!taskChannelId) throw new Error("sealScoreBatch: taskChannelId required");
  const payload = {
    chatId,
    taskId,
    searchConditionId,
    businessChannel,
    channelSubType,
    serializeChannel,
    scoreBatchNo: Number(scoreBatchNo) || 1,
    scoreBatchComplete: true,
    resultItems: []
  };
  console.log("[任务流程] [scoringBatch] 封批 >>> /results (scoreBatchComplete)", {
    taskId,
    taskChannelId,
    scoreBatchNo: payload.scoreBatchNo,
    chatId,
    searchConditionId,
    businessChannel,
    channelSubType,
    serializeChannel,
    resultItems: payload.resultItems.length
  });
  const startedAt = Date.now();
  const resp = await postSearchResults(taskChannelId, payload);
  const cost = Date.now() - startedAt;
  if (resp == null || resp?.success !== "success") {
    const reason = resp?.errorMessage || resp?.message || "未返回 success";
    console.warn(
      "[任务流程]", `[scoringBatch] 封批 !!! failed ${cost}ms taskId=${taskId} taskChannelId=${taskChannelId}` +
        ` scoreBatchNo=${payload.scoreBatchNo}（${reason}，见 [request.js] 完整响应日志）`
    );
    throw new Error(
      `封批失败：${reason} taskChannelId=${taskChannelId} scoreBatchNo=${payload.scoreBatchNo}`
    );
  }
  console.log(
    `[任务流程] [scoringBatch] 封批成功 ${cost}ms taskId=${taskId} taskChannelId=${taskChannelId} scoreBatchNo=${payload.scoreBatchNo}`,
    {
      accepted: resp?.data?.accepted,
      taskResumes: resp?.data?.taskResumes?.length ?? 0
    }
  );
  return resp;
}

function normalizeBatchMessage(message) {
  if (!message || typeof message !== "object") return null;
  if (message.scenario !== SCORE_BATCH_EVENT) return null;
  const data = message.data && typeof message.data === "object" ? message.data : null;
  if (!data) return null;
  // 少数事件会把业务字段再包一层 data，兼容两种形态。
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
    return { ...data, ...data.data };
  }
  return data;
}

const PASSED_ID_FIELDS = [
  "resumeBlindId",
  "resumeId",
  "taskResumeId",
  "resumeTaskId",
  "channelResumeId",
  "outId",
  "uniqSign",
  "geekId",
  "encryptGeekId",
  "candidateId",
  "id"
];

const PASSED_LIST_FIELDS = [
  "passedResumeIds",
  "passedUniqSigns",
  "passedUniqSignList",
  "passUniqSigns",
  "qualifiedUniqSigns",
  "passedResumeIdList",
  "scorePassedResumeIds",
  "scorePassedIds",
  "passedIdList",
  "passedTaskResumeIds",
  "passedResumeTaskIds",
  "passedCandidateIds",
  "passedIds",
  "passResumeIds",
  "passTaskResumeIds",
  "qualifiedResumeIds",
  "qualifiedIdList",
  "qualifiedTaskResumeIds",
  "qualifiedIds",
  "passIds",
  "passedResumes",
  "passedResumeList",
  "passedCandidates",
  "passedCandidateList",
  "passedTaskResumes",
  "passedList",
  "passedItems",
  "qualifiedResumeList",
  "qualifiedList"
];

const RESULT_LIST_FIELDS = [
  "results",
  "items",
  "resumeList",
  "taskResumeList",
  "candidateList",
  "scoreList",
  "resumeScores",
  "scoreResults",
  "scoreItems",
  "candidateScores"
];

function toId(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function isPassedResultItem(item) {
  if (!item || typeof item !== "object") return false;
  const passFlag =
    item.passed ?? item.isPassed ?? item.qualified ?? item.isQualified ?? item.pass;
  if (passFlag === true || passFlag === 1 || passFlag === "1" || passFlag === "true") {
    return true;
  }
  const status = String(
    item.status ?? item.scoreStatus ?? item.resultStatus ?? item.scoreResult ?? ""
  ).toUpperCase();
  // 注意：SUCCESS 只代表“评分成功”，不代表“画像合格”，这里不能当通过处理。
  return ["PASSED", "PASS", "QUALIFIED", "MATCHED"].includes(status);
}

function extractIdsFromList(list, { requirePassed = false } = {}) {
  const ids = [];
  if (!Array.isArray(list)) return ids;
  for (const item of list) {
    if (item === undefined || item === null || item === "") continue;
    if (typeof item === "string" || typeof item === "number") {
      ids.push(String(item));
      continue;
    }
    if (typeof item !== "object") continue;
    if (requirePassed && !isPassedResultItem(item)) continue;
    for (const field of PASSED_ID_FIELDS) {
      const id = toId(item[field]);
      if (id) {
        ids.push(id);
        break;
      }
    }
  }
  return ids;
}

function parsePassedIds(data) {
  const ids = [];
  for (const field of PASSED_LIST_FIELDS) {
    ids.push(...extractIdsFromList(data?.[field]));
  }
  for (const field of RESULT_LIST_FIELDS) {
    ids.push(...extractIdsFromList(data?.[field], { requirePassed: true }));
  }
  return [...new Set(ids)];
}

/**
 * 等待当前批次的评分完成事件。
 *
 * 事件字段：scoreBatchNo / shouldContinue / passedCount / passedUniqSigns。
 * batchId、hasMore 等字段仅保留在 raw 中供日志查看，不参与继续/结束判断。
 *
 * @returns {Promise<{
 *   received: boolean,
 *   timedOut?: boolean,
 *   scoreBatchNo?: number,
 *   passedCount: number,
 *   passedIds: string[],
 *   targetCount?: number,
 *   shouldContinue: boolean|null,
 *   raw?: object
 * }>}
 */
export function waitForScoreBatchCompleted({
  taskId,
  scoreBatchNo,
  timeoutMs = 10 * 60 * 1000,
  signal
} = {}) {
  const expectedTaskId = taskId == null ? "" : String(taskId);
  const expectedBatchNo = Number(scoreBatchNo) || null;

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        sseClient.off("message", onMessage);
      } catch (_e) {
        /* ignore */
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve(result);
    };

    const onAbort = () => {
      console.warn(
        `[任务流程] [scoringBatch] 取消等待评分批次 taskId=${taskId} scoreBatchNo=${scoreBatchNo}`
      );
      finish({
        received: false,
        cancelled: true,
        scoreBatchNo: expectedBatchNo,
        passedCount: 0,
        shouldContinue: false
      });
    };

    const onMessage = (message) => {
      const data = normalizeBatchMessage(message);
      if (!data) return;

      const msgTaskId = data.taskId ?? data.batchId ?? data.searchTaskId;
      if (expectedTaskId && msgTaskId != null && String(msgTaskId) !== expectedTaskId) {
        return;
      }
      const msgBatchNo = Number(data.scoreBatchNo ?? data.batchNo);
      if (expectedBatchNo && Number.isFinite(msgBatchNo) && msgBatchNo !== expectedBatchNo) {
        return;
      }

      console.log(
        `[任务流程] [scoringBatch] <<< SSE ${SCORE_BATCH_EVENT} taskId=${msgTaskId ?? expectedTaskId} scoreBatchNo=${
          Number.isFinite(msgBatchNo) ? msgBatchNo : expectedBatchNo
        } status=${data.status ?? "-"} passedCount=${data.passedCount ?? "-"} shouldContinue=${data.shouldContinue ?? "-"}`,
        {
          totalCount: data.totalCount,
          completedCount: data.completedCount,
          failedCount: data.failedCount,
          filteredCount: data.filteredCount,
          hasMore: data.hasMore,
          passedUniqSigns: Array.isArray(data.passedUniqSigns)
            ? data.passedUniqSigns.slice(0, 20)
            : data.passedUniqSigns
        }
      );
      const passedIds = parsePassedIds(data);
      const reportedPassedCount = Number(data.passedCount);
      const passedCount =
        Number.isFinite(reportedPassedCount) && reportedPassedCount > 0
          ? reportedPassedCount
          : passedIds.length;
      // 任务是否继续只由 shouldContinue 控制；hasMore 不参与任务状态判断。
      // 保留 null，调用方只在明确收到 false 时结束，避免把 null 误判成 false。
      const shouldContinue =
        data.shouldContinue === true
          ? true
          : data.shouldContinue === false
          ? false
          : null;
      console.log(
        `[任务流程] [scoringBatch] 收到批次完成事件 taskId=${msgTaskId ?? expectedTaskId} scoreBatchNo=${
          Number.isFinite(msgBatchNo) ? msgBatchNo : expectedBatchNo
        } passedCount=${passedCount} passedIds=${passedIds.length} shouldContinue=${shouldContinue}`,
        passedIds
      );
      finish({
        received: true,
        scoreBatchNo: Number.isFinite(msgBatchNo) ? msgBatchNo : expectedBatchNo,
        passedCount,
        passedIds,
        targetCount: Number(data.targetCount) || undefined,
        shouldContinue,
        raw: data
      });
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    sseClient.on("message", onMessage);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    console.log(`[任务流程] [scoringBatch] 已监听，等待评分批次完成 taskId=${taskId} scoreBatchNo=${scoreBatchNo}`);

    timer = setTimeout(() => {
      console.warn(
        `[任务流程] [scoringBatch] 等评分批次完成事件超时 taskId=${taskId} scoreBatchNo=${scoreBatchNo}，按停止继续抓取处理`
      );
      finish({
        received: false,
        timedOut: true,
        scoreBatchNo: expectedBatchNo,
        passedCount: 0,
        shouldContinue: false
      });
    }, Math.max(10_000, Number(timeoutMs) || 0));
  });
}
