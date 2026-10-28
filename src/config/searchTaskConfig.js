/** 单个评分批次最多处理的候选人数。实际批大小还会受用户 targetCount 限制。 */
export const SCORE_BATCH_SIZE = 5;

/** 用户目标小于批次上限时按用户目标执行，否则使用批次上限。 */
export function resolveScoreBatchSize(targetCount) {
  const target = Math.max(0, Math.trunc(Number(targetCount) || 0));
  return target > 0 ? Math.min(target, SCORE_BATCH_SIZE) : SCORE_BATCH_SIZE;
}
