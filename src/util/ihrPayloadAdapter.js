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
 *   resumeInfo: [{ id, channel:<numeric>, fileId, link, type, isMaster }]
 * }
 *
 * ── 鉴权（2026-05-18 起全部统一） ─────────────────────────────────────
 *   全部 6 个客户端调用都走 accessToken / noauth 包装：
 *     - getSharedCandidateResume  → noauth/resume/init        （2026-05-18 上线）
 *     - uploadFile                → noauth/resume/upload      （2026-05-18 上线）
 *     - addPools / assignPositions → noauth/addPools / import
 *   见 docs/07-ihr-client-usage.md §2。
 *
 * 兜底策略：init / upload 任一环节失败时仍组装 placeholder 字段继续打 phase-1，
 *          让后端给出明确字段错误（比起整条 9001 更易定位）。生产期望路径下两条
 *          兜底分支都不应被触发——一旦被触发请追查 accessToken / 网关日志。
 */

// ============= 工具函数 =============

/**
 * 渠道 label → 数字 id 的本地兜底表。
 *
 * 正常路径下 `noauth/resume/init`（doc 07 §2 第 5 个接口）会返回 `channels: [{label,value}]`，
 * 这里的值仅在 init **整体失败**或 init 返回了**缺少某 channel** 的不完整列表时作为应急兜底
 * （否则就要带着 channel:0 打到 addPools 触发 9001）。
 *
 * 数字基于 docs/07-ihr-client-usage.md §6.3 example（BOSS=12）+ 早期联调记录。
 * 如果哪天后端调整了顺序，issue 表现为 phase-1 dedup 全空 → 来这里校准。
 */
const DEFAULT_CHANNEL_ID = {
  BOSS直聘: 12,
  智联招聘: 11,
  前程无忧: 13,
  猎聘: 14
};

/**
 * "init 拿不到 talentPools / upload 失败 / blob 缺失" 三种异常路径下用的占位值。
 *
 * ⚠️ 这两个值后端肯定不会真接受——加它们只是为了让 phase-1 还能成功走到接口、拿到一个**更明确的字段错误**
 * 而不是 9001/HTTP 200 不带 message。如果在日志里看到它们被发出去，去查：
 *   1. accessToken 是否过期 / 缺失（getAccessTokenStatus()）
 *   2. noauth/resume/init 网关是否报错
 *   3. resumeFile[].file 是否真的是 Blob（H5 sendResume 链路）
 */
const PLACEHOLDER_TALENT_POOL_ID = 1;
const PLACEHOLDER_FILE_ID = "placeholder-file-id-init-or-upload-failed";

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
 * "BOSS直聘" 等 label → 数字 channel id。
 * 优先级：channelsMap（真实来源）→ DEFAULT_CHANNEL_ID（默认推测）→ 原 string
 */
function mapChannel(label, channelsMap) {
  if (channelsMap && channelsMap.has(label)) return channelsMap.get(label);
  // 常见 alias 容错（拿到 channelsMap 但 label 不完全匹配时）
  if (channelsMap && channelsMap.size > 0) {
    const aliases = {
      BOSS直聘: ["boss直聘", "BOSS", "boss"],
      智联招聘: ["智联", "zhilian"],
      前程无忧: ["51job", "51Job", "job51"],
      猎聘: ["liepin", "LIEPIN"]
    };
    for (const [canonical, alts] of Object.entries(aliases)) {
      if (alts.includes(label) && channelsMap.has(canonical)) return channelsMap.get(canonical);
    }
  }
  // init 整体失败 / 没返回该 channel：落到本地兜底表（详见 DEFAULT_CHANNEL_ID 注释）
  if (DEFAULT_CHANNEL_ID[label] !== undefined) {
    console.warn(
      `[ihrAdapter] init.channels 缺少 ${label}，临时使用本地兜底 id=${DEFAULT_CHANNEL_ID[label]}`
    );
    return DEFAULT_CHANNEL_ID[label];
  }
  console.warn("[ihrAdapter] unknown channel label, fallback to 0:", label);
  return 0;
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
  if (_initCache) return _initCache;
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
    return _initCache;
  } catch (e) {
    console.warn(
      "[ihrAdapter] getSharedCandidateResume 异常（不写缓存，下次重试）",
      e?.message || e
    );
    return emptyFallback;
  }
}

/**
 * 上传所有 resumeFile，组装 resumeInfo[]。
 * 单个文件上传失败时该项 fileId 留空，但不阻断整体流程。
 */
async function buildResumeInfoBestEffort(resumeFile, channelsMap, centralUpload, ihrBridge) {
  if (!Array.isArray(resumeFile) || resumeFile.length === 0) return [];
  return Promise.all(
    resumeFile.map(async (item) => {
      const base = {
        id: item?.id,
        channel: mapChannel(item?.channel, channelsMap),
        link: item?.url || "",
        type: item?.type || "normal",
        isMaster: !!item?.isMaster
      };
      const transfer = await fileToTransfer(
        item?.file,
        `${item?.channel || "ch"}-${item?.id || "unknown"}.${item?.fileType || "bin"}`
      );
      if (!transfer) {
        console.warn("[ihrAdapter] resume 缺少 file blob，fileId 用占位:", item?.id);
        return { ...base, fileId: PLACEHOLDER_FILE_ID };
      }
      try {
        // centralUpload 已被 noauth/resume/upload 统一吞掉，但保留参数以免 H5 侧旧调用方报错
        const uploadRes = await ihrBridge.uploadFile({ ...transfer, centralUpload });
        if (!uploadRes?.success) {
          // 期望路径：noauth/resume/upload 2026-05-18 已上线，正常应 success=true & data=<fileId>
          console.warn(
            `[ihrAdapter] noauth/resume/upload 失败 id=${item?.id}，fileId 占位:`,
            uploadRes?.message
          );
          return { ...base, fileId: PLACEHOLDER_FILE_ID };
        }
        // noauth/resume/upload 返回结构跟旧接口对齐：{ code:0, data:"<fileId>" }
        const fileId =
          typeof uploadRes.data === "string"
            ? uploadRes.data
            : uploadRes.data?.fileId || uploadRes.data?.id || PLACEHOLDER_FILE_ID;
        return { ...base, fileId };
      } catch (e) {
        console.warn(
          `[ihrAdapter] uploadFile 异常 id=${item?.id}，fileId 用占位:`,
          e?.message || e
        );
        return { ...base, fileId: PLACEHOLDER_FILE_ID };
      }
    })
  );
}

// ============= 主流程：talent-pool / assign-position =============

/**
 * talent-pool 流程：
 *   1. 拿 channels map + talentPools（best-effort）
 *   2. uploadFile × N → fileId（best-effort）
 *   3. talentPoolIds：先用 H5 payload 显式传的，没有就取第一个 init 拿到的 pool
 *   4. phase-1 addPools(isSelectPosition:false) → 去重
 *   5. phase-2 addPools(isSelectPosition:true)  → 真正落库
 *
 * 注：phase-1 401 / 字段不全时直接返回，不跑 phase-2。
 */
async function runTalentPoolFlow(h5Payload, ihrBridge) {
  const init = await fetchInitBestEffort(ihrBridge);
  const resumeInfo = await buildResumeInfoBestEffort(
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
  const p1 = await ihrBridge.addPools(phase1Body);
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
  const phase2Body = {
    newResumeInfos: newCount > 0 ? dedup.newResumeInfos : null,
    maybeResumeInfos: maybeCount > 0 ? dedup.maybeResumeInfos : null,
    repeatResumeInfos: repeatCount > 0 ? dedup.repeatResumeInfos : null,
    isSelectPosition: true,
    isMaybeResumeInfos: false,
    talentPoolIds: dedup.talentPoolIds || talentPoolIds
  };
  console.log("[ihrAdapter] phase-2 addPools(确认导入) body:", phase2Body);
  return ihrBridge.addPools(phase2Body);
}

/**
 * assign-position 流程：跟 talent-pool 完全平行，只是 talentPoolIds 换成 headcountId，
 * API 入口换成 assignPositions。
 */
async function runAssignPositionFlow(h5Payload, ihrBridge) {
  const headcountId = h5Payload?.positionId;
  if (!headcountId) {
    return { success: false, code: -1, message: "缺少 positionId（headcountId）" };
  }
  const init = await fetchInitBestEffort(ihrBridge);
  const resumeInfo = await buildResumeInfoBestEffort(
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
  console.log("[ihrAdapter] phase-1 assignPositions(去重) body:", phase1Body);
  const p1 = await ihrBridge.assignPositions(phase1Body);
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

  const phase2Body = {
    newResumeInfos: newCount > 0 ? dedup.newResumeInfos : null,
    maybeResumeInfos: maybeCount > 0 ? dedup.maybeResumeInfos : null,
    repeatResumeInfos: repeatCount > 0 ? dedup.repeatResumeInfos : null,
    isSelectPosition: true,
    isMaybeResumeInfos: false,
    headcountId: dedup.headcountId || headcountId
  };
  console.log("[ihrAdapter] phase-2 assignPositions(确认导入) body:", phase2Body);
  return ihrBridge.assignPositions(phase2Body);
}

// ============= 公开入口 =============

/**
 * 把 H5 SPA 发出的 resumeList payload 转成后端正确格式并跑完整流程。
 * @param {object} h5Payload  H5 sendResume 出来的原始 payload
 * @param {object} ihrBridge  window.api.ihrBridge
 * @returns {Promise<IhrApiResult>}  最终阶段 addPools/assignPositions 的返回
 */
export async function processResumeList(h5Payload, ihrBridge) {
  if (!ihrBridge) {
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
    if (action === "talent-pool") return await runTalentPoolFlow(h5Payload, ihrBridge);
    if (action === "assign-position") return await runAssignPositionFlow(h5Payload, ihrBridge);
    return { success: false, code: -1, message: `unknown action: ${action}` };
  } catch (e) {
    return {
      success: false,
      code: -1,
      message: e?.message || String(e),
      errorCode: "OTHER"
    };
  }
}

/** 清缓存：登出 / token 失效后调，让下次 talent-pool 重拉 init */
export function resetIhrAdapterCache() {
  _initCache = null;
}
