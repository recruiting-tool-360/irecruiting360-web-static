/**
 * BOSS 我的职位列表 - 自动调度
 *
 * 触发时机：
 *   - 主页 mounted 时（`ensureBossJobList(store)`）
 *   - BOSS 登录态从 false → true（`bindBossLoginListener(store)`）
 *
 * 调度策略（全部封装在此，组件不用关心）：
 *   - 仅 Electron 客户端有效：浏览器模式直接 noop（隐藏窗口能力依赖 main 进程）
 *   - BOSS 必须在用户「渠道设置」中启用（userChannelConfig 为空 = 全启用）
 *   - BOSS 必须已登录（channelConf.BOSS.login === true）
 *   - 节流：默认 5 分钟内已成功抓过则跳过；可通过 opts.staleMs / opts.force 调整
 *   - 去重：模块内 inflight Promise 防止并发抓取
 *
 * 数据写入：Vuex `BossData` 模块（自动持久化到 localStorage）
 */

import { fetchBossJobList, isInElectronClient } from './bossJobList'

const DEFAULT_STALE_MS = 5 * 60 * 1000

/** in-flight Promise，防止并发抓取 */
let inflight = null

/** 检查 BOSS 是否在用户的「渠道设置」中启用（与 ClientHeader / LoginRequiredPanel 同口径） */
function isBossEnabled(store) {
  const list = store.getters.getUserChannelConfig
  if (!Array.isArray(list) || list.length === 0) return true // 没配置 → 全启用
  const entry = list.find((c) => c && c.key === 'BOSS')
  return entry ? !!entry.enableConfig : true
}

/** 检查 BOSS 是否已登录 */
function isBossLoggedIn(store) {
  const conf = store.getters.getChannelConf
  return !!(conf && conf.BOSS && conf.BOSS.login === true)
}

/**
 * 幂等触发一次抓取。命中节流 / 不满足前置条件时直接返回当前缓存。
 *
 * @param {import('vuex').Store} store
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false]   绕过节流强制抓
 * @param {number}  [opts.staleMs=300000] 多久之内不重复抓
 * @param {number}  [opts.timeoutMs=15000]
 * @param {string}  [opts.reason]         调度来源标记（仅日志）
 * @returns {Promise<{ ok: boolean; skipped?: string; jobList?: Array<Object>; errorCode?: string; message?: string }>}
 */
export async function ensureBossJobList(store, opts = {}) {
  const reasonTag = opts.reason ? `[reason=${opts.reason}] ` : ''
  if (!isInElectronClient()) {
    console.log(
      `[bossJobListAutoFetch] ${reasonTag}skipped: not_in_electron_client ` +
        `(window.api.automation 不存在；只有 Electron 客户端 dev:el / dev:el:local / 打包后才会触发)`
    )
    return { ok: false, skipped: 'not_in_electron_client' }
  }
  if (!isBossEnabled(store)) {
    console.log(`[bossJobListAutoFetch] ${reasonTag}skipped: boss_disabled_by_user`)
    return { ok: false, skipped: 'boss_disabled_by_user' }
  }
  if (!isBossLoggedIn(store)) {
    console.log(`[bossJobListAutoFetch] ${reasonTag}skipped: boss_not_logged_in`)
    return { ok: false, skipped: 'boss_not_logged_in' }
  }

  const staleMs = opts.staleMs == null ? DEFAULT_STALE_MS : Number(opts.staleMs)
  const lastAt = Number(store.state.BossData?.lastFetchedAt) || 0
  if (!opts.force && lastAt && Date.now() - lastAt < staleMs) {
    const ageSec = Math.round((Date.now() - lastAt) / 1000)
    console.log(
      `[bossJobListAutoFetch] ${reasonTag}skipped: fresh (cached ${ageSec}s ago, staleMs=${staleMs})`
    )
    return {
      ok: true,
      skipped: 'fresh',
      jobList: store.getters.getBossJobList
    }
  }

  if (inflight) return inflight

  store.commit('setBossJobListFetching', true)
  inflight = (async () => {
    try {
      console.log(`[bossJobListAutoFetch] ${reasonTag}start fetch`)
      const res = await fetchBossJobList({
        timeoutMs: opts.timeoutMs == null ? 15000 : Number(opts.timeoutMs)
      })

      if (!res.ok) {
        store.commit('setBossJobListError', {
          code: res.errorCode || 'UNKNOWN',
          message: res.message || ''
        })
        console.warn('[bossJobListAutoFetch] fetch failed', res.errorCode, res.message)
        // 把 main 进程隐藏窗口期间观察到的请求清单也吐出来，便于排查"没抓到接口"的原因
        if (Array.isArray(res.logs) && res.logs.length) {
          console.warn('[bossJobListAutoFetch] hidden window diagnostic logs:')
          for (const line of res.logs) console.warn('  ' + line)
        }
        return {
          ok: false,
          errorCode: res.errorCode,
          message: res.message,
          logs: res.logs
        }
      }

      const data = res.zpData && Array.isArray(res.zpData.data) ? res.zpData.data : []
      const totalSize = res.zpData && Number(res.zpData.totalSize) ? Number(res.zpData.totalSize) : data.length
      store.commit('setBossJobList', {
        data,
        totalSize,
        fetchedAt: Date.now()
      })
      console.log(
        `[bossJobListAutoFetch] ok rows=${data.length} totalSize=${totalSize} duration=${res.durationMs}ms`
      )
      return { ok: true, jobList: data }
    } finally {
      store.commit('setBossJobListFetching', false)
      inflight = null
    }
  })()

  return inflight
}

/**
 * 监听 BOSS 登录态：一旦从 false → true，自动触发一次（force=true）抓取。
 *
 * @param {import('vuex').Store} store
 * @param {Object} [opts]
 * @param {number} [opts.debounceMs=800]  登录成功后再延迟一点点（让 cookie/storage 落库稳定）
 * @returns {() => void}  unwatch 函数，组件 unmount 时调用
 */
export function bindBossLoginListener(store, opts = {}) {
  const debounceMs = opts.debounceMs == null ? 800 : Number(opts.debounceMs)
  let lastLogin = isBossLoggedIn(store)
  let timer = null

  const unsubscribe = store.subscribe((mutation) => {
    if (mutation.type !== 'changeChannelConfLogin') return
    if (!mutation.payload || mutation.payload.key !== 'BOSS') return
    const next = !!mutation.payload.value
    if (next === lastLogin) return
    lastLogin = next
    if (!next) return // 退出登录 → 不抓
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void ensureBossJobList(store, { force: true, reason: 'boss_login_success' })
    }, debounceMs)
  })

  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    unsubscribe()
  }
}

export default { ensureBossJobList, bindBossLoginListener }
