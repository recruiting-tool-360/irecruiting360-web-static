import { queryEvaluationReport } from "src/api/jobList/JobListApi";

/**
 * 把 i 快招 H5 SPA 发出的 resumeList payload 转换成后端 noauth/addPools 或
 * noauth/import 期望的 CandidateResumeAiManagerListCommand 结构。
 *
 * 1:1 对照 ihr360-recruit-static/src/pages/recruit-assistant/index.tsx
 *   - handleUpload(resumeFile)
 *   - saveTalentPoolSuccessfully(talentPoolIds)
 *   - savePositionSuccessfully(headcountId)
 *
 * ── H5 SPA 发出来的原 payload ───────────────────────────────────────────
 * {
 *   action: 'talent-pool' | 'assign-position',
 *   positionId: '<headcountId 用>',
 *   resumeFile: [{ id, file:<Blob>, channel:'BOSS直聘', fileType, url, type, isMaster, ... }],
 *   fileConfig: { type:'html', count:1 }
 * }
 *
 * ── 后端期望（docs/07-ihr-client-usage.md §6.2/§7） ─────────────────────
 * {
 *   isSelectPosition: false,        // phase-1 固定 false
 *   isMaybeResumeInfos: false,
 *   talentPoolIds: [<numeric>],     // talent-pool 必须
 *   headcountId: '<id>',            // assign-position 必须
 *   resumeInfo: [{ id: taskResumeId, channel:<numeric>, fileId, link, type }]
 * }
 *
 * ── 鉴权（2026-05-18 起全部统一） ─────────────────────────────────────
 *   全部 6 个客户端调用都走 accessToken / noauth 包装：
 *     - getSharedCandidateResume  → noauth/resume/init        （2026-05-18 上线）
 *     - uploadFile                → noauth/resume/upload      （2026-05-18 上线）
 *     - addPools / assignPositions → noauth/addPools / import
 *   见 docs/07-ihr-client-usage.md §2。
 *
 * 严格策略：channel 必须来自 resume/init，fileId 必须由 resume/upload 返回。
 * 任一环节缺失都直接阻止后续 import，不能携带猜测值或占位值请求招聘接口。
 */

// ============= 工具函数 =============

/**
 * 加入人才库时 init 未返回 talentPools 的历史兜底值。
 *
 * ⚠️ 该值后端肯定不会真接受——加它只是为了让 phase-1 还能成功走到接口、拿到一个**更明确的字段错误**
 * 而不是 9001/HTTP 200 不带 message。如果在日志里看到它们被发出去，去查：
 *   1. accessToken 是否过期 / 缺失（getAccessTokenStatus()）
 *   2. noauth/resume/init 网关是否报错
 *   3. H5 是否显式传了可用 talentPoolIds
 */
const PLACEHOLDER_TALENT_POOL_ID = 1;

/** 把 Blob/File 转为 ihrBridge.uploadFile 入参 */
async function fileToTransfer(file, fallbackName) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  return {
    arrayBuffer: await file.arrayBuffer(),
    name: file.name || fallbackName || "upload.bin",
    mime: file.type || "application/octet-stream"
  };
}

/**
 * "BOSS直聘" 等 label → 当前招聘公司的渠道配置 ID。
 *
 * 新契约要求 channel 必须来自 resume/init；找不到时直接阻止请求，
 * 不能使用本地硬编码渠道 ID，否则可能把候选人导入到其它公司的渠道配置。
 */
function mapChannel(label, channelsMap) {
  if (!channelsMap || channelsMap.size === 0) {
    throw new Error("招聘渠道配置尚未加载，请稍后重试");
  }
  if (channelsMap.has(label)) return channelsMap.get(label);
  // 常见 alias 容错（拿到 channelsMap 但 label 大小写/别名不完全匹配时）
  const aliases = {
    BOSS直聘: ["BOSS直聘", "boss直聘", "BOSS", "boss"],
    智联招聘: ["智联招聘", "智联", "zhilian"],
    前程无忧: ["前程无忧", "51job", "51Job", "job51"],
    猎聘: ["猎聘", "liepin", "LIEPIN"]
  };
  const normalizedLabel = String(label || "").trim().toLowerCase();
  for (const [configuredLabel, value] of channelsMap.entries()) {
    const normalizedConfiguredLabel = String(configuredLabel).trim().toLowerCase();
    if (normalizedConfiguredLabel === normalizedLabel) return value;
    for (const channelAliases of Object.values(aliases)) {
      const normalizedAliases = channelAliases.map((alias) => alias.toLowerCase());
      if (
        normalizedAliases.includes(normalizedLabel) &&
        normalizedAliases.includes(normalizedConfiguredLabel)
      ) {
        return value;
      }
    }
  }
  throw new Error(`当前招聘公司未配置渠道：${label || "unknown"}`);
}

/** IrsTreeSelect 风格的 talentPools 树扁平化 */
function flattenTalentPools(tree) {
  const out = [];
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      const id = n?.value ?? n?.id ?? n?.key;
      if (id !== undefined && id !== null && id !== "") {
        out.push({ id, label: n?.label ?? n?.title ?? String(id) });
      }
      if (Array.isArray(n?.children) && n.children.length > 0) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

async function callIhrBridge(ihrBridge, method, body, action) {
  console.info(`[IHR Action][ihrAdapter] ${action}:ipc-invoke`, {
    method,
    body
  });
  if (typeof ihrBridge?.[method] !== "function") {
    console.error(`[IHR Action][ihrAdapter] ${action}:ipc-unavailable`, {
      method,
      availableMethods: Object.keys(ihrBridge || {})
    });
    return {
      success: false,
      code: -1,
      errorCode: "OTHER",
      message: `ihrBridge.${method} 不可用`
    };
  }
  const startedAt = Date.now();
  try {
    const result = await ihrBridge[method](body);
    console.info(`[IHR Action][ihrAdapter] ${action}:ipc-returned`, {
      method,
      elapsedMs: Date.now() - startedAt,
      success: result?.success,
      code: result?.code ?? "-",
      errorCode: result?.errorCode ?? "-",
      httpStatus: result?.httpStatus ?? "-",
      message: result?.message ?? "-",
      data: result?.data ?? null
    });
    return result;
  } catch (error) {
    console.error(`[IHR Action][ihrAdapter] ${action}:ipc-error`, {
      method,
      elapsedMs: Date.now() - startedAt,
      message: error?.message || String(error),
      stack: error?.stack || ""
    });
    throw error;
  }
}

// ============= 拉 init / 上传文件（best-effort） =============

let _initCache = null;
/**
 * 同会话缓存一次 init，失败时返回**临时**空对象但**不写缓存**，下次有机会重试。
 *
 * ⚠️ 历史踩坑：之前失败也写缓存，结果"用户在 token 还没到位时点了加入人才库 → init 失败 →
 *    _initCache 被设成空对象 → 之后 token 到位也再也不会重试 init 了"。
 *    现在改成只有真正拿到数据才落缓存。
 */
async function fetchInitBestEffort(ihrBridge) {
  if (_initCache) {
    console.info("[IHR Action][ihrAdapter] init:cache-hit", {
      channelCount: _initCache.channelsMap?.size || 0,
      talentPoolCount: _initCache.talentPools?.length || 0
    });
    return _initCache;
  }
  console.info("[IHR Action][ihrAdapter] init:start");
  const emptyFallback = {
    channelsMap: new Map(),
    talentPools: [],
    resumeCenteralUpload: false
  };
  try {
    const res = await ihrBridge.getSharedCandidateResume();
    if (!res?.success) {
      // 期望路径：noauth/resume/init 2026-05-18 已上线，正常应 success=true
      // 失败 → accessToken 异常 / 网关错误。**不写缓存**，下次还能重试。
      console.warn(
        "[ihrAdapter] noauth/resume/init 失败，本次使用空兜底但不写缓存（下次重试）",
        res?.errorCode || "",
        res?.message
      );
      console.warn("[IHR Action][ihrAdapter] init:failed", {
        code: res?.code ?? "-",
        errorCode: res?.errorCode ?? "-",
        message: res?.message ?? "-"
      });
      return emptyFallback;
    }
    const init = res.data || {};
    const channelsMap = new Map();
    (init.channels || []).forEach((c) => {
      if (c && c.label !== undefined) channelsMap.set(c.label, c.value);
    });
    _initCache = {
      channelsMap,
      talentPools: flattenTalentPools(init.talentPools),
      resumeCenteralUpload: !!init.resumeCenteralUpload
    };
    console.log(
      `[ihrAdapter] init ok: channels=${channelsMap.size} pools=${_initCache.talentPools.length} central=${_initCache.resumeCenteralUpload}`
    );
    console.info("[IHR Action][ihrAdapter] init:finished", {
      channelCount: channelsMap.size,
      talentPoolCount: _initCache.talentPools.length,
      centralUpload: _initCache.resumeCenteralUpload
    });
    return _initCache;
  } catch (e) {
    console.warn(
      "[ihrAdapter] getSharedCandidateResume 异常（不写缓存，下次重试）",
      e?.message || e
    );
    console.error("[IHR Action][ihrAdapter] init:error", {
      message: e?.message || String(e)
    });
    return emptyFallback;
  }
}

/**
 * 上传所有 resumeFile，组装 resumeInfo[]。
 * channel 或 fileId 任一无效都会直接失败，避免携带错误数据请求招聘接口。
 */
async function buildResumeInfo(resumeFile, channelsMap, centralUpload, ihrBridge) {
  console.info("[IHR Action][ihrAdapter] resume-info:start", {
    resumeCount: Array.isArray(resumeFile) ? resumeFile.length : 0,
    channelCount: channelsMap?.size || 0,
    centralUpload: !!centralUpload
  });
  if (!Array.isArray(resumeFile) || resumeFile.length === 0) return [];
  const resumeInfo = await Promise.all(
    resumeFile.map(async (item) => {
      const base = {
        id: item?.id,
        channel: mapChannel(item?.channel, channelsMap),
        link: item?.link || item?.url || "",
        type: item?.type || "normal"
      };
      if (item?.fileId) {
        return { ...base, fileId: item.fileId };
      }
      const transfer = await fileToTransfer(
        item?.file,
        `${item?.channel || "ch"}-${item?.id || "unknown"}.${item?.fileType || "bin"}`
      );
      if (!transfer) {
        throw new Error(`候选人 ${item?.id || "unknown"} 缺少可上传的简历文件`);
      }
      try {
        // centralUpload 已被 noauth/resume/upload 统一吞掉，但保留参数以免 H5 侧旧调用方报错
        const uploadRes = await ihrBridge.uploadFile({ ...transfer, centralUpload });
        if (!uploadRes?.success) {
          throw new Error(
            `候选人 ${item?.id || "unknown"} 简历上传失败：${
              uploadRes?.message || "未返回 fileId"
            }`
          );
        }
        // noauth/resume/upload 返回结构跟旧接口对齐：{ code:0, data:"<fileId>" }
        const fileId =
          typeof uploadRes.data === "string"
            ? uploadRes.data
            : uploadRes.data?.fileId || uploadRes.data?.id;
        if (!fileId) {
          throw new Error(`候选人 ${item?.id || "unknown"} 上传后未返回 fileId`);
        }
        return { ...base, fileId };
      } catch (e) {
        throw new Error(
          `候选人 ${item?.id || "unknown"} 简历上传失败：${e?.message || String(e)}`
        );
      }
    })
  );
  console.info("[IHR Action][ihrAdapter] resume-info:finished", {
    resumeCount: resumeInfo.length,
    items: resumeInfo.map((item) => ({
      id: item.id,
      channel: item.channel,
      hasFileId: !!item.fileId,
      fileId: item.fileId,
      type: item.type
    }))
  });
  return resumeInfo;
}

/**
 * phase-1 返回的候选人对象不包含源文件 fileId，但 phase-2 仍需要用它确认导入。
 * 优先用简历编号/详情链接匹配 phase-1 请求项，无法唯一定位时仅在数量一致时按序兜底。
 */
function attachSourceFileIds(resumeInfos, sourceResumeInfo) {
  if (!Array.isArray(resumeInfos) || resumeInfos.length === 0) return resumeInfos;
  const sources = Array.isArray(sourceResumeInfo) ? sourceResumeInfo : [];
  const usedSourceIndexes = new Set();

  return resumeInfos.map((resumeInfo, index) => {
    if (resumeInfo?.fileId) return resumeInfo;

    const sourceResumeNo =
      resumeInfo?.candidateSource?.sourceResumeNo ||
      resumeInfo?.resume?.sourceResumeNo ||
      resumeInfo?.aiResumeId ||
      resumeInfo?.resumeId;
    let sourceIndex = sourceResumeNo
      ? sources.findIndex(
          (source, sourceIndex) =>
            !usedSourceIndexes.has(sourceIndex) &&
            String(source?.id || "") === String(sourceResumeNo)
        )
      : -1;

    const sourceLink =
      resumeInfo?.candidateSource?.sourceResumeLink ||
      resumeInfo?.resume?.sourceResumeLink;
    if (sourceIndex < 0 && sourceLink) {
      sourceIndex = sources.findIndex(
        (source, sourceIndex) =>
          !usedSourceIndexes.has(sourceIndex) && source?.link === sourceLink
      );
    }

    if (sourceIndex < 0 && sources.length === resumeInfos.length) {
      sourceIndex = index;
    }

    const source = sources[sourceIndex];
    if (!source?.fileId) {
      console.warn("[IHR Action][ihrAdapter] phase-2:fileId-missing", {
        index,
        hasSourceResumeNo: !!sourceResumeNo,
        hasSourceLink: !!sourceLink,
        sourceCount: sources.length,
        resumeCount: resumeInfos.length
      });
      return resumeInfo;
    }

    usedSourceIndexes.add(sourceIndex);
    return {
      ...resumeInfo,
      fileId: source.fileId
    };
  });
}

const CANDIDATE_GROUPS = [
  "newResumeInfos",
  "maybeResumeInfos",
  "repeatResumeInfos"
];

function reportError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function unwrapEvaluationReportPayload(response) {
  let data = response?.data ?? response;
  if (data?.report) data = data.report;
  if (data?.evaluationReport) data = data.evaluationReport;
  if (
    data?.data &&
    !data?.scoreStatus &&
    !data?.scoringProfile &&
    !data?.harnessScoreReport
  ) {
    data = data.data;
  }
  return data && typeof data === "object" ? data : null;
}

/**
 * 把本次 i快招评分的报告快照补到 phase-1 候选人对象。
 *
 * 报告必须与候选人的 aiResumeId、原始 file.fileId 和 scoringSourceFileId
 * 指向同一次评分，任何一项不一致都不能继续确认分配。
 */
async function enrichCandidateWithEvaluationReport(candidate) {
  const taskResumeId = candidate?.aiResumeId;
  if (taskResumeId === undefined || taskResumeId === null || taskResumeId === "") {
    throw reportError(
      "REPORT_CANDIDATE_ID_MISSING",
      "第一阶段候选人缺少 aiResumeId，无法查询评估报告"
    );
  }

  let reportResponse;
  try {
    reportResponse = await queryEvaluationReport({
      taskResumeId: String(taskResumeId)
    });
  } catch (error) {
    throw reportError(
      "REPORT_REQUEST_FAILED",
      `候选人 ${taskResumeId} 的评估报告查询失败：${error?.message || String(error)}`,
      { taskResumeId, cause: error }
    );
  }

  const reportData = unwrapEvaluationReportPayload(reportResponse);
  if (reportResponse?.success !== "success" || !reportData) {
    throw reportError(
      "REPORT_NOT_READY",
      `候选人 ${taskResumeId} 的评估报告尚未完成`,
      { taskResumeId, response: reportResponse }
    );
  }

  if (
    reportData.scoreStatus !== "SCORED" ||
    reportData.evaluationStatus?.code !== "COMPLETED" ||
    reportData.evaluationStatus?.reportAvailable !== true ||
    !reportData.scoringProfile ||
    !reportData.harnessScoreReport
  ) {
    throw reportError(
      "REPORT_NOT_READY",
      `候选人 ${taskResumeId} 的评估报告尚未完成`,
      { taskResumeId, reportData }
    );
  }

  const sourceFileId = reportData.scoringProfile.sourceFileId;
  const candidateFileId = candidate?.file?.fileId;
  const candidateScoringSourceFileId = candidate?.scoringSourceFileId;
  if (
    sourceFileId === undefined ||
    sourceFileId === null ||
    sourceFileId === "" ||
    String(sourceFileId) !== String(candidateFileId) ||
    String(sourceFileId) !== String(candidateScoringSourceFileId)
  ) {
    throw reportError(
      "REPORT_FILE_ID_MISMATCH",
      `候选人 ${taskResumeId} 的原始简历 fileId 不一致`,
      {
        taskResumeId,
        sourceFileId,
        candidateFileId,
        candidateScoringSourceFileId
      }
    );
  }

  return {
    ...candidate,
    scoringSourceFileId: sourceFileId,
    scoringProfile: reportData.scoringProfile,
    harnessScoreReport: reportData.harnessScoreReport
  };
}

async function enrichCandidateGroups(firstData) {
  const enriched = {};
  await Promise.all(
    CANDIDATE_GROUPS.map(async (group) => {
      const candidates = Array.isArray(firstData?.[group]) ? firstData[group] : [];
      enriched[group] = await Promise.all(
        candidates.map((candidate) => enrichCandidateWithEvaluationReport(candidate))
      );
    })
  );
  return enriched;
}

// ============= 主流程：talent-pool / assign-position =============

/**
 * talent-pool 流程：
 *   1. 拿 channels map + talentPools（best-effort）
 *   2. uploadFile × N → fileId（严格校验）
 *   3. talentPoolIds：先用 H5 payload 显式传的，没有就取第一个 init 拿到的 pool
 *   4. phase-1 addPools(isSelectPosition:false) → 去重
 *   5. phase-2 addPools(isSelectPosition:true)  → 真正落库
 *
 * 注：phase-1 401 / 字段不全时直接返回，不跑 phase-2。
 */
async function runTalentPoolFlow(h5Payload, ihrBridge) {
  console.info("[IHR Action][ihrAdapter] talent-pool:flow-start");
  const init = await fetchInitBestEffort(ihrBridge);
  const resumeInfo = await buildResumeInfo(
    h5Payload?.resumeFile,
    init.channelsMap,
    init.resumeCenteralUpload,
    ihrBridge
  );
  if (resumeInfo.length === 0) {
    return { success: false, code: -1, message: "resumeFile 为空" };
  }

  // talentPoolIds 优先：H5 payload 显式传 → init 拿到的第一个 → 默认占位
  let talentPoolIds;
  if (Array.isArray(h5Payload?.talentPoolIds) && h5Payload.talentPoolIds.length > 0) {
    talentPoolIds = h5Payload.talentPoolIds;
  } else if (init.talentPools.length > 0) {
    talentPoolIds = [init.talentPools[0].id];
    console.warn(
      "[ihrAdapter] H5 未传 talentPoolIds，自动用首个可用人才库:",
      init.talentPools[0].label,
      "id=",
      init.talentPools[0].id
    );
  } else {
    talentPoolIds = [PLACEHOLDER_TALENT_POOL_ID];
    console.warn(
      `[ihrAdapter] noauth/resume/init 没返回任何人才库，用占位 [${PLACEHOLDER_TALENT_POOL_ID}]（后端会拒绝，但能拿到字段错误信息便于定位）`
    );
  }

  const phase1Body = {
    isSelectPosition: false,
    isMaybeResumeInfos: false,
    talentPoolIds,
    resumeInfo
  };
  console.log("[ihrAdapter] phase-1 addPools(去重) body:", phase1Body);
  const p1 = await callIhrBridge(ihrBridge, "addPools", phase1Body, "talent-pool");
  if (!p1?.success) {
    console.warn("[ihrAdapter] phase-1 失败（HTTP/网关层），跳过 phase-2:", p1?.message);
    return p1;
  }
  const dedup = p1.data || {};
  // ⚠️ 不要看 dedup.success！
  // 对照原项目 ihr360-recruit-static/src/pages/recruit-assistant/index.tsx L434/L572：
  //   原项目 saveTalentPoolSuccessfully 和 onConfirm 都只判 `res.code === 0`。
  //   后端 phase-1 阶段返回的 data.success=false 是预期值（dedup 还没真正落库），
  //   只有 phase-2 落库成功后才会变 true。之前在这里加 dedup.success===false 提前 return
  //   会把所有正常请求误判成"业务空跑"，phase-2 永远不会被调用。
  const newCount = (dedup.newResumeInfos || []).length;
  const maybeCount = (dedup.maybeResumeInfos || []).length;
  const repeatCount = (dedup.repeatResumeInfos || []).length;
  console.log(
    `[ihrAdapter] phase-1 dedup: new=${newCount} maybe=${maybeCount} repeat=${repeatCount} (dedup.success=${dedup.success})`
  );
  const totalDedup = newCount + maybeCount + repeatCount;
  if (totalDedup === 0) {
    // 三个数组全空才是真的"简历没被分类"——常见原因 fileId 不合法 / channel id 错。
    // 这种情况 phase-2 没意义（没东西可 commit），直接返回 phase-1 让上层定位字段错。
    console.warn("[ihrAdapter] phase-1 三个 dedup 数组都是空（简历被静默丢弃），跳过 phase-2");
    return {
      success: false,
      code: -1,
      errorCode: "OTHER",
      message: "简历未被后端分类（常见原因：fileId 不合法 / channel id 不对）",
      data: dedup
    };
  }

  // phase-2 严格按 React onConfirm 的转换规则：
  //   - 空数组传 null
  //   - isMaybeResumeInfos 默认 false（原项目 importChecked 默认 false，用户在"校验完成 modal"
  //     里勾选才传 true；客户端目前没移植这个 modal，保守用 false 避免误导入疑似重复）
  //   - talentPoolIds 优先用后端回的（带上去重信息），落到本地传的
  const phase2NewResumeInfos =
    newCount > 0
      ? attachSourceFileIds(dedup.newResumeInfos, resumeInfo)
      : dedup.newResumeInfos;
  const phase2Body = {
    newResumeInfos: newCount > 0 ? phase2NewResumeInfos : null,
    maybeResumeInfos: maybeCount > 0 ? dedup.maybeResumeInfos : null,
    repeatResumeInfos: repeatCount > 0 ? dedup.repeatResumeInfos : null,
    isSelectPosition: true,
    isMaybeResumeInfos: false,
    talentPoolIds: dedup.talentPoolIds || talentPoolIds
  };
  console.log("[ihrAdapter] phase-2 addPools(确认导入) body:", phase2Body);
  return callIhrBridge(ihrBridge, "addPools", phase2Body, "talent-pool");
}

/**
 * assign-position 流程：跟 talent-pool 完全平行，只是 talentPoolIds 换成 headcountId，
 * API 入口换成 assignPositions。
 */
async function runAssignPositionFlow(h5Payload, ihrBridge) {
  const headcountId = h5Payload?.positionId;
  console.info("[IHR Action][ihrAdapter] assign-position:flow-start", {
    headcountId: headcountId || ""
  });
  if (!headcountId) {
    console.error("[IHR Action][ihrAdapter] assign-position:blocked", {
      reason: "missing positionId/headcountId"
    });
    return { success: false, code: -1, message: "缺少 positionId（headcountId）" };
  }
  const init = await fetchInitBestEffort(ihrBridge);
  const resumeInfo = await buildResumeInfo(
    h5Payload?.resumeFile,
    init.channelsMap,
    init.resumeCenteralUpload,
    ihrBridge
  );
  if (resumeInfo.length === 0) {
    return { success: false, code: -1, message: "resumeFile 为空" };
  }

  const phase1Body = {
    isSelectPosition: false,
    isMaybeResumeInfos: false,
    headcountId,
    resumeInfo
  };
  console.info(
    "[IHR Action][ihrAdapter] assign-position:phase-1:request",
    phase1Body
  );
  const p1 = await callIhrBridge(
    ihrBridge,
    "assignPositions",
    phase1Body,
    "assign-position"
  );
  console.info(
    "[IHR Action][ihrAdapter] assign-position:phase-1:response",
    p1
  );
  if (!p1?.success) return p1;
  const dedup = p1.data || {};
  // ⚠️ 同 talent-pool：原项目只判 code===0，不看 dedup.success（phase-1 后它一定是 false）。
  const newCount = (dedup.newResumeInfos || []).length;
  const maybeCount = (dedup.maybeResumeInfos || []).length;
  const repeatCount = (dedup.repeatResumeInfos || []).length;
  console.log(
    `[ihrAdapter] phase-1 dedup: new=${newCount} maybe=${maybeCount} repeat=${repeatCount} (dedup.success=${dedup.success})`
  );
  const totalDedup = newCount + maybeCount + repeatCount;
  if (totalDedup === 0) {
    console.warn("[ihrAdapter] phase-1 三个 dedup 数组都是空（简历被静默丢弃），跳过 phase-2");
    return {
      success: false,
      code: -1,
      errorCode: "OTHER",
      message: "简历未被后端分类（常见原因：fileId 不合法 / channel id 不对）",
      data: dedup
    };
  }

  let enriched;
  try {
    enriched = await enrichCandidateGroups(dedup);
  } catch (error) {
    console.warn("[IHR Action][ihrAdapter] assign-position:report:blocked", {
      code: error?.code || "OTHER",
      message: error?.message || String(error),
      taskResumeId: error?.taskResumeId || ""
    });
    return {
      success: false,
      code: -1,
      errorCode: error?.code || "OTHER",
      message: error?.message || String(error)
    };
  }

  const phase2Body = {
    headcountId: dedup.headcountId || headcountId,
    isSelectPosition: true,
    isMaybeResumeInfos: false,
    talentPoolIds: null,
    newResumeInfos: enriched.newResumeInfos,
    maybeResumeInfos: enriched.maybeResumeInfos,
    repeatResumeInfos: enriched.repeatResumeInfos
  };
  console.info(
    "[IHR Action][ihrAdapter] assign-position:phase-2:request",
    phase2Body
  );
  const p2 = await callIhrBridge(
    ihrBridge,
    "assignPositions",
    phase2Body,
    "assign-position"
  );
  console.info(
    "[IHR Action][ihrAdapter] assign-position:phase-2:response",
    p2
  );
  return p2;
}

// ============= 公开入口 =============

/**
 * 把 H5 SPA 发出的 resumeList payload 转成后端正确格式并跑完整流程。
 * @param {object} h5Payload  H5 sendResume 出来的原始 payload
 * @param {object} ihrBridge  window.api.ihrBridge
 * @returns {Promise<IhrApiResult>}  最终阶段 addPools/assignPositions 的返回
 */
export async function processResumeList(h5Payload, ihrBridge) {
  console.info("[IHR Action][ihrAdapter] process:start", {
    action: h5Payload?.action || "",
    resumeCount: Array.isArray(h5Payload?.resumeFile) ? h5Payload.resumeFile.length : 0,
    positionId: h5Payload?.positionId || "",
    directFileId: h5Payload?.directFileId === true,
    talentPoolIds: h5Payload?.talentPoolIds || []
  });
  if (!ihrBridge) {
    console.error("[IHR Action][ihrAdapter] process:error", {
      reason: "ihrBridge 未注入"
    });
    return { success: false, code: -1, message: "ihrBridge 未注入（非客户端模式？）" };
  }
  // 前置 token 检查：避免没 token 时白白发一次带占位字段的 addPools / 把 _initCache 污染。
  // ihrBridge.getAccessTokenStatus 在新版 preload 才暴露，老版本回退到直接打——
  // 至少接口层 noauthFetch 还会再拦一道（log 里能看到 "blocked: hasToken=false"）。
  if (typeof ihrBridge.getAccessTokenStatus === "function") {
    try {
      const ts = await ihrBridge.getAccessTokenStatus();
      if (!ts?.hasToken || ts?.expired) {
        console.warn("[ihrAdapter] aborted: accessToken missing/expired", ts);
        console.warn("[IHR Action][ihrAdapter] auth:blocked", {
          hasToken: !!ts?.hasToken,
          expired: !!ts?.expired,
          remainMs: ts?.remainMs ?? "-"
        });
        return {
          success: false,
          code: -1,
          errorCode: "NOT_LOGGED_IN",
          message: "客户端访问令牌缺失或已过期，请回到招聘工作台重新打开 i 快招"
        };
      }
    } catch {
      /* getAccessTokenStatus 失败不阻塞，让接口层去判 */
    }
  }
  const action = h5Payload?.action;
  try {
    if (action === "talent-pool") {
      console.info("[IHR Action][ihrAdapter] branch:talent-pool");
      return await runTalentPoolFlow(h5Payload, ihrBridge);
    }
    if (action === "assign-position") {
      console.info("[IHR Action][ihrAdapter] branch:assign-position");
      return await runAssignPositionFlow(h5Payload, ihrBridge);
    }
    console.error("[IHR Action][ihrAdapter] branch:unknown", { action: action || "" });
    return { success: false, code: -1, message: `unknown action: ${action}` };
  } catch (e) {
    console.error("[IHR Action][ihrAdapter] process:error", {
      action: action || "",
      message: e?.message || String(e),
      stack: e?.stack || ""
    });
    return {
      success: false,
      code: -1,
      message: e?.message || String(e),
      errorCode: e?.code || "OTHER"
    };
  }
}

/** 清缓存：登出 / token 失效后调，让下次 talent-pool 重拉 init */
export function resetIhrAdapterCache() {
  _initCache = null;
}
