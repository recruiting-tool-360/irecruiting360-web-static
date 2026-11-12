export const POSITION_PROFILE_AVAILABILITY = Object.freeze({
  UNKNOWN: "unknown",
  AVAILABLE: "available",
  NONE_ENABLED: "none_enabled"
});

function resolvePositionProfileFlag(position, detailMap) {
  const id = position?.headcountId ?? position?.positionId;
  const detail = id == null || id === "" ? null : detailMap?.[String(id)];
  return detail?.jobProfileEnabled ?? position?.jobProfileEnabled;
}

/**
 * 判断当前招聘中职位是否至少有一个开启了职位画像。
 *
 * 返回 UNKNOWN 时调用方必须保持原行为，不能把接口缺字段或详情接口失败误判成
 * “全部未开启”，否则会错误阻断所有寻聘操作。
 */
export function resolvePositionProfileAvailability(applicationPositions, detailMap = {}) {
  if (!Array.isArray(applicationPositions)) {
    return POSITION_PROFILE_AVAILABILITY.UNKNOWN;
  }
  if (applicationPositions.length === 0) {
    return POSITION_PROFILE_AVAILABILITY.NONE_ENABLED;
  }

  let hasUnknownFlag = false;
  for (const position of applicationPositions) {
    const enabled = resolvePositionProfileFlag(position, detailMap);
    if (enabled === true) return POSITION_PROFILE_AVAILABILITY.AVAILABLE;
    if (enabled !== false) hasUnknownFlag = true;
  }

  return hasUnknownFlag
    ? POSITION_PROFILE_AVAILABILITY.UNKNOWN
    : POSITION_PROFILE_AVAILABILITY.NONE_ENABLED;
}
