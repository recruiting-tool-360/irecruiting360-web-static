/**
 * 组装 POST /search/task/create 和 POST /search/task/estimate 共用的 channels 数组。
 *
 * 之前这段逻辑只在 `src/pages/IndexPage.vue` dispatchTaskStore 里实现，导致
 * AIProfileActionPanel 想调 estimate 接口时没法复用 → 容易两边不一致。抽到工具
 * 模块后两处共享一份判定逻辑（哪些渠道启用 / channelSubType 命名 / searchTaskConfig 形态）。
 *
 * 跟 AISearch.vue 的 getChannelDisable / ResumeCard.vue 的 getChannelDisable 保持一致：
 *   - LIEPIN：硬规则全局禁用（项目里没人在任务里包含猎聘）
 *   - 其他渠道：cfgList 找不到 → 视为未启用（严格，避免误报）
 *   - 找到了 → 直接 truthy 判断 enableConfig
 */

/**
 * 单个 channel 是否启用（按 store.getters.getUserChannelConfig 判定）。
 * 给单元测试或外部直接判定用；上方 buildSearchTaskChannels 内部也复用这个。
 */
export function isChannelEnabled(cfgList, key) {
  if (key === "LIEPIN") return false;
  if (!Array.isArray(cfgList) || cfgList.length === 0) return false;
  const cfg = cfgList.find((c) => c?.key === key);
  if (!cfg) return false;
  return !!cfg.enableConfig;
}

/**
 * 组装 channels[] 数组。
 *
 * @param {object} opts
 * @param {Array<{key:string, enableConfig:boolean}>} opts.cfgList  store.getters.getUserChannelConfig
 * @param {{search?: boolean, recommend?: boolean}} opts.selectedModules  用户勾选
 * @param {string|null} opts.matchedBossJobId  推荐固定 BOSS 用的 encryptJobId
 * @param {number|null|undefined} opts.resumeCount  推荐期望简历份数
 * @param {string|number} [opts.condId='0']  searchConditionId；
 *   - create 路径：必须传真实 condId（prepareConditionOnly 拿到的）
 *   - estimate 路径：传 '0' 占位即可（后端预估不需要真 condId）
 * @returns {Array<object>}  channels；可能为空数组（无任何启用渠道）
 */
export function buildSearchTaskChannels({
  cfgList,
  selectedModules,
  matchedBossJobId,
  resumeCount,
  condId = "0"
}) {
  const channels = [];
  const searchChecked = !!selectedModules?.search;
  const recommendChecked = !!selectedModules?.recommend;

  // 搜索：为每个启用的渠道生成一个 SEARCH channel
  if (searchChecked) {
    const candidates = ["BOSS", "ZHILIAN", "JOB51"];
    for (const key of candidates) {
      if (!isChannelEnabled(cfgList, key)) continue;
      channels.push({
        businessChannel: "SEARCH",
        channelSubType: key,
        searchConditionId: String(condId)
      });
    }
  }

  // 推荐：仅 BOSS 支持，且需要 BOSS 启用 + 用户勾了推荐 + 有 jobId
  if (recommendChecked && matchedBossJobId && isChannelEnabled(cfgList, "BOSS")) {
    channels.push({
      businessChannel: "RECOMMEND",
      channelSubType: "BOSS",
      searchConditionId: String(condId),
      searchTaskConfig: JSON.stringify({
        relatedPositionValue: matchedBossJobId,
        maxSearchCount: Number(resumeCount) > 0 ? Number(resumeCount) : 10
      })
    });
  }

  return channels;
}

/**
 * 组装 /search/task/estimate 的完整 payload（chatId + positionId + taskType + channels）。
 *
 * 跟 /search/task/create 的 payload 结构对齐。给 AIProfileActionPanel 等"实时预估"
 * 入口直接调用，免去重复拼接。
 *
 * @param {object} opts
 * @param {string} opts.chatId
 * @param {string|number} opts.positionId
 * @param {Array} opts.cfgList
 * @param {object} opts.selectedModules
 * @param {string|null} opts.matchedBossJobId
 * @param {number|null} opts.resumeCount
 * @param {'INITIAL'|'RESTART'|'CONTINUE'} [opts.taskType='INITIAL']
 * @returns {object|null}  payload；channels 为空时返回 null（caller 自行跳过调 estimate）
 */
export function buildEstimatePayload(opts) {
  const {
    chatId,
    positionId,
    cfgList,
    selectedModules,
    matchedBossJobId,
    resumeCount,
    taskType = "INITIAL"
  } = opts || {};

  const channels = buildSearchTaskChannels({
    cfgList,
    selectedModules,
    matchedBossJobId,
    resumeCount,
    condId: "0" // estimate 不需要真 condId
  });

  if (channels.length === 0) return null;

  return {
    chatId,
    positionId,
    taskType,
    triggerSource: "USER_CLICK",
    channels
  };
}
