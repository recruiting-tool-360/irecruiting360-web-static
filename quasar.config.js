/* eslint-env node */

/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 */

// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-js

// 加载环境变量
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });

const { configure } = require('quasar/wrappers');
const path = require('path');

module.exports = configure(function (/* ctx */) {
  // 在控制台打印环境变量，便于调试
  // console.log('Environment:', process.env.NODE_ENV);
  // console.log('API Base URL:', process.env.VUE_APP_API_BASE_URL);

  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: [
      'i18n',
      'axios',
      'intersection-observer',
      'iframe-messenger',
      'SvgBase64Manager'
    ],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#css
    css: [
      'app.scss',
      // Tailwind 3.x 入口（preflight 已关闭，不会覆盖 Quasar 基础样式）
      // 主要为渲染后端 SSE 推送的富文本卡片（HTML 里含大量 Tailwind 类名）服务
      'tailwind.css'
    ],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#build
    build: {
      target: {
        browser: [ 'es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1' ],
        node: 'node20'
      },

      vueRouterMode: 'history', // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // publicPath: '/',
      // analyze: true,
      env: {
        VUE_APP_API_BASE_URL: process.env.VUE_APP_API_BASE_URL,
        VUE_APP_WECHAT_CALL_URL: process.env.VUE_APP_WECHAT_CALL_URL,
        VUE_APP_WECHAT_APP_ID: process.env.VUE_APP_WECHAT_APP_ID,
      },
      // rawDefine: {}
      // ignorePublicFolder: true,

      // 代码压缩，移除注释 空白符等
      minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
      // polyfillModulePreload: true,
      // distDir

      extendViteConf (viteConf) {
        // 在生产环境下移除console语句
        if (process.env.NODE_ENV === 'production') {
          viteConf.build = viteConf.build || {};
          viteConf.build.terserOptions = {
            compress: {
              drop_console: true, // 移除所有的 console.log 语句
              drop_debugger: true, // 移除所有的 debugger 语句
              pure_funcs: ['console.info', 'console.debug', 'console.warn'] // 移除指定的函数调用
            }
          };
        }
      },
      // viteVuePluginOptions: {},

      vitePlugins: [
        ['@intlify/vite-plugin-vue-i18n', {
          // if you want to use Vue I18n Legacy API, you need to set `compositionOnly: false`
          // compositionOnly: false,

          // if you want to use named tokens in your Vue I18n messages, such as 'Hello {name}',
          // you need to set `runtimeOnly: false`
          // runtimeOnly: false,

          // you need to set i18n resource including paths !
          include: path.resolve(__dirname, './src/i18n/**')
        }],
        ['vite-plugin-checker', {
          eslint: {
            lintCommand: 'eslint "./**/*.{js,mjs,cjs,vue}"'
          }
        }, { server: false }]
      ]
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#devServer
    devServer: {
      // https: true
      port: 8080,
      open: true,
      proxy: {
        /**
         * 反向代理 /web-manage-api/* → ihire-solution 测试服。
         *
         * 为什么：.env.development 的 VUE_APP_API_BASE_URL 改成相对路径 `/web-manage-api`,
         *        让 axios / EventSource 都打到 dev server（localhost:8080），由 proxy
         *        转发到真实测试服域名（test.ihire365.com），绕开浏览器 CORS。
         *        切环境（test / qa / sit / prod）改 .env 的 VUE_APP_DEV_API_TARGET 即可。
         *
         * 关键配置：
         *   - changeOrigin: true   重写 Host header，避免后端按 Origin 校验
         *   - secure: false        测试服 HTTPS 证书可能是自签，跳过校验
         *   - ws: true             SSE 长连接也走这条 proxy（虽然 SSE 不是 WebSocket，但
         *                          http-proxy-middleware 的 ws 选项会启用 upgrade 处理 +
         *                          keep-alive，对 EventSource 流式响应也友好）
         *   - proxyTimeout / timeout: 0   长连接不超时（SSE 可能挂很久）
         */
        '/web-manage-api': {
          target: process.env.VUE_APP_DEV_API_TARGET || 'https://test.ihire365.com',
          changeOrigin: true,
          secure: false,
          ws: true,
          proxyTimeout: 0,
          timeout: 0,
        },
        // 历史 /api 代理（旧代码可能还有路径用 /api，保留向后兼容）
        '/api': {
          target: process.env.VUE_APP_DEV_API_TARGET || process.env.VUE_APP_API_BASE_URL || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        }
      }
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#framework
    framework: {
      config: {},

      iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: [
        'Notify',
        'Dialog',
        'Loading'
      ]
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#property-sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   registerServiceWorker: 'src-pwa/register-service-worker',
    //   serviceWorker: 'src-pwa/custom-service-worker',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      // ssrPwaHtmlFilename: 'offline.html', // do NOT use index.html as name!
                                          // will mess up SSR

      // extendSSRWebserverConf (esbuildConf) {},
      // extendPackageJson (json) {},

      pwa: false,

      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      prodPort: 3000, // The default port that the production server should use
                      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        'render' // keep this as last one
      ]
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'generateSW', // or 'injectManifest'
      injectPwaMetaTags: true,
      swFilename: 'sw.js',
      manifestFilename: 'manifest.json',
      useCredentialsForManifestTag: false,
      // useFilenameHashes: true,
      // extendGenerateSWOptions (cfg) {}
      // extendInjectManifestOptions (cfg) {},
      // extendManifestJson (json) {}
      // extendPWACustomSWConf (esbuildConf) {}
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (esbuildConf)
      // extendElectronPreloadConf (esbuildConf)

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: 'packager', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options

        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',

        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        // https://www.electron.build/configuration/configuration

        appId: 'irecruiting360'
      }
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      contentScripts: [
        'my-content-script'
      ],

      // extendBexScriptsConf (esbuildConf) {}
      // extendBexManifestJson (json) {}
    }
  }
});
