/**
 * 搜索渠道「增量搜索去重 + 自动翻页」工具
 *
 * 场景：执行「保留增量搜索」(CONTINUE) 时，渠道重新抓取会拿到很多**已经入库**的简历（重复）。
 *   需求：把已存在的简历过滤掉（用 getTaskChannelResumeIds 拿已保存的 outId），
 *        如果当前页过滤后未凑够「一页」的新数据，就**延时 5s 自动翻下一页**继续抓，
 *        直到攒够一页完整的新数据 或 没有更多页为止。
 *   一页大小（channelCountSize，由各渠道 manager 返回）：智联 20 / 51job 50 / BOSS 15。
 *
 * 只对 CONTINUE（保留增量搜索）生效；INITIAL / RESTART（清空重新搜索）保持单页原逻辑。
 *
 * 各渠道 SEARCH 列表项的唯一 outId 字段（跟后端 getTaskChannelResumeIds 的 channelResumeId/outId 对应）：
 *   - BOSS：uniqSign
 *   - 智联(ZHILIAN)：resumeNumber
 *   - 前程无忧(JOB51)：userid
 */
import { getTaskChannelResumeIds } from "src/api/searchTaskApi";

const OUTID_EXTRACTORS = {
  BOSS: (it) => it?.uniqSign,
  ZHILIAN: (it) => it?.resumeNumber,
  JOB51: (it) => it?.userid
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 当前 chat 最新任务是否「保留增量搜索」(CONTINUE) */
export function isContinueTaskForChat(store, chatId) {
  try {
    const t = store?.getters?.["SearchTasks/getLatestTaskByChat"]?.(chatId);
    return t?.taskType === "CONTINUE";
  } catch {
    return false;
  }
}

/**
 * 收集该 chat 该渠道「已保存」简历的 outId 集合（增量去重用）。
 * 扫该 chat 所有任务里 businessChannel=SEARCH 且 channelSubType=该渠道 的 taskChannel，
 * 逐个调 getTaskChannelResumeIds 取 channelResumeId/outId 并合并。
 *
 * @param {import('vuex').Store} store
 * @param {string} chatId
 * @param {'BOSS'|'ZHILIAN'|'JOB51'} channelSubType
 * @returns {Promise<Set<string>>}
 */
export async function collectSavedOutIds(store, chatId, channelSubType) {
  const set = new Set();
  if (!store || !chatId || !channelSubType) return set;
  try {
    const st = store.state?.SearchTasks || {};
    const ids = st.chatTaskIdx?.[chatId] || [];
    const tcIds = [];
    for (const tid of ids) {
      const t = st.tasksById?.[tid];
      if (!t || !Array.isArray(t.channels)) continue;
      for (const ch of t.channels) {
        if (
          ch &&
          ch.businessChannel === "SEARCH" &&
          ch.channelSubType === channelSubType &&
          ch.taskChannelId
        ) {
          tcIds.push(String(ch.taskChannelId));
        }
      }
    }
    const uniqueIds = [...new Set(tcIds)];
    if (uniqueIds.length === 0) return set;
    const resps = await Promise.all(
      uniqueIds.map((id) => getTaskChannelResumeIds(id).catch(() => null))
    );
    for (const r of resps) {
      const list = r?.data?.taskResumes || r?.taskResumes || [];
      if (!Array.isArray(list)) continue;
      for (const tr of list) {
        const oid = tr?.channelResumeId ?? tr?.outId;
        if (oid != null && oid !== "") set.add(String(oid));
      }
    }
    console.log(
      `[searchChannelDedup] ${channelSubType} 已保存 outId 数=${set.size}（taskChannels=${uniqueIds.length}）`
    );
  } catch (e) {
    console.warn("[searchChannelDedup] collectSavedOutIds 失败:", e?.message || e);
  }
  return set;
}

/**
 * 拉一页搜索结果（可能多页累计）：
 *   - 普通搜索（非 CONTINUE）：直接拉 startPage 一页返回（原逻辑）。
 *   - 保留增量搜索（CONTINUE）：拉页 → 过滤已保存(savedOutIds)/本次已收 → 累计未保存新人；
 *     不足一页(channelCountSize) 且 还有下一页 → 延时 delayMs 翻下一页；
 *     直到攒够一页新人 或 没有更多页 / 达到 maxPages。
 *
 * @param {object} opts
 * @param {import('vuex').Store} opts.store
 * @param {string} opts.chatId
 * @param {'BOSS'|'ZHILIAN'|'JOB51'} opts.channelSubType
 * @param {object|null} opts.searchRequestData
 * @param {number} [opts.startPage=1]
 * @param {(searchRequestData:object, page:number)=>Promise<object>} opts.channelSearchList
 *        渠道 manager 的 channelSearchList，返回 config（含 dataList/channelPage/totalPage/channelCountSize）
 * @param {(config:object)=>void} [opts.onPageConfig] 每页拿到 config 回调（更新 store 分页 meta）
 * @param {number} [opts.delayMs=5000]
 * @param {number} [opts.maxPages=20]
 * @returns {Promise<object|null>} 一个 config 对象（dataList 为最终要保存的列表）；拿不到返回 null
 */
export async function runChannelSearchWithDedup(opts) {
  const {
    store,
    chatId,
    channelSubType,
    searchRequestData,
    startPage = 1,
    channelSearchList,
    onPageConfig,
    delayMs = 5000,
    maxPages = 20
  } = opts || {};

  // 非增量：原单页逻辑
  if (!isContinueTaskForChat(store, chatId)) {
    const cfg = await channelSearchList(searchRequestData, startPage);
    if (cfg && typeof onPageConfig === "function") onPageConfig(cfg);
    return cfg || null;
  }

  // 增量：去重 + 自动翻页
  const savedOutIds = await collectSavedOutIds(store, chatId, channelSubType);
  const extractOutId = OUTID_EXTRACTORS[channelSubType] || (() => null);

  const newItems = [];
  const seen = new Set(); // 本次跨页去重
  let page = startPage;
  let lastConfig = null;
  let pageSize = 0;

  for (let i = 0; i < maxPages; i++) {
    const cfg = await channelSearchList(searchRequestData, page);
    if (!cfg) break;
    lastConfig = cfg;
    if (typeof onPageConfig === "function") onPageConfig(cfg);

    pageSize = Number(cfg.channelCountSize) || pageSize || 0;
    const list = Array.isArray(cfg.dataList) ? cfg.dataList : [];

    let pageNew = 0;
    for (const item of list) {
      const oid = extractOutId(item);
      const key = oid != null ? String(oid) : "";
      if (key && savedOutIds.has(key)) continue; // 已入库 → 跳过
      if (key && seen.has(key)) continue; // 本次已收 → 跳过
      if (key) seen.add(key);
      newItems.push(item);
      pageNew++;
    }

    const curPage = Number(cfg.channelPage) || page;
    // manager 返回的 config 不一定带 totalPage（store mutation 才算），这里用 总数/页大小 兜底推导
    const total = Number(cfg.channelDataTotal) || 0;
    const size = Number(cfg.channelCountSize) || pageSize || 0;
    const totalPage = Number(cfg.totalPage) || (size > 0 ? Math.ceil(total / size) : 0);
    const hasMore = totalPage > 0 ? curPage < totalPage : list.length > 0;

    console.log(
      `[searchChannelDedup] ${channelSubType} 第${curPage}页：返回${list.length} 本页新人${pageNew} 累计新人${newItems.length}/${pageSize} hasMore=${hasMore}`
    );

    // 攒够一页新人 / 没有更多 / 本页空 → 结束
    if ((pageSize > 0 && newItems.length >= pageSize) || !hasMore || list.length === 0) break;

    await sleep(delayMs);
    page = curPage + 1;
  }

  if (!lastConfig) return null;
  // 用累计的「未入库新人」替换 dataList 返回给调用方保存
  return { ...lastConfig, dataList: newItems };
}

export default { isContinueTaskForChat, collectSavedOutIds, runChannelSearchWithDedup };
