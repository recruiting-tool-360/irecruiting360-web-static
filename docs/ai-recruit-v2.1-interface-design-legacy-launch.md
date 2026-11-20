# AI 寻聘助手 V2.1 接口设计（沿用现有登录与唤醒链路版）

> 状态：待技术评审
> 日期：2026-11-19
> 来源：[完整技术方案](./ai-recruit-v2.1-technical-design-legacy-launch.md)
> 相关文档：[表设计](./ai-recruit-v2.1-table-design-legacy-launch.md)
> 说明：本文由完整技术方案拆出，保留原第 11 章编号，避免跨文档引用失效。

## 11. 主要接口设计

接口按“是否有新 HTTP 路径”区分，不按业务动作是否新增区分。本节仅列本期需要调整请求上下文、响应语义或调用约束的现有接口；接口、请求和响应均无变化的复用接口不再展开。开批、详情完成和封批属于逻辑动作，本期复用现有搜索和详情接口。

表设计调整不影响现有接口中的业务 ID 约定：`channelAccountId/clientSessionId/dayPlanId` 分别对应 i快招 `channel_account.id/ai_client_session.id/ai_recruit_day_plan.id`；`taskId/clientInstanceId` 等继续使用各自业务 ID，不要求接口字段名与数据库列名完全一致。

### 11.1 复用和修改的现有接口

| 归属 | 接口 | 当前用途 | 本版处理 |
|---|---|---|---|
| i快招后端 | `POST /search/task/create` | 现有手动简历搜索创建任务 | 路径保留；手动触发新增 `requestId/headcountId/channelCode/externalJobId` 上下文。期望简历数、分数线、筛选方式和 BOSS 筛选从招聘同步配置读取，客户端不得覆盖；任务写入 `trigger_source=USER_CLICK`、`task_scope_key=USER:{requestId}:JOB:{headcountId}` 和职位执行快照 |
| i快招后端 | `POST /search/taskChannel/{taskChannelId}/results` | 保存渠道候选人结果，已支持 `scoreBatchNo` 和 `scoreBatchComplete` | 扩展批次、会话和租约上下文 |
| i快招后端 | `POST /resume/task/{taskResumeId}/detail` | 保存任务详情、截图和简历内容 | 扩展 `scoreBatchNo`、会话和租约校验 |
| i快招后端 | `POST /search/taskChannel/{taskChannelId}/finish` | 结束渠道任务并返回下一任务 | 扩展任务终态、结束原因和日计划上下文 |
| i快招后端 | `POST /candidate/AiManager/client/noauth/position/profile/query` | 查询招聘当前职位画像 | 返回 `positionHarnessProfileId/profileContent`；i快招只读，不能把自身缓存视为当前权威内容 |
| i快招后端 | `POST /candidate/AiManager/client/noauth/position/profile/save` | i快招编辑画像时回写招聘 | 保存成功后重新查询当前画像内容即可；保存失败不得使用新画像创建任务 |
| i快招后端 | `POST /candidate/AiManager/client/noauth/position/profile/candidate/score`、`/candidate/score/async` | 通过招聘代理 Harness 评分 | 请求只传 `positionHarnessProfileId`；招聘直接调用 Harness，按该画像当前最新内容评分，不传也不校验画像版本 |
| i快招后端 | `POST /candidate/AiManager/client/noauth/resume/upload` | 上传回复附件并取得招聘文件中心 `fileId` | 复用分配职位上传链路；返回原始 `fileId` |
| i快招后端 | `POST /candidate/AiManager/client/noauth/import` | 解析、查重并导入达标附件 | 复用分配职位两阶段导入；不增加 `Idempotency-Key`，由 `reply_task_candidate` 行锁和 `import_status` 保证业务幂等 |
| i快招后端 | `GET /sseManager/connect` | 按用户建立 SSE 连接 | 路径保留，继续使用 `satoken` 鉴权；连接参数增加 `clientSessionId`，连接注册和消息路由键由 `userId` 改为 `clientSessionId` |

任务状态响应口径：

| 字段值 | 含义 | 持久化/映射 |
|---|---|---|
| `QUEUED` | 已创建，等待前置条件、时间窗口或队列轮次 | 现有 i快招表存 `WAITING`，接口展示为 `QUEUED`；不得同时返回两个同义状态。 |
| `RUNNING` | 已领取执行权并下发执行命令 | 当前执行中；`RESTING` 是内部非终态，接口对外仍映射为运行中。 |
| `COMPLETED` | 正常完成 | 达到目标、列表结束或执行中权益耗尽；可用 `stopReason` 补充原因。 |
| `STOPPED` | 正常业务停止 | 用户停止、正常退出、时间窗口结束；终态且不自动补建。 |
| `FAILED` | 不可恢复失败 | 执行异常或中断；使用 `terminalReason` 区分。 |
| `SKIPPED` | 执行单元因前置条件不满足而未开始 | 不作为根任务状态，放在 `result=SKIPPED` 和固定 `reasonCode`。 |
| `INTERRUPTED` | 执行开始后因 BOSS 退出、掉线、崩溃或账号/公司失效中断 | 不作为独立根状态，映射为 `FAILED + terminalReason=INTERRUPTED`。 |

SSE 建连使用以下参数：

```text
GET /sseManager/connect?satoken={satoken}&clientSessionId={clientSessionId}&sessionEpoch={sessionEpoch}
```

服务端处理顺序：

1. 使用现有 `satoken` 鉴权并获取当前 i快招 `userId`。
2. 按 `clientSessionId` 查询客户端会话。
3. 校验客户端会话属于当前 `userId/companyId`，且请求中的 `sessionEpoch` 与当前值一致。
4. 校验会话未关闭、`channelLoginState`、完整职位同步版本和渠道运行态满足任务 SSE 建连条件。
5. 以 `clientSessionId` 注册本地 SSE emitter，并写入 Redis 路由映射 `sse:client-session-instance:{clientSessionId}`。
6. 订阅注册完成后立即发送当前 `DAY_PLAN_SNAPSHOT`，随后发送 `DAY_PLAN_CHANGED`、任务进度和任务指令事件。

`companyId/channelCode/channelAccountId/externalCompanyId` 由服务端从客户端会话读取，不信任客户端在 SSE URL 中额外提交的值。未登录、完整职位同步版本不可用、`sessionEpoch` 不匹配或已关闭的客户端会话不得建立任务 SSE。

本期继续把长期 `satoken` 放在 SSE URL 中，作为已接受的安全债务。招聘前端、i快招前端、网关、Nginx、代理和错误监控必须过滤完整 SSE URL，只允许记录脱敏后的 `satoken` 和 `clientSessionId`。

### 11.2 新增招聘后端接口

以下接口当前招聘后端不存在，属于新增：

| 接口 | 作用 | 主要副作用/约束 |
|---|---|---|
| `GET /ai-recruit/assistant/positions` | AI 寻聘助手页分页查询所有已打开 AI 寻聘且有权限的职位及其当前渠道关联、同步状态和客户端状态 | 只读批量查询；固定过滤 `aiEnabled=true`；按当前用户职位权限过滤；支持职位名称、BOSS 职位名称、绑定状态和同步状态筛选；不返回完整可绑定职位列表 |
| `GET /ai-recruit/positions/{headcountId}/assistant-config` | 职位详情页聚合读取单个职位的 AI 寻聘配置、当前 BOSS 绑定、可绑定 BOSS 职位、客户端会话、权益、日计划和任务摘要 | 只读，校验职位权限；职位配置、职位权益和任务摘要按当前 `headcountId` 聚合，客户端和日计划按绑定账号上下文返回；客户端离线时仍返回配置，只把客户端相关摘要降级；本期只返回 BOSS 渠道 |
| `PUT /ai-recruit/positions/{headcountId}/config` | 保存配置并生成新版本 | 写配置表、版本加 1并标记 `SYNCING`，同步调用 i快招；确认成功后标记 `SYNCED`，失败或超时返回错误；i快招把完整配置写入 `sync_inbox`。正在执行的任务继续使用旧快照，尚未开始的后续职位任务在首次执行时读取最新 `POSITION_CONFIG_PUBLISHED` |
| `PUT /ai-recruit/positions/{headcountId}/bindings/{channelCode}` | 新增或编辑系统职位与指定渠道职位的关联 | 同一系统职位在同一渠道只能关联一个职位；编辑时原子覆盖当前关联、递增 `bindingVersion`、写 `operate_log` 并同步调用 i快招；确认成功后返回保存成功，失败返回错误；不支持主动解绑或传空渠道账号/职位 ID |
| `GET /ai-recruit/tasks` | 查询某业务日的搜索/回复任务列表 | 招聘后端调用 i快招二方任务查询接口；按当前用户职位权限过滤，支持状态和职位筛选；结果允许 2-5 秒短缓存 |
| `GET /ai-recruit/tasks/{taskId}/candidates` | 统一查询搜索或回复任务的候选人结果 | 招聘后端先调用 i快招二方任务查询接口校验任务和权限，再调用候选人二方查询接口；搜索任务不返回列表预筛淘汰者 |
| `PUT /internal/ai-recruit/positions/{headcountId}/bindings/{channelCode}` | 接收 i快招后端发起的系统职位与 BOSS 职位关联修改 | 不暴露给桌面端；先校验职位权限、账号、公司、BOSS 职位和当前关联，再原子覆盖绑定并返回 `bindingVersion`；绑定同步成功后才能创建手动搜索任务；不支持传空或解绑 |
| `POST /internal/ai-recruit/sync/events` | 接收 i快招同步的会话、渠道账号及权益、渠道职位及权益和任务终止通知事件 | 任务状态和候选人结果不走该接口；招聘侧不写 inbox；按业务表唯一键、通知幂等键和版本字段幂等；仅内部调用 |

本版不新增：

- `POST /internal/ai-recruit/launch/consume`
- `POST /ai-recruit/client/launch/exchange`
- `ai_recruit_launch_grant`
- deep link `v=2/v=3` 启动协议

招聘前端在 AI 寻聘助手页轮询 `GET /ai-recruit/assistant/positions`，在职位详情页轮询 `GET /ai-recruit/positions/{headcountId}/assistant-config`，任务运行期间轮询 `GET /ai-recruit/tasks/{taskId}/candidates`，建议 5 秒一次；离开页面或任务结束后停止轮询。

#### 11.2.1 招聘前端职位权益来源契约

招聘前端不解析渠道页面字段，也不调用 BOSS、猎聘等渠道权益接口。i快招通过渠道适配器识别权益来源并同步到招聘侧 `ai_recruit_channel_job_projection.rights_source`，招聘后端在职位寻聘配置聚合查询中统一返回当前绑定和可绑定职位的 `rightsSource`。

可绑定职位响应必须至少包含：

```json
{
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "externalUserId": "535435066",
  "externalCompanyId": "34716316",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
  "jobName": "产品经理",
  "jobStatus": "OPEN",
  "bindingStatus": "NOT_BOUND",
  "rightsSource": "PURCHASED",
  "jobPrivilegeCount": 100,
  "jobPrivilegeUsedCount": 20,
  "channelRemainingCount": 80,
  "allocatedLimit": 80,
  "aiUsedCount": 0,
  "collectStatus": "SUCCESS",
  "adapterVersion": "1.0.0",
  "extSchemaVersion": 1,
  "lastSyncedAt": "2026-11-16T10:30:00+08:00"
}
```

该列表只返回 `present_in_latest_list=1` 的职位；完整列表同步后消失的职位不得继续出现在可绑定候选，已有绑定由校验任务标记 `JOB_NOT_FOUND`。

职位寻聘配置聚合查询返回 `channelBindings`，本期只包含 BOSS 一项，并复用相同的 `rightsSource` 和权益字段。某渠道未绑定时对应绑定为 `null`；旧数据无法识别权益来源时返回 `rightsSource=UNKNOWN`，不能省略字段。

`jobStatus` 使用归一化枚举：

| `jobStatus` | 含义 | 自动任务 |
|---|---|---|
| `OPEN` | 适配器确认职位可正常使用；BOSS `jobStatus=0` 映射到此值 | 可进入后续权益和配置准入 |
| `NOT_OPEN` | 适配器确认职位不可用；当前 BOSS `jobStatus=1/3` 映射到此值 | 禁止自动执行 |
| `UNKNOWN` | 未知原始值、字段缺失或完整职位列表未同步；BOSS `jobStatus=2` 当前映射到此值 | 禁止自动执行 |

| `rightsSource` | 含义 | 招聘前端展示 | 自动任务 |
|---|---|---|---|
| `PURCHASED` | 该渠道职位单独购买权益 | 单独购买职位 | 条件满足时可执行 |
| `ACCOUNT_POOL` | 使用渠道账号总权益；BOSS `VIP_CREATED` 映射到此值 | BOSS 展示为“VIP 职位” | 条件满足时可执行 |
| `CHANNEL_MANAGED` | 渠道统一托管权益，无账号/职位级明确额度 | 渠道统一权益 | 仅在适配器声明可自动执行时允许 |
| `UNKNOWN` | 权益来源未识别或解析失败 | 权益来源待同步 | 禁止自动执行 |

`rightsSource` 是职位级字段。同一个当前渠道账号下可能同时存在 `PURCHASED` 和 `ACCOUNT_POOL` 职位，不能把整个客户端会话统一标记为 VIP。`collectStatus != SUCCESS` 或 `lastSyncedAt` 缺失时，前端展示最后同步时间或“待同步”，后端不得将陈旧或 `UNKNOWN` 数据用于自动任务准入。

#### 11.2.2 配置聚合查询与关联编辑契约

`GET /ai-recruit/positions/{headcountId}/assistant-config` 只承载职位详情页首屏和单个职位的运行状态摘要，不承担 AI 寻聘助手页的批量列表查询。可传可选参数 `businessDate`，未传时使用服务端当前业务日。

```json
{
  "headcountId": "100001",
  "businessDate": "2026-11-17",
  "positionConfig": {
    "aiEnabled": true,
    "filterMode": "FILTER_AND_GREET",
    "scoreLine": 75,
    "positionHarnessProfileId": "profile-10001",
    "profileContentHash": "sha256:...",
    "expectedResumeCount": 10,
    "replyResumeEnabled": true,
    "channelFilters": {
      "BOSS": {}
    },
    "chatLimitOverride": null,
    "configVersion": 12,
    "syncStatus": "SYNCED",
    "syncedConfigVersion": 12,
    "lastSyncError": null,
    "lastSyncedAt": "2026-11-17T10:28:00+08:00"
  },
  "channelBindings": [
    {
      "channelCode": "BOSS",
      "channelAccountId": "ca-10001",
      "externalUserId": "535435066",
      "externalCompanyId": "34716316",
      "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
      "jobName": "产品经理",
      "bindingStatus": "ACTIVE",
      "bindingVersion": 3,
      "syncStatus": "SYNCED",
      "syncedBindingVersion": 3,
      "lastSyncError": null,
      "rightsSource": "PURCHASED",
      "lastSyncedAt": "2026-11-17T10:30:00+08:00",
      "adapterVersion": "1.0.0",
      "extSchemaVersion": 1,
      "channelExt": {}
    }
  ],
  "bindableJobs": [],
  "clientSession": {
    "clientSessionId": "session-uuid",
    "sessionEpoch": 3,
    "state": "BUSY",
    "clientDisplayStatus": "BUSY",
    "connectionState": "ONLINE",
    "appVersion": "2.1.0",
    "channelRuntime": {
      "channelCode": "BOSS",
      "channelAccountId": "ca-10001",
      "externalUserId": "535435066",
      "externalCompanyId": "34716316",
      "companyName": "上海利唐信息科技有限公司大连分公司",
      "channelLoginState": "LOGGED_IN",
      "displayName": "王女士",
      "clientDisplayStatus": "BUSY",
      "connectionState": "ONLINE",
      "adapterVersion": "1.0.0",
      "lastChannelSnapshotAt": "2026-11-17T10:30:00+08:00",
      "channelStateVersion": 5
    }
  },
  "rightsSummary": {
    "accountRemainingCount": 46,
    "allocatedLimit": 46,
    "aiUsedCount": 8
  },
  "dayPlanSummary": {
    "dayPlanId": "day-plan-20261117-ca10001",
    "businessDate": "2026-11-17",
    "status": "SEARCHING",
    "planVersion": 3,
    "currentHeadcountId": "100001",
    "currentSearchTaskId": "task-1001",
    "currentReplyTaskId": null,
    "nextReplyAt": null
  },
  "taskStats": {
    "waiting": 2,
    "running": 1,
    "completed": 3,
    "failed": 0
  },
  "latestTask": null,
  "freshnessState": "FRESH",
  "lastSyncedAt": "2026-11-17T10:30:00+08:00"
}
```

聚合口径：

- `positionConfig/channelBindings/bindableJobs/taskStats/latestTask` 按当前 `headcountId` 过滤，不能混入同企业其他职位的数据。
- `taskStats/latestTask/dayPlanSummary` 由招聘后端调用 i快招任务二方查询接口聚合，不在招聘侧保存任务投影。
- `rightsSummary.allocatedLimit/aiUsedCount` 中，`allocatedLimit` 是当前职位本轮 AI 沟通上限，`aiUsedCount` 必须优先由招聘后端调用 i快招当日任务二方查询，按 `businessDate + channelAccountId + headcountId` 聚合成功自动打招呼数得到；任务停止和日报同样以 i快招结果行聚合为准。招聘侧 `ai_recruit_channel_job_projection.ai_used_count` 只能作为最近值兜底展示，不能替代 i快招事实，且必须返回 `lastSyncedAt/freshnessState`。`accountRemainingCount` 是绑定渠道账号的共享剩余权益，只作为上下文展示。
- `clientSession` 返回与当前职位绑定账号相关的活动客户端会话摘要，`channelRuntime` 返回该会话内本期唯一的 BOSS 运行态；不返回其他账号的会话。
- `dayPlanSummary` 是该绑定账号和公司上下文当天的账号级计划摘要，不按 `headcountId` 重新创建；通过 `currentHeadcountId` 标明当前搜索任务所属职位。
- 客户端离线、未登录、账号投影尚未同步或任务二方查询暂不可用时，配置和可绑定职位仍正常返回；`clientSession` 可为 `null`，`channelRuntime` 也可为 `null`，并通过 `freshnessState/lastSyncedAt` 明确数据新鲜度，不能因为客户端离线或任务查询失败让整个配置查询失败。
- `dayPlanSummary` 查询失败或尚未生成时返回 `null`，其他配置字段仍可读取；它只用于展示，不替代 SSE 下发给桌面端的 `DAY_PLAN_SNAPSHOT`。
- 该接口不返回完整任务列表。任务列表和候选人明细继续分别使用 `GET /ai-recruit/tasks` 和 `GET /ai-recruit/tasks/{taskId}/candidates`。
- `positionConfig.syncStatus/syncedConfigVersion/lastSyncError/lastSyncedAt` 必须返回，前端据此展示当前配置是否已同步 i快招；`channelBindings[].syncStatus/syncedBindingVersion/lastSyncError` 同理。保存失败时展示后端错误，不得显示为已同步。
- 本接口已经包含客户端会话和 BOSS 运行态摘要，因此本版不再单独提供 `GET /ai-recruit/client-sessions/current`。

`PUT /ai-recruit/positions/{headcountId}/bindings/{channelCode}` 请求：

```json
{
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "externalUserId": "535435066",
  "externalCompanyId": "34716316",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
  "adapterVersion": "1.0.0",
  "extSchemaVersion": 1,
  "channelExt": {}
}
```

约束：

- `channelCode`、`channelAccountId`、`externalCompanyId` 和 `externalJobId` 均不能为空，必须是当前招聘企业可绑定职位列表中的值；不提供删除字段或用空值表示解绑。
- 首次关联记为 `BIND`；已有其他关联时记为 `CHANGE`，并在一次事务中覆盖当前关联。
- 同一目标重复提交按幂等成功处理，不递增 `bindingVersion`，不重复调用 i快招同步命令。
- 招聘本地保存后同步调用 i快招；只有 i快招确认成功才返回 `SYNCED`。失败或超时返回错误并记录 `SYNC_FAILED/lastSyncError`。
- 用户重试时必须复用同一业务版本对应的同步请求 ID，i快招按 inbox 幂等返回首次成功结果。
- 该接口只编辑一个系统职位在当前渠道的一条关联。职位详情页直接调用；AI 寻聘助手页逐行编辑时也复用该接口，不另建语义不同的单行写接口。

#### 11.2.3 AI 寻聘助手批量职位查询契约

`GET /ai-recruit/assistant/positions` 用于 AI 寻聘助手页批量展示所有已打开 AI 寻聘且当前用户有权限的职位，以及每个职位当前关联的 BOSS 职位、账号、权益和同步状态。

查询参数：

- `page`：页码，从 1 开始。
- `pageSize`：每页数量，默认 20，最大 100。
- `keyword`：可选，匹配招聘职位名称或当前关联 BOSS 职位名称。
- `channelCode`：可选，本期固定传 `BOSS`。
- `bindingStatus`：可选，按 `ACTIVE/CHANNEL_NOT_LOGGED_IN/CHANNEL_ACCOUNT_MISMATCH/EXTERNAL_COMPANY_MISMATCH/JOB_NOT_FOUND/JOB_NOT_OPEN` 筛选。
- `syncStatus`：可选，按 `SYNCING/SYNCED/SYNC_FAILED` 筛选。
- `sortOrder`：可选，默认按配置 `sort_order`、职位更新时间排序。

响应示例：

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 2,
  "accountSummary": {
    "channelAccountId": "ca-10001",
    "displayName": "张三",
    "channelLoginState": "LOGGED_IN",
    "rights": {
      "viewQuota": {
        "usedCount": 130,
        "totalCount": 200
      },
      "communicationQuota": {
        "usedCount": 3,
        "totalCount": 100
      },
      "onlineCompetitiveJobQuota": {
        "usedCount": 4,
        "totalCount": 4
      }
    },
    "capturedAt": "2026-11-17T10:30:00+08:00",
    "freshnessState": "FRESH"
  },
  "items": [
    {
      "headcountId": "100001",
      "positionName": "高级产品经理",
      "positionStatus": "OPEN",
      "aiEnabled": true,
      "config": {
        "filterMode": "FILTER_AND_GREET",
        "scoreLine": 75,
        "expectedResumeCount": 10,
        "replyResumeEnabled": true,
        "chatLimitOverride": null,
        "configVersion": 12,
        "syncStatus": "SYNCED"
      },
      "channelBinding": {
        "channelCode": "BOSS",
        "channelAccountId": "ca-10001",
        "channelAccountDisplayName": "王女士",
        "externalCompanyId": "34716316",
        "externalCompanyName": "上海利唐信息科技有限公司大连分公司",
        "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
        "jobName": "产品经理",
        "bindingStatus": "ACTIVE",
        "bindingVersion": 3,
        "syncStatus": "SYNCED",
        "rightsSource": "PURCHASED",
        "allocatedLimit": 30,
        "aiUsedCount": 8,
        "lastVerifiedAt": "2026-11-17T10:30:00+08:00"
      },
      "clientSummary": {
        "channelLoginState": "LOGGED_IN",
        "clientDisplayStatus": "BUSY",
        "lastChannelSnapshotAt": "2026-11-17T10:30:00+08:00",
        "freshnessState": "FRESH"
      }
    },
    {
      "headcountId": "100002",
      "positionName": "Java 开发工程师",
      "positionStatus": "OPEN",
      "aiEnabled": true,
      "config": {
        "filterMode": "FILTER_ONLY",
        "scoreLine": 80,
        "positionHarnessProfileId": "profile-10002",
        "profileContentHash": "sha256:...",
        "expectedResumeCount": 5,
        "replyResumeEnabled": false,
        "chatLimitOverride": 10,
        "configVersion": 4,
        "syncStatus": "SYNCED"
      },
      "channelBinding": null,
      "clientSummary": {
        "channelLoginState": "LOGGED_IN",
        "clientDisplayStatus": "READY",
        "lastChannelSnapshotAt": "2026-11-17T10:30:00+08:00",
        "freshnessState": "FRESH"
      }
    }
  ]
}
```

批量查询规则：

- 固定查询 `ai_enabled=1` 的职位；关闭 AI 寻聘后不再出现在该列表。
- 必须按当前用户职位权限过滤，不能只按 `companyId` 返回企业全部职位。
- 列表只返回当前绑定摘要，不返回完整 `bindableJobs`，避免一次查询携带大量 BOSS 职位。用户点击编辑时，再调用 `GET /ai-recruit/positions/{headcountId}/assistant-config` 获取可绑定职位和当前关联。
- `accountSummary` 返回当前页面绑定账号的账号级摘要，不按职位重复计算。`rights.viewQuota` 取 BOSS `countType=1`，`rights.communicationQuota` 取 `countType=2`，`rights.onlineCompetitiveJobQuota` 取 `countType=7`；三项均按“已用/总量”展示。`countType=4` 的在线普通职位不并入竞招/集招职位指标。
- `accountSummary` 没有活动账号或权益尚未同步时返回 `null`，不得返回全企业聚合值或使用其他 BOSS 账号的数据。
- `channelBinding.allocatedLimit` 是当前职位本业务日实际 AI 沟通上限：`chatLimitOverride` 非空时优先使用该值，否则使用权益分配结果；`channelBinding.aiUsedCount` 必须优先取 i快招当日任务二方查询聚合的成功自动打招呼数，不能只读招聘侧投影缓存。达到 `aiUsedCount >= allocatedLimit` 时，招聘页面显示该职位已用尽，i快招调度器必须停止该职位当前搜索任务并继续下一个职位。
- `channelBinding=null` 表示该职位已打开 AI 寻聘但尚未关联 BOSS 职位，前端应展示“未关联”并允许编辑。
- 批量页采用逐行编辑和逐行保存，保存复用 `PUT /ai-recruit/positions/{headcountId}/bindings/{channelCode}`。本期不新增批量写接口，避免多行部分成功、版本冲突和错误回滚语义复杂化。
- 同一职位绑定保存成功后，前端可局部更新该行，也可重新请求当前页；不得按本地状态直接假定 i快招已同步。

#### 11.2.4 任务候选人结果查询契约

`GET /ai-recruit/tasks/{taskId}/candidates` 统一承载搜索任务和回复任务的候选人结果查询。

查询参数：

- `page`：页码，从 1 开始。
- `pageSize`：每页数量，默认 20，最大 100。
- `status`：可选，按候选人结果状态过滤。

服务端先调用 i快招二方任务查询接口取得任务上下文，校验企业、当前登录用户身份和职位权限，再调用候选人二方查询接口并返回对应候选人数据。客户端不传 `taskType`，避免路径参数与任务类型不一致。招聘侧不落任务状态或候选人结果投影表；i快招不可用时返回明确的数据不可用错误，不能把失败结果转换成空列表。

公共响应：

```json
{
  "taskId": "task-1001",
  "taskType": "SEARCH",
  "page": 1,
  "pageSize": 20,
  "total": 2,
  "items": []
}
```

`taskType=SEARCH` 时，`items` 使用搜索结果结构：

```json
{
  "candidateRef": "candidate-ref",
  "candidateName": "候选人A",
  "headcountId": "100001",
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "externalUserId": "535435066",
  "externalCompanyId": "34716316",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
  "evaluationStage": "SCORE",
  "score": 82.5,
  "qualified": true,
  "greetingStatus": "SUCCESS",
  "attachmentStatus": "NONE",
  "importStatus": null,
  "occurredAt": "2026-11-16T10:30:00+08:00"
}
```

搜索任务只返回通过列表预筛并进入详情、评分或后续动作的候选人，不返回 `REJECTED` 预筛淘汰者，也不返回扫描人数和淘汰人数。

`taskType=REPLY` 时，`items` 使用回复候选人结构：

```json
{
  "candidateRef": "candidate-ref",
  "conversationId": "conversation-1001",
  "headcountId": "100001",
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "externalUserId": "535435066",
  "externalCompanyId": "34716316",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
  "status": "WAITING_ATTACHMENT",
  "replyActions": {
    "message": {
      "status": "SUCCESS",
      "sentAt": "2026-11-16T14:10:00+08:00"
    },
    "requestResume": {
      "status": "SUCCESS",
      "completedAt": "2026-11-16T14:10:05+08:00"
    },
    "exchangePhone": {
      "status": "FAILED",
      "errorCode": "BUTTON_NOT_FOUND"
    },
    "exchangeWechat": {
      "status": "SUCCESS",
      "completedAt": "2026-11-16T14:10:08+08:00"
    }
  },
  "attachmentStatus": "UPLOADED",
  "score": 80,
  "scorePass": true,
  "importStatus": "IMPORTED",
  "lastActionAt": "2026-11-16T14:20:00+08:00"
}
```

回复任务的 `items` 返回固定文案、求简历、换电话、换微信的独立动作状态，以及附件简历评分和导入状态。字段来源如下：

- `status/replyActions/importStatus/importResult` 来自 `reply_task_candidate`。
- `attachmentStatus/score` 来自 `reply_task_candidate` 的最近附件摘要，并可用 `latest_resume_detail_id/score_record_id` 追溯 `resume_detail2/resume_score_record`；没有附件时返回 `attachmentStatus=NOT_RECEIVED`。
- `scorePass` 根据评分记录和 `search_task.config_snapshot_json.scoreLine` 中冻结的职位分数线实时计算，不单独落库。
- `lastActionAt` 来自 `reply_task_candidate.last_action_at`；动作细分时间从 `action_state_json` 读取。

前端根据响应顶层的 `taskType` 选择对应列和详情展示，不需要根据 URL 判断任务类型。

#### 11.2.5 现有手动简历搜索契约

手动简历搜索复用 i快招桌面端现有入口和现有 `POST /search/task/create`，不新增招聘侧 `manual-search` 接口，也不新增 i快招内部手动任务创建接口。它不是“立即沟通”接口，不会直接给候选人发消息；任务是否自动打招呼仍由招聘同步配置决定。

用户点击搜索前，i快招桌面端调用：

```text
GET /ai-recruit/client/manual-search-context?headcountId={headcountId}&chatId={chatId}
```

响应至少包含：

```json
{
  "headcountId": "100001",
  "chatId": "chat-1001",
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "config": {
    "aiEnabled": true,
    "filterMode": "FILTER_AND_GREET",
    "scoreLine": 75,
    "positionHarnessProfileId": "profile-10001",
    "profileContentHash": "sha256:...",
    "expectedResumeCount": 10,
    "channelFilters": {
      "BOSS": {}
    },
    "configVersion": 12,
    "syncStatus": "SYNCED"
  },
  "binding": {
    "channelCode": "BOSS",
    "channelAccountId": "ca-10001",
    "externalCompanyId": "34716316",
    "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
    "bindingVersion": 6,
    "bindingStatus": "ACTIVE"
  },
  "autoSearchCompleted": true
}
```

创建任务时，请求在前端现有字段基础上增加：

```json
{
  "requestId": "9dbd4d8a-58bd-4dbe-8f6d-56f6ee62c0fa",
  "headcountId": "100001",
  "channelCode": "BOSS",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ"
}
```

约束：

- `requestId` 由 i快招桌面端为每次用户点击生成。同一请求超时重试复用同一值并返回同一任务，用户再次点击生成新值。
- 手动搜索只允许在全部自动搜索任务完成后创建，且必须满足职位权限、`aiEnabled=true`、`expectedResumeCount>0`、当前绑定有效、BOSS 已登录、权益可用和时间窗口有效。
- 目标职位不要求存在于自动任务集合、`position_order_json` 或日计划 `execution_context_json`。当天新增职位或后来修复、变更关联的职位，只要用户点击时有效，都允许搜索。
- 用户修改 BOSS 职位关联时，i快招桌面端先调用 i快招后端，由 i快招后端调用 `PUT /internal/ai-recruit/positions/{headcountId}/bindings/{channelCode}` 同步招聘后端。招聘更新成功后返回权威绑定和新的 `bindingVersion`，i快招后端把完整 `JOB_BINDING_PUBLISHED` 事件写入 `sync_inbox`，之后才能创建搜索任务。招聘保存、i快招事件写入或任务创建任一步失败，都不得用旧关联静默继续搜索。
- 手动任务固定 `task_kind=SEARCH`、`task_type=INITIAL`、`trigger_source=USER_CLICK`，任务范围键为 `USER:{requestId}:JOB:{headcountId}`。
- i快招后端从 `sync_inbox` 最新 `POSITION_CONFIG_PUBLISHED` 读取招聘同步配置，并在首次 `RUNNING` 时写入 `search_task.config_snapshot_json`；客户端提交的期望简历数、分数线或筛选条件字段无效。职位画像必须在同一时点通过招聘接口读取当前 `positionHarnessProfileId/profileContent`，任务固定画像 ID 但不冻结画像版本；后续预筛、详情评分和附件评分由招聘按该画像当前最新内容执行，客户端不得提交或覆盖画像内容。
- 首次 `RUNNING` 时同时把本次账号、公司、系统职位、BOSS 职位、绑定版本和权益上下文写入 `search_task_channel.execution_snapshot_json`。后续关联修改不能覆盖该任务的职位执行快照。
- 日计划处于 `REPLY_WAITING` 时任务进入手动搜索队列；处于 `REPLY_RUNNING` 时，当前回复轮次完成并按正常规则生成下一次 `nextReplyAt` 后执行。手动队列串行执行，之后不再次重置 `nextReplyAt`。
- 同一职位允许使用不同 `requestId` 在同一天多次搜索；每次都要重新校验职位开放状态、渠道登录状态、职位日分配额度和渠道剩余权益。
- 以下情况返回明确业务错误，不创建可执行任务：`AUTO_SEARCH_NOT_COMPLETED`、`JOB_NOT_EXECUTABLE`、`CLIENT_SESSION_NOT_READY`、`NO_REMAINING_RIGHTS`、`OUT_OF_WORK_PERIOD`、`CONFIG_NOT_SYNCED`、`EXPECTED_RESUME_COUNT_EMPTY`。

内部绑定同步响应示例：

```json
{
  "headcountId": "100001",
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "externalCompanyId": "34716316",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
  "bindingVersion": 7,
  "bindingStatus": "ACTIVE"
}
```

#### 11.2.6 回复附件导入复用分配职位链路

达标附件不新增独立业务导入接口，复用招聘现有：

1. `POST /candidate/AiManager/client/noauth/resume/upload`：上传桌面端获取的附件，返回原始 `fileId`。
2. `POST /candidate/AiManager/client/noauth/import`，`isSelectPosition=false`：解析、查重并返回候选人/重复候选人候选集。
3. 以回复任务的 `positionHarnessProfileId` 查询当前最新画像评分报告，补齐 `harnessScoreReport/scoringProfile`。
4. `POST /candidate/AiManager/client/noauth/import`，`isSelectPosition=true`：正式导入，成功进入招聘初筛。

正式导入不增加 `Idempotency-Key`。i快招锁定 `reply_task_candidate` 行，以 `companyId + replyTaskCandidateId + resumeInfo.id` 作为固定业务键，并在 `import_status=IMPORTING` 时阻止重复调用。明确成功写 `SUCCESS/REPEATED`，明确失败才允许重试；超时或响应未知写 `PENDING_CONFIRM`，不自动重试。`reply_task_candidate.import_result_json` 保存文件 ID、候选人 ID、Application ID、导入状态、评分画像内容摘要和失败原因。

### 11.3 新增 i快招后端接口

以下接口当前 i快招后端不存在，属于新增：

| 接口 | 作用 | 主要副作用/约束 |
|---|---|---|
| `POST /ai-recruit/client/session/open` | 桌面端现有 SSO 登录成功后创建客户端会话 | 从 i快招当前登录用户获取身份；校验招聘用户和企业映射；首次请求生成并返回 `clientInstanceId`，同时返回 `clientSessionId/sessionEpoch/state`；不接收 launch ticket，不新增客户端 session token |
| `POST /ai-recruit/client/session/heartbeat` | 上报客户端存活状态、会话内渠道状态和当前任务 | 10 秒一次；请求至少包含 `clientSessionId/sessionEpoch/channelCode/channelAccountId/state/channelLoginState/currentTaskId/taskLeaseEpoch/appVersion` |
| `POST /ai-recruit/client/channel-state` | 上报 BOSS 登录态、账号/公司上下文，以及可选的账号权益和全量职位列表 | 只登录或退出时只传状态；首次登录或刷新权益时附带完整 `snapshot`；同一 `clientSessionId` 不得混用两个 `channelAccountId + externalCompanyId` 的采集结果；账号或公司变化时必须关闭旧会话并重新 `session/open` |
| `GET /ai-recruit/client/manual-search-context` | 现有手动简历搜索打开时由桌面端调用 i快招后端，读取招聘同步配置、当前有效关联和自动搜索完成状态 | 按 `headcountId/chatId` 校验当前用户和企业范围；i快招后端从 `sync_inbox` 最新 `POSITION_CONFIG_PUBLISHED/JOB_BINDING_PUBLISHED` 事件读取当前配置和绑定；不返回完整招聘配置编辑模型，不允许客户端覆盖配置 |
| `POST /ai-recruit/task/{taskId}/prefilter` | 对单个候选人使用当前渠道列表字段执行硬规则预筛 | 返回 PASS/REJECTED/UNKNOWN；请求必须带同一职位执行单元内单调递增的 `prefilterRequestNo`；新序号原子增加 `prefilter_total_count`，重复序号返回上次结果，旧序号返回 `STALE_REQUEST`；REJECTED 不落候选人表、不占 batchSize；字段由适配器归一化 |
| `POST /ai-recruit/task/candidate-action-result` | 统一上报搜索任务自动打招呼和回复任务各动作结果 | `taskType/actionType/status/idempotencyKey` 必填；搜索任务 `GREETING SUCCESS` 只能写入 `communication_type=0` 并增加 AI 已沟通；固定文案成功后不重发，失败动作可补做 |
| `POST /internal/ai-recruit/tasks/query` | 招聘后端查询任务列表、职位任务摘要和计数 | 二方只读接口；按 `companyId`、授权职位、业务日、任务类型和状态过滤；直接读取 i快招任务事实，不依赖招聘投影表 |
| `POST /internal/ai-recruit/tasks/{taskId}/candidates/query` | 招聘后端查询搜索或回复任务的候选人结果 | 二方只读接口；返回任务上下文和分页结果；按招聘侧传入的授权职位过滤，搜索任务不返回列表预筛淘汰者 |
| `POST /internal/ai-recruit/sync/commands` | 同步接收招聘侧配置、绑定、自动任务执行上下文和启用状态命令 | 业务更新与 `sync_inbox` 写入同事务；保存完整 payload，按 `consumer + eventId` 幂等，并以 `companyId + consumer + aggregateId + aggregateVersion` 查询最新配置/绑定；不覆盖已进入 `RUNNING` 的任务配置或已生成自动任务的日计划职位集合 |

`POST /internal/ai-recruit/sync/events` 只由招聘侧实现，用于接收 i快招同步的会话、账号权益、全量职位当前列表和任务终止通知事件；任务状态和候选人结果改由招聘实时调用 i快招二方查询接口，不再异步投影到招聘数据库。招聘侧不新增 inbox，事件按账号、职位和通知业务幂等键处理。`POST /internal/ai-recruit/sync/commands` 只由 i快招侧实现，用于同步接收招聘配置、职位关联、执行上下文和启用状态，成功写入 `sync_inbox` 后才向招聘返回成功。

i快招不新增职位配置或绑定投影表。`sync_inbox` 保存完整同步 payload，并按 `company_id + consumer + aggregate_id + aggregate_version` 提供最新事件查询：

```text
IKZ_POSITION_CONFIG + headcountId
  -> 最新 POSITION_CONFIG_PUBLISHED

IKZ_JOB_BINDING + headcountId
  -> 最新 JOB_BINDING_PUBLISHED
```

任务首次进入 `RUNNING` 时必须在同一事务内查询并固化任务快照。每个职位最新成功配置和绑定事件不得清理；`payload_json` 不能只保存审计摘要。

#### 11.3.1 任务二方查询契约

`POST /internal/ai-recruit/tasks/query` 由招聘后端调用，统一支撑招聘侧 `GET /ai-recruit/tasks` 以及职位配置聚合中的 `taskStats/latestTask/dayPlanSummary`。

请求示例：

```json
{
  "companyId": "company-1",
  "businessDate": "2026-11-18",
  "taskIds": [],
  "taskType": "SEARCH",
  "channelCode": "BOSS",
  "authorizedHeadcountIds": ["100001", "100002"],
  "channelAccountId": "ca-10001",
  "statuses": ["RUNNING", "COMPLETED"],
  "includeDayPlan": true,
  "page": 1,
  "pageSize": 20
}
```

响应示例：

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "summary": {
    "waiting": 2,
    "running": 1,
    "completed": 3,
    "failed": 0,
    "latestTask": null
  },
  "dayPlanSummary": {
    "dayPlanId": "day-plan-20261118-ca10001",
    "businessDate": "2026-11-18",
    "status": "SEARCHING",
    "planVersion": 3,
    "currentHeadcountId": "100001",
    "currentSearchTaskId": "task-1001",
    "currentReplyTaskId": null,
    "nextReplyAt": null
  },
  "items": [
    {
      "taskId": "task-1001",
      "taskType": "SEARCH",
      "triggerSource": "SYSTEM",
      "companyId": "company-1",
      "channelCode": "BOSS",
      "channelAccountId": "ca-10001",
      "headcountId": "100001",
      "headcountIds": ["100001"],
      "status": "RUNNING",
      "expectedResumeCount": 10,
      "prefilterTotalCount": 20,
      "qualifiedCount": 3,
      "greetedCount": 2,
      "aiCommunicatedCount": 2,
      "configVersion": 12,
      "startedAt": "2026-11-18T08:01:00+08:00",
      "finishedAt": null,
      "lastUpdatedAt": "2026-11-18T10:30:00+08:00"
    }
  ]
}
```

约束：

- `companyId` 必须来自招聘已认证上下文，不能直接使用前端提交值；它是企业级任务的硬隔离条件。
- `userId` 不参与企业级共享任务的默认过滤。按职位权限共享的任务不能因为创建人不是当前用户而不可见；只有显式“我的任务/我创建的”视图才允许追加当前 `userId` 条件。
- `authorizedHeadcountIds` 是招聘当前用户有权限访问的职位集合；搜索任务按 `headcountId` 过滤，回复任务只返回至少命中一个授权职位的结果。
- `taskIds` 非空时按任务 ID 精确查询；`taskType` 为空时同时返回搜索和回复任务。
- 本期 `channelCode` 固定为 `BOSS`，由招聘后端显式传入，不能依赖 i快招服务端从历史数据推断。
- `prefilterTotalCount/qualifiedCount/greetedCount/aiCommunicatedCount` 是查询时按职位执行单元、结果行和详情行聚合的响应字段，不是任务表累计列；`configVersion` 从任务配置快照读取，对外状态为 `QUEUED`（内部持久化 `WAITING`）且尚未生成执行快照时返回 `null`。渠道职位、账号和公司信息通过任务及职位执行单元关联。
- `triggerSource` 返回现有任务触发来源。自动搜索和回复任务为 `SYSTEM`，现有手动简历搜索为 `USER_CLICK`；前端可据此区分任务来源，但不能用它判断候选人沟通是自动还是手动。
- `summary` 和 `dayPlanSummary` 仅在按单职位、单账号和单业务日聚合时返回，避免任务列表承担额外聚合成本。
- 任务列表查询允许招聘侧按 `companyId + businessDate + filter` 做 2-5 秒短缓存；任务详情和终态查询不得使用本地持久化副本替代。

#### 11.3.2 候选人二方查询契约

`POST /internal/ai-recruit/tasks/{taskId}/candidates/query` 由招聘后端调用，返回任务上下文和候选人分页结果。

请求示例：

```json
{
  "companyId": "company-1",
  "authorizedHeadcountIds": ["100001", "100002"],
  "statuses": [],
  "page": 1,
  "pageSize": 20
}
```

响应示例：

```json
{
  "task": {
    "taskId": "task-1001",
    "taskType": "SEARCH",
    "companyId": "company-1",
    "channelCode": "BOSS",
    "channelAccountId": "ca-10001",
    "headcountId": "100001",
    "headcountIds": ["100001"],
    "status": "RUNNING"
  },
  "page": 1,
  "pageSize": 20,
  "total": 2,
  "items": []
}
```

约束：

- i快招必须先校验任务属于请求中的 `companyId`，再按 `authorizedHeadcountIds` 过滤候选人结果；不得用任务创建人 `userId` 代替企业或职位权限校验。
- 同一企业内有职位权限的用户可以查看共享任务和候选人结果；`userId` 只用于操作归属、审计和用户私有数据。
- `taskType=SEARCH` 时，结果来自 `condition_resume/task_resume_detail`，只返回通过列表预筛并进入详情、评分或后续动作的候选人。
- `taskType=REPLY` 时，回复调度、动作和导入状态来自 `reply_task_candidate`；附件摘要来自 `resume_detail2`，评分历史来自 `resume_score_record`，其中 `reply_candidate_id` 指向 `reply_task_candidate.id`。接口统一返回固定文案、求简历、换电话、换微信、附件简历评分和导入状态，不读取 `condition_resume` 作为回复候选人来源。
- 响应中的 `task` 与 `items` 必须来自同一查询快照或同一可接受的一致性窗口，避免任务已终止但结果仍显示运行中。
- 招聘后端负责将结果中的 `headcountId` 补充为招聘职位名称，并在返回招聘前端前再次按当前用户权限过滤。
- 二方接口只允许服务间调用，必须使用内部认证、超时、熔断和链路日志；招聘前端不得直接访问 `/internal/**`。
- 链路日志只记录 `traceId/companyId/taskId/taskType/page/pageSize/resultCount/latencyMs/errorCode`，不得记录候选人姓名、手机号、简历正文、附件内容或完整响应体。

`POST /ai-recruit/client/channel-state` 合并渠道状态上报和采集结果上报。仅登录或退出时：

```json
{
  "clientSessionId": "session-uuid",
  "sessionEpoch": 3,
  "channelStateVersion": 5,
  "channelCode": "BOSS",
  "channelLoginState": "LOGGED_IN",
  "externalUserId": "658444611",
  "externalCompanyId": "34716316",
  "occurredAt": "2026-11-16T10:30:00+08:00"
}
```

首次登录或刷新权益时追加 `snapshot`：

```json
{
  "clientSessionId": "session-uuid",
  "sessionEpoch": 3,
  "channelStateVersion": 6,
  "channelCode": "BOSS",
  "channelLoginState": "LOGGED_IN",
  "externalUserId": "658444611",
  "externalCompanyId": "34716316",
  "jobSnapshotVersion": 12,
  "adapterVersion": "1.0.0",
  "extSchemaVersion": 1,
  "snapshot": {
    "account": {
      "externalUserId": "658444611",
      "displayName": "陈思莹",
      "externalCompanyId": "34716316",
      "externalCompanyName": "上海利唐信息科技有限公司大连分公司",
      "rightsSource": "ACCOUNT_POOL",
      "communicationQuotaTotal": 100,
      "communicationQuotaUsed": 20,
      "communicationQuotaRemaining": 80,
      "quotaConfidence": "EXACT",
      "businessDate": "2026-11-16",
      "entitlementCapturedAt": "2026-11-16T10:30:00+08:00",
      "channelExt": {
        "boss": {
          "userTitle": "招聘者",
          "brandId": "19829142",
          "brandName": "利唐"
        }
      }
    },
    "jobs": [
      {
        "channelJobSnapshotId": "job-snapshot-uuid",
        "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
        "jobName": "产品经理",
        "normalizedJobStatus": "OPEN",
        "rightsSource": "PURCHASED",
        "quotaConfidence": "EXACT",
        "channelExt": {
          "boss": {
            "rawJobStatus": "0"
          }
        }
      }
    ]
  },
  "occurredAt": "2026-11-16T10:31:00+08:00"
}
```

服务端按 `clientSessionId + sessionEpoch + channelStateVersion` 处理乱序：状态先落库；携带完整账号和职位数据时，更新 `channel_account` 当前态、同步招聘侧全量职位投影，并等待招聘侧回传绑定职位执行上下文。职位列表不完整时允许分阶段同步，但客户端会话不得在没有完整职位版本时进入 `READY`。旧 `sessionEpoch` 或旧 `channelStateVersion` 的请求直接拒绝。

SSE 建连继续复用 `GET /sseManager/connect?satoken=...`。客户端在会话达到可建立任务 SSE 的状态后，追加 `clientSessionId + sessionEpoch` 建连。服务端以 `satoken` 确认用户身份，再校验该客户端会话的归属、状态和当前 epoch；SSE 消息只路由给对应 `clientSessionId`。建连成功后先发送 `DAY_PLAN_SNAPSHOT`，再发送 `DAY_PLAN_CHANGED` 和任务事件；客户端重启、断线重连和首次进入 `READY` 均通过同一快照恢复，不提供独立的日计划查询接口。

统一动作结果接口请求示例：

```json
{
  "taskType": "REPLY",
  "taskId": "reply-task-1001",
  "candidateRef": "candidate-ref",
  "channelCode": "BOSS",
  "channelAccountId": "ca-10001",
  "clientSessionId": "session-uuid",
  "sessionEpoch": 3,
  "taskLeaseEpoch": 7,
  "externalUserId": "535435066",
  "externalCompanyId": "34716316",
  "externalJobId": "7f2392448ed78b4a03173N-8FVJZ",
  "conversationId": "conversation-1001",
  "actionType": "REQUEST_RESUME",
  "status": "SUCCESS",
  "idempotencyKey": "8ad7a9f8-706f-4aa9-ae09-8f48e3589f63",
  "occurredAt": "2026-11-16T14:30:00+08:00"
}
```

枚举：

- `taskType`: `SEARCH / REPLY`
- 搜索任务 `actionType`: `GREETING`
- 回复任务 `actionType`: `REPLY_MESSAGE / REQUEST_RESUME / EXCHANGE_PHONE / EXCHANGE_WECHAT`
- `status`: `SUCCESS / FAILED / SKIPPED`

服务端按 `companyId + channelCode + channelAccountId + externalCompanyId + taskType + taskId + candidateRef + actionType + idempotencyKey` 去重。只有搜索任务的 `GREETING SUCCESS` 写入 `condition_resume.communication_type=0` 并计入日报自动沟通次数，不维护任务级 AI 沟通累计列；固定文案 `REPLY_MESSAGE SUCCESS` 后永不重发，但不计入日报自动沟通次数，其余失败动作允许补做。

`session/open` 首次启动请求示例，不传 `clientInstanceId`：

```json
{
  "openRequestId": "open-request-uuid",
  "recruitCompanyId": "company-id",
  "deviceId": "masked-device-id",
  "appVersion": "2.1.0",
  "platform": "macOS"
}
```

后续启动请求示例，传入客户端已持久化的 `clientInstanceId`：

```json
{
  "clientInstanceId": "ci_01J8Z6M8Y8V6Y8Q7Q6N8M6P4R2",
  "openRequestId": "new-open-request-uuid",
  "recruitCompanyId": "company-id",
  "deviceId": "masked-device-id",
  "appVersion": "2.1.0",
  "platform": "macOS"
}
```

响应示例：

```json
{
  "clientInstanceId": "ci_01J8Z6M8Y8V6Y8Q7Q6N8M6P4R2",
  "clientSessionId": "session-uuid",
  "sessionEpoch": 3,
  "state": "SSO_AUTHENTICATED"
}
```

约束：

- `tenantId/userId` 以 i快招现有 SSO 登录上下文为准。现有 SSO 已携带 `companyId/companyName`，服务端以 `tenantId + thirdPartyUserId` 识别稳定 i快招用户，并以 `third_party_user.external_company_id` 作为招聘企业映射；`recruitCompanyId` 仅用于与 SSO 上下文核对，不能单独作为授权事实。`companyName` 只展示，不作为唯一键。
- `companyId` 缺失映射返回 `COMPANY_MAPPING_NOT_FOUND`，映射与本次招聘登录企业不一致返回 `SSO_COMPANY_MISMATCH`；两种情况都不得创建可执行会话或进入 `READY`。切换企业必须关闭旧 `clientSessionId`，创建新会话和新 `sessionEpoch`。
- `ai_client_instance` 在请求未携带 `clientInstanceId` 时按当前 `tenantId + companyId` 创建；请求携带时按 `tenantId + companyId + clientInstanceId` 查询并复用。同一企业内不同用户复用该实例行；同一物理安装切换招聘企业时，客户端按 `tenantId + companyId` 分别持久化 `clientInstanceId` 并创建不同逻辑实例行，不能覆盖原企业上下文。
- 首次 `session/open` 不传 `clientInstanceId`，由 i快招后端生成并返回；建议格式为 `ci_ + UUIDv7/ULID`，客户端不得自行生成。客户端成功持久化后才能进入后续渠道采集和任务流程；后续启动继续携带该值。
- 相同 `openRequestId` 重试必须返回同一个 `clientInstanceId` 和 `clientSessionId`。传入在当前 `tenantId` 下完全未知的 `clientInstanceId` 时返回 `CLIENT_INSTANCE_CONFLICT`，不得静默新建；已存在于其他企业作用域的同一安装 ID，可以在当前 `tenantId + companyId` 下建立独立实例行。
- `clientInstanceId` 仅用于安装实例识别，不是登录凭证，不能单独用于鉴权。心跳只更新已存在实例，不能创建实例。
- `userId` 只表示本次登录用户、操作归属或用户私有数据，不作为企业级任务和结果的统一过滤条件。
- 客户端每次进程重启生成新的 `openRequestId`，由服务端创建新的 `clientSessionId`；不能因 `clientInstanceId` 相同复用旧会话。
- 本版客户端运行会话不签发独立登录 token。`session/open` 之后的普通 i快招接口继续使用现有 `satoken`；请求中的 `clientSessionId/sessionEpoch` 是运行会话上下文，不是独立登录凭证。
- `sessionEpoch` 在服务端创建会话时生成，账号/公司上下文变化必须创建新会话和新 epoch。
- `session/open` 位于现有 SSO 成功之后，因此 launch ticket 的缺席不影响会话建立。

`channel-state` 是渠道上下文的唯一写入口，追加约束：

- 服务端必须以适配器声明的稳定身份规则校验 `externalUserId`，客户端提交的公司名、用户名仅作为展示候选值。
- `externalCompanyId` 必须由适配器归一化后提供；没有公司概念的渠道也要生成稳定逻辑公司 ID，不能为空。
- `adapterVersion` 和 `extSchemaVersion` 必须由桌面端适配器上报，后端按版本选择兼容解析规则。
- 同一 `clientSessionId` 重复上报相同 `channelAccountId + externalCompanyId + channelStateVersion` 视为幂等成功。
- 账号或公司变化时不更新旧会话，服务端关闭旧会话并返回 `SESSION_CONTEXT_CHANGED`，桌面端重新调用 `session/open`。
- `channelAccountId` 由服务端创建或解析，跨服务任务、快照和结果只使用该内部 ID。
- BOSS 原始 `bossUserId/bossCompanyId/bossJobId` 只允许作为适配器输入，不作为下游业务主键，也不在通用表或 `channelExt` 中重复保存；审计时只保留脱敏摘要。

### 11.4 逻辑动作与现有接口映射

本节仅列 HTTP 路径保持不变、但本期请求上下文或响应语义有变化的逻辑动作。

| 逻辑动作 | 实际接口 | 说明 |
|---|---|---|
| 开批 | `POST /search/taskChannel/{taskChannelId}/results` | `resultItems` 非空，`scoreBatchComplete=false` |
| 详情完成 | `POST /resume/task/{taskResumeId}/detail` | 保存详情、截图和详情完成状态 |
| 封批 | `POST /search/taskChannel/{taskChannelId}/results` | `resultItems=[]`，`scoreBatchComplete=true` |
| 手动立即沟通 | `POST /resume/userImmediateCommunicate` | 路径保留；请求带 `taskResumeId`，成功后写入 `communication_type=1` 并更新 `immediate_chat_flag`；日报时间使用 `condition_resume.create_time` |
| 自动筛选并打招呼 | `POST /ai-recruit/task/candidate-action-result` | `taskType=SEARCH/actionType=GREETING`；仅明确成功后写入 `communication_type=0`、更新 `immediate_chat_flag` 并增加 AI 已沟通 |
| 任务结束 | `POST /search/taskChannel/{taskChannelId}/finish` | 提交正常、停止或异常结束状态及原因 |
| SSE 建连 | `GET /sseManager/connect` | 路径保留；`satoken` 鉴权，`clientSessionId` 指定连接和消息路由目标 |

因此，`open/detail-completed/seal/finish` 是业务动作名称，不要求新增对应 HTTP 路径。

### 11.5 复用接口需要增加的上下文

现有搜索、详情、结束和 SSE 接口需要增加以下上下文：

- `companyId`
- `channelCode`
- `channelAccountId`
- `externalCompanyId`
- `clientSessionId`
- `sessionEpoch`
- `executionAttemptId`
- `taskLeaseEpoch`
- `dayPlanId`
- `headcountId`
- `channelJobSnapshotId`
- `externalJobId`
- `configVersion`
- `bindingVersion`

`configSnapshotId` 不再是任务字段或请求上下文。服务端按 `taskId` 读取 `search_task.config_snapshot_json`。自动任务的职位上下文通过 `search_task.day_plan_id + taskChannel.externalJobId` 读取 `ai_recruit_day_plan.execution_context_json`；现有手动搜索任务通过 `taskChannel.execution_snapshot_json` 读取本次职位、绑定和权益上下文。`configVersion/bindingVersion` 只用于与服务端快照校验，不能由客户端覆盖任务配置或任务职位执行快照。

SSE 连接不再按用户 ID 注册和发送消息，必须按：

```text
clientSessionId
```

`userId` 只用于鉴权、操作归属和用户私有数据，不作为 emitter key、消息路由 key 或企业级共享任务的强制过滤键。任务执行校验必须通过 `search_task.channel_account_id` 关联 `channel_account`，比较 `companyId + channelCode + channelAccountId + externalCompanyId` 与客户端会话、任务字段及对应执行上下文是否一致。自动任务读取日计划职位执行上下文，手动任务读取任务职位执行快照；任务创建人和当前执行人可以是同一企业下不同用户。服务端由客户端会话反查：

```text
companyId + channelCode + channelAccountId + externalCompanyId
```

SSE 只向当前活动客户端会话推送任务；未登录、`sessionEpoch` 不匹配或已关闭的会话不接收任务事件。相同 `clientSessionId + sessionEpoch` 重连时，新连接替换旧 emitter，并同步更新 Redis 实例映射。
