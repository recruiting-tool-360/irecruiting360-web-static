# 旧文档总索引

最后更新：2026-11-20

本文件是 `docs/` 根目录旧专题文档的完整路由表。它只负责判断“什么任务需要读哪些原文”，不替代原文档。代码、配置、接口实现和运行结果始终优先于文档。

## 使用规则

1. 开始非微小改动前，先按模块在本文件查找候选旧文档。
2. 读取所有匹配项及其关联文档，再与当前代码、配置和接口核对。
3. AI 详细日志的“依据”必须记录实际读取的旧文档和关键结论。
4. 新增或删除 `docs/*.md` 时同步更新本索引。
5. 标记为“历史”“草案”或“待评审”的内容，不得直接当作当前实现事实。

## 按任务读取

| 任务范围                        | 建议读取顺序                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI 寻聘 V2.1                    | [需求基线](requirements/huang218/002-ai-recruit-v2.1-baseline.md) -> 五份 V2.1 原始文档 -> [实施账本](plans/huang218/001-ai-recruit-v2.1-frontend-delivery.md) |
| 任务、SSE、结果、详情、评分     | `05-api-contract.md` -> `10-frontend-task-sse-integration(1).md` -> `11-task-channel-execute-and-detail.md` -> `automation-protocol.md`                        |
| 客户端唤起、SSO、深链           | `client-launcher-flow.md` -> `ihr-integration.md` -> `electron-handover-plan.md` -> `plugin-bridge.md` -> `07-ihr-client-usage.md`                             |
| 插件与 Electron 桥接能力        | `plugin-bridge.md` -> `electron-handover-plan.md` -> `client-launcher-flow.md`                                                                                 |
| BOSS 自动化与登录态             | `automation-protocol.md` -> `12-recommend-boss-cdp-automation.md` -> `boss推荐任务完整流程.md` -> `boss标签管理.md` -> `boss地址资料.md`                       |
| BOSS 权益识别                   | `boss-job-rights-classification.md` -> `boss-privilege-api-fields.md` -> V2.1 技术方案/接口设计                                                                |
| 打包、签名、公证、发版          | `build-and-package.md` -> `client-signing-guide.md` -> `macos-release.md` 或 `windows-release.md` -> `client-auto-update.md`                                   |
| IHR 客户端 token 与 noauth 接口 | `05-api-contract.md` -> `07-ihr-client-usage.md` -> `11-task-channel-execute-and-detail.md`                                                                    |

## 完整清单

| 文档                                                                                                   | 适用模块与阅读触发                                          | 状态                          | 权威性与关系                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| [05-api-contract.md](05-api-contract.md)                                                               | IHR/SSO、任务、搜索、简历、结果字段和服务边界               | 历史契约，2026-05-11          | 字段级历史依据；外部来源路径不可用，必须与当前接口和 V2.1 文档核对           |
| [07-ihr-client-usage.md](07-ihr-client-usage.md)                                                       | IHR 客户端 token、`client/noauth` 接口、简历上传和导入      | 现行接入说明，2026-05-18 更新 | IHR 客户端接入主参考；与 V2.1 复用 `client/launch` 和 `accessToken` 链路相关 |
| [10-frontend-task-sse-integration.md](10-frontend-task-sse-integration.md)                             | 旧任务 SSE、`/sseManager/task/connect` 和任务执行顺序       | 历史版本                      | 已被同主题 `(1)` 文件部分替代；不能作为当前 SSE 路由依据                     |
| [10-frontend-task-sse-integration(1).md](<10-frontend-task-sse-integration(1).md>)                     | 通用 SSE、任务队列、创建任务、步骤指令和恢复                | 当前参考，文件命名不规范      | 同主题优先版本；涉及 SSE 时必须再与 `src/api/` 和当前接口核对                |
| [11-task-channel-execute-and-detail.md](11-task-channel-execute-and-detail.md)                         | `/execute`、`/results`、`/detail`、任务级查分和 ID 映射     | 实施计划，2026-05-20          | 任务结果链路的主要历史实施方案；以当前 API 和代码为准                        |
| [12-recommend-boss-cdp-automation.md](12-recommend-boss-cdp-automation.md)                             | 推荐牛人任务、CDP 输入、滚动、拟人交互和风控                | 草案 v1，2026-05-20           | 设计意图和风险边界参考；需核对已落地模块                                     |
| [ai-recruit-v2.1-technical-design-legacy-launch.md](ai-recruit-v2.1-technical-design-legacy-launch.md) | V2.1 业务范围、权威边界、会话、任务、同步和启动链路         | 待技术评审                    | V2.1 业务与跨模块决策主依据，入口为需求基线                                  |
| [ai-recruit-v2.1-interface-design-legacy-launch.md](ai-recruit-v2.1-interface-design-legacy-launch.md) | V2.1 HTTP、SSE、状态映射和二方接口                          | 待技术评审                    | V2.1 接口主依据；联调前需确认最终版本                                        |
| [ai-recruit-v2.1-table-design-legacy-launch.md](ai-recruit-v2.1-table-design-legacy-launch.md)         | V2.1 数据对象、字段语义、唯一键和事实边界                   | 待技术评审                    | V2.1 数据契约主依据；本仓库只提炼前端可观察字段                              |
| [ai-recruit-v2.1-backend-ddl-and-rollback.md](ai-recruit-v2.1-backend-ddl-and-rollback.md)             | 后端 DDL、历史回填、发布顺序和回滚                          | 后端执行物                    | 由后端/DBA 执行，不表示本仓库已迁移；不作为前端实现证据                      |
| [ai-recruit-v2.1-four-project-delivery-plan.md](ai-recruit-v2.1-four-project-delivery-plan.md)         | V2.1 四项目任务、工时和日程                                 | 排期估算                      | 只用于任务范围；完成状态以代码、测试和 AI 日志为准                           |
| [automation-protocol.md](automation-protocol.md)                                                       | AI Agent、H5、Electron 自动化协议、安全和脚本生命周期       | 设计中，待评审                | 自动化协议设计主参考；落地状态需核对 runner、preload 和工具目录              |
| [boss-job-rights-classification.md](boss-job-rights-classification.md)                                 | BOSS `viewRightsUrl`、职位权益来源分类                      | 专项分析                      | 权益来源识别的主要字段依据；与 V2.1 `rightsSource` 设计直接相关              |
| [boss-privilege-api-fields.md](boss-privilege-api-fields.md)                                           | BOSS 账号权益、职位权益接口字段和展示映射                   | 专项参考，2026-11-13          | 账号级与职位级权益字段依据；原始页面和接口仍可能变化                         |
| [boss 地址资料.md](boss地址资料.md)                                                                    | BOSS 页面、接口、请求和响应样本                             | 实测样本，无明确日期          | 字段与路由样本来源，不是稳定契约；必须优先核对当前页面和接口                 |
| [boss 推荐任务完整流程.md](boss推荐任务完整流程.md)                                                    | BOSS 推荐任务的产品步骤和成功判定                           | 产品流程说明                  | 用于验收路径；具体技术实现以代码和自动化设计为准                             |
| [boss 标签管理.md](boss标签管理.md)                                                                    | BOSS 隐藏 webContent、登录态监听、渠道启停和 tab 复用       | 产品行为说明                  | 用于登录态和标签生命周期核查；实现以 `TabManager` 等代码为准                 |
| [build-and-package.md](build-and-package.md)                                                           | Electron 打包、开发包、正式包和验证                         | 操作指南                      | 打包主入口；证书和平台细节继续读签名与发版文档                               |
| [client-auto-update.md](client-auto-update.md)                                                         | Electron 自动更新、策略、下载站和灰度                       | 设计稿，未落地                | 目标方案参考；不能视为自动更新已经上线                                       |
| [client-launcher-flow.md](client-launcher-flow.md)                                                     | `/client-launcher`、iframe、deep link、下载引导和客户端状态 | 设计中，部分已实现            | 当前代码与历史方案需交叉核对；V2.1 拟把启动页迁移到招聘前端                  |
| [client-signing-guide.md](client-signing-guide.md)                                                     | macOS/Windows 签名、公证、协议注册和 CI Secret              | 操作指南                      | 签名与公证总教程；平台操作继续读 macOS/Windows 发版清单                      |
| [electron-handover-plan.md](electron-handover-plan.md)                                                 | i 人事到客户端唤起、SSO 接力、插件能力迁移                  | 历史实施计划，2026-05-06      | 背景和迁移路径参考；当前实现以 Web/Electron 两侧代码为准                     |
| [ihr-integration.md](ihr-integration.md)                                                               | iframe postMessage、身份识别、SSO、UI 差异和简历双向流      | 架构梳理，历史参考            | 现有 iframe 集成的主要背景；客户端模式改动必须核对当前代码                   |
| [macos-release.md](macos-release.md)                                                                   | macOS Developer ID、公证、staple、验证和排障                | 操作清单                      | macOS 正式发版主参考                                                         |
| [plugin-bridge.md](plugin-bridge.md)                                                                   | 浏览器插件协议、Electron 双通道、能力映射和坑点             | 架构与迁移计划，2026-05-06    | 桥接设计背景；当前能力以 `pluginSrc/`、preload 和 main IPC 为准              |
| [windows-release.md](windows-release.md)                                                               | Windows OV/EV 签名、交叉打包、SmartScreen 和 CI             | 操作清单                      | Windows 正式发版主参考                                                       |

## 状态口径

- `当前参考`：优先阅读，但仍需和代码核对。
- `历史版本`：保留审计价值，当前实现优先使用替代版本或代码。
- `待技术评审`：候选方案，不得当作已批准或已实现。
- `草案`、`设计中`：用于理解目标和边界，实施前确认是否落地。
- `专项参考`、`实测样本`：字段和页面证据，不自动具备接口契约效力。
- `操作指南`、`操作清单`：按步骤执行，环境值不得写入仓库。
- `后端执行物`、`排期估算`：不是本仓库代码完成或数据库已变更的证据。

## 维护规则

- 新文档进入 `docs/` 根目录时，必须在本表登记适用模块、状态和权威性。
- 文档被替代时保留原文件，并在此登记替代关系；不自动删除。
- 本索引中的路径必须存在；新增或移动旧文档后执行链接检查。
