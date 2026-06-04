/**
 * 重新分析「AI 分析异常」的简历（渠道重新登录后触发）。
 *
 * 场景：任务进行中渠道登录失效 → 任务停止 → 未评分简历被标成 score=-2（"AI分析失败/渠道数据异常"）。
 *   用户在客户端重新登录该渠道成功后，应把这些 -2 的简历**重新走一遍 AI 分析**。
 *
 * 做法（复用既有 AI 分析管线）：
 *   1) 重新登记 taskResumeId 映射（任务停止后可能被清，scoreUpdater 查分要用）
 *   2) 把这些简历 score 重置为 null（重新进入"分析中"，scoreUpdater 会重新收集查分）
 *   3) 开"重新分析中"窗口（reAnalyzingActive），避免 JobInfo.onWaitingCallback 在任务已停止时
 *      又立刻把 WAITING 简历标回 -2
 *   4) 重新入队提交 detail（addResumeTask → postTaskResumeDetail，重新触发后端 AI 评分）
 *   5) changeSearchCount 触发 JobInfo 重启评分轮询
 *
 * 只处理 runtime 的 ChannelConfig.ALL.data（停止后用户看的就是这份）。仅 Electron 客户端有效。
 */

const CHANNEL_DESC = {
  BOSS: "boss直聘",
  ZHILIAN: "智联招聘",
  JOB51: "前程无忧",
  LIEPIN: "猎聘"
};

/** "重新分析中"窗口时长：detail 重新入队 + 后端打分需要时间，期间别让 onWaitingCallback 放弃 */
const REANALYZING_WINDOW_MS = 90 * 1000;
let clearTimer = null;

/**
 * @param {import('vuex').Store} store
 * @param {'BOSS'|'ZHILIAN'|'JOB51'|'LIEPIN'} channelKey
 */
export async function reAnalyzeFailedResumesForChannel(store, channelKey) {
  if (!store || !channelKey) return;
  const desc = store.getters.getChannelConf?.[channelKey]?.desc || CHANNEL_DESC[channelKey];
  const all = store.getters.getChannelConfByAll?.data || [];
  if (!Array.isArray(all) || all.length === 0) return;

  // 找该渠道 score=-2（AI 分析异常）的简历
  const failed = all.filter(
    (r) => r && r.score === -2 && (r.channelSubType === channelKey || r.channel === desc)
  );
  if (failed.length === 0) {
    // 没有需要重分析的简历（AI 早已分析完）→ 若有「待 finish」channel，直接 finish
    try {
      store.dispatch("SearchTasks/finishPendingChannelsForChannel", { channelKey });
    } catch {
      /* ignore */
    }
    return;
  }
  console.log(`[reAnalyze] ${channelKey} 重新登录成功 → 重新分析 ${failed.length} 条 AI 分析异常简历`);

  // 1) 重新登记 taskResumeId 映射（停止后可能被清）
  try {
    const mappings = failed
      .filter((r) => (r.resumeBlindId || r.id) && r.taskResumeId)
      .map((r) => ({
        resumeBlindId: r.resumeBlindId || r.id,
        taskResumeId: r.taskResumeId,
        channelSubType: channelKey
      }));
    if (mappings.length > 0) store.commit("SearchTasks/patchTaskResumeIds", mappings);
  } catch (e) {
    console.warn("[reAnalyze] patchTaskResumeIds 失败:", e?.message || e);
  }

  // 2) score 重置为 null（重新进入"分析中"）
  failed.forEach((r) => {
    const idx = all.findIndex((x) => x && x.id === r.id);
    if (idx >= 0) {
      store.dispatch("updateChannelConf", {
        key: "ALL",
        index: idx,
        data: { ...all[idx], score: null, scoreStatus: undefined }
      });
    }
  });

  // 3) 开"重新分析中"窗口
  store.commit("setReAnalyzingActive", true);
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    try {
      store.commit("setReAnalyzingActive", false);
    } catch {
      /* ignore */
    }
  }, REANALYZING_WINDOW_MS);

  // 4) 重新入队提交 detail（重新触发后端 AI 评分）
  try {
    const { addResumeTask } = await import("src/pluginSrc/util/AsyncResumeProcessor");
    failed.forEach((r) => {
      addResumeTask(channelKey, {
        channel: desc,
        searchId: r.searchId || r.searchConditionId,
        resume: r
      });
    });
  } catch (e) {
    console.warn("[reAnalyze] addResumeTask 失败:", e?.message || e);
  }

  // 5) 触发 JobInfo 重启评分轮询
  try {
    store.commit("changeSearchCount");
  } catch {
    /* ignore */
  }

  // 6) 轮询等本渠道简历都跑到终态（score>=0 成功 / 或又 -2 失败）→ AI 分析跑完 →
  //    再 finish 之前「待 finish」的 channel（postFinishChannel COMPLETED）。
  const startTs = Date.now();
  const finishPoll = setInterval(() => {
    const cur = store.getters.getChannelConfByAll?.data || [];
    const mine = cur.filter(
      (r) => r && (r.channelSubType === channelKey || r.channel === desc)
    );
    const stillAnalyzing = mine.some(
      (r) =>
        r.score === null ||
        r.score === undefined ||
        (typeof r.score === "number" && r.score < 0 && r.score !== -2)
    );
    const timedOut = Date.now() - startTs > REANALYZING_WINDOW_MS;
    if (stillAnalyzing && !timedOut) return;
    clearInterval(finishPoll);
    try {
      store.commit("setReAnalyzingActive", false);
    } catch {
      /* ignore */
    }
    try {
      store.dispatch("SearchTasks/finishPendingChannelsForChannel", { channelKey });
    } catch {
      /* ignore */
    }
  }, 5000);
}

export default { reAnalyzeFailedResumesForChannel };
