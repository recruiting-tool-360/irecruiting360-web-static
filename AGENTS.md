# irecruiting360-web-static

## 项目定位

本仓库是“i 快招”的前端与桌面客户端工程，包含两个可独立构建的运行面：

- 根目录：Quasar 2 + Vue 3 + Vuex 4 + Vue Router 4 的 Web SPA，使用 Vite、Axios 和 SSE。
- `electron/`：Electron 38 + React 19 + TypeScript 的桌面壳层，使用 electron-vite 构建；业务页面仍由远端 Web SPA 或招聘站点页面承载。

`src/` 是 JavaScript/Vue 业务主体，`electron/src/` 是 TypeScript 桌面主体。不要假设两者共享依赖、构建命令或状态生命周期。

## 模块职责与依赖

| 路径                                            | 职责                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `src/pages/`、`src/layouts/`、`src/components/` | 页面、布局和可复用 UI；通过 store、API 和工具层访问业务能力。      |
| `src/router/`                                   | 路由与页面入口。                                                   |
| `src/store/`                                    | Vuex 状态、任务编排和跨组件流程；只持久化明确列出的字段。          |
| `src/api/`                                      | HTTP、SSE 和登录请求边界；不得反向依赖页面组件。                   |
| `src/pluginSrc/`                                | 渠道管理、插件适配、任务桥接和搜索执行。                           |
| `src/util/automation/`、`src/playwright/`       | 招聘站点自动化、页面探测和任务执行辅助。                           |
| `src/boot/`                                     | Quasar 启动期初始化。                                              |
| `electron/src/main/`                            | Electron 主进程、窗口与标签、IPC、网络、更新、深链和自动化执行器。 |
| `electron/src/preload/`                         | 对渲染端暴露的最小 typed bridge，连接主进程 IPC。                  |
| `electron/src/renderer/`                        | Electron 壳层 UI；不得直接使用 Node.js 能力。                      |

依赖方向从 UI 指向 store、API 和纯工具模块；API、store 和工具模块不得导入页面或布局。Electron 渲染端只能通过 preload 暴露的接口访问主进程能力，主进程能力不得直接泄漏到 Web SPA。改动跨 `src/` 与 `electron/` 的桥接、深链或任务协议时，同时核对两侧实现和既有专题文档。

## 编码与配置

- 文档和业务说明使用简体中文；代码沿用所在目录现有的 JavaScript、Vue、TypeScript、ESLint 和 Prettier 风格。
- 不做与任务无关的全仓格式化、依赖升级或文件搬迁。
- 环境变量由 Quasar 或 electron-vite 在构建期注入。不得提交 Token、密钥、证书密码、真实候选人信息或新的生产地址；日志和文档不得回显敏感配置值。
- 修改 Electron 安全边界时必须保留 `contextIsolation`、最小 preload 暴露面、站点 partition 隔离和现有风控约束。除内部调试外，不得为招聘站点启用远程调试。
- 渠道、自动化或登录态改动必须明确处理未登录、风控、超时、取消和清理路径。

## 文档体系

开始任何非微小改动前，读取：

1. 本文件、[文档体系](docs/README.md)与[旧文档总索引](docs/legacy-docs.md)。
2. `docs/architecture/`、`docs/adr/`、`docs/roadmap/` 下所有维护者文档。
3. 与任务相关的 `docs/requirements/`、`docs/plans/`、`docs/changelog/` 和 `docs/ai-log/`。
4. 按旧文档总索引读取与任务模块匹配的接口、客户端、插件、自动化或发版专题原文。

只写自己的维护者目录；读取类别时合并所有维护者。现有 `docs/*.md` 专题文档保留原位，除非任务明确要求迁移并有引用影响分析。

## 改动流程

1. 改动前确认目标模块、接口契约、状态归属和验证方式。复杂、跨模块、公共接口、数据契约或发版流程改动，先在 `docs/requirements/<owner>/` 写背景、目标、范围、非目标、验收和实现方案。
2. 改动中保持模块边界，优先复用现有 API、store、适配器和任务协议。不得凭文档推定后端字段或已实现状态，以代码和接口契约为准。
3. 完成后更新需求状态、`CHANGELOG.md`、`roadmap.md`、详细 AI 日志和摘要索引；架构、决策或数据契约变化时分别更新 `architecture.md`、`adr.md`、`data-model.md`。接口、配置或启动方式变化时同步根 `README.md`。
4. 没有运行证据不得宣称构建、接口联调、自动化、签名、更新或部署成功。

## 验证

根目录 Web：

```bash
npm run lint
node --test src/util/*.test.js
npm run build
```

`npm run test` 当前仍是占位脚本，不能作为测试通过的证据。涉及页面或交互时，还应启动 `npm run dev` 验证相关路由；涉及接口或 SSE 时，明确验证环境和未覆盖的外部依赖。

Electron：

```bash
cd electron
npm run typecheck
npm run lint
npm run build
```

发版、签名、公证和自动更新验证按 `docs/build-and-package.md`、`docs/client-signing-guide.md`、`docs/macos-release.md`、`docs/windows-release.md` 执行。本地构建不等于签名、公证、安装器、真实更新源或生产渠道验证成功。

## 可选工作流

只有用户明确要求时才接入或启动 SuperSpec；普通开发不得自动创建 change、推进阶段或修改受管理工作流。
