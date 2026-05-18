/**
 * Automation runScript 客户端封装
 *
 * 对应 main 进程：electron/src/main/automation/runner.ts
 * 协议参考：docs/automation-protocol.md §4.5
 *
 * 提供：
 *   - runOnTab(tabId, scriptCode, ctx, opts)：在指定 tab 内执行脚本
 *   - runOnActiveTab(scriptCode, ctx, opts)：在当前激活 tab 内执行
 *   - runOnChannel(channel, scriptCode, ctx, opts)：先确保某渠道有 tab 再执行（自动打开 + 等待加载）
 *   - cancelAll()：取消所有正在跑的脚本
 *
 * 错误码（result.errorCode）：
 *   NOT_IN_CLIENT | BAD_REQUEST | TAB_NOT_FOUND | PAGE_NOT_FOUND
 *   CDP_CONNECT_FAILED | TIMEOUT | CANCELLED | SCRIPT_ERROR
 *   + 脚本内 throw err.code 透传
 */

function isInElectronClient() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.api &&
      window.api.automation &&
      typeof window.api.automation.runScript === 'function'
  )
}

/**
 * 归一化 runScript 返回值
 * @param {{ ok: boolean; data?: any; error?: any; logs?: string[]; elapsedMs?: number }} raw
 */
function normalize(raw) {
  if (!raw) return { ok: false, errorCode: 'RAW', message: 'no result from main', logs: [] }
  if (raw.ok) {
    return {
      ok: true,
      data: raw.data,
      elapsedMs: raw.elapsedMs,
      logs: raw.logs || []
    }
  }
  const err = raw.error || {}
  return {
    ok: false,
    // 优先用业务脚本里 throw 的语义码（err.scriptCode）；否则用 runner 的 code
    errorCode: err.scriptCode || err.code || 'SCRIPT_ERROR',
    message: err.message || '',
    name: err.name,
    stack: err.stack,
    elapsedMs: raw.elapsedMs,
    logs: raw.logs || []
  }
}

/**
 * 在指定 tab 内执行 Playwright 脚本
 * @param {string} tabId
 * @param {string} scriptCode async function body 字符串
 * @param {object} [ctx]
 * @param {{ timeoutMs?: number, expectedHost?: string }} [opts]
 *   expectedHost: 期望 tab 已加载到的 host（如 'zhipin.com'），
 *                 解决 openOrActivate 后 loadURL 异步未完成的竞态
 */
export async function runOnTab(tabId, scriptCode, ctx, opts = {}) {
  if (!isInElectronClient()) {
    return {
      ok: false,
      errorCode: 'NOT_IN_CLIENT',
      message: 'window.api.automation.runScript 不可用（非 Electron 客户端）',
      logs: []
    }
  }
  if (!tabId || !scriptCode) {
    return {
      ok: false,
      errorCode: 'BAD_REQUEST',
      message: 'tabId & scriptCode required',
      logs: []
    }
  }
  const raw = await window.api.automation.runScript({
    tabId,
    scriptCode,
    ctx,
    timeoutMs: opts.timeoutMs,
    expectedHost: opts.expectedHost
  })
  const result = normalize(raw)
  if (!result.ok) {
    console.warn('[runScript] failed:', result.errorCode, result.message)
    if (Array.isArray(result.logs) && result.logs.length) {
      console.warn('[runScript] script logs:')
      for (const line of result.logs) console.warn('  ' + line)
    }
  }
  return result
}

/** 在当前激活 tab 内执行 */
export async function runOnActiveTab(scriptCode, ctx, opts = {}) {
  if (!isInElectronClient()) {
    return { ok: false, errorCode: 'NOT_IN_CLIENT', message: '非客户端模式', logs: [] }
  }
  const active = await window.api.automation.getActiveTab()
  if (!active?.tabId) {
    return {
      ok: false,
      errorCode: 'TAB_NOT_FOUND',
      message: 'no active tab',
      logs: []
    }
  }
  return await runOnTab(active.tabId, scriptCode, ctx, opts)
}

/**
 * 先确保某 channel 有可用 tab（按需打开），再在那个 tab 上执行脚本
 *
 * @param {string} channel 'boss' / 'zhilian' / 'job51' / 'liepin'
 * @param {string} url 目标页面 URL（不存在时打开这个）
 * @param {string} scriptCode
 * @param {object} [ctx]
 * @param {{ timeoutMs?: number; hidden?: boolean; navTimeoutMs?: number }} [opts]
 */
export async function runOnChannel(channel, url, scriptCode, ctx, opts = {}) {
  if (!isInElectronClient()) {
    return { ok: false, errorCode: 'NOT_IN_CLIENT', message: '非客户端模式', logs: [] }
  }
  const { tabId } = await window.api.automation.openOrActivate({
    channel,
    url,
    hidden: !!opts.hidden
  })
  if (!tabId) {
    return {
      ok: false,
      errorCode: 'TAB_NOT_FOUND',
      message: `failed to open tab for channel ${channel}`,
      logs: []
    }
  }
  // 给一点时间让 tab 完成 navigation（page 在 playwright 端可见之前可能 PAGE_NOT_FOUND）
  // 简单策略：runScript 失败若是 PAGE_NOT_FOUND 则重试一次
  const first = await runOnTab(tabId, scriptCode, ctx, opts)
  if (first.ok || first.errorCode !== 'PAGE_NOT_FOUND') return first
  await new Promise((r) => setTimeout(r, (opts.navTimeoutMs ?? 3000) / 2))
  return await runOnTab(tabId, scriptCode, ctx, opts)
}

/** 取消所有正在跑的脚本 */
export async function cancelAllScripts() {
  if (!isInElectronClient()) return { cancelled: 0 }
  return await window.api.automation.cancelAll()
}

export default { runOnTab, runOnActiveTab, runOnChannel, cancelAllScripts }
