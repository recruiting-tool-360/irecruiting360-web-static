# irecruiting360-web-static：数据模型

最后更新：2026-11-20

## 核对来源

- Vuex 模块：`src/store/index.js`、`src/store/modules/`。
- API 与 SSE：`src/api/`、`docs/05-api-contract.md`、`docs/10-frontend-task-sse-integration.md`、`docs/11-task-channel-execute-and-detail.md`。
- Electron 会话与桥接：`electron/src/main/recruitBridge.ts`、`electron/src/main/ihrBridge.ts`、`electron/src/preload/index.ts`。
- 客户端启动参数：`src/pages/login/ClientLauncher.vue`、`electron/src/main/util/deepLinkCodec.ts`。
- V2.1 候选契约：`docs/ai-recruit-v2.1-technical-design-legacy-launch.md`、`docs/ai-recruit-v2.1-interface-design-legacy-launch.md`、`docs/ai-recruit-v2.1-table-design-legacy-launch.md`。

本仓库没有前端数据库、Entity、Mapper 或数据库迁移。以下描述仅覆盖已核对的本地状态和接口边界，不代表后端表结构。

## 对象与标识

| 对象            | 标识与用途                                                              | 权威来源                                        |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| 用户与会话      | 用户信息、登录配置、当前聊天和职位选择由 Vuex 与后端接口维护。          | `UserConfig.js`、`ChatConfig.js`、`chatList.js` |
| 搜索任务        | `taskId`、`taskChannelId` 和渠道任务状态驱动搜索、SSE、结果查看和恢复。 | `SearchTasks.js`、任务 API/SSE                  |
| 渠道配置        | 渠道启用状态、职位条件和采集配置按渠道 key 管理。                       | `ChannelConfig.js`、`src/pluginSrc/`            |
| BOSS 职位与推荐 | 职位列表、推荐牛人按 `encryptJobId` 和任务上下文分桶。                  | `BossData.js`、`BossRecommendData.js`           |
| 查看历史结果    | 查看历史任务时按 `taskId` 隔离，避免污染当前运行任务状态。              | `ViewingResults.js`                             |
| 客户端启动参数  | 深链和 iframe 启动数据包含 action/intent、登录上下文和业务载荷。        | `ClientLauncher.vue`、deep link codec           |

字段名、必填性、后端唯一性和状态枚举以实现及对应接口文档为准。前端不得自行补齐不确定字段或把设计稿字段当作后端事实。

## V2.1 候选接口与状态契约

本节来自待评审的 V2.1 技术方案、接口设计和表设计，只用于前端影响分析，不代表当前代码已实现：

| 对象或字段                                    | 候选语义                                      | 当前状态       |
| --------------------------------------------- | --------------------------------------------- | -------------- |
| `clientInstanceId`                            | 客户端安装实例 ID，由服务端签发并在本地持久化 | 待评审、待实现 |
| `clientSessionId`                             | 一次客户端运行会话；SSE 和任务租约按此隔离    | 待评审、待实现 |
| `sessionEpoch`                                | 会话隔离和旧连接拒绝版本                      | 待评审、待实现 |
| `channelAccountId`                            | 渠道账号内部稳定 ID                           | 待评审、待实现 |
| `externalCompanyId`、`externalJobId`          | 渠道公司和职位原始标识                        | 待评审、待实现 |
| `taskKind`、`taskScopeKey`                    | 搜索/回复任务类型和任务幂等范围               | 待评审、待实现 |
| `requestId`                                   | 手动搜索请求幂等标识                          | 待评审、待实现 |
| `configSnapshotJson`、`executionSnapshotJson` | 任务配置或职位执行上下文快照                  | 待评审、待实现 |
| `scoreBatchNo`                                | 搜索、详情和评分批次标识                      | 待评审、待实现 |

V2.1 设计中的权威边界为：招聘侧负责寻聘配置、职位关联和职位画像；i 快招负责客户端会话、任务编排、执行状态和结果事实。该边界在评审通过并进入实现前，不能被当作现有接口事实。

## 本地持久化

Vuex 使用 `localStorage` 键 `vuex` 持久化白名单字段，包括用户基础配置、当前职位选择、职位 JD 缓存、部分 AI 交互偏好、相似简历冷却、BOSS 职位/推荐缓存和置顶职位。

`SearchTasks` 明确不持久化。任务状态在启动和运行期间从后端队列、当前任务接口和轮询/SSE 恢复，避免本地残留 `WAITING` 或 `RUNNING` 状态造成假进度。

Electron 招聘站点 cookie、header 和登录态由独立站点 partition/session 管理，不写入 Vuex 持久化白名单。不得把 cookie、Token 或页面抓取凭据写入日志和文档。

## 状态与接口约束

- 任务创建、执行、结果回传和评分由后端协议驱动；前端 store 只做展示和流程编排。
- SSE 断线、重连、重复消息和任务恢复必须保持幂等，具体契约以现有 API 文档和代码为准。
- Electron preload 暴露的对象是对主进程能力的窄接口；新增字段需同时更新 preload 类型、主进程 handler 和调用方。
- 深链载荷不得记录到持久化日志，客户端应校验 action、数据新鲜度和用户上下文。

## 未覆盖

- 后端数据库表、索引、外键和迁移顺序不在本仓库。
- 现有 V2.1 DDL 文档描述的是跨项目后端方案，不能视为本仓库已执行迁移。
