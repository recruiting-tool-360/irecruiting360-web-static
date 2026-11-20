# 001 AI 项目初始化

最后更新：2026-11-20

状态：已完成

## 背景

仓库已有大量接口、客户端、插件、自动化和发版文档，但缺少统一的 AI 协作入口、维护者文档目录、可审计日志和项目级验证基线。

## 目标

- 建立 AI 读取和写入本仓库的明确规则。
- 建立架构、ADR、路线图、数据模型、变更、需求和 AI 日志目录。
- 根据当前技术栈记录模块职责、依赖方向、安全边界和验证命令。
- 保留现有专题文档，不破坏历史链接。

## 范围

- 根 `AGENTS.md` 和 `README.md`。
- `docs/README.md`、`docs/ai_log/README.md`。
- `docs/architecture/huang218/architecture.md`。
- `docs/adr/huang218/adr.md`。
- `docs/roadmap/huang218/roadmap.md`。
- `docs/data-model/huang218/data-model.md`。
- `docs/changelog/huang218/CHANGELOG.md`。
- 本需求、详细日志和摘要索引。

## 非目标

- 不新增 Java/iHR360 AI 服务模块。
- 不引入模型 SDK、Prompt 存储、数据库或异步生成任务框架。
- 不安装或激活 SuperSpec。
- 不移动、删除或批量重写现有 `docs/*.md` 专题文档。
- 不提交、推送、发消息或发布服务。

## 验收

- AI 入口能指明项目栈、模块边界、依赖方向、安全约束和实际验证命令。
- 新文档目录与现有专题文档关系清晰。
- 事实性内容可通过代码、配置或命令核对。
- 现有文件不被脚本覆盖。
- 文档链接、日期、编号和 Markdown 结构有效。
- Web 纯函数测试、lint 和构建验证结果被如实记录。

## 实现

已完成文档初始化。项目属于 Web/Electron 前端工程，因此使用通用协作治理，不创建业务 AI 后端骨架。维护者目录暂按 Git 身份候选 `huang218` 建入，团队用户名如有变化需按目录契约另行调整。

## 遗留

- 团队其他维护者身份待确认。
- 根 `npm run test` 仍为占位脚本。
- 真实接口、SSE、招聘站点自动化、Electron 安装包、签名、公证和自动更新未在本次初始化中验证。
