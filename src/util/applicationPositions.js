/**
 * noauth/application/position 只按招聘中状态过滤，仍可能返回 isDeleted=true 的 HC。
 * 对明确删除的数据做客户端兜底；字段缺失时保留，避免误隐藏历史接口返回的职位。
 */
export function filterNonDeletedApplicationPositions(positions) {
  if (!Array.isArray(positions)) return positions;
  return positions.filter((position) => position?.isDeleted !== true);
}
