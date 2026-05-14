/**
 * Launcher payload 持久化
 *
 * 来源：用户在浏览器里通过 /client-launcher 触发 deep link 唤起客户端时，
 *       payload 里携带 ihrManageUrl / ssoConfig / sysConfig / companyConfig / positionIds / intent。
 *
 * 持久化目的：
 *   - 下次用户直接启动客户端（双击图标，没走 deep link），仍能拿到上次环境配置（最重要：ihrManageUrl）
 *   - 业务层（SPA）也可以读"上次 launcher 给的所有数据"做兜底（如主题色 sysConfig.color、companyConfig 等）
 *
 * 存储位置：app.getPath('userData')/launcher-data.json
 *   - macOS: ~/Library/Application Support/i快招/launcher-data.json
 *   - Windows: %APPDATA%/i快招/launcher-data.json
 *
 * ⚠️ 安全注意：
 *   ssoConfig 里的 token / apiKey / signature 等敏感凭证也会被存（按用户要求"全部存"）。
 *   userData 目录已经是当前用户的私有目录（操作系统级权限隔离），但仍要谨慎：
 *     - 不要把这个文件分享/上传到 OSS
 *     - 退出登录场景应主动调 clearStoredLauncherData()
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** 持久化的 launcher 数据结构 */
export interface StoredLauncherData {
  /** i 人事 manage 系统入口 URL（最高优先级——所有 ihrBridge 调用都用它） */
  ihrManageUrl?: string
  /** 上次 deep link payload 的完整副本（按用户要求"全部存"，包含 ssoConfig 等敏感字段） */
  lastInitPayload?: Record<string, unknown>
  /** 写入时间戳（用于判断数据新鲜度，目前仅展示用） */
  savedAt?: number
  /** 写入来源（'deep-link' / 'manual'），便于调试 */
  source?: string
}

const STORE_FILE_NAME = 'launcher-data.json'

let cached: StoredLauncherData | null = null

function getStoreFilePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE_NAME)
}

/**
 * 从磁盘读取持久化数据；带内存 cache，避免重复读 IO。
 * 首次调用必须在 app.ready 之后（getPath('userData') 依赖 app）。
 */
export function loadStoredLauncherData(): StoredLauncherData {
  if (cached) return cached
  try {
    const file = getStoreFilePath()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8')
      cached = JSON.parse(raw) as StoredLauncherData
      return cached
    }
  } catch (e) {
    console.warn('[launcherStore] load failed:', (e as Error).message)
  }
  cached = {}
  return cached
}

/**
 * 部分更新持久化数据（patch 语义；不传的字段保留原值）。
 * - 写完后更新 cached
 * - 错误吞掉但打日志，不影响业务
 */
export function saveStoredLauncherData(patch: Partial<StoredLauncherData>): void {
  try {
    const existing = loadStoredLauncherData()
    const merged: StoredLauncherData = {
      ...existing,
      ...patch,
      savedAt: Date.now()
    }
    const file = getStoreFilePath()
    fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8')
    cached = merged
    console.log(
      `[launcherStore] saved (source=${patch.source ?? 'unknown'}, ihrManageUrl=${merged.ihrManageUrl})`
    )
  } catch (e) {
    console.warn('[launcherStore] save failed:', (e as Error).message)
  }
}

/** 清除全部持久化数据（用户退出登录时调用） */
export function clearStoredLauncherData(): void {
  try {
    const file = getStoreFilePath()
    if (fs.existsSync(file)) fs.unlinkSync(file)
    cached = {}
    console.log('[launcherStore] cleared')
  } catch (e) {
    console.warn('[launcherStore] clear failed:', (e as Error).message)
  }
}

/**
 * 把 deep link payload 全量持久化。
 * - ihrManageUrl 单独抽出来作为顶层字段，方便 ihrBridge 启动时读取
 * - 其余 payload（包括 ssoConfig 等）整体存到 lastInitPayload
 */
export function persistDeepLinkPayload(payload: Record<string, unknown> | undefined | null): void {
  if (!payload || typeof payload !== 'object') return
  const ihrManageUrl =
    typeof payload.ihrManageUrl === 'string' ? (payload.ihrManageUrl as string) : undefined
  saveStoredLauncherData({
    ...(ihrManageUrl ? { ihrManageUrl } : {}),
    lastInitPayload: payload,
    source: 'deep-link'
  })
}
