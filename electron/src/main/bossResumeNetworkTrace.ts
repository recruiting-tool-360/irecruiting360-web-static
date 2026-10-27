import type { WebContents } from 'electron'

export interface BossResumeTrace {
  stage: string
  timestamp: number
  wcId: number
  sessionId: string
  requestId?: string
  frameId?: string
  frameUrl?: string
  url: string
  method?: string
  resourceType?: string
  postData?: string
  status?: number
  mimeType?: string
  body?: unknown
  bodyBytes?: number
  error?: string
}

interface FrameInfo {
  id: string
  parentId?: string
  url: string
}

interface RequestInfo {
  sessionId: string
  requestId: string
  frameId: string
  frameUrl: string
  url: string
  method: string
  resourceType: string
  postData?: string
  status?: number
  mimeType?: string
}

interface FrameTree {
  frame: FrameInfo
  childFrames?: FrameTree[]
}

interface TraceMessageParams {
  targetInfo?: { type?: string }
  sessionId?: string
  frameId?: string
  parentFrameId?: string
  frame?: FrameInfo
  reason?: string
  requestId?: string
  request?: { url?: string; method?: string; postData?: string }
  documentURL?: string
  type?: string
  redirectResponse?: { status?: number }
  response?: { status?: number; mimeType?: string }
  errorText?: string
  blockedReason?: string
}

function isResumeFrameUrl(value: string): boolean {
  try {
    return new URL(value).pathname === '/web/frame/c-resume/'
  } catch {
    return false
  }
}

export function traceBossResumeNetwork(
  wc: WebContents,
  onTrace?: (entry: BossResumeTrace) => void
): () => void {
  const debuggerApi = wc.debugger
  const frames = new Map<string, FrameInfo>()
  const requests = new Map<string, RequestInfo>()
  let disposed = false

  const emit = (entry: Omit<BossResumeTrace, 'timestamp' | 'wcId'>): void => {
    if (disposed || !onTrace) return
    const payload = { ...entry, timestamp: Date.now(), wcId: wc.id }
    try {
      onTrace?.(payload)
    } catch (error) {
      console.warn('[任务流程] [网络监听] 状态转发失败', error)
    }
  }

  const rememberFrame = (frame: FrameInfo, sessionId: string): void => {
    const previous = frames.get(frame.id)
    frames.set(frame.id, { ...previous, ...frame })
    if (isResumeFrameUrl(frame.url) && previous?.url !== frame.url) {
      emit({ stage: 'FRAME', sessionId, frameId: frame.id, frameUrl: frame.url, url: frame.url })
    }
  }

  const resumeFrameUrl = (frameId: string): string => {
    const visited = new Set<string>()
    let frame = frames.get(frameId)
    while (frame && !visited.has(frame.id)) {
      if (isResumeFrameUrl(frame.url)) return frame.url
      visited.add(frame.id)
      frame = frame.parentId ? frames.get(frame.parentId) : undefined
    }
    return ''
  }

  const rememberTree = (tree: FrameTree, sessionId: string): void => {
    rememberFrame(tree.frame, sessionId)
    for (const child of tree.childFrames || []) rememberTree(child, sessionId)
  }

  const configureSession = async (sessionId: string): Promise<void> => {
    const send = (method: string, params?: Record<string, unknown>): Promise<unknown> =>
      disposed
        ? Promise.reject(new Error('NETWORK_TRACE_DISPOSED'))
        : debuggerApi.sendCommand(method, params, sessionId || undefined)
    try {
      await send('Network.enable')
      await send('Page.enable')
      const tree = (await send('Page.getFrameTree')) as { frameTree?: FrameTree }
      if (tree.frameTree) rememberTree(tree.frameTree, sessionId)
      await send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
        filter: [{ type: 'iframe' }, { exclude: true }]
      })
      emit({ stage: 'LISTENING', sessionId, url: wc.getURL() })
    } catch (error) {
      emit({ stage: 'LISTENER_ERROR', sessionId, url: '', error: String(error) })
    }
  }

  const onMessage = (
    _event: Electron.Event,
    method: string,
    params: TraceMessageParams,
    sessionId = ''
  ): void => {
    if (disposed) return
    if (method === 'Target.attachedToTarget') {
      if (params.targetInfo?.type === 'iframe' && params.sessionId) {
        void configureSession(params.sessionId)
      }
      return
    }
    if (method === 'Target.detachedFromTarget') {
      for (const [key, request] of requests) {
        if (request.sessionId === params.sessionId) requests.delete(key)
      }
      return
    }
    if (method === 'Page.frameAttached') {
      if (params.frameId && !frames.has(params.frameId)) {
        frames.set(params.frameId, { id: params.frameId, parentId: params.parentFrameId, url: '' })
      }
      return
    }
    if (method === 'Page.frameNavigated') {
      if (params.frame) rememberFrame(params.frame, sessionId)
      return
    }
    if (method === 'Page.frameDetached') {
      if (params.reason !== 'swap' && params.frameId) frames.delete(params.frameId)
      return
    }

    const requestId = String(params.requestId || '')
    const key = `${sessionId}:${requestId}`
    if (method === 'Network.requestWillBeSent') {
      const request = params.request || {}
      const frameId = String(params.frameId || '')
      const frameUrl = isResumeFrameUrl(params.documentURL || '')
        ? params.documentURL || ''
        : params.type === 'Document' && isResumeFrameUrl(request.url || '')
          ? request.url || ''
          : resumeFrameUrl(frameId)
      if (!frameUrl) return
      if (params.type === 'Document' && isResumeFrameUrl(request.url || '')) {
        rememberFrame({ id: frameId, url: request.url || '' }, sessionId)
      }
      if (params.redirectResponse) {
        const previous = requests.get(key)
        if (previous)
          emit({ ...previous, stage: 'REDIRECT', status: params.redirectResponse.status })
      }
      const meta: RequestInfo = {
        sessionId,
        requestId,
        frameId,
        frameUrl,
        url: request.url || '',
        method: request.method || 'GET',
        resourceType: params.type || '',
        postData: request.postData
      }
      requests.set(key, meta)
      emit({ ...meta, stage: 'REQUEST' })
      return
    }

    const meta = requests.get(key)
    if (!meta) return
    if (method === 'Network.responseReceived') {
      meta.status = params.response?.status
      meta.mimeType = params.response?.mimeType
      emit({ ...meta, stage: 'RESPONSE' })
    } else if (method === 'Network.loadingFailed') {
      requests.delete(key)
      emit({
        ...meta,
        stage: 'FAILED',
        error: params.errorText || params.blockedReason || '请求失败'
      })
    } else if (method === 'Network.loadingFinished') {
      requests.delete(key)
      if (!onTrace) return
      const textual = /json|text|javascript|xml|x-www-form-urlencoded/i.test(meta.mimeType || '')
      if (!textual && !['XHR', 'Fetch'].includes(meta.resourceType)) return
      void debuggerApi
        .sendCommand('Network.getResponseBody', { requestId }, sessionId || undefined)
        .then((response: { body?: string; base64Encoded?: boolean }) => {
          const text = response.base64Encoded
            ? Buffer.from(response.body || '', 'base64').toString('utf8')
            : response.body || ''
          let body: unknown = text
          try {
            body = JSON.parse(text)
          } catch {
            body = text
          }
          emit({ ...meta, stage: 'BODY', body, bodyBytes: Buffer.byteLength(text, 'utf8') })
        })
        .catch((error) => emit({ ...meta, stage: 'BODY_ERROR', error: String(error) }))
    }
  }

  const dispose = (): void => {
    disposed = true
    requests.clear()
    frames.clear()
    debuggerApi.removeListener('message', onMessage)
    debuggerApi.removeListener('detach', dispose)
    wc.removeListener('destroyed', dispose)
  }

  debuggerApi.on('message', onMessage)
  debuggerApi.once('detach', dispose)
  wc.once('destroyed', dispose)
  void configureSession('')
  return dispose
}
