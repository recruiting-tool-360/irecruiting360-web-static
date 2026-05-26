/**
 * saveCondition 响应缓存（按 searchConditionId 索引，永久存储到 localStorage）
 *
 * 用途：避免重复调 /search/saveCondition。
 *
 *   1. 主动启动任务（handleAggregateSearch）：
 *      prepareConditionOnly → saveCondition 拿到 data → 通过 task.searchRequestData 透传给 executor，
 *      同时写缓存（这里）；executor 看到 task.searchRequestData 有值就跳过 saveCondition
 *
 *   2. current 拉的任务（重启 / cleanupOrphanRunningAndResume / currentTaskPoller）：
 *      task.searchRequestData = null（后端 current 响应没有这个本地字段），
 *      但 task.channels[i].searchConditionId 是后端绑定的；
 *      runTask 调 executor 前 → 按 condId 查缓存 → 命中则直接当 searchRequestData 用 → 跳过 saveCondition
 *
 *   3. 兜底场景（createTask 后立即 resumeFromCurrent 覆盖 task.searchRequestData=null）：
 *      靠缓存反查也能恢复，runTask 不会拿到 null
 *
 * 存储：localStorage 永久，重启客户端 / 同浏览器跨 tab 都能复用。
 *
 * ⚠️ TODO（推荐路径）：等后端提供 `GET /search/getConditionById?id=xxx` 接口
 *    （返回结构跟 saveCondition data 同构：{ id, channelSearchConditions[], config[], ... }），
 *    可以删掉本地缓存模块，改成 runTask 内部按 condId 调这个接口反查。
 *
 *    后端接口比本地缓存更可靠：
 *      - 避免本地缓存过期 / 跨 client 不共享 / 用户清浏览器缓存的场景
 *      - 跨设备查看同一 task 的"重跑"也能拿到原始条件
 *    本地缓存只是过渡方案。
 */

const STORAGE_KEY = "ikuaizhao-search-condition-cache";

/** 内存级 cache（首次访问从 localStorage hydrate，避免每次都 JSON.parse） */
let _memoryCache = null;

function _loadFromStorage() {
  if (_memoryCache) return _memoryCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _memoryCache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("[searchConditionCache] localStorage 读取失败:", e?.message || e);
    _memoryCache = {};
  }
  return _memoryCache;
}

function _persistToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_memoryCache || {}));
  } catch (e) {
    // QuotaExceededError / Safari 隐私模式等场景：内存里仍有数据，本次 session 能用
    console.warn("[searchConditionCache] localStorage 写入失败:", e?.message || e);
  }
}

/**
 * 写入缓存。saveCondition 成功后调用。
 *
 * @param {string|number} id    searchConditionId
 * @param {object} data         saveCondition 响应的 data 对象（含 channelSearchConditions / config / id 等）
 */
export function setConditionCache(id, data) {
  if (!id || !data || typeof data !== "object") return;
  const cache = _loadFromStorage();
  cache[String(id)] = {
    data,
    cachedAt: Date.now()
  };
  _persistToStorage();
  console.log(
    `[searchConditionCache] set ok id=${id} channels=${data.channelSearchConditions?.length || 0}`
  );
}

/**
 * 读取缓存。runTask 调 executor 前，按 task.channels[i].searchConditionId 反查。
 *
 * @param {string|number} id    searchConditionId
 * @returns {object | null}     saveCondition 同构 data，或 null
 */
export function getConditionCache(id) {
  if (!id) return null;
  const cache = _loadFromStorage();
  const entry = cache[String(id)];
  if (!entry?.data) return null;
  // 防御：缓存里的 data 至少要有 channelSearchConditions 才能给 channel 组件用，
  // 否则不如让 executor 走 saveCondition 兜底
  if (!Array.isArray(entry.data.channelSearchConditions)) return null;
  return entry.data;
}

/**
 * 清除某个 id 的缓存（业务侧用得少；主要给调试 / 删除任务时用）
 *
 * @param {string|number} id
 */
export function clearConditionCache(id) {
  if (!id) return;
  const cache = _loadFromStorage();
  if (cache[String(id)]) {
    delete cache[String(id)];
    _persistToStorage();
  }
}

/**
 * 清除全部缓存（退出登录 / 切换用户 / 手动调试时用）
 */
export function clearAllConditionCache() {
  _memoryCache = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_e) {
    /* ignore */
  }
  console.log("[searchConditionCache] 全部清空");
}

/**
 * 调试用：返回当前缓存的所有 condId 列表
 */
export function listConditionCacheIds() {
  const cache = _loadFromStorage();
  return Object.keys(cache);
}

export default {
  set: setConditionCache,
  get: getConditionCache,
  clear: clearConditionCache,
  clearAll: clearAllConditionCache,
  listIds: listConditionCacheIds
};
