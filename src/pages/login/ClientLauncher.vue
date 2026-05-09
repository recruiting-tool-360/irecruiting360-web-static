<template>
  <div class="client-launcher">
    <div class="panel">
      <div class="logo" aria-hidden>IK</div>

      <!-- 等待 i 人事父页面通过 postMessage 推 init 数据 -->
      <template v-if="state === 'waiting-init'">
        <q-spinner color="primary" size="40px" class="q-mb-md" />
        <div class="title">正在准备启动数据</div>
        <div class="subtitle">
          正在与父页面建立连接，请稍候…
          <br />
          若长时间无响应，请刷新页面或确认是否在招聘工作台内打开。
        </div>
      </template>

      <!-- 正在唤起客户端 -->
      <template v-else-if="state === 'launching'">
        <q-spinner color="primary" size="40px" class="q-mb-md" />
        <div class="title">正在打开 i 快招客户端</div>
        <div class="subtitle">
          如果系统提示"是否打开 i 快招"，请点击允许；
          <br />
          客户端启动后会被本页确定性探测到，无需手动确认。
        </div>
        <!-- 读秒：让用户知道还在等，不会以为卡死 -->
        <div class="elapsed-tip">
          已等待 {{ elapsedSec }}s（每 0.25s 探测一次客户端状态），{{ Math.max(0, timeoutSec - elapsedSec) }}s 后判为未安装
        </div>
        <div class="actions">
          <q-btn flat color="grey-7" label="放弃等待" @click="handleCancelWait" />
        </div>
      </template>

      <!-- 唤起成功 -->
      <template v-else-if="state === 'succeeded'">
        <div class="success-icon" aria-hidden>✓</div>
        <div class="title">客户端已启动</div>
        <div class="subtitle">
          已切换到 i 快招客户端窗口，请在客户端内继续操作。
        </div>
        <div class="actions">
          <q-btn flat color="primary" label="重新唤起" @click="handleManualOpen" />
        </div>
      </template>

      <!-- 唤起失败：未安装 / 被拦截 / 内嵌 webview / 探测超时 -->
      <template v-else-if="state === 'missing'">
        <div class="error-icon" aria-hidden>!</div>
        <div class="title">未检测到 i 快招客户端</div>
        <div class="subtitle">
          {{ errorMsg || '探测端口 127.0.0.1:53531 没有响应。请确认已安装客户端并启动；若未安装，请下载。' }}
        </div>
        <div class="actions">
          <q-btn
            color="primary"
            label="重新尝试"
            :disable="!hasInitData"
            @click="handleManualOpen"
          />
          <q-btn
            color="primary"
            outline
            label="下载客户端"
            @click="handleDownload"
          />
        </div>

        <!-- 兜底：跳老 SSO 流程（在浏览器内继续，不依赖客户端） -->
        <!-- 仅当 hasInitData=true 时显示：父端有推 init 才能在浏览器内完成 SSO -->
        <div v-if="hasInitData" class="fallback">
          <a class="fallback-link" @click="handleFallbackToBrowser">
            在浏览器内继续（无需安装客户端）
          </a>
        </div>

        <div class="platform-tip">
          当前识别为：{{ osLabel }}
          <span v-if="isEmbedded">（内嵌浏览器无法唤起，请在系统浏览器中打开）</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * /client-launcher —— Electron 客户端唤起中转页
 *
 * 流程（i 人事新版 iframe 嵌入此 URL）：
 *   1. boot/iframe-messenger.js 已在 mount 阶段建立 IframeMessenger 与父页面（i 人事招聘工作台）的连接
 *   2. 父端 postMessage 'init' 带 payload（positionList / sysConfig / ssoConfig / companyConfig）
 *   3. 本页 onMounted 注册 iframeMsg.on('init', cb)，拿到 payload 后调 useClientLauncher.tryLaunch('sso', payload)
 *   4. tryLaunch 通过 fetch http://127.0.0.1:53531/__ikuaizhao/health 确定性探测：
 *      - 客户端已在跑 → 立即 succeeded（拉协议把窗口提到前台）
 *      - 客户端未在跑 → 触发 deep link → 每 250ms 轮询 /health → 命中即 succeeded
 *      - 8s 仍探测不到 → missing
 *      不再依赖 window.blur / visibilitychange 启发式（详见 useClientLauncher.js 注释）
 *
 * 几个关键边界：
 *   - 已经在 Electron 客户端里跑（isElectronClient() === true）：直接 push('/'), 避免套娃唤起
 *   - 浏览器直接打开本 URL（无父 iframe）：state 停在 waiting-init，30s 后变 missing 并提示
 *   - 钉钉/飞书等内嵌 webview：useClientLauncher 内部已直接判 missing
 *
 * 详见 docs/client-launcher-flow.md
 */
import { onMounted, onUnmounted, ref, computed, getCurrentInstance } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useClientLauncher } from 'src/hooks/useClientLauncher';
import { isElectronClient } from 'src/util/openChannelLoginUrl';
import {
  detectOS,
  osLabel as osLabelOf,
  isInsideEmbeddedWebview,
  CLIENT_DOWNLOAD_BASE
} from 'src/util/clientPlatform';

const router = useRouter();
const route = useRoute();
const { proxy } = getCurrentInstance();
const iframeMsg = proxy.$iframeMessenger;
const { tryLaunch } = useClientLauncher();

// ============= 状态 =============

/** @type {'waiting-init' | 'launching' | 'succeeded' | 'missing'} */
const state = ref('waiting-init');
const errorMsg = ref('');
const initPayload = ref(null);

// 读秒（launching 状态下显示已等待 / 剩余时间），与 useClientLauncher.onTick 对齐
const elapsedMs = ref(0);
const LAUNCH_TIMEOUT_MS = 8000; // 与 useClientLauncher 默认值保持一致；首次冷启动需要覆盖 dialog 阅读时间
const timeoutSec = Math.ceil(LAUNCH_TIMEOUT_MS / 1000);
const elapsedSec = computed(() => Math.floor(elapsedMs.value / 1000));

// 持有当前 tryLaunch 的句柄，供「我已打开 / 放弃等待」按钮调用
let currentLaunchHandle = null;

const isEmbedded = computed(() => isInsideEmbeddedWebview());
const osLabel = computed(() => osLabelOf());
const hasInitData = computed(() => !!initPayload.value);

const isMockMode = computed(() => route.query.mock === '1' || route.query.mock === 'true');

/**
 * 唤起后客户端要直达的 SPA 业务（intent）
 *  - 默认 'sso'（必经 SSO 登录页）
 *  - 'open-chat' / 'import-resume' 等需要主进程 KNOWN_ACTIONS 同步开放
 *  - 业务在客户端启动后从 sessionStorage('ikuaizhao:initPayload').intent 读取并分发
 */
const intent = computed(() => {
  const v = route.query.intent;
  if (typeof v === 'string' && v) return v;
  return 'sso';
});

let waitingTimer = null;

// ============= 唤起 =============

async function launchWithPayload(payload) {
  if (!payload?.ssoConfig) {
    state.value = 'missing';
    errorMsg.value = '启动数据不完整（缺少 ssoConfig），请刷新工作台后重试。';
    return;
  }

  state.value = 'launching';
  elapsedMs.value = 0;

  // 把 i 人事推过来的 init payload 直接丢给 deep link，
  // 决策 D10：positionList 不进 URL（URL 长度上限），在客户端启动后由 ihrBridge 自取。
  // intent 字段同步透传，让客户端 SPA 启动后能根据 intent 分发到对应业务模块
  const dlPayload = {
    intent: intent.value,
    ssoConfig: payload.ssoConfig,
    sysConfig: payload.sysConfig,
    companyConfig: payload.companyConfig,
    positionIds: Array.isArray(payload.positionList)
      ? payload.positionList.map((p) => p?.positionId).filter(Boolean)
      : payload.positionIds
  };

  try {
    const handle = tryLaunch(intent.value, dlPayload, {
      timeoutMs: LAUNCH_TIMEOUT_MS,
      onTick: (ms) => {
        elapsedMs.value = ms;
      }
    });
    currentLaunchHandle = handle;
    const ok = await handle.promise;
    currentLaunchHandle = null;
    state.value = ok ? 'succeeded' : 'missing';
    if (!ok) {
      errorMsg.value = isEmbedded.value
        ? '当前在内嵌浏览器中，无法唤起客户端，请用系统浏览器访问。'
        : '';
    }
  } catch (e) {
    console.error('[ClientLauncher] tryLaunch failed:', e);
    currentLaunchHandle = null;
    state.value = 'missing';
    errorMsg.value = e?.message || '唤起客户端时发生错误';
  }
}

// 用户在 missing/succeeded 状态点"重新尝试"
async function handleManualOpen() {
  if (!initPayload.value) return;
  await launchWithPayload(initPayload.value);
}

// launching 状态下用户点「放弃等待」：直接 resolve(false) → 进 missing 状态
function handleCancelWait() {
  currentLaunchHandle?.cancel?.();
}

function handleDownload() {
  const os = detectOS();
  const target = os === 'other' ? CLIENT_DOWNLOAD_BASE : `${CLIENT_DOWNLOAD_BASE}/?os=${os}`;
  window.open(target, '_blank');
}

/**
 * 客户端唤起失败时的兜底：把当前 init payload 暂存到 sessionStorage，
 * 跳到老的 /sso-login，由 SSOLogin.vue 入口 A 接管。
 *
 * 走完整的"浏览器内 iframe SSO"老流程（user 体验完全等同于客户端没出现之前），
 * 实现"老的东西不做减法，只是新增客户端"的兼容承诺。
 */
function handleFallbackToBrowser() {
  if (!initPayload.value) return;
  try {
    // 用 sessionStorage 把 payload 透传给 SSOLogin.vue（同 origin，可读）
    sessionStorage.setItem(
      'ikuaizhao:fallbackInitPayload',
      JSON.stringify(initPayload.value)
    );
  } catch (_e) {
    // ignore
  }
  // replace 而不是 push：避免用户点回退又回到 launcher 死循环
  void router.replace('/sso-login?from-launcher=1');
}

// ============= 生命周期 =============

/**
 * 开发期 mock：直接访问 /client-launcher?mock=1 时用一个测试 payload 自动唤起。
 * 解决"无父 iframe 推 init 时无法独立联调"的问题。
 *
 * intent 默认 sso，可通过 ?mock=1&intent=open-chat 切换。
 */
function buildMockPayload() {
  return {
    positionList: [
      { positionId: 'mock-pos-001', name: 'Mock 高级前端工程师 (HC001)' },
      { positionId: 'mock-pos-002', name: 'Mock 资深 Java 开发 (HC002)' }
    ],
    sysConfig: { color: '#1677ff' },
    companyConfig: { companyId: 'mock-company-001' },
    ssoConfig: {
      locale: 'zh-CN',
      userConfig: {
        tenantCode: 'company_a',
        apiKey: 'test_api_key_123',
        signature: '94a8f1478929d191c56fb42e1007cdfe',
        thirdPartyUserId: 'mock-user-001',
        userData: {
          username: 'mock-user',
          nickname: 'Mock 用户',
          email: 'mock@ihire365.com',
          phone: '13800138000',
          avatar: ''
        },
        extendData: {
          plan: 'PlanA',
          from: 'recruit-assistant',
          assignPositionAuth: true,
          talentPoolAuth: true,
          sendJdAuth: true
        }
      }
    }
  };
}

onMounted(() => {
  // 已在 Electron 客户端里跑：避免再套娃唤起，直接转主页
  if (isElectronClient()) {
    void router.replace('/');
    return;
  }

  // 开发期 mock 模式：用测试 payload 直接唤起，不等父 iframe 推 init
  if (isMockMode.value) {
    console.log('[ClientLauncher] mock mode — using test payload');
    const payload = buildMockPayload();
    initPayload.value = payload;
    void launchWithPayload(payload);
    return;
  }

  // 注册 init 监听器（与原 SSOLogin.vue 入口 A 等价）
  iframeMsg?.on?.('init', (data, context) => {
    if (context?.from && context.from !== 'ihr-recruit-assistant') {
      // 兼容老 from 名（可按需放开），目前只接 ihr-recruit-assistant
      console.warn('[ClientLauncher] ignore init from unknown source:', context.from);
      return Promise.resolve(false);
    }
    initPayload.value = data;
    void launchWithPayload(data);
    return Promise.resolve(true);
  });

  // 30s 内仍在 waiting-init → 视为父页面没推 init（用户直接访问 URL 或父端故障）
  waitingTimer = setTimeout(() => {
    if (state.value === 'waiting-init') {
      state.value = 'missing';
      errorMsg.value =
        '未收到启动数据。如果你是直接访问本页面，请从招聘工作台进入；或点击"下载客户端"。开发期可加 ?mock=1 测试唤起。';
    }
  }, 30000);
});

onUnmounted(() => {
  if (waitingTimer) {
    clearTimeout(waitingTimer);
    waitingTimer = null;
  }
  iframeMsg?.off?.('init');
});
</script>

<style scoped>
.client-launcher {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  padding: 24px;
}

.panel {
  width: 100%;
  max-width: 460px;
  padding: 36px 32px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.logo {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1677ff, #69b1ff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -1px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 24px;
  word-break: break-word;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 8px;
  flex-wrap: wrap;
}

.platform-tip {
  margin-top: 18px;
  font-size: 12px;
  color: #9ca3af;
}

.elapsed-tip {
  margin-top: 4px;
  margin-bottom: 16px;
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}

.subtitle .hint {
  color: #9ca3af;
}

.fallback {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #f3f4f6;
}

.fallback-link {
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.fallback-link:hover {
  color: #1677ff;
}

.success-icon,
.error-icon {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}
.success-icon {
  background: #10b981;
}
.error-icon {
  background: #f59e0b;
}
</style>
