/**
 * 推荐候选人的本地简历文件 ID 映射。
 *
 * 任务过程中 fileId 由截图上传接口返回，结果查询接口不一定会再次返回它。
 * 用候选人的本地 ID 建映射，支持任务完成后从结果卡片直接执行导入操作。
 */

const STORAGE_KEY = "recommendResumeFileIdMap";

function storage() {
  try {
    return typeof window !== "undefined" && window.sessionStorage
      ? window.sessionStorage
      : null;
  } catch (_error) {
    return null;
  }
}

function loadMap() {
  const currentStorage = storage();
  if (!currentStorage) return {};
  try {
    return JSON.parse(currentStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch (_error) {
    return {};
  }
}

function saveMap(map) {
  const currentStorage = storage();
  if (!currentStorage) return;
  try {
    currentStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn(
      "[任务流程] [recommendFileIdMap] 写入 sessionStorage 失败（忽略）:",
      error?.message || error
    );
  }
}

function usable(value) {
  return value !== undefined && value !== null && value !== "";
}

export function rememberFileIds(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  const map = loadMap();
  let changed = false;
  for (const pair of pairs) {
    if (!usable(pair?.localId) || !usable(pair?.fileId)) continue;
    map[String(pair.localId)] = String(pair.fileId);
    changed = true;
  }
  if (changed) saveMap(map);
}

export function lookupFileId(localId) {
  if (!usable(localId)) return null;
  return loadMap()[String(localId)] || null;
}

export default { rememberFileIds, lookupFileId };
