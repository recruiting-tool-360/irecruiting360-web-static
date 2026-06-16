/**
 * 本地 probe + dispatch HTTP server（127.0.0.1:53531）
 *
 * 两个端点：
 *
 * ① GET  /__ikuaizhao/health      —— 客户端存活探测（无副作用，浏览器 launcher 用）
 * ② POST /__ikuaizhao/dispatch    —— 浏览器 → 客户端 SPA 的数据通道（替代 deep link 的脏活）
 *
 * 为什么把 dispatch 也走这里：
 *   - deep link (ikuaizhao://) 受 URL 长度限制（macOS 512KB / Windows 8KB），大 payload 走不动
 *   - deep link 是 OS 协议，每次新加 type 都要让客户端的 main 进程认识 → 必须升级客户端
 *   - dispatch 走本地 HTTP + IPC 透传：主进程**不解析 type/payload**，原样转给 SPA，
 *     新业务只需升级 H5，客户端零改动
 *
 * 架构：
 *
 *   浏览器                probe server              home tab webContents (i 快招 SPA)
 *      │ POST /dispatch        │                              │
 *      │ ──────────────────────>│                              │
 *      │                       │ wc.send('app:browser-data',  │
 *      │                       │         body)                │
 *      │                       │ ────────────────────────────>│ window.api.browserBridge
 *      │                       │                              │   .on(type, callback)
 *      │ <── 200 { ok }────────│                              │
 *
 * 安全：
 *   - 只 listen 127.0.0.1，外网/局域网打不进
 *   - 没有写文件、执行命令等危险操作；只是把 JSON 透传给同机的 SPA renderer
 *   - 任何同机进程都能 POST：风险等同于「同机程序能往 SPA 发自定义事件」。如果以后业务里
 *     `app:browser-data` 处理触发敏感操作，需要在 SPA 侧自己做来源校验（例如 type 白名单 +
 *     payload 必须带「父端签名」），不是 probe server 的职责
 *   - 端口冲突时 server 静默退出，dispatch 自然返回失败
 */

import http from 'node:http'
import { app, type WebContents } from 'electron'

export const PROBE_PORT = 53531
export const PROBE_HOST = '127.0.0.1'
export const PROBE_HEALTH_PATH = '/__ikuaizhao/health'
export const PROBE_DISPATCH_PATH = '/__ikuaizhao/dispatch'

/** 单次请求 body 上限（防止恶意撑爆主进程内存）。8MB 足够任何合理业务 payload */
const MAX_BODY_BYTES = 8 * 1024 * 1024

let probeServer: http.Server | null = null

interface ProbeHealthInfo {
  v: 1
  appVersion: string
  pid: number
  startedAt: number
  ts: number
}

interface DispatchBody {
  /** 协议版本号；主进程只识别 v=1，其他直接 400（强制浏览器/客户端协商） */
  v: 1
  /** 业务事件类型，字符串。主进程不解析，只转发 */
  type: string
  /** 业务数据，任意 JSON。主进程不解析，只转发 */
  payload?: unknown
  /** 可选请求 ID，浏览器侧可用来做 request/response 关联（当前仅透传） */
  requestId?: string
}

const startedAt = Date.now()

function buildHealthInfo(): ProbeHealthInfo {
  return {
    v: 1,
    appVersion: app.getVersion(),
    pid: process.pid,
    startedAt,
    ts: Date.now()
  }
}

// =============== home tab webContents 注入 ===============

/**
 * 主页 tab 的 webContents 引用，由 main 在 home tab 创建后通过 setHomeWebContentsForProbe 注入。
 * 与 recruitBridge.homeWcRef 是两个不同的 ref，但实际指向同一个 wc。
 */
let homeWcRef: WebContents | null = null

export function setHomeWebContentsForProbe(wc: WebContents): void {
  homeWcRef = wc
}

// =============== HTTP server ===============

function setCorsHeaders(res: http.ServerResponse): void {
  // 浏览器跨域 fetch 必须；同时支持 Chrome PNA preflight（HTTPS → http://127.0.0.1）
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('Cache-Control', 'no-store')
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/**
 * 读取 JSON body（带大小上限保护，超限直接断流）
 */
function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (!raw) {
          resolve(null)
          return
        }
        resolve(JSON.parse(raw))
      } catch (_e) {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function isValidDispatchBody(input: unknown): input is DispatchBody {
  if (!input || typeof input !== 'object') return false
  const obj = input as Record<string, unknown>
  if (obj.v !== 1) return false
  if (typeof obj.type !== 'string' || !obj.type) return false
  if (obj.requestId !== undefined && typeof obj.requestId !== 'string') return false
  return true
}

async function handleDispatch(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (e) {
    const msg = (e as Error).message
    jsonResponse(res, 400, { ok: false, error: msg })
    return
  }

  if (!isValidDispatchBody(body)) {
    jsonResponse(res, 400, {
      ok: false,
      error: 'invalid_body',
      hint: 'expected { v: 1, type: string, payload?: any, requestId?: string }'
    })
    return
  }

  if (!homeWcRef || homeWcRef.isDestroyed()) {
    jsonResponse(res, 503, {
      ok: false,
      error: 'no_renderer',
      hint: 'home tab not ready yet, retry in a moment'
    })
    return
  }

  // 透传给 home tab；主进程不关心也不解析 type/payload
  homeWcRef.send('app:browser-data', body)

  jsonResponse(res, 200, {
    ok: true,
    dispatched: true,
    requestId: body.requestId
  })
}

export function startProbeServer(): void {
  if (probeServer) {
    console.log('[probe] already running, skip')
    return
  }

  probeServer = http.createServer((req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = req.url ?? ''

    if (req.method === 'GET' && url.startsWith(PROBE_HEALTH_PATH)) {
      jsonResponse(res, 200, buildHealthInfo())
      return
    }

    if (req.method === 'POST' && url.startsWith(PROBE_DISPATCH_PATH)) {
      void handleDispatch(req, res)
      return
    }

    jsonResponse(res, 404, { ok: false, error: 'not_found' })
  })

  probeServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(
        `[probe] port ${PROBE_PORT} already in use ` +
          `(another i快招 instance? probe + dispatch disabled, browser side will fallback to deep link only)`
      )
    } else {
      console.error('[probe] server error:', err)
    }
    probeServer = null
  })

  probeServer.listen(PROBE_PORT, PROBE_HOST, () => {
    console.log(
      `[probe] listening on http://${PROBE_HOST}:${PROBE_PORT} ` +
        `(health=${PROBE_HEALTH_PATH}, dispatch=${PROBE_DISPATCH_PATH}, pid=${process.pid})`
    )
  })

  app.on('before-quit', () => {
    stopProbeServer()
  })
}

export function stopProbeServer(): void {
  if (!probeServer) return
  probeServer.close((err) => {
    if (err) console.warn('[probe] close error:', err)
  })
  probeServer = null
  homeWcRef = null
}
