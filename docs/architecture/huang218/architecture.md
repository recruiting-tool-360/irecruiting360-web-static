# irecruiting360-web-static：架构说明

最后更新：2026-11-20

## 项目定位

仓库由两个运行面组成：

- Web SPA：Quasar 2 + Vue 3，面向浏览器、i 人事 iframe 嵌入和 Electron WebContentsView 加载。
- Electron 客户端：React/TypeScript 壳层，负责桌面窗口、标签、招聘站点会话、自动化执行、深链、更新和安装包。

业务数据由后端接口和 SSE 提供，本仓库没有前端数据库或 ORM。Electron 站点会话由独立 partition 管理，渲染端通过 preload 调用主进程能力。

## 运行时结构

| 层级             | 关键入口                                   | 职责                                                                            |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Web 启动         | `src/App.vue`、`src/boot/`                 | 初始化 i18n、Axios、iframe messenger、SVG 缓存和 chunk reload。                 |
| Web 路由         | `src/router/routes.js`                     | 登录、SSO、客户端唤起、主页和 404 路由。                                        |
| Web 页面         | `src/pages/`、`src/layouts/`               | 搜索、聊天、任务、结果、设置和登录流程。                                        |
| 状态与流程       | `src/store/modules/`                       | 用户、渠道、会话、搜索任务、结果查看和推荐数据。                                |
| 通信             | `src/api/`、`src/boot/iframe-messenger.js` | HTTP、SSE、登录请求和 i 人事 postMessage。                                      |
| 渠道与桥接       | `src/pluginSrc/`                           | 插件适配、Electron bridge、渠道管理、任务队列和简历处理。                       |
| 自动化           | `src/util/automation/`、`src/playwright/`  | 新自动化协议与历史 Playwright 场景代码。                                        |
| Electron 主进程  | `electron/src/main/`                       | BrowserWindow、WebContentsView、TabManager、站点会话、深链、IPC、更新与执行器。 |
| Electron preload | `electron/src/preload/`                    | 对壳层和远端 SPA 暴露最小能力。                                                 |
| Electron 壳层    | `electron/src/renderer/`                   | 自绘标题栏和标签栏；业务内容由 WebContentsView 叠加显示。                       |

## 启动与通信链路

1. Web 开发服务器默认监听 `8080`，`quasar.config.js` 将 `/web-manage-api` 和兼容的 `/api` 代理到配置的 API 目标。
2. 浏览器模式通过 iframe postMessage、登录接口和插件/Electron 适配器通信。
3. Electron 主进程先加载壳层 renderer，再通过 TabManager 将主页 SPA 和招聘站点放入 WebContentsView 标签。
4. Electron 打包版本根据自身发布渠道选择 Web SPA 地址；本地开发可用 `DEV_TARGET_URL` 覆盖并加载本地 SPA。
5. `ikuaizhao://` 深链由主进程解析，完成启动参数传递、SSO 和业务 intent 分发。
6. 主进程通过 IPC 和 preload bridge 暴露招聘站点请求、cookie/header、标签、自动化、更新和恢复能力。

## 依赖方向

```text
pages/layouts/components
  -> store
  -> api
  -> util/pluginSrc

electron renderer
  -> preload typed bridge
  -> Electron main IPC
  -> WebContentsView / site sessions / OS capabilities
```

禁止方向：

- `src/api/`、`src/store/` 和纯工具模块不得导入页面或布局。
- Electron renderer 不得直接使用 Node.js 或 Electron main 模块。
- Web SPA 不得假定 Electron bridge 一定存在；客户端能力必须有浏览器或插件降级路径。
- 主进程能力不得无筛选地暴露给远端页面，IPC 参数和 URL 必须保持现有校验边界。

## 扩展点

- 新增招聘渠道：同时核对 `src/pages/search/channel/`、`src/pluginSrc/channels/`、`src/store/modules/ChannelConfig.js`、任务协议和对应 Electron bridge。
- 新增搜索/推荐任务：核对 `src/store/modules/SearchTasks.js`、`src/api/`、`src/pluginSrc/util/taskResumeBridge.js` 和 `docs/05-api-contract.md`。
- 新增站点自动化：优先沿用 `src/util/automation/toolCatalog.js`、runner 和 Electron preload 的受控协议；不要绕过取消、超时、登录态和风控处理。
- 修改客户端唤起：同时核对 `src/pages/login/ClientLauncher.vue`、`src/util/clientBridge.js`、`electron/src/main/util/deepLinkCodec.ts` 和 `docs/client-launcher-flow.md`。
- 修改发版：核对 `electron/electron-builder*.yml`、发布脚本和环境变量文档，不在仓库记录证书或密码。

## 已知边界

- 根 `package.json` 的 `test` 当前是占位命令；现有纯函数测试位于 `src/util/*.test.js`，使用 `node --test` 执行。
- Web 主体是 JavaScript/Vue，Electron 主体是 TypeScript/React，不能把一侧的类型约束直接视为另一侧的保证。
- 现有 `docs/*.md` 中有历史方案和“待补”描述，必须与当前代码、配置和接口实现交叉核对。
- 招聘站点自动化受外部页面结构、登录态和风控影响；本地单测不能替代真实站点长跑验证。
