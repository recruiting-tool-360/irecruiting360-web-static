# 任务化搜索：results / detail / 查分接入计划

日期：2026-05-20（按 `docs/05-api-contract.md` 2026-05-11 修订）
关联文档：`docs/05-api-contract.md`、`docs/10-frontend-task-sse-integration.md`

---

## 0. 决策摘要 ⚠️ 先看

按 `docs/05-api-contract.md` 2026-05-11 修订对齐，本次实施的最终决定：

### 0.1 实现 `/execute`（接口确认存在）

用户确认 `POST /search/taskChannel/{taskChannelId}/execute` 接口存在（API 文档未同步该接口，按实际后端实现接入）。

**决策**：实现 `/execute` 调用：

- `searchTaskApi.postExecuteChannel(taskChannelId)` —— 空 body POST，path 参数
- `SearchTasks/runTask` 启动后给任务的每个 channel 调一次 `postExecuteChannel`（fire-and-forget，失败 console.warn 不阻塞主流程）

调用时机：`patchChannel(WAITING → RUNNING)` 之后、`aggregateSearchExecutor` 跑业务搜索之前。已经终态的 channel 跳过。

如果后端要求 `/execute` 带 body（taskId 等），后续单独补字段。

### 0.2 查分接口升级（**重大变更**）

| 旧接口 | 新接口 |
|---|---|
| `POST /resume/queryScoreList` 参数 `resumeBlindIds[]` | `POST /resume/queryTaskScoreList` 参数 `taskResumeIds[]` |

`scoreAutoUpdater.js` 当前用老接口，**任务化模式下拿不到任务侧分数**（任务侧分数写在 `task_resume_detail.score`，老接口读 `condition_resume.score`，文档说明会兜底但优先读任务侧）。

**决策**：双路径并存：

- 优先 `postTaskScoreList(taskResumeIds[])`（需要 `taskResumeIdMap` 有映射）
- 降级 `queryScoreList(resumeBlindIds[])`（保留老逻辑，任务化未启动时仍能工作）

### 0.3 其它决策

| 决策点 | 方案 |
|---|---|
| `taskResumeIdMap` 持久化 | **不持久化**到 vuex-persistedstate，任务周期内有效 |
| 老 vs 新业务接口共存 | **追加调用**，老接口（`saveSearchPlus` / `saveResumeDetailPlus`）不动 |
| 任务化未启动场景 | 任务级调用静默跳过，业务正常 |
| `scoreStatus=FAILED/NOT_SUPPORTED` | 跟旧 `score=-2` 同等处理，从轮询移除 |
| `serializeChannel` 字段 | 跟 `channelSubType` 取相同值（`BOSS / ZHILIAN / JOB51 / LIEPIN`）|
| `/detail` 调用失败 | 仅 console.warn，业务详情已通过 `saveResumeDetailPlus` 落库 |

---

## 1. 背景

`docs/10-frontend-task-sse-integration.md` 已经接好基础链路（任务创建、SSE 旁路、runTask 主动驱动）。本轮要把**结果落库 + 详情上报 + 任务级查分**真正打通：

- 业务侧 `saveSearchPlus` → 配对 **`/search/taskChannel/{tcId}/results`**
- 业务侧 `saveResumeDetailPlus` → 配对 **`/resume/task/{taskResumeId}/detail`**
- 业务侧 `queryScoreList` → 升级为 **`/resume/queryTaskScoreList`**

并维护 `resumeBlindId → taskResumeId` 映射，让所有"任务级"调用都能拿到正确的 ID。

---

## 2. 接口契约（按 API 文档对齐）

### 2.1 `POST /search/taskChannel/{taskChannelId}/results`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `chatId` | `string` | 是 | 职位会话 ID |
| `taskId` | `string(int64)` | 是 | 所属任务 |
| `searchConditionId` | `string(int64)` | 是 | 实际搜索条件 |
| `businessChannel` | `string` | 是 | `SEARCH / RECOMMEND` |
| `channelSubType` | `string` | 是 | 平台子类型，跟 `taskChannel` 一致 |
| `serializeChannel` | `string` | 是 | 旧 ihire 反序列化通道名 |
| `filterByRead` | `boolean` | 否 | 是否过滤已读 |
| `finished` | `boolean` | 否 | 默认 `false`：保存一批；`true`：渠道收尾，触发 `completeChannel` |
| `resultItems` | `array<{ rawResume: object }>` | 条件必填 | 结果列表；`finished=true` 时可为空数组 |

**响应**：

| 字段 | 说明 |
|---|---|
| `data.accepted` | 是否接受 |
| `data.taskResumes[]` | **关键映射**：`{ taskResumeId, resumeBlindId, outId, channelSubType, duplicateFlag, visibleInResultSet }` |
| `data.nextCommandExpected` | 本次请求是否已触发后续渠道执行 |
| `data.nextTaskChannelId` | `nextCommandExpected=true` 时返回下一条待执行渠道任务 ID |
| `data.taskId` | 所属任务 |
| `data.taskChannelId` | 所属渠道任务 |
| `data.taskStatus` | `finished=true` 时返回最新任务状态 |
| `data.taskChannelStatus` | 渠道任务状态 |

### 2.2 `POST /resume/task/{taskResumeId}/detail`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `serializeChannel` | `string` | 是 | 旧详情反序列化通道名（如 `BOSS / ZHILIAN`）|
| `channelSubType` | `string` | 是 | 平台子类型 |
| `content` | `object` | 是 | 原始详情内容（对应旧 `saveResumeDetailPlus.content`）|
| `resume` | `{ id: resumeBlindId, outId: string }` | 是 | 摘要信息 |

**响应**：`Response.success()`（不返回业务字段）

### 2.3 `POST /resume/queryTaskScoreList`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taskResumeIds` | `array<string(int64)>` | 是 | 任务结果行主键列表 |

**响应**：

```ts
data: Array<{
  taskResumeId: string;
  resumeBlindId: string;
  score: number;          // -2 表示不可获取
  scoreJson: object;      // 评分明细
  scoreStatus: 'WAITING' | 'SCORING' | 'SUCCESS' | 'FAILED' | 'NOT_SUPPORTED'
}>
```

注意：返回字段比老 `queryScoreList` 多了 `taskResumeId` 和 `scoreStatus`，前端可以利用 `scoreStatus !== 'WAITING' && scoreStatus !== 'SCORING'` 作为"该条不再轮询"的判定（替代老的 `score !== null` 简单判定）。

---

## 3. 调用顺序

```
1) SearchTasks/runTask 启动
   ├─ patchChannel(每个 channel → RUNNING)
   ├─ taskSse.connect（旁路）
   └─ 调 aggregateSearchExecutor 跑业务搜索
                ↓
2) AISearch.executeSearch 内部各 channel 搜索
                ↓
3) CannelManager.channelDataSavePlus 内部：
   ├─ saveSearchPlus(req)  → 业务侧 /search/saveSearchPlus
   └─ 【新增】postSearchResults(tcId, { finished:false, resultItems })
        ├─ 调 /search/taskChannel/{tcId}/results
        ├─ 响应 taskResumes[] commit 到 store.taskResumeIdMap
        └─ 不阻塞业务（失败仅 console.warn）
                ↓
4) AsyncResumeProcessor 处理每条简历：
   <Channel>JobInfoManager.findResumeDetail:
   ├─ saveResumeDetailPlus(data)  → 业务侧 /resume/saveResumeDetailPlus
   └─ 【新增】postTaskResumeDetail(taskResumeId, body)
        ├─ taskResumeId 从 store.taskResumeIdMap[resumeBlindId] 反查
        ├─ 没找到 → 跳过 + warn（任务化未启动场景）
        └─ 调 /resume/task/{taskResumeId}/detail
                ↓
5) scoreAutoUpdater 轮询分数：
   ├─ 【升级】用 postTaskScoreList(taskResumeIds[]) 替代 queryScoreList(resumeBlindIds[])
   ├─ taskResumeIds 从 store.taskResumeIdMap 收集
   └─ 拿到分数后通过 resumeBlindId 反查回填到 jobList
                ↓
6) SearchTasks/runTask 末尾：
   ├─ for each channel: postSearchResults(tcId, { finished:true, resultItems:[] })
   │   └─ 后端触发 completeChannel → 推下一渠道 / 生成 TASK_COMPLETION_CARD
   ├─ postCommandResult(tcId, { status: 'SUCCESS' })
   └─ finishTask(COMPLETED)
```

---

## 4. 改造点清单

### 4.1 新增 / 更新 API（`src/api/searchTaskApi.js`）

```js
/**
 * 任务级简历详情保存。
 * @param {string} taskResumeId  来自 postSearchResults 响应的 taskResumes[i].taskResumeId
 * @param {{
 *   serializeChannel: string,
 *   channelSubType: string,
 *   content: object,
 *   resume: { id: string, outId: string }
 * }} payload
 */
export function postTaskResumeDetail(taskResumeId, payload) {
  return service.post(
    `/resume/task/${encodeURIComponent(taskResumeId)}/detail`,
    payload
  );
}

/**
 * 任务级查分（替代 /resume/queryScoreList）
 * @param {Array<string>} taskResumeIds
 */
export function postTaskScoreList(taskResumeIds) {
  return service.post('/resume/queryTaskScoreList', { taskResumeIds });
}
```

注：`postExecuteChannel` **暂不加**，等接口规范确认（见 §0）。

### 4.2 `src/store/modules/SearchTasks.js` 新增

```js
state.taskResumeIdMap = {};   // resumeBlindId → taskResumeId

mutations:
  SET_TASK_RESUME_ID(state, { resumeBlindId, taskResumeId }) {...}
  PATCH_TASK_RESUME_IDS(state, taskResumes) {...}     // 直接喂 /results 的响应
  CLEAR_TASK_RESUME_IDS(state)  {...}                 // 任务终态时清

getters:
  getTaskResumeId: (state) => (resumeBlindId) => state.taskResumeIdMap[String(resumeBlindId)] || null
  getAllTaskResumeIds: (state) => () => Object.values(state.taskResumeIdMap)

  // 给业务侧 lazy import 调用：按 chatId + channelDesc 反查活跃 taskChannel
  getActiveTaskChannelByDesc: (state, gtrs) => (chatId, channelDesc) => {
    const subType = DESC_TO_SUBTYPE[channelDesc]; // 'boss直聘' → 'BOSS' 等
    if (!subType) return null;
    const t = gtrs.getLatestTaskByChat(chatId);
    return t?.channels?.find(
      c => c.businessChannel === 'SEARCH' && c.channelSubType === subType
    ) || null;
  }
```

**不持久化** `taskResumeIdMap` 到 `vuex-persistedstate`（任务级映射没必要跨刷新保留）。

### 4.3 新增工具 `src/pluginSrc/util/taskResumeBridge.js`

业务模块（4 个 JobInfoManager + CannelManager）共用的"任务级伴生调用"。**lazy import store/taskApi** 避免循环依赖。

```js
/**
 * saveSearchPlus 后调，把同一批 resumeList 落库到任务侧并维护 taskResumeId 映射。
 * @param {{ chatId, channelDesc, resumeList, searchConditionId, filterByRead, finished?: boolean }} args
 */
export async function postBatchResultsToTaskChannel(args) {
  const { store, taskApi } = await loadDeps();
  if (!store || !taskApi) return;

  const ch = store.getters['SearchTasks/getActiveTaskChannelByDesc'](args.chatId, args.channelDesc);
  if (!ch?.taskChannelId) {
    console.log('[taskResumeBridge] 无活跃 taskChannel，跳过 postSearchResults');
    return;
  }

  const payload = {
    chatId: args.chatId,
    taskId: ch.taskId || store.getters['SearchTasks/getLatestTaskByChat'](args.chatId)?.taskId,
    searchConditionId: args.searchConditionId || ch.searchConditionId,
    businessChannel: ch.businessChannel,
    channelSubType: ch.channelSubType,
    serializeChannel: ch.channelSubType,
    filterByRead: !!args.filterByRead,
    finished: !!args.finished,
    resultItems: (args.resumeList || []).map(r => ({ rawResume: r }))
  };
  try {
    const resp = await taskApi.postSearchResults(ch.taskChannelId, payload);
    const data = resp?.data || resp;
    if (Array.isArray(data?.taskResumes)) {
      store.commit('SearchTasks/PATCH_TASK_RESUME_IDS', data.taskResumes);
      console.log(`[taskResumeBridge] 映射 ${data.taskResumes.length} 条 taskResumeId (${args.channelDesc})`);
    }
  } catch (e) {
    console.warn('[taskResumeBridge] postSearchResults 失败:', e?.message || e);
  }
}

/**
 * saveResumeDetailPlus 后调，配对推任务级 /detail。
 * @param {{ data, channelSubType, serializeChannel? }} args
 */
export async function postDetailToTaskResume({ data, channelSubType, serializeChannel }) {
  const { store, taskApi } = await loadDeps();
  if (!store || !taskApi) return;

  const resumeBlindId = data?.resume?.id || data?.resume?.resumeBlindId;
  if (!resumeBlindId) return;
  const taskResumeId = store.getters['SearchTasks/getTaskResumeId'](resumeBlindId);
  if (!taskResumeId) {
    console.log(`[taskResumeBridge] taskResumeId 未映射，跳过 detail (blindId=${resumeBlindId})`);
    return;
  }

  const payload = {
    serializeChannel: serializeChannel || channelSubType,
    channelSubType,
    content: data?.content,
    resume: {
      id: String(resumeBlindId),
      outId: data?.resume?.outId
    }
  };
  try {
    await taskApi.postTaskResumeDetail(taskResumeId, payload);
    console.log(`[taskResumeBridge] postDetail ok (taskResumeId=${taskResumeId})`);
  } catch (e) {
    console.warn('[taskResumeBridge] postDetail 失败:', e?.message || e);
  }
}

let _depsCache = null;
async function loadDeps() {
  if (_depsCache) return _depsCache;
  try {
    const [storeMod, apiMod] = await Promise.all([
      import('src/store'),
      import('src/api/searchTaskApi')
    ]);
    _depsCache = { store: storeMod.default, taskApi: apiMod.default || apiMod };
    return _depsCache;
  } catch (e) {
    console.warn('[taskResumeBridge] lazy import 失败:', e?.message || e);
    return { store: null, taskApi: null };
  }
}
```

### 4.4 改造 `CannelManager.channelDataSavePlus`

文件：`src/pluginSrc/util/CannelManager.js`

```js
export const channelDataSavePlus = async (outId, searchConditionId, channel, channelList, chatId, isRead) => {
  // ... 原有逻辑 ...
  const { data: jobListData } = await saveSearchPlus(saveJobListRequest);
  const jobList = jobListData;
  if (!jobList || jobList.length === 0) return;

  // 新增：同步落库到任务侧（lazy import，任务化未启动时静默跳过）
  await postBatchResultsToTaskChannel({
    chatId,
    channelDesc: channel,   // "boss直聘" / "智联招聘" 等
    resumeList: channelList,
    searchConditionId,
    filterByRead: isRead,
    finished: false         // 分批保存，runTask 末尾再发 finished=true
  });

  return jobList;
};
```

### 4.5 改造 4 个 `<Channel>JobInfoManager`

文件：

- `src/pluginSrc/channels/BossJobInfoManager.js`
- `src/pluginSrc/channels/ZhiLianJobInfoManager.js`
- `src/pluginSrc/channels/Job51InfoManager.js`
- `src/pluginSrc/channels/LIEPINJobInfoManager.js`

每个 `findResumeDetail` 里 `await saveResumeDetailPlus(data)` 后追加：

```js
import { postDetailToTaskResume } from "src/pluginSrc/util/taskResumeBridge";

await saveResumeDetailPlus(data);
await postDetailToTaskResume({
  data,
  channelSubType: 'BOSS',          // 各文件填对应的子类型
  serializeChannel: 'BOSS'
});
```

### 4.6 升级 `scoreAutoUpdater.js` 用任务级查分

文件：`src/utils/scoreAutoUpdater.js`

策略：**优先用 `postTaskScoreList(taskResumeIds[])`，老接口 `queryScoreList` 作为兜底**。

```js
import { queryScoreList } from 'src/api/jobList/JobListApi';

async queryScores() {
  const ids = Array.from(this.pendingResumeIds);
  if (ids.length === 0) return;

  // 优先：任务级查分（taskResumeIds[]）
  const { store, taskApi } = await loadDeps();
  const idMap = store?.getters?.['SearchTasks/getTaskResumeIdMap']?.() || {};
  const taskResumeIds = ids
    .map(blindId => idMap[String(blindId)])
    .filter(Boolean);

  let data = null;
  if (taskResumeIds.length > 0 && taskApi?.postTaskScoreList) {
    try {
      const resp = await taskApi.postTaskScoreList(taskResumeIds);
      data = resp?.data;
      // 字段映射：返回 taskResumeId / resumeBlindId / score / scoreStatus
      data = (data || []).map(item => ({
        ...item,
        resumeBlindId: item.resumeBlindId,
        // scoreStatus 用于判定是否继续轮询
      }));
    } catch (e) {
      console.warn('[scoreAutoUpdater] postTaskScoreList 失败，降级到老接口:', e?.message);
    }
  }

  // 降级：业务侧 queryScoreList
  if (!data) {
    const resp = await queryScoreList({
      resumeBlindIds: ids,
      channel: this.channelKey,
      searchId: this.searchId
    });
    data = resp?.data;
  }

  // ... 处理 data 的逻辑不变
  // 但增加：scoreStatus === 'FAILED' / 'NOT_SUPPORTED' 时也从 pendingResumeIds 移除（避免一直轮询）
}
```

注意：旧 `scoreAutoUpdater` 用 `score < 0 && score !== -2` 判断是否继续轮询。新接口的 `scoreStatus` 字段更直接：

| scoreStatus | 处理 |
|---|---|
| `SUCCESS` / `FAILED` / `NOT_SUPPORTED` | 从 pending 移除（不再轮询）|
| `WAITING` / `SCORING` | 保留在 pending，下次继续 |

### 4.7 改造 `SearchTasks/runTask`

文件：`src/store/modules/SearchTasks.js`

末尾循环里：

```js
for (const ch of task.channels) {
  // ...
  if (!runFailed) {
    // 之前：resultItems 含简历数据，现在业务侧已经分批上报过
    // 改为：finished=true 空 resultItems（仅作收尾信号）
    await taskApi.postSearchResults(ch.taskChannelId, {
      chatId: task.chatId,
      taskId: task.taskId,
      searchConditionId: ch.searchConditionId,
      businessChannel: ch.businessChannel,
      channelSubType: ch.channelSubType,
      serializeChannel: ch.channelSubType,
      filterByRead: false,
      finished: true,                    // ← 关键
      resultItems: []                    // 业务侧已分批上报，这里空数组即可
    });
    await taskApi.postCommandResult(ch.taskChannelId, { status: 'SUCCESS', ... });
    // ...
  }
}

// 任务终态后清理 taskResumeIdMap
commit('SearchTasks/CLEAR_TASK_RESUME_IDS');
```

---

## 5. 边界场景

| 场景 | 现象 | 处理 |
|---|---|---|
| 任务化未启动（dispatchTaskStore 失败 / 老业务模式） | `getActiveTaskChannelByDesc` 返回 null | 任务级调用全跳过，业务正常 |
| `taskResumeIdMap` 没匹配（轮询时 mock 数据） | `taskResumeIds` 收集结果空 | 降级到老 `queryScoreList`（业务接口仍能拿分数）|
| `/results(finished=false)` 失败 | 网络错 / 404 | 仅 console.warn，业务流程继续；下一次保存仍会推 |
| `/detail` 失败 | 同上 | 仅 console.warn |
| 应用刷新后 `taskResumeIdMap` 丢失 | 不持久化 | 接受降级：下次刷新后简历的"任务级 detail"未补齐，scoreAutoUpdater 走老接口；不影响业务 |
| 同一 `resumeBlindId` 在多次 `/results` 响应里出现 | 后端会去重（`duplicateFlag`）| 前端覆盖式写入 map，不引入复杂去重逻辑 |
| `scoreStatus === 'NOT_SUPPORTED'` | 评分不可获取 | 从 pending 移除，jobList 里那条 score 设 `-2`（跟老逻辑兼容）|

---

## 6. 实施步骤

### Step 1: API + Store 基础

1. `src/api/searchTaskApi.js`：新增 `postTaskResumeDetail` / `postTaskScoreList`
2. `src/store/modules/SearchTasks.js`：
   - 加 `taskResumeIdMap` state + 3 个 mutation + 3 个 getter
   - 加 `DESC_TO_SUBTYPE` 反查表

**烟测**：纯代码，重启不应影响任何现有功能

### Step 2: 工具层 `taskResumeBridge.js`

3. 新建文件，实现 `postBatchResultsToTaskChannel` / `postDetailToTaskResume` + lazy import

**烟测**：导出函数手动 console 调用，看是否 lazy import 成功

### Step 3: 业务侧 `channelDataSavePlus` 接入

4. `CannelManager.channelDataSavePlus` 末尾调 `postBatchResultsToTaskChannel`

**烟测**：
- 触发聚合搜索 → Network 面板每次 `/search/saveSearchPlus` 后看到 `/search/taskChannel/{tcId}/results?finished=false`
- vuex devtools 看 `SearchTasks.taskResumeIdMap` 有数据

### Step 4: 4 个 JobInfoManager 接入 `/detail`

5. 在每个 `findResumeDetail` 的 `saveResumeDetailPlus` 后追加 `postDetailToTaskResume`

**烟测**：
- AsyncResumeProcessor 处理简历时，Network 面板看到每条简历有一对 `/saveResumeDetailPlus` + `/resume/task/{taskResumeId}/detail`

### Step 5: scoreAutoUpdater 升级查分

6. 接 `postTaskScoreList`，老 `queryScoreList` 作为降级
7. 用 `scoreStatus` 替代 `score` 判定是否继续轮询

**烟测**：
- 任务化模式：Network 看 `/resume/queryTaskScoreList` 调用
- 非任务化（清 store 后）：仍走老 `queryScoreList` 接口

### Step 6: runTask 末尾用 `finished=true` 空数组收尾 + 清 map

8. `runTask` 末尾 `postSearchResults(finished=true, resultItems=[])`
9. `finishTask` 后清 `taskResumeIdMap`

**烟测**：
- 任务跑完看 Network 末尾的 `/results?finished=true` payload 是空 resultItems
- 任务跑完后 `taskResumeIdMap` 重置为空

---

## 7. 验证清单（完整 happy path）

启动一次搜索（启用 ZHILIAN + JOB51），按时序观察 Network：

```
1. POST /search/task/create                                    ← 1 次
2. GET  /sseManager/connect?satoken=...                        ← 1 次
3. POST /search/saveCondition                                  ← 1 次（业务）
4. POST /search/saveSearchPlus                                 ← N 次（每页 / 渠道）
   POST /search/taskChannel/{tcId}/results  finished=false     ← 紧跟 3 的每次调用
5. POST /resume/saveResumeDetailPlus                           ← M 次（每条简历）
   POST /resume/task/{taskResumeId}/detail                     ← 紧跟 4 的每次调用
6. POST /resume/queryTaskScoreList                             ← 每 8s 一次
7. POST /search/taskChannel/{tcId}/results  finished=true      ← 每 channel 1 次（runTask 末尾）
8. POST /search/taskChannel/{tcId}/commandResult status=SUCCESS ← 每 channel 1 次
9. SSE 推送 TASK_COMPLETION_CARD（如果后端实现）→ ChatCard 渲染完成卡片
```

console 应该看到：

```
[taskResumeBridge] 映射 N 条 taskResumeId (智联招聘)
[taskResumeBridge] 映射 M 条 taskResumeId (前程无忧)
[taskResumeBridge] postDetail ok (taskResumeId=99001)
...
[scoreAutoUpdater] 用 postTaskScoreList 查 K 条任务级分数
```

---

## 8. 决策一览（取代旧"待确认项"）

按 §0 已收口的决策，本期实施按下表执行；如后端有调整，单独再补 patch：

| 议题 | 决策 |
|---|---|
| `/execute` 接口 | **本期不实现**（API 文档无定义） |
| 查分接口升级 | 双路径：优先 `postTaskScoreList`，降级 `queryScoreList` |
| `saveResumeDetailPlus.data → /detail` 字段映射 | `data.content → content`，`data.resume.id → resume.id`，`data.resume.outId → resume.outId`，`channelSubType / serializeChannel` 由调用方（各 JobInfoManager）显式传入 |
| `scoreStatus = NOT_SUPPORTED / FAILED` | 同 `score=-2` 处理，从 pending 移除 |
| `channelDesc → channelSubType` | 覆盖 4 个渠道：`boss直聘=BOSS / 智联招聘=ZHILIAN / 前程无忧=JOB51 / 猎聘=LIEPIN`；未识别返回 null |
| 完成卡片触发 | 后端 SSE 推 `TASK_COMPLETION_CARD`，前端 ChatCard 已经接好；不做轮询兜底 |
| `taskResumeIdMap` 跨刷新 | 不持久化；刷新后丢失则降级到老查分接口 |
| 老接口调用是否保留 | **保留**，本期只是"追加"任务级配对调用；老接口签名不动 |

---

## 9. 实施现场指南（每个 Step 的具体改动文件）

### Step 1 文件

- `src/api/searchTaskApi.js`：新增 `postTaskResumeDetail` / `postTaskScoreList` 两个 export
- `src/store/modules/SearchTasks.js`：
  - 加 `state.taskResumeIdMap`
  - 加 mutation：`SET_TASK_RESUME_ID` / `PATCH_TASK_RESUME_IDS` / `CLEAR_TASK_RESUME_IDS`
  - 加 getter：`getTaskResumeId` / `getTaskResumeIdMap` / `getActiveTaskChannelByDesc`
  - 加常量 `DESC_TO_SUBTYPE`

### Step 2 文件

- `src/pluginSrc/util/taskResumeBridge.js`（新建）：导出 `postBatchResultsToTaskChannel` / `postDetailToTaskResume`，内部 lazy import + 缓存

### Step 3 文件

- `src/pluginSrc/util/CannelManager.js`：`channelDataSavePlus` 末尾调 `postBatchResultsToTaskChannel`

### Step 4 文件

- `src/pluginSrc/channels/BossJobInfoManager.js`
- `src/pluginSrc/channels/ZhiLianJobInfoManager.js`
- `src/pluginSrc/channels/Job51InfoManager.js`
- `src/pluginSrc/channels/LIEPINJobInfoManager.js`

每个文件的 `findResumeDetail` 里 `await saveResumeDetailPlus(data)` 后追加一行 `await postDetailToTaskResume(...)`。

### Step 5 文件

- `src/utils/scoreAutoUpdater.js`：`queryScores()` 内部接入 `postTaskScoreList`，老接口作为 fallback

### Step 6 文件

- `src/store/modules/SearchTasks.js`：`runTask` 末尾 `postSearchResults(finished=true, resultItems=[])`，`finishTask` 后清 map
