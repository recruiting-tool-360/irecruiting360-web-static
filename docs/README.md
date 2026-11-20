# 文档体系

本目录同时承载既有专题设计和按维护者拆分的 AI 协作文档。既有 `docs/*.md` 是当前业务流程、接口、客户端和自动化的重要来源，继续原位保留；新增需求、架构、决策、路线图和 AI 日志按“类别 / 维护者”写入。

## 目录契约

| 路径                                    | 用途                                    |
| --------------------------------------- | --------------------------------------- |
| `architecture/<owner>/architecture.md`  | 模块、依赖、运行时机制和已知边界        |
| `adr/<owner>/adr.md`                    | 全仓库唯一的架构决策记录                |
| `roadmap/<owner>/roadmap.md`            | 已完成、进行中、后续计划和待确认项      |
| `changelog/<owner>/CHANGELOG.md`        | 新增、变更、修复和移除                  |
| `data-model/<owner>/data-model.md`      | 前端状态、接口对象、ID 语义和持久化边界 |
| `ai-log/<owner>/ai-log.md`              | AI 任务摘要索引                         |
| `ai_log/<owner>/YYYY-MM-DD-NNN-slug.md` | AI 详细执行日志                         |
| `requirements/<owner>/NNN-slug.md`      | 需求背景、范围、验收和实施结果          |
| `plans/<owner>/`                        | 复杂需求的设计与实施计划                |

`ai-log` 是摘要，`ai_log` 是详细日志，两者命名不同是有意保留的契约，不创建第三种别名。

## 当前迭代

| 入口                                                                                            | 用途                                              | 状态       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- |
| [002 AI 寻聘 V2.1 迭代需求基线](requirements/huang218/002-ai-recruit-v2.1-baseline.md)          | 五份需求文档的权威关系、范围、评审门槛和待确认项  | 评审中     |
| [001 AI 寻聘 V2.1 前端/桌面端实施账本](plans/huang218/001-ai-recruit-v2.1-frontend-delivery.md) | `IHF-01` 至 `IHF-29` 的状态、实施域和验证证据入口 | 未开始实施 |

V2.1 原始需求包固定在提交 `6c8edf2`，必须通过基线入口读取。原始五份文档继续原位保留，不复制完整正文。

## 旧文档入口

`docs/` 根目录的 26 份旧专题文档统一登记在 [旧文档总索引](legacy-docs.md)。开始非微小改动前，先按任务模块在索引中定位候选文档，再读取原文并与当前代码、配置和接口核对。索引同时标注历史版本、草案、待评审、实测样本和执行物的权威边界。

## 现有专题文档

下表只用于高频主题快查；未覆盖的任务范围以[旧文档总索引](legacy-docs.md)为准。

| 主题                   | 入口                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接口与任务契约         | `05-api-contract.md`、`10-frontend-task-sse-integration(1).md`、`11-task-channel-execute-and-detail.md`                                                                                                                                                   |
| i 人事集成与客户端唤起 | `ihr-integration.md`、`client-launcher-flow.md`                                                                                                                                                                                                           |
| 插件与 Electron 桥接   | `plugin-bridge.md`、`electron-handover-plan.md`                                                                                                                                                                                                           |
| 招聘站点自动化         | `automation-protocol.md`、`12-recommend-boss-cdp-automation.md`                                                                                                                                                                                           |
| 构建、签名、更新与发版 | `build-and-package.md`、`client-signing-guide.md`、`client-auto-update.md`、`macos-release.md`、`windows-release.md`                                                                                                                                      |
| AI 寻聘 V2.1           | `ai-recruit-v2.1-technical-design-legacy-launch.md`、`ai-recruit-v2.1-interface-design-legacy-launch.md`、`ai-recruit-v2.1-table-design-legacy-launch.md`、`ai-recruit-v2.1-backend-ddl-and-rollback.md`、`ai-recruit-v2.1-four-project-delivery-plan.md` |

标题中含有“设计”“计划”或“待补”的专题不自动等于代码已完成。使用前核对当前代码、接口实现和最近提交。

## 维护者与读取规则

- 维护者目录使用团队英文用户名，不使用邮箱、中文名或全名。
- 只写自己的维护者目录；读取任一类别时遍历所有维护者目录，不只读取自己的文件。
- 修改既有共享 `docs/README.md` 或 `docs/ai_log/README.md` 前先核对团队约定。
- 现有专题文档不做自动搬迁或删除。需要迁移时先列出引用影响和兼容方式。

## 事实与冲突

冲突优先级：

1. 当前代码、配置、接口实现和运行结果。
2. 与当前代码一致的接口契约、数据模型和专题文档。
3. 带“最后更新”且日期最新的维护者文档。
4. 日期相同或缺失时，按对应 Git 提交时间最新者。

仍无法裁决时，在自己的需求或 ADR 中登记分歧、证据和待确认结论，不擅自改写其他维护者事实。

`architecture.md`、`adr.md`、`roadmap.md`、`data-model.md` 开头写 `最后更新：YYYY-MM-DD`；缺少日期视为未核对。需求按维护者从 `001` 递增，ADR 编号全仓库唯一，详细日志按维护者和当天从 `001` 递增，禁止覆盖。
