/**
 * iHR 业务桥接（i 人事招聘工作台 API 代理）
 *
 * 用于 i 快招 Electron 客户端模式下取代"父 iframe"的角色：
 *   - i 人事 iframe 模式：父端 React + Redux 直接调 i 人事网关，结果通过 postMessage 推给子端
 *   - 客户端模式：i 快招 SPA 里 messenger shim 把 post('resumeList', ...) 等转到这里，
 *                  再由本模块通过 universalRequest / 直接 fetch 调 i 人事网关
 *
 * 当前阶段：M1 mock 实现，所有方法返回固定占位结构，跑通流程；
 *           真实接入需要先确认 D1（网关 base）+ D2（鉴权方式），见 docs/client-launcher-flow.md
 *
 * 业务接口清单（与 ihr360-recruit-static/src/actions/recruit-assistant.ts 对齐）：
 *   - getApplicationPosition()
 *   - getSharedCandidateResume()
 *   - sharedCandidateResumeInit()
 *   - batchGetPositionDetailByIds(ids)
 *   - assignPositions(req)
 *   - addPools(req)
 *   - uploadFile(arrayBuffer, name, mime, centralUpload)
 */

import { ipcMain } from 'electron'

// =============== 通用响应包装 ===============

interface IhrApiResult<T = unknown> {
  success: boolean
  code?: number
  message?: string
  data?: T
}

// 与 i 人事 redux action 对齐的成功 envelope
function ok<T>(data: T): IhrApiResult<T> {
  return { success: true, code: 0, data }
}

function fail(message: string, code = -1): IhrApiResult<never> {
  return { success: false, code, message }
}

// =============== Mock 数据（开发期占位） ===============

const MOCK_POSITIONS = [
  {
    headcountId: 'mock-pos-001',
    headcountCode: 'HC001',
    positionName: 'Mock 高级前端工程师',
    headcountStatus: 1,
    isClose: false,
    isDeleted: false
  },
  {
    headcountId: 'mock-pos-002',
    headcountCode: 'HC002',
    positionName: 'Mock 资深 Java 开发',
    headcountStatus: 1,
    isClose: false,
    isDeleted: false
  }
]

const MOCK_CHANNELS = [
  { label: 'BOSS直聘', value: 'BOSS' },
  { label: '智联招聘', value: 'ZHILIAN' },
  { label: '猎聘', value: 'LIEPIN' },
  { label: '前程无忧', value: 'JOB51' },
  { label: '其他', value: 'OTHER' }
]

const MOCK_TALENT_POOLS = [
  { id: 1, name: 'Mock 默认人才库' },
  { id: 2, name: 'Mock 高潜人才库' }
]

// =============== Mock 业务实现 ===============

/**
 * 招聘中的职位列表（同 i 人事 getApplicationPosition）
 */
async function getApplicationPosition(): Promise<IhrApiResult<typeof MOCK_POSITIONS>> {
  console.log('[ihrBridge] getApplicationPosition (mock)')
  return ok(MOCK_POSITIONS)
}

/**
 * 共享简历入口的初始数据（人才库 / 渠道映射 / 上传配置）
 */
async function getSharedCandidateResume(): Promise<
  IhrApiResult<{
    talentPools: typeof MOCK_TALENT_POOLS
    channels: typeof MOCK_CHANNELS
    resumeCenteralUpload: boolean
  }>
> {
  console.log('[ihrBridge] getSharedCandidateResume (mock)')
  return ok({
    talentPools: MOCK_TALENT_POOLS,
    channels: MOCK_CHANNELS,
    resumeCenteralUpload: false
  })
}

/**
 * 共享简历入口初始化校验（与 sharedCandidateResumeInit(null) 对齐）
 */
async function sharedCandidateResumeInit(): Promise<
  IhrApiResult<{ resumeCenteralUpload: boolean }>
> {
  console.log('[ihrBridge] sharedCandidateResumeInit (mock)')
  return ok({ resumeCenteralUpload: false })
}

/**
 * 批量职位详情（用于父端 generateJobPostingFromResume 生成 JD）
 */
async function batchGetPositionDetailByIds(ids: string[]): Promise<
  IhrApiResult<
    Array<{
      headcountBasic: { headcountId: string }
      [key: string]: unknown
    }>
  >
> {
  console.log('[ihrBridge] batchGetPositionDetailByIds (mock):', ids)
  if (!Array.isArray(ids) || ids.length === 0) return ok([])
  return ok(
    ids.map((id) => ({
      headcountBasic: { headcountId: id, mock: true },
      jdRequirements: 'Mock 任职要求…',
      jdResponsibilities: 'Mock 工作职责…'
    }))
  )
}

/**
 * 分配职位（同 assignPositions）
 */
async function assignPositions(req: Record<string, unknown>): Promise<
  IhrApiResult<{
    type: string
    newResumeInfos: Array<{ aiResumeId: string }>
    repeatResumeInfos: Array<{ aiResumeId: string }>
    maybeResumeInfos: Array<{ aiResumeId: string }>
    failParseResumeIds: Array<{ aiResumeId: string }>
    successResumeIds?: string[]
    failRepeatResumeIds?: string[]
    failOtherResumeIds?: string[]
    headcountId?: string
  }>
> {
  console.log('[ihrBridge] assignPositions (mock):', JSON.stringify(req, null, 2).slice(0, 500))
  return ok({
    type: 'assign',
    newResumeInfos: [],
    repeatResumeInfos: [],
    maybeResumeInfos: [],
    failParseResumeIds: [],
    successResumeIds: ['mock-resume-001'],
    failRepeatResumeIds: [],
    failOtherResumeIds: [],
    headcountId: (req?.headcountId as string) ?? ''
  })
}

/**
 * 加入人才库（同 addPools）
 */
async function addPools(req: Record<string, unknown>): Promise<
  IhrApiResult<{
    type: string
    newResumeInfos: Array<{ aiResumeId: string }>
    repeatResumeInfos: Array<{ aiResumeId: string }>
    maybeResumeInfos: Array<{ aiResumeId: string }>
    failParseResumeIds: Array<{ aiResumeId: string }>
    successResumeIds?: string[]
    failRepeatResumeIds?: string[]
    failOtherResumeIds?: string[]
    talentPoolIds?: number[]
  }>
> {
  console.log('[ihrBridge] addPools (mock):', JSON.stringify(req, null, 2).slice(0, 500))
  return ok({
    type: 'pool',
    newResumeInfos: [],
    repeatResumeInfos: [],
    maybeResumeInfos: [],
    failParseResumeIds: [],
    successResumeIds: ['mock-resume-002'],
    failRepeatResumeIds: [],
    failOtherResumeIds: [],
    talentPoolIds: (req?.talentPoolIds as number[]) ?? []
  })
}

/**
 * 简历文件上传（取代 i 人事 uploadFile）
 *
 * 渲染端发过来的 file 通过 IPC 序列化为 ArrayBuffer + meta，本侧落盘 / 走网关上传。
 * mock 阶段：直接返回伪造 fileId。
 */
async function uploadFile(arg: {
  arrayBuffer: ArrayBuffer
  name: string
  mime?: string
  centralUpload?: boolean
}): Promise<IhrApiResult<{ fileId: string }>> {
  if (!arg || !arg.arrayBuffer) return fail('missing file payload')
  const sizeKb = Math.round((arg.arrayBuffer.byteLength ?? 0) / 1024)
  console.log(
    `[ihrBridge] uploadFile (mock): ${arg.name} (${sizeKb}KB, central=${arg.centralUpload})`
  )
  return ok({
    fileId: `mock-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  })
}

// =============== IPC 注册 ===============

export function registerIhrBridgeIpc(): void {
  ipcMain.handle('ihrBridge:getApplicationPosition', () => getApplicationPosition())
  ipcMain.handle('ihrBridge:getSharedCandidateResume', () => getSharedCandidateResume())
  ipcMain.handle('ihrBridge:sharedCandidateResumeInit', () => sharedCandidateResumeInit())
  ipcMain.handle('ihrBridge:batchGetPositionDetailByIds', (_e, ids: string[]) =>
    batchGetPositionDetailByIds(ids)
  )
  ipcMain.handle('ihrBridge:assignPositions', (_e, req: Record<string, unknown>) =>
    assignPositions(req)
  )
  ipcMain.handle('ihrBridge:addPools', (_e, req: Record<string, unknown>) => addPools(req))
  ipcMain.handle(
    'ihrBridge:uploadFile',
    (
      _e,
      arg: {
        arrayBuffer: ArrayBuffer
        name: string
        mime?: string
        centralUpload?: boolean
      }
    ) => uploadFile(arg)
  )
}
