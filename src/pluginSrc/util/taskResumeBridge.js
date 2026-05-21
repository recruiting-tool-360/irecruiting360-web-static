/**
 * 任务化"伴生调用"桥接工具
 *
 * 业务侧（CannelManager / 各 JobInfoManager）在调老接口时需要"配对"地调任务级接口：
 *   - saveSearchPlus       → /search/taskChannel/{tcId}/results
 *   - saveResumeDetailPlus → /resume/task/{taskResumeId}/detail
 *
 * 直接在业务模块里 `import { useStore } from 'vuex'` 拿 store 会有问题：
 *   - 这些模块运行在 Vue 组件外，没有 setup 上下文
 *   - 早期模块加载时 store 可能还没就绪 → 容易循环依赖
 *
 * 本桥接工具用 **lazy dynamic import**：第一次调用时才 import store / api，缓存复用。
 * 业务方零侵入：只 import 本工具，await 调一下；任务化未启动时静默跳过，不影响业务流程。
 *
 * 详细设计见 docs/11-task-channel-execute-and-detail.md §4.3。
 */

let _depsCache = null;

/**
 * lazy 加载 store 和 searchTaskApi 模块，缓存复用。
 * 加载失败时返回 { store: null, taskApi: null }，让调用方静默跳过。
 */
async function loadDeps() {
  if (_depsCache) return _depsCache;
  try {
    const [storeMod, apiMod] = await Promise.all([
      import("src/store"),
      import("src/api/searchTaskApi")
    ]);
    _depsCache = {
      store: storeMod.default || storeMod,
      taskApi: apiMod.default || apiMod
    };
    return _depsCache;
  } catch (e) {
    console.warn("[taskResumeBridge] lazy import 失败:", e?.message || e);
    return { store: null, taskApi: null };
  }
}

/**
 * 业务侧 saveSearchPlus 之后调，把同一批 resumeList 落库到任务侧。
 *
 * 行为：
 *   1. 按 chatId + channelDesc 反查活跃 taskChannel（通过 store getter）
 *   2. 没找到 taskChannel → 静默跳过（任务化未启动场景）
 *   3. 调 /search/taskChannel/{tcId}/results 落库
 *   4. 响应 data.taskResumes 批量 commit 到 store.taskResumeIdMap
 *      → 后续 saveResumeDetailPlus 配对调 /detail 时按 resumeBlindId 反查
 *
 * 失败处理：仅 console.warn，不抛错（不阻塞业务流程）
 *
 * @param {object} args
 * @param {string} args.chatId            职位会话 ID
 * @param {string} args.channelDesc       渠道中文 desc（"boss直聘" / "智联招聘" 等）
 * @param {string} [args.businessChannel='SEARCH']  'SEARCH' | 'RECOMMEND'，默认 SEARCH
 * @param {Array}  args.resumeList        本批简历对象数组
 * @param {string} args.searchConditionId 搜索条件 ID
 * @param {boolean} [args.filterByRead]   是否过滤已读
 * @param {boolean} [args.finished]       默认 false（分批保存）；runTask 末尾才传 true
 */
export async function postBatchResultsToTaskChannel(args) {
  const { store, taskApi } = await loadDeps();
  if (!store || !taskApi) {
    console.warn("[taskResumeBridge] postSearchResults: deps 未就绪");
    return [];
  }

  const chatId = args?.chatId;
  const channelDesc = args?.channelDesc;
  const businessChannel = args?.businessChannel || "SEARCH";
  if (!chatId || !channelDesc) {
    console.warn(
      `[taskResumeBridge] postSearchResults SKIP: chatId/channelDesc 缺失 (chatId=${chatId}, channelDesc=${channelDesc})`
    );
    return [];
  }

  // 通过 getter 找活跃 taskChannel（getter 内做 desc → channelSubType 反查 + 按 businessChannel 过滤）
  //
  // 时序场景：handleAggregateSearch 里 dispatchTaskStore（创建任务）和 runRealAggregateSearch
  // （触发各渠道搜索）并行跑。第一批 saveSearchPlus 可能比 SearchTasks/create 更快到达
  // —— 此时 store 里还没任务，getActiveTaskChannelByDesc 返回 null。
  //
  // 解决方案：dispatchTaskStore 启动时在 store 里 set 了 pendingCreate[chatId]=true，
  // 这里看到该标记就**短轮询**等任务出现（一般几百 ms 回包，超时 10s）。
  // 没标记则说明任务化未启动，立刻短路 return 不浪费时间。
  let channel = store.getters["SearchTasks/getActiveTaskChannelByDesc"](
    chatId,
    channelDesc,
    businessChannel
  );
  const isPendingCreate = store.getters["SearchTasks/isPendingCreate"];
  const hasPending = typeof isPendingCreate === "function" && isPendingCreate(chatId);
  if ((!channel || !channel.taskChannelId) && hasPending) {
    const WAIT_TASK_MS = 10 * 1000;
    const POLL_INTERVAL = 200;
    const startWait = Date.now();
    console.log(
      `[taskResumeBridge] postSearchResults: pendingCreate=true，等任务创建 (chatId=${chatId} ${channelDesc}, 上限 ${WAIT_TASK_MS}ms)`
    );
    while (Date.now() - startWait < WAIT_TASK_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      channel = store.getters["SearchTasks/getActiveTaskChannelByDesc"](
        chatId,
        channelDesc,
        businessChannel
      );
      if (channel && channel.taskChannelId) {
        console.log(
          `[taskResumeBridge] postSearchResults: 任务就绪 ✓ 等了 ${
            Date.now() - startWait
          }ms (${channelDesc} → ${channel.channelSubType}#${channel.taskChannelId})`
        );
        break;
      }
      // pendingCreate 中途清掉了（说明 create 已结束）→ 立刻 break，不再死等
      if (typeof isPendingCreate === "function" && !isPendingCreate(chatId)) {
        channel = store.getters["SearchTasks/getActiveTaskChannelByDesc"](
          chatId,
          channelDesc,
          businessChannel
        );
        break;
      }
    }
  }
  if (!channel || !channel.taskChannelId) {
    // 任务化未启动 / 该渠道未启用 / create 失败 → 静默跳过
    // 仅打 debug 级 log，避免业务侧噪音
    const t = store.getters["SearchTasks/getLatestTaskByChat"](chatId);
    const channelsBrief = t?.channels
      ? t.channels.map((c) => `${c.channelSubType}/${c.businessChannel}#${c.taskChannelId}`)
      : null;
    console.log(
      `[taskResumeBridge] postSearchResults SKIP: 无活跃 taskChannel` +
        ` | chatId=${chatId} channelDesc=${channelDesc}` +
        ` | hasPending=${hasPending}` +
        ` | latestTask=${t ? `taskId=${t.taskId} status=${t.taskStatus}` : "(null)"}` +
        ` | channels=${channelsBrief ? `[${channelsBrief.join(", ")}]` : "(null)"}`
    );
    return [];
  }

  const task = store.getters["SearchTasks/getLatestTaskByChat"](chatId);
  // ⚠️ searchConditionId 必须取 channel 自身绑定的值，不能用 store 里"当前最新的"
  // searchConditionId（args.searchConditionId）。
  //
  // 后端 taskChannel 创建时跟一个固定的 searchConditionId 强绑定。如果业务侧期间又跑了
  // 一次 saveCondition（比如分页 / 加载更多触发），store 里 getSearchConditionId 会被更
  // 新成新 ID，跟 channel 创建时绑的旧 ID 错位 → 后端拒：
  //   SYSTEM_005 "searchConditionId does not match taskChannel"
  //
  // 任务侧 /results 接口的契约就是配对调用（taskChannelId ↔ 它绑定的 searchConditionId），
  // 这里硬以 channel.searchConditionId 为准；args.searchConditionId 仅作为 channel 没绑
  // 的极端 fallback。
  const payload = {
    chatId,
    taskId: task?.taskId || "",
    searchConditionId: channel.searchConditionId || args.searchConditionId,
    businessChannel: channel.businessChannel,
    channelSubType: channel.channelSubType,
    // ⚠️ serializeChannel 是"旧 ihire 反序列化通道名"，按业务侧旧命名是中文 desc
    // （"boss直聘" / "智联招聘" / "前程无忧" / "猎聘"），**不是** channelSubType（"BOSS" 等）。
    // 之前写 channel.channelSubType 后端拒 SYSTEM_005 "Invalid serializeChannel: BOSS"。
    serializeChannel: channelDesc,
    filterByRead: !!args.filterByRead,
    finished: !!args.finished,
    resultItems: (args.resumeList || []).map((r) => ({ rawResume: r }))
  };

  // 诊断：如果 args.searchConditionId 跟 channel.searchConditionId 不一致，提示用户业务侧
  // 跑了第二次 saveCondition（比如分页/加载更多/编辑筛选条件）。这种情况后端会以 channel
  // 绑定的为准，避免 SYSTEM_005。
  if (
    args.searchConditionId &&
    channel.searchConditionId &&
    String(args.searchConditionId) !== String(channel.searchConditionId)
  ) {
    console.warn(
      `[taskResumeBridge] searchConditionId 不一致：argsCondId=${args.searchConditionId} channelCondId=${channel.searchConditionId}` +
        ` | 取 channel 绑定值 ${channel.searchConditionId}（任务侧契约）`
    );
  }

  // ===== 预校验：必填字段缺失立刻 abort（避免发残缺 payload 给后端，后端拒掉后还要排查）=====
  // 对照 docs/05-api-contract.md §5.3.5：chatId / taskId / searchConditionId /
  // businessChannel / channelSubType / serializeChannel 都是必填
  const missingFields = [
    ["chatId", payload.chatId],
    ["taskId", payload.taskId],
    ["searchConditionId", payload.searchConditionId],
    ["businessChannel", payload.businessChannel],
    ["channelSubType", payload.channelSubType],
    ["serializeChannel", payload.serializeChannel]
  ]
    .filter(([_k, v]) => !v)
    .map(([k]) => k);
  if (missingFields.length > 0) {
    console.warn(
      `[taskResumeBridge] /results SKIP: 必填字段缺失 [${missingFields.join(
        ", "
      )}]，避免发残缺 payload`,
      { chatId, channelDesc, channel, taskFromStore: task }
    );
    return [];
  }

  try {
    // 打出顶级字段全集（不展开 resultItems 内部，避免 console 被几十条简历内容刷屏）
    console.log(
      `[taskResumeBridge] >>> POST /search/taskChannel/${channel.taskChannelId}/results | 顶级字段:`,
      {
        chatId: payload.chatId,
        taskId: payload.taskId,
        searchConditionId: payload.searchConditionId,
        businessChannel: payload.businessChannel,
        channelSubType: payload.channelSubType,
        serializeChannel: payload.serializeChannel,
        filterByRead: payload.filterByRead,
        finished: payload.finished,
        "resultItems.length": payload.resultItems.length
      }
    );
    const resp = await taskApi.postSearchResults(channel.taskChannelId, payload);

    // ⚠️ request.js 拦截器逻辑：res.data.success!=='success' 时**返回 undefined**（业务失败）。
    // 所以 resp===undefined 一定是后端业务失败（接口已 200，但响应里 success!=='success'），
    // 此时 console 已经会有 "服务异常,请联系管理员"。
    if (resp == null) {
      console.warn(
        `[taskResumeBridge] >>> /results 返回 undefined（后端业务失败 / success!=='success'）${channelDesc}` +
          ` | 请检查 Network 里这条 /search/taskChannel/${channel.taskChannelId}/results 的实际响应 body` +
          ` | 上送的 payload=`,
        { ...payload, resultItems: `[${payload.resultItems?.length || 0} items]` }
      );
      return [];
    }

    // 后端 Response.success(data) → service.post 拦截器返回的就是 res.data（已校验 success）
    // 形态：{ success: 'success', code: 0, data: { taskResumes: [...], accepted, ... } }
    const respData = resp?.data || {};
    const taskResumes = Array.isArray(respData?.taskResumes) ? respData.taskResumes : null;
    if (taskResumes && taskResumes.length > 0) {
      // commit taskResumeId 映射
      store.commit("SearchTasks/patchTaskResumeIds", taskResumes);
      const fullMapGetter = store.getters["SearchTasks/getTaskResumeIdMap"];
      const mapSize =
        typeof fullMapGetter === "function" ? Object.keys(fullMapGetter()).length : -1;

      // ===== 组装 jobList（供 channelDataSavePlus 返回给 BossJobInfo.vue 等业务方）=====
      //
      // 后端 /results 响应的 taskResumes[i] 不仅含 ID 映射，还内嵌了 resume（ResumeBlindVO 投影）。
      // 老 saveSearchPlus 返回的 jobList 元素是 ResumeBlindVO 平摊结构，前端 UI / AsyncTaskQueue
      // / ResumeCard 都依赖这个形态。
      //
      // 这里把 taskResumes[i].resume 平摊出来 + 注入 taskResumeId / resumeBlindId / channel /
      // searchId 等上层字段，让业务方拿到的 jobList 跟 saveSearchPlus 时代完全兼容。
      const jobList = taskResumes.map((tr) => {
        const r = tr?.resume || {};
        return {
          ...r, // ResumeBlindVO 投影所有字段
          id: r.id || tr.resumeBlindId, // 兜底 id = resumeBlindId
          resumeBlindId: tr.resumeBlindId,
          taskResumeId: tr.taskResumeId,
          channel: channelDesc, // 渠道中文 desc（业务方按这个 group）
          channelSubType: tr.channelSubType,
          duplicateFlag: tr.duplicateFlag,
          visibleInResultSet: tr.visibleInResultSet,
          searchId: payload.searchConditionId // 兼容老字段
        };
      });
      console.log(
        `[taskResumeBridge] /results ok ✓ 组装 jobList ${jobList.length} 条 (${channelDesc} → ${channel.channelSubType}) | mapSize 现 ${mapSize}`
      );
      return jobList;
    } else {
      let respPreview = "(stringify failed)";
      try {
        respPreview = JSON.stringify(resp).slice(0, 500);
      } catch (_e) {
        /* keep default */
      }
      console.warn(
        `[taskResumeBridge] /results ok 但 taskResumes 为空/缺失 (${channelDesc}) | respData 字段=`,
        respData ? Object.keys(respData) : "(null)",
        "| 完整响应预览:",
        respPreview
      );
      return [];
    }
  } catch (e) {
    console.warn(
      `[taskResumeBridge] /results failed (${channelDesc}):`,
      e?.message || e,
      e?.response?.data
    );
    return [];
  }
}

/**
 * 业务侧 saveResumeDetailPlus 之后调，配对发送任务侧 /resume/task/{taskResumeId}/detail。
 *
 * 时序前提：channelDataSavePlus（搜索渠道入口）已经 await 调过 /results(finished=true)，
 * 后端返回的 taskResumes 已经 commit 到 store.SearchTasks.taskResumeIdMap。所以这里
 * 按 resumeBlindId 反查 taskResumeId 一定能拿到。
 *
 * 失败处理：仅 console.warn，不抛错（业务详情已通过 saveResumeDetailPlus 落到业务库）
 *
 * @param {object} args
 * @param {object} args.data           跟 saveResumeDetailPlus 入参一致：含 data.content /
 *                                      data.resume.id (resumeBlindId) / data.resume.outId
 * @param {string} args.channelSubType 'BOSS' | 'ZHILIAN' | 'JOB51' | 'LIEPIN'
 * @param {string} [args.serializeChannel] 默认 == channelSubType
 */
export async function postDetailToTaskResume(args) {
  const { store, taskApi } = await loadDeps();
  if (!store || !taskApi) return;

  const data = args?.data;
  if (!data) return;

  const resumeBlindId =
    data?.resume?.id || data?.resume?.resumeBlindId || data?.resume?.blindId || null;
  if (!resumeBlindId) {
    console.warn(
      "[taskResumeBridge] postDetail: data.resume.{id|resumeBlindId|blindId} 都缺失。data.resume 字段=",
      data?.resume ? Object.keys(data.resume) : "(null)"
    );
    return;
  }

  const taskResumeId = store.getters["SearchTasks/getTaskResumeId"](resumeBlindId);
  if (!taskResumeId) {
    // 任务化未启动 / /results 还没回包 / blindId 不一致
    const fullMapGetter = store.getters["SearchTasks/getTaskResumeIdMap"];
    const fullMap = typeof fullMapGetter === "function" ? fullMapGetter() : {};
    const mapKeys = Object.keys(fullMap || {});
    console.warn(
      `[taskResumeBridge] postDetail SKIP: 没找到 taskResumeId` +
        ` | blindId=${resumeBlindId} (type=${typeof resumeBlindId})` +
        ` | map size=${mapKeys.length}` +
        ` | map 前 5 key=[${mapKeys.slice(0, 5).join(", ")}]`
    );
    return;
  }

  const channelSubType = args.channelSubType;
  // ⚠️ serializeChannel 是"旧 ihire 反序列化通道名"（中文 desc："boss直聘" / "智联招聘" 等），
  // **不是** channelSubType（"BOSS" 等）。后端拒 SYSTEM_005 "Invalid serializeChannel: BOSS"
  // 就是因为前端误传了 channelSubType。
  // 优先用 args.serializeChannel（调用方明确指定）；fallback：从 ChannelConfig 反查中文 desc
  const channelConfMap = store.state?.ChannelConfig?.channelConf || {};
  const fallbackDesc = channelConfMap[channelSubType]?.desc;
  const serializeChannel = args.serializeChannel || fallbackDesc || channelSubType;

  const payload = {
    serializeChannel,
    channelSubType,
    content: data?.content,
    resume: {
      id: String(resumeBlindId),
      outId: data?.resume?.outId
    }
  };

  try {
    await taskApi.postTaskResumeDetail(taskResumeId, payload);
    console.log(
      `[taskResumeBridge] postDetail ok (taskResumeId=${taskResumeId}, blindId=${resumeBlindId}, serializeChannel=${serializeChannel})`
    );
  } catch (e) {
    console.warn(
      `[taskResumeBridge] postDetail failed (taskResumeId=${taskResumeId}):`,
      e?.message || e
    );
  }
}
