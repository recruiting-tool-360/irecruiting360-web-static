import service from "src/api/request";
import { MOCK_PROFILE_AREA_TREE } from "src/mock/profileKnowledgeAreaTree";

/**
 * 职位画像知识库接口。
 *
 * 协议（已与后端确认）：
 *   - GET  /ihire/profile/knowledge/initialize   无参，返回 { HIGHEST_EDUCATION, FIRST_EDUCATION, WORK_STABILITY }
 *   - GET  /ihire/profile/knowledge/area/tree    无参，返回省市区树
 *   - POST /ihire/profile/knowledge/search       { dataType, keyword, structureType }
 *        dataType      = 维度的 data_type（1..13）
 *        structureType = 1 结构化 / 2 标签化
 *
 * 「不限」接口不返回，由前端本地固定补。
 */

let initializePromise = null;
let areaTreePromise = null;

function unwrap(resp) {
  if (!resp) return null;
  return resp.data !== undefined ? resp.data : resp;
}

/** 最高学历 / 第一学历 / 工作稳定性下拉数据源（进程内缓存） */
export function getProfileKnowledgeInitialize() {
  if (!initializePromise) {
    initializePromise = service
      .get("/ihire/profile/knowledge/initialize")
      .then((resp) => unwrap(resp) || {})
      .catch((e) => {
        console.warn("[ProfileKnowledge] initialize 失败:", e?.message || e);
        initializePromise = null;
        return {};
      });
  }
  return initializePromise;
}

/** 意向工作城市级联数据源（进程内缓存） */
export function getProfileKnowledgeAreaTree() {
  if (!areaTreePromise) {
    areaTreePromise = service
      .get("/ihire/profile/knowledge/area/tree")
      .then((resp) => {
        const data = unwrap(resp);
        const list = Array.isArray(data) ? data : [];
        if (list.length) return list;
        console.warn("[ProfileKnowledge] area/tree 返回为空，暂用 mock 城市数据");
        // 不缓存 mock 结果：接口部署后下一次调用会重新请求真实数据
        areaTreePromise = null;
        return MOCK_PROFILE_AREA_TREE;
      })
      .catch((e) => {
        console.warn("[ProfileKnowledge] area/tree 失败，暂用 mock 城市数据:", e?.message || e);
        areaTreePromise = null;
        return MOCK_PROFILE_AREA_TREE;
      });
  }
  return areaTreePromise;
}

/** 模糊搜索（院校 / 专业 / 历任公司 / 专业技能 / 软实力 / 工作经历） */
export async function searchProfileKnowledge({ dataType, keyword = "", structureType = 1 }) {
  const resp = await service.post("/ihire/profile/knowledge/search", {
    dataType,
    keyword,
    structureType
  });
  const data = unwrap(resp);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.dataList)) return data.dataList;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

export function resetProfileKnowledgeCache() {
  initializePromise = null;
  areaTreePromise = null;
}
