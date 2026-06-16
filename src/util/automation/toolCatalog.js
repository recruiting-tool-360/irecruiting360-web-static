/**
 * 前端工具目录（docs/automation-protocol.md §3.3）
 *
 * 每个工具是一个 "scriptCode 字符串 + ctxSchema" 的可序列化对象。
 * 由 AI Agent 通过 tool name 引用，前端来组合 ctx + 调 runScript。
 *
 * 当前注册：
 *   - boss.recommendFilter：BOSS 推荐牛人 - 筛选浮层（src/playwright/bossRecommendFilter.js）
 *
 * 未来扩展：
 *   - boss.openRecommend / boss.scroll / boss.viewResume / boss.loadMore / boss.selectPosition / ...
 *   - zhilian.* / job51.* / liepin.*
 */

import {
  scriptCode as bossRecommendFilterScript,
  meta as bossRecommendFilterMeta
} from 'src/playwright/bossRecommendFilter'
import {
  scriptCode as bossJobListScript,
  meta as bossJobListMeta
} from 'src/playwright/bossJobList'
import {
  scriptCode as bossRecommendListScript,
  meta as bossRecommendListMeta
} from 'src/playwright/bossRecommendList'
import {
  scriptCode as bossRecommendHumanizeScript,
  meta as bossRecommendHumanizeMeta
} from 'src/playwright/bossRecommendHumanize'
import {
  scriptCode as bossRecommendVerifyScript,
  meta as bossRecommendVerifyMeta
} from 'src/playwright/bossRecommendVerify'

/**
 * 工具登记表：name → { scriptCode, meta }
 */
const TOOLS = {
  [bossRecommendFilterMeta.name]: {
    scriptCode: bossRecommendFilterScript,
    meta: bossRecommendFilterMeta
  },
  [bossJobListMeta.name]: {
    scriptCode: bossJobListScript,
    meta: bossJobListMeta
  },
  [bossRecommendListMeta.name]: {
    scriptCode: bossRecommendListScript,
    meta: bossRecommendListMeta
  },
  [bossRecommendHumanizeMeta.name]: {
    scriptCode: bossRecommendHumanizeScript,
    meta: bossRecommendHumanizeMeta
  },
  [bossRecommendVerifyMeta.name]: {
    scriptCode: bossRecommendVerifyScript,
    meta: bossRecommendVerifyMeta
  }
}

/** 列出所有已注册的工具（给 AI Agent 发协议时用） */
export function listTools() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    channel: t.meta.channel,
    description: t.meta.description,
    pageUrlPattern: t.meta.pageUrlPattern,
    apiUrl: t.meta.apiUrl,
    ctxSchema: t.meta.ctxSchema,
    optionDict: t.meta.optionDict
  }))
}

/** 取某工具的 scriptCode + meta（供 runScript 用） */
export function getTool(name) {
  return TOOLS[name] || null
}

/** 工具是否存在 */
export function hasTool(name) {
  return Object.prototype.hasOwnProperty.call(TOOLS, name)
}

export default { listTools, getTool, hasTool }
