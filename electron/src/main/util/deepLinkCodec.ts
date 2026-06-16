/**
 * Electron 主进程端的 deep link 解析模块。
 * 与 SPA 端 src/util/deepLinkCodec.js 保持算法一致：
 *
 *   编码（SPA）：base64url(unescape(encodeURIComponent(JSON.stringify(payload))))
 *   解码（main）：JSON.parse(decodeURIComponent(escape(Buffer.from(b64, 'base64').toString('utf8'))))
 *
 * 协议形如 ikuaizhao://<action>?d=<base64url>&v=1
 */

export interface SsoHandoverPayload {
  ssoConfig?: {
    userConfig?: {
      tenantCode?: string
      apiKey?: string
      signature?: string
      thirdPartyUserId?: string
      userData?: Record<string, unknown>
      extendData?: Record<string, unknown>
    }
  }
  sysConfig?: {
    color?: string
  }
  from?: string
  ts?: number
  v?: number
}

export interface ParsedDeepLink<T = SsoHandoverPayload> {
  /** 协议路径段，比如 'sso' / 'open-chat' / 'import-resume' */
  action: string
  /** 协议版本，没有时按 1 算 */
  version: number
  /** 解码后的 payload */
  payload: T
  /** 原始 URL（调试用） */
  rawUrl: string
}

/**
 * base64url → JSON 对象
 */
export function decodePayload<T = SsoHandoverPayload>(d: string): T {
  // 补回 padding
  const padded = d + '='.repeat((4 - (d.length % 4)) % 4)
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const json = Buffer.from(b64, 'base64').toString('utf8')
  // 反向 unescape(encodeURIComponent(...))：等价于 decodeURIComponent(escape(...))，
  // 但 Buffer 已经按 utf8 解了，json 已是 UTF-8 字符串，直接 parse 即可
  return JSON.parse(json)
}

/**
 * 解析 ikuaizhao:// 协议 URL
 * @param url 形如 'ikuaizhao://sso?d=<base64url>&v=1'
 * @returns 解析失败返回 null
 */
export function parseDeepLink(url: string): ParsedDeepLink | null {
  if (typeof url !== 'string' || !url) return null
  if (!url.startsWith('ikuaizhao://')) return null

  try {
    const u = new URL(url)
    if (u.protocol !== 'ikuaizhao:') return null

    // u.host 通常是 path 段（比如 'sso'），u.pathname 是 '' 或 '/'
    // 兼容形如 ikuaizhao://sso 和 ikuaizhao:///sso 两种写法
    const action = (u.host || u.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase()
    if (!action) return null

    const d = u.searchParams.get('d')
    const vRaw = u.searchParams.get('v')
    const version = vRaw ? Number(vRaw) || 1 : 1

    if (!d) {
      return { action, version, payload: {}, rawUrl: url }
    }

    const payload = decodePayload(d)
    return { action, version, payload, rawUrl: url }
  } catch (e) {
    console.error('[deepLinkCodec] parse failed for url:', url, e)
    return null
  }
}

/**
 * 校验 payload 的 ts（防止过期 deep link 被回放）
 * @param payload
 * @param maxAgeMs 最大允许年龄，默认 5 分钟
 */
export function isPayloadFresh(payload: SsoHandoverPayload, maxAgeMs = 5 * 60 * 1000): boolean {
  const ts = payload?.ts
  if (typeof ts !== 'number' || ts <= 0) {
    // 没带 ts 当作不过期（比如老版本协议）
    return true
  }
  return Date.now() - ts <= maxAgeMs
}
