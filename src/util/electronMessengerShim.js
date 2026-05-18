/**
 * Electron 客户端模式下的 IframeMessenger Shim
 *
 * 客户端模式下 i 快招主页跑在 Electron 主窗口的 WebContentsView 里，没有父 iframe，
 * 因此原 boot/iframe-messenger.js 提供的 postMessage 通道全部失效。
 *
 * 本模块返回一个**与 IframeMessenger 同名同接口**的对象，让业务代码
 * （this.$iframeMessenger.on/post/...）保持原样：
 *
 *   -     on('init', cb)         冷启动从 sessionStorage（'ikuaizhao:initPayload'）补发；
 *                            后续 SSOLogin 拿到 deep link payload 后会调 injectInit() 触发
 *   - on('themeColor', cb)   noop（客户端自带主题；如需联动后续可改 ihrBridge.getTheme()）
 *   - on('ihrSuccessIds', cb) 业务 post('resumeList', ...) 完成后由 shim 自己 emit
 *   - post('connect') / post('disconnect')   noop
 *   - post('resumeList', { action: 'assign-position', ... })   → ihrBridge.assignPositions
 *   - post('resumeList', { action: 'talent-pool',     ... })   → ihrBridge.addPools
 *   - post('iframe-back')                                       → tabs.goBack(home tab)
 *   - post('themeColor', ...)                                   noop
 *
 * 与 IframeMessenger 行为差异：
 *   - 客户端模式下无任何真实 postMessage 收发；所有"事件"都是 shim 内部模拟
 *   - on('init') 注册后无需等待 — 如果 sessionStorage / 已注入 缓存里有 payload，立即同步触发
 *   - emit 事件时 context.from 伪装成 'ihr-recruit-assistant'，让业务代码 0 改动通过来源判断
 *
 * 详见 docs/client-launcher-flow.md
 */

const SS_KEY_INIT = 'ikuaizhao:initPayload';

/**
 * shim emit 事件时模拟的 context.from / origin。
 *
 * ⚠️ 关键设计：from 必须是 'ihr-recruit-assistant'。
 *
 * 业务代码（MainLayout.vue 'ihrSuccessIds' / SSOLogin.vue 'init' 'themeColor' 等）
 * 都有 `if (context.from !== 'ihr-recruit-assistant') return;` 来源判断，
 * 用于过滤恶意 origin 注入。客户端模式下 shim 是受信内部模拟，
 * 必须伪装成 i 人事推过来的，业务代码才能 0 改动跑通。
 *
 * origin 业务代码不读，写一个标记串方便日志追溯即可。
 */
const ELECTRON_CTX = { from: 'ihr-recruit-assistant', origin: 'electron://shim' };

/**
 * @returns {boolean}
 */
function isElectronClient() {
  if (typeof window === 'undefined') return false;
  const native = window.__IKUAIZHAO_NATIVE__;
  return !!native && native.mode === 'electron';
}

// Vuex store 用顶层 import 拿；shim 不被任何 store 模块依赖，无循环依赖风险
import store from 'src/store';
import { processResumeList } from 'src/util/ihrPayloadAdapter';

/**
 * 触发"i 人事账号授权"弹框（MainLayout 渲染 IhrAuthModal 订阅这个 Vuex state）。
 */
function showIhrAuthModal() {
  try {
    store?.commit?.('setIhrAuthModalVisible', true);
  } catch (e) {
    console.warn('[electronShim] auth modal commit failed:', e);
  }
}

/**
 * 渲染端把 File / Blob 序列化为可走 IPC 的 ArrayBuffer + 元数据
 */
async function fileToTransfer(file) {
  if (!file) return null;
  if (typeof file.arrayBuffer !== 'function') {
    throw new Error('uploadFile 入参必须是 File 或 Blob');
  }
  return {
    arrayBuffer: await file.arrayBuffer(),
    name: file.name || 'upload.bin',
    mime: file.type || 'application/octet-stream'
  };
}

/**
 * 创建客户端模式下的 messenger（与 IframeMessenger 接口对齐）
 */
export function createElectronMessengerShim() {
  /** @type {Map<string, Function>} */
  const handlers = new Map();
  /** @type {object | null} */
  let cachedInit = readInitFromSession();

  const ihrBridge = window?.api?.ihrBridge;
  const tabs = window?.api?.tabs;

  function readInitFromSession() {
    try {
      const raw = sessionStorage.getItem(SS_KEY_INIT);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function writeInitToSession(payload) {
    try {
      sessionStorage.setItem(SS_KEY_INIT, JSON.stringify(payload));
    } catch (e) {
      console.warn('[electronShim] writeInitToSession failed:', e);
    }
  }

  function emit(type, data) {
    const cb = handlers.get(type);
    if (typeof cb === 'function') {
      try {
        cb(data, ELECTRON_CTX);
      } catch (e) {
        console.error(`[electronShim] handler '${type}' threw:`, e);
      }
    }
  }

  // ============= 公共接口 =============

  /**
   * 由 SSOLogin.vue 等首次拿到 deep link payload 的消费者调用，
   * 把"业务部分"灌进来，触发 init 事件 + 持久化
   */
  function injectInit(payload) {
    if (!payload || typeof payload !== 'object') return;
    cachedInit = {
      positionList: payload.positionList,
      positionIds: payload.positionIds,
      sysConfig: payload.sysConfig,
      ssoConfig: payload.ssoConfig,
      companyConfig: payload.companyConfig
    };
    writeInitToSession(cachedInit);
    emit('init', cachedInit);
  }

  function on(type, callback) {
    handlers.set(type, callback);
    if (type === 'init') {
      // 晚到的监听器自动补发（业务页面 onMounted 才注册时大概率走这条路径）
      // 三级 fallback：内存 cache → sessionStorage（本次会话）→ 持久化磁盘（跨次启动）
      const data = cachedInit ?? readInitFromSession();
      if (data) {
        cachedInit = data;
        Promise.resolve().then(() => emit('init', data));
      } else {
        // 内存 + sessionStorage 都没拿到 → 尝试读主进程持久化的 launcher 数据
        // 这是"用户直接启动客户端，没走 deep link"的场景
        void tryHydrateFromStoredLauncherData().then((restored) => {
          if (restored && handlers.has('init')) {
            emit('init', restored);
          }
        });
      }
    }
  }

  /**
   * 尝试从主进程持久化的 launcher 数据恢复 init payload。
   * 仅在本次会话从未拿到过 init（cachedInit/sessionStorage 都空）时触发。
   */
  async function tryHydrateFromStoredLauncherData() {
    try {
      const handover = window?.api?.handover;
      const stored = await handover?.getStoredLauncherData?.();
      const last = stored?.lastInitPayload;
      if (!last || typeof last !== 'object') return null;
      const restored = {
        positionList: last.positionList,
        positionIds: last.positionIds,
        sysConfig: last.sysConfig,
        ssoConfig: last.ssoConfig,
        companyConfig: last.companyConfig
      };
      cachedInit = restored;
      writeInitToSession(restored);
      console.log('[electronShim] hydrated init from stored launcher data');
      return restored;
    } catch (e) {
      console.warn('[electronShim] hydrate from stored launcher failed:', e);
      return null;
    }
  }

  function off(type) {
    handlers.delete(type);
  }

  /**
   * post 转 IPC 调用；返回与 IframeMessenger.post 一致的 { data } 形态
   */
  async function post(type, data) {
    switch (type) {
      case 'connect':
      case 'disconnect':
        return { data: null };

      case 'themeColor':
        // 客户端自带主题（D4），忽略；如需联动可改成 ihrBridge.getTheme()
        return { data: null };

      case 'iframe-back':
        try {
          await tabs?.goBack?.('home');
        } catch (e) {
          console.warn('[electronShim] iframe-back failed:', e);
        }
        return { data: null };

      case 'resumeList': {
        if (!ihrBridge) {
          console.error('[electronShim] window.api.ihrBridge missing');
          return { data: { code: -1, message: 'ihrBridge unavailable' } };
        }
        const action = data?.action;
        if (action !== 'assign-position' && action !== 'talent-pool') {
          console.warn('[electronShim] unknown resumeList action:', action);
          return { data: { code: -1, message: `unknown action: ${action}` } };
        }
        console.log(
          `[electronShim] resumeList → adapter.processResumeList(action=${action}, resumes=${(data?.resumeFile || []).length})`
        );
        try {
          // 通过 adapter 跑完整流程：
          //   1. 拉 channels map + talentPools（best-effort，失败不阻断）
          //   2. uploadFile × N 拿 fileId（best-effort，失败 fileId 留空）
          //   3. 组装符合 docs/07 §6.2 / §7 的 CandidateResumeAiManagerListCommand
          //   4. phase-1 noauth/addPools(去重) → phase-2 noauth/addPools(自动确认导入)
          // 详见 src/util/ihrPayloadAdapter.js
          const result = await processResumeList(data ?? {}, ihrBridge);
          console.log(
            `[electronShim] resumeList result: success=${result?.success} code=${result?.code ?? '-'} errorCode=${result?.errorCode ?? '-'} httpStatus=${result?.httpStatus ?? '-'} message=${result?.message ?? '-'}`
          );

          // 未登录 i 人事工作台 / 会话失效 → 弹"i 人事账号授权"对话框
          // 用户点弹框里"登录账号"按钮 → 走系统浏览器打开 manage 登录页
          // （MainLayout 渲染 IhrAuthModal，订阅 store.getters.getIhrAuthModalVisible）
          if (result?.errorCode === 'NOT_LOGGED_IN') {
            console.warn('[electronShim] manage not logged in, showing auth modal');
            try {
              showIhrAuthModal();
            } catch (e) {
              console.warn('[electronShim] showIhrAuthModal failed:', e);
            }
            return { data: result };
          }

          // 模拟 iframe 模式下父端 onConfirm 后回推 ihrSuccessIds 的语义
          // （让业务代码 iframeMsg.on('ihrSuccessIds') 监听器在客户端模式下也能触发）
          //
          // ⚠️ 真接入完整流程是"两次 addPools + 用户决策 modal"，当前 shim 只做单次直调，
          //    待 i 快招 SPA 移植 TalentPoolModal / 校验结果 Modal 后，这里改为只转发
          //    单次 API 调用，由 SPA 自己控制两次 addPools 的时序。
          if (result?.success && result.data) {
            const successPayload = {
              type: result.data.type,
              successResumeIds: result.data.successResumeIds,
              failRepeatResumeIds: result.data.failRepeatResumeIds,
              failOtherResumeIds: result.data.failOtherResumeIds
            };
            // 空 successResumeIds（mock 模式 / 真实校验阶段都可能为空）就不触发后续状态同步
            // 避免下游 POST /importResume 收到空数组报错
            const hasAnyResult =
              (successPayload.successResumeIds?.length || 0) +
                (successPayload.failRepeatResumeIds?.length || 0) +
                (successPayload.failOtherResumeIds?.length || 0) >
              0;
            if (hasAnyResult) {
              // 异步触发，让 post() 的 await 先 resolve
              Promise.resolve().then(() => emit('ihrSuccessIds', successPayload));
            }
          }
          return { data: result };
        } catch (e) {
          console.error('[electronShim] resumeList failed:', e);
          return { data: { code: -1, message: String(e?.message || e) } };
        }
      }

      default:
        console.warn('[electronShim] unknown post type:', type);
        return { data: null };
    }
  }

  function connect() {
    /* noop */
  }
  function disconnect() {
    /* noop */
  }
  function destroy() {
    handlers.clear();
  }

  return {
    // 与 IframeMessenger 同名 API（业务代码原样可用）
    on,
    off,
    post,
    connect,
    disconnect,
    destroy,
    // shim 独有：让 SSOLogin 等把 deep link payload 灌进来
    injectInit,
    // 直通：让消费者按需调用
    ihrBridge,
    isElectronShim: true
  };
}

export { isElectronClient };
