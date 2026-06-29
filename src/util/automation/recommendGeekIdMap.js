/**
 * 推荐牛人「本地 id ↔ BOSS encryptGeekId」映射（sessionStorage 持久化）。
 *
 * 背景：
 *   - BOSS 推荐页 DOM 卡片上的 `data-geekid` 是**加密的 encryptGeekId**（形如 `xxx~~`）。
 *   - 而「查看任务结果」时推荐列表是后端归一化数据，ResumeCard 拿到的 `resume.id`
 *     是 i 人事的 `resumeBlindId`（本地 id），**不带** encryptGeekId，
 *     没法直接跟 DOM 的 data-geekid 字符串匹配 → 「立即沟通」找不到牛人。
 *
 * 方案：
 *   在调 `/search/taskChannel/{id}/results` 落库推荐结果时，后端返回的
 *   `resumeBlindId / taskResumeId` 跟我们手里原始 geek 的 `encryptGeekId` 是一一对应的，
 *   把这份对应关系写进 sessionStorage。之后「立即沟通」用 resume 的本地 id 反查出
 *   encryptGeekId，再去 DOM 精确匹配 `data-geekid`，比按姓名兜底可靠得多。
 *
 * 为什么用 sessionStorage：
 *   encryptGeekId 是 BOSS 会话级 token（重开 BOSS 页可能换一批），跨会话缓存意义不大，
 *   且「跑任务 → 查看结果 → 立即沟通」通常都在同一次客户端会话内完成。
 */

const STORAGE_KEY = "recommendGeekIdMap";

function safeGetStorage() {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch (_e) {
    return null;
  }
}

function loadMap() {
  const ss = safeGetStorage();
  if (!ss) return {};
  try {
    return JSON.parse(ss.getItem(STORAGE_KEY) || "{}") || {};
  } catch (_e) {
    return {};
  }
}

function saveMap(map) {
  const ss = safeGetStorage();
  if (!ss) return;
  try {
    ss.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("[recommendGeekIdMap] 写入 sessionStorage 失败（忽略）:", e?.message || e);
  }
}

function isUsable(v) {
  return v !== undefined && v !== null && v !== "" && v !== 0;
}

/**
 * 判断一个值是否「像」BOSS encryptGeekId（DOM 上的 data-geekid，形如 `158d...FQ~~`）。
 *
 * 必须排除这几种"短 id"，否则存进去也匹配不到 DOM：
 *   - uniqSign：`rec_510757599`（后端 /results 的 outId 用的就是它）
 *   - 纯数字：plaintext geekId（510757599）/ resumeBlindId（雪花 id）
 *   - 太短的串
 * encryptGeekId 特征：较长（去掉末尾 ~ 后 ≥ 12）、非纯数字、不以 rec_ 开头。
 */
function isLikelyEncryptGeekId(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return false;
  if (s.indexOf("rec_") === 0) return false; // uniqSign
  if (/^\d+$/.test(s)) return false; // 纯数字（plaintext geekId / resumeBlindId）
  if (s.replace(/~+$/, "").length < 12) return false; // 太短，不像加密 id
  return true;
}

/**
 * 记一条「本地 id → encryptGeekId」映射。
 * @param {string|number} localId  resumeBlindId / taskResumeId 等本地 id
 * @param {string} geekId          BOSS encryptGeekId（匹配 DOM data-geekid）
 */
export function rememberGeekId(localId, geekId) {
  if (!isUsable(localId) || !isUsable(geekId)) return;
  // 只存「真·长 encryptGeekId」，挡掉 uniqSign(rec_xxx) / 纯数字短 id，避免污染/覆盖正确值
  if (!isLikelyEncryptGeekId(geekId)) {
    console.warn(`[recommendGeekIdMap] 跳过非 encryptGeekId 值：localId=${localId} geekId=${geekId}`);
    return;
  }
  const map = loadMap();
  map[String(localId)] = String(geekId);
  saveMap(map);
}

/**
 * 批量记映射。
 * @param {Array<{ localId: string|number, geekId: string }>} pairs
 */
export function rememberGeekIds(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  const map = loadMap();
  let changed = false;
  let skipped = 0;
  for (const p of pairs) {
    if (!p || !isUsable(p.localId) || !isUsable(p.geekId)) continue;
    // 只存真·长 encryptGeekId，挡掉 uniqSign(rec_xxx)/纯数字短 id（防止覆盖正确值）
    if (!isLikelyEncryptGeekId(p.geekId)) {
      skipped++;
      continue;
    }
    map[String(p.localId)] = String(p.geekId);
    changed = true;
  }
  if (changed) {
    saveMap(map);
    console.log(
      `[recommendGeekIdMap] 记录 id→encryptGeekId 映射（本次有效 ${pairs.length - skipped}/${pairs.length}，累计 ${Object.keys(map).length}）`
    );
  } else if (skipped > 0) {
    console.warn(`[recommendGeekIdMap] 本次 ${skipped} 条均非 encryptGeekId（如 rec_/纯数字），未写入`);
  }
}

/**
 * 用本地 id 反查 encryptGeekId。
 * @param {string|number} localId
 * @returns {string|null}
 */
export function lookupGeekId(localId) {
  if (!isUsable(localId)) return null;
  return loadMap()[String(localId)] || null;
}

export default {
  rememberGeekId,
  rememberGeekIds,
  lookupGeekId
};
