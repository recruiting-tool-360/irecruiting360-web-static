import store from "src/store";
import { generateJobPostingFromResume } from "src/util/jobPostingGenerator";

/**
 * 按 positionId(headcountId) 批量拉 i人事职位详情并算出 JD 文本，返回 { [positionId]: jdText }。
 *
 * 背景：i人事 `application/position`（getApplicationPosition）接口**不带 jd**
 * （见 SSOLogin.rebuildPositionList 原本硬写 jd:''）。真正的 JD 要调
 * `ihrBridge.batchGetPositionDetailByIds` + `generateJobPostingFromResume` 现算。
 *
 * 用途：在「createChatPlus 同步职位列表」之前预拉 JD，让同步进后端的 chat 就带上 JD，不再写空串。
 * 同时会把算出的 JD 写进 store 的 positionJdCache，后续 chatList 渲染 / auto-send-jd 直接命中。
 *
 * 失败 / 非客户端（无 ihrBridge）→ 返回 {}，调用方自然回退空串（不影响主流程）。
 *
 * @param {Array<string|number>} positionIds  headcountId 列表
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchJdMapForPositions(positionIds) {
  const map = {};
  const ihrBridge = window?.api?.ihrBridge;
  if (!ihrBridge || typeof ihrBridge.batchGetPositionDetailByIds !== "function") return map;
  const ids = (positionIds || []).filter((id) => id != null && id !== "");
  if (ids.length === 0) return map;
  try {
    const res = await ihrBridge.batchGetPositionDetailByIds(ids);
    const list = res?.success && Array.isArray(res.data) ? res.data : [];
    for (const item of list) {
      const headcountBasic = item?.headcountBasic;
      if (!headcountBasic?.headcountId) continue;
      const enums = {
        salaryTypes: item?.salaryTypes || [],
        workYears: item?.workYears || [],
        positionTypes: item?.positionTypes || [],
        diplomaTypes: item?.diplomaTypes || []
      };
      try {
        const aiText = generateJobPostingFromResume(headcountBasic, enums);
        if (aiText) {
          const pid = String(headcountBasic.headcountId);
          map[pid] = aiText;
          // 顺手写进 cache，后续 chatList 渲染 / auto-send-jd 直接命中
          try {
            store.commit("PATCH_POSITION_JD_CACHE", { positionId: pid, jd: aiText });
          } catch (_e) {
            /* cache 写入失败不阻塞 */
          }
        }
      } catch (e) {
        console.warn("[positionJdFetcher] 生成 JD 失败:", e?.message || e);
      }
    }
  } catch (e) {
    console.warn(
      "[positionJdFetcher] batchGetPositionDetailByIds 失败:",
      e?.message || e
    );
  }
  return map;
}
