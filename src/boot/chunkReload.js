import { boot } from "quasar/wrappers";
import { isStaleChunkError, reloadForStaleChunk } from "src/util/safeDynamicImport";

/**
 * 全局兜底：网页重新部署后，旧页面懒加载老 chunk 报 404 时自动刷新拉最新版本。
 *
 * 覆盖两类来源：
 *   1. Vite 内置的 `vite:preloadError` 事件（路由/组件懒加载的预加载失败时派发）。
 *   2. 兜底监听 window 'error' / 'unhandledrejection' 里「Failed to fetch dynamically
 *      imported module」类报错（safeImport 已对关键业务 import 单独兜底，这里再加一层）。
 *
 * 刷新本身带节流（见 safeDynamicImport.reloadForStaleChunk），不会死循环。
 */
export default boot(() => {
  if (typeof window === "undefined") return;

  // Vite 预加载失败事件：阻止其默认抛错，改为自动刷新
  window.addEventListener("vite:preloadError", (event) => {
    try {
      event.preventDefault();
    } catch (e) {
      void e;
    }
    reloadForStaleChunk("vite:preloadError");
  });

  // 兜底：未被捕获的 Promise 拒绝里若是 chunk 失效，也刷新
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event?.reason)) {
      reloadForStaleChunk("unhandledrejection");
    }
  });
});
