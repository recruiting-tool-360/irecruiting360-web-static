/**
 * 桌面端运行时配置。
 *
 * 新客户端由 preload 提供进程级内存配置；旧客户端没有 runtimeConfig bridge 时，
 * 由 SPA 在当前页面内存中兜底，保证不更新桌面端的用户也能执行任务。
 * 配置不写 localStorage / sessionStorage，客户端或页面重新加载后恢复默认。
 */
export const RUNTIME_CONFIG_DEFAULTS = Object.freeze({
  includeViewedCandidates: false
});

const runtimeConfigState = { ...RUNTIME_CONFIG_DEFAULTS };

const preloadRuntimeConfig =
  typeof window !== "undefined"
    ? window.api?.runtimeConfig || window.ikuaizhaoConfig || null
    : null;

function isElectronRuntime() {
  return (
    typeof window !== "undefined" &&
    window.__IKUAIZHAO_NATIVE__?.mode === "electron"
  );
}

function isQa2Page() {
  return (
    typeof window !== "undefined" &&
    window.location.hostname === "test.ihire365.com"
  );
}

function assertMutable(action) {
  if (!isQa2Page()) {
    throw new Error(
      `ikuaizhaoConfig.${action} 仅允许在 QA2 环境执行；线上版本只支持 ikuaizhaoConfig.get()`
    );
  }
}

function getDefault(key) {
  return Object.prototype.hasOwnProperty.call(RUNTIME_CONFIG_DEFAULTS, key)
    ? RUNTIME_CONFIG_DEFAULTS[key]
    : undefined;
}

function getFallbackConfig(key) {
  if (key === undefined) return { ...runtimeConfigState };
  return runtimeConfigState[key];
}

/**
 * 读取运行时配置。preload bridge 不可用时返回默认值。
 * @param {keyof typeof RUNTIME_CONFIG_DEFAULTS} [key]
 */
export function getRuntimeConfig(key) {
  if (preloadRuntimeConfig?.get) {
    return preloadRuntimeConfig.get(key);
  }
  if (key === undefined) return getFallbackConfig();
  return getFallbackConfig(key) ?? getDefault(key);
}

function setRuntimeConfig(key, value) {
  if (preloadRuntimeConfig?.set) {
    return preloadRuntimeConfig.set(key, value);
  }
  assertMutable("set");
  if (!Object.prototype.hasOwnProperty.call(RUNTIME_CONFIG_DEFAULTS, key)) {
    throw new Error(`未知运行时配置: ${String(key)}`);
  }
  runtimeConfigState[key] = value;
  return getFallbackConfig();
}

function resetRuntimeConfig(key) {
  if (preloadRuntimeConfig?.reset) {
    return preloadRuntimeConfig.reset(key);
  }
  assertMutable("reset");
  if (key === undefined) {
    Object.assign(runtimeConfigState, RUNTIME_CONFIG_DEFAULTS);
  } else if (Object.prototype.hasOwnProperty.call(RUNTIME_CONFIG_DEFAULTS, key)) {
    runtimeConfigState[key] = RUNTIME_CONFIG_DEFAULTS[key];
  } else {
    throw new Error(`未知运行时配置: ${String(key)}`);
  }
  return getFallbackConfig();
}

/**
 * 旧桌面端没有 preload 全局入口时，由 SPA 安装兼容实现。
 * 新桌面端已有 preload 入口时不覆盖，避免出现两份独立状态。
 */
export function installRuntimeConfigConsole() {
  if (!isElectronRuntime() || window.ikuaizhaoConfig) return;
  Object.defineProperty(window, "ikuaizhaoConfig", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      get: getRuntimeConfig,
      set: setRuntimeConfig,
      reset: resetRuntimeConfig
    })
  });
}
