/**
 * 安全的动态 import 封装 —— 解决「网页重新部署后，已打开的旧页面再 import() 老 chunk
 * 报 404 / Failed to fetch dynamically imported module」的问题。
 *
 * 背景：
 *   Vite 打包的 chunk 文件名带 hash（如 bossSelectJob.7f0411be.js）。重新部署后 hash 变了、
 *   老文件会被删除。此时**已经加载在内存里的旧版 index.js** 里写死的还是老 hash，
 *   懒加载（await import(...)）时去请求老文件 → 404 → 抛
 *   "Failed to fetch dynamically imported module"。
 *
 *   在本项目里这条异常会一路冒泡到 runRealAggregateSearch → runTask，把正在跑的任务
 *   直接 finish 成 FAILED(EXECUTOR_FAILED)，体验很差（用户其实只要刷新拿最新版本就好）。
 *
 * 处理策略：
 *   1. 失败先重试若干次（部署切换的瞬间偶发，重试常能成功）。
 *   2. 多次仍失败且确认是「旧 chunk 失效」类错误 → 触发一次**全局自动刷新**拉取最新版本
 *      （带节流，避免万一真缺文件时陷入刷新死循环）。
 */

const RELOAD_THROTTLE_KEY = "__stale_chunk_reload_ts__";
const RELOAD_THROTTLE_MS = 10 * 60 * 1000; // 10 分钟内最多自动刷新一次

/**
 * 判断是否为「动态 import 的 chunk 失效」类错误（区别于业务异常，避免误刷新）。
 */
export function isStaleChunkError(err) {
  const msg = String((err && (err.message || err.toString())) || "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    // 部分服务器对缺失静态资源返回 SPA fallback(index.html)，浏览器按 MIME 报这个
    /Expected a JavaScript(?:-or-Wasm)? module script but the server responded with a MIME type/i.test(
      msg
    )
  );
}

/**
 * 触发一次「拉取最新版本」的整页刷新（带节流，防死循环）。
 * @returns {boolean} 是否真的触发了刷新
 */
export function reloadForStaleChunk(reason = "") {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_THROTTLE_KEY) || 0);
    const now = Date.now();
    if (now - last < RELOAD_THROTTLE_MS) {
      console.warn("[safeImport] 已在节流窗口内刷新过，跳过自动刷新，避免死循环");
      return false;
    }
    sessionStorage.setItem(RELOAD_THROTTLE_KEY, String(now));
  } catch (e) {
    // sessionStorage 不可用（隐私模式等）→ 仍然尝试刷新一次
    void e;
  }
  console.warn(`[safeImport] 检测到旧版本资源失效，自动刷新加载最新版本${reason ? `（${reason}）` : ""}`);
  // 用 location.reload() 让浏览器/Electron tab 重新拉取最新 index.html + chunk
  try {
    window.location.reload();
  } catch (e) {
    void e;
  }
  return true;
}

/**
 * 带重试 + 失效自动刷新的动态 import。
 *
 * 用法（务必把字面量 import() 放进工厂函数里，保证 Vite 仍能做代码分割）：
 *   const mod = await safeImport(() => import("src/util/automation/bossSelectJob"));
 *
 * @param {() => Promise<any>} factory  返回 import() 的工厂函数
 * @param {{ retries?: number, retryDelayMs?: number, autoReload?: boolean }} [opts]
 */
export async function safeImport(factory, opts = {}) {
  const { retries = 2, retryDelayMs = 350, autoReload = true } = opts;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await factory();
    } catch (err) {
      lastErr = err;
      // 非 chunk 失效类错误（如模块内部抛错）→ 不重试、不刷新，直接抛给业务
      if (!isStaleChunkError(err)) throw err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  // 重试若干次仍失败 → 老 chunk 已被新部署删除，自动刷新拉最新版本
  if (autoReload) reloadForStaleChunk("dynamic import 多次失败");
  throw lastErr;
}
