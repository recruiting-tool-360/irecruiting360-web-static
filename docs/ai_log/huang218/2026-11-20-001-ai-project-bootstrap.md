# 2026-11-20 AI 编码日志：AI 项目初始化

## 任务

为 `irecruiting360-web-static` 建立 AI 协作规范和维护者文档体系，并根据 Quasar/Vue + Electron 技术栈补齐项目事实。

## 依据

- 根 `package.json`、`quasar.config.js` 和 `electron/package.json`：确认 Web 与 Electron 是两套独立构建。
- `src/router/routes.js`、`src/store/index.js`、`src/api/`、`src/pluginSrc/`、`src/util/automation/`：确认 SPA 路由、状态、接口、渠道和自动化边界。
- `electron/src/main/index.ts`、`electron/electron.vite.config.ts`、`electron/src/preload/index.ts`：确认主进程、preload、壳层和 WebContentsView 分工。
- `docs/` 根目录专题文档：确认接口、客户端、插件、自动化和发版文档需原位保留。
- `git status --short --branch`：初始化前工作区干净，分支为 `feat-s34326-dev...origin/feat-s34326-dev`。
- `git config user.name`：得到维护者候选 `huang218`。

## 改动

- 新增根 `AGENTS.md`，写明语言、模块职责、依赖方向、配置安全、文档读取、改动流程和验证命令。
- 更新根 `README.md`，补充技术栈、Web/Electron 启动方式、实际验证命令和文档入口。
- 新增 `docs/README.md`，定义维护者目录、现有专题文档入口、冲突优先级和编号规则。
- 新增 `docs/ai_log/README.md`，定义详细日志格式和敏感信息边界。
- 新增 `docs/architecture/huang218/architecture.md`，记录运行时结构、通信链路、扩展点和已知边界。
- 新增 `docs/adr/huang218/adr.md`，记录“仅初始化治理”和“保留现有专题文档”两项决策。
- 新增路线图、数据模型、变更日志、需求和本日志。

## 验证

- 文档初始化脚本默认预览成功；`--write` 仅创建缺失文件，`README.md` 被跳过。
- `node --test src/util/*.test.js`：12 个测试全部通过，存在 Node 模块类型自动识别的告警。
- `npm run lint`：通过。
- `npm run build`：通过；存在既有 CSS 注释、CSS nesting、chunk 体积和 Browserslist 数据过期告警。
- Electron `npm run typecheck`：通过。
- Electron `npm run build`：通过。
- Electron `npm run lint`：失败，共 34 个错误、44 个警告，集中在既有脚本和主进程的未使用参数、`require` 导入、显式返回类型与格式规则；本次未改动 Electron 源码。
- `git diff --check`：通过。
- 对本次修改和新增加 Markdown 文件执行相对链接检查：通过。
- `npx prettier --check`：新增和维护者文档全部通过格式检查。

## 遗留

- 维护者团队用户名需团队确认。
- Electron lint 的既有错误需单独修复，不能把本次类型检查和构建通过等同于 Electron lint 通过。
- 未执行真实接口、SSE、招聘站点自动化、Electron 安装包、签名、公证和自动更新验证。
- 根 `npm run test` 仍为占位脚本，后续应替换为真实聚合测试命令。
