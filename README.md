# irecruiting360-web-static

i 快招智能招聘助手的前端与桌面客户端工程。Web SPA 负责招聘搜索、AI 对话与画像、简历任务、反馈结果和客户端唤起；Electron 客户端负责桌面壳层、招聘站点标签、登录态桥接、自动化和客户端更新。

## 技术栈

- Web：Quasar 2、Vue 3、Vuex 4、Vue Router 4、Axios、SSE、Vite、Tailwind CSS。
- Desktop：Electron 38、React 19、TypeScript、electron-vite、electron-builder、playwright-core。

详细模块边界见 [架构说明](docs/architecture/huang218/architecture.md)。

## 启动

建议使用 Node.js 20、npm 或 Yarn Classic 1.22。

Web 开发：

```bash
npm install
npm run dev
```

默认开发服务器端口为 `8080`，环境变量和 API 代理配置见 `quasar.config.js` 与本地 `.env.*` 文件。

Electron 开发：

```bash
cd electron
npm install
npm run dev
```

若需要让 Electron 壳层加载本地 Web SPA：

```bash
DEV_TARGET_URL=http://localhost:8080/ npm run dev
```

## 验证

Web：

```bash
npm run lint
node --test src/util/*.test.js
npm run build
```

Electron：

```bash
cd electron
npm run typecheck
npm run lint
npm run build
```

`npm run test` 当前仍是占位脚本，不代表已有测试通过。页面、接口、SSE、招聘站点自动化、安装器、签名、公证和自动更新还需要各自对应的运行环境验证。

## 文档

- 协作规则：[AGENTS.md](AGENTS.md)
- 文档目录与冲突规则：[docs/README.md](docs/README.md)
- 旧专题文档索引与阅读路由：[docs/legacy-docs.md](docs/legacy-docs.md)
- 客户端与 i 人事融合：[docs/ihr-integration.md](docs/ihr-integration.md)
- 客户端唤起流程：[docs/client-launcher-flow.md](docs/client-launcher-flow.md)
- 插件与 Electron 桥接：[docs/plugin-bridge.md](docs/plugin-bridge.md)
- 招聘站自动化协议：[docs/automation-protocol.md](docs/automation-protocol.md)
- 构建、签名与发版：[docs/build-and-package.md](docs/build-and-package.md)
