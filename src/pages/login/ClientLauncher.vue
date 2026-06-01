<template>
  <!--
    /client-launcher
    单一入口，3 个 UI 状态：
      • waiting-init   等 i 人事父页推 init payload（30s 超时降级到 intro）
      • intro          默认下载引导页（包含 deep link 唤起入口）
      • completed      用户点了下载按钮后立刻进入：浏览器接管下载（自带下载栏显示进度），
                      本页面后台轮询 127.0.0.1:53531 健康端口探测客户端是否在跑

    deep link 唤起（探测 127.0.0.1:53531）作为后台静默任务跑，
    不再有专门的"正在打开 i 快招客户端"UI；唤起成功焦点切走，失败回 intro 并显示提示。

    设计参考 UI 项目 ihraisaas/src/components/AIAssistant/ClientGuide.tsx
  -->
  <div class="cg-shell">
    <div class="cg-card">
      <!-- ========== Header：渐变 + 3 图标 ========== -->
      <div class="cg-header">
        <div class="cg-header-pattern" />
        <div class="cg-header-icons">
          <div class="cg-header-icon-frosted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--lg">
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <line x1="8" x2="16" y1="21" y2="21" />
              <line x1="12" x2="12" y1="17" y2="21" />
            </svg>
          </div>
          <div class="cg-header-icon-globe">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--sm">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <div class="cg-header-icon-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--lg cg-svg--primary">
              <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- ========== Body：状态机切换 ========== -->
      <div class="cg-body">
        <Transition name="cg-step" mode="out-in">
          <!-- ===== waiting-init：等父页推 init payload（短暂态） ===== -->
          <div v-if="state === 'waiting-init'" key="waiting-init" class="cg-step-status">
            <div class="cg-spinner-bg">
              <SvgSpinner />
            </div>
            <h3 class="cg-title cg-title--sm">正在准备启动数据</h3>
            <p class="cg-desc cg-desc--sm">
              正在与父页面建立连接，请稍候…
            </p>
          </div>

          <!-- ===== intro：默认下载引导页 ===== -->
          <div v-else-if="state === 'intro'" key="intro" class="cg-step-intro">
            <h2 class="cg-title">启用 AI 聚合搜索客户端</h2>
            <p class="cg-desc">
              AI 招聘助理现已升级为独立客户端。为了保障全网各平台的实时深度聚合及安全算法推荐，请安装"AI 聚合搜索客户端"并在本地运行以打通数据通路。
            </p>

            <div class="cg-channels">
              <div v-for="ch in CHANNELS" :key="ch.name" class="cg-channel">
                <div class="cg-channel-icon" :style="{ background: ch.color }">
                  {{ ch.name.substring(0, 1) }}
                </div>
                <span class="cg-channel-label">{{ ch.name }}</span>
              </div>
            </div>

            <div class="cg-download-grid">
              <button class="cg-btn-win" @click="handleStartDownload('win')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round"
                     class="cg-svg cg-svg--md cg-svg--primary-light">
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                  <line x1="8" x2="16" y1="21" y2="21" />
                  <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
                <span>下载 Windows 版本</span>
                <span class="cg-btn-subtext">.exe 安装程序</span>
              </button>
              <button
                class="cg-btn-mac"
                :disabled="!macAvailable"
                :title="macAvailable ? '' : 'Mac 版本即将开放'"
                @click="macAvailable && (isMacModalOpen = true)"
              >
                <SvgApple class="cg-svg cg-svg--md" />
                <span>下载 Mac 客户端</span>
                <span class="cg-btn-subtext">
                  {{ macAvailable ? '.dmg 磁盘映像' : '即将开放' }}
                </span>
              </button>
            </div>

            <div class="cg-divider">
              <button
                class="cg-btn-launch"
                :disabled="!canRelaunch || isLaunching"
                :title="canRelaunch ? '' : '当前在内嵌浏览器或缺少启动数据'"
                @click="handleManualOpen"
              >
                <SvgZap v-if="!isLaunching" />
                <SvgSpinner v-else class="cg-svg cg-svg--xs cg-svg--primary cg-spinner" />
                <template v-if="isLaunching">正在唤起客户端…</template>
                <template v-else>{{ hasInitData ? '打开 i快招 客户端' : '打开已安装的 i快招 客户端' }}</template>
              </button>
            </div>

            <!-- 错误提示（30s 没收到 init / 探测失败等） -->
            <div v-if="errorMsg" class="cg-error-msg">{{ errorMsg }}</div>
            <div class="cg-platform-tip">
              当前识别为：{{ osLabel }}
              <span v-if="isEmbedded">（内嵌浏览器无法唤起，请在系统浏览器中打开）</span>
            </div>
          </div>

          <!-- ===== completed：下载已开始 → 真探测客户端进程 ===== -->
          <div v-else-if="state === 'completed'" key="completed" class="cg-step-completed">
            <!-- 探测到客户端在跑：真"已启动" -->
            <template v-if="clientDetected">
              <div class="cg-success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--xxl cg-svg--green">
                  <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
              </div>
              <h3 class="cg-title cg-title--md">检测到 i 快招客户端已在运行</h3>
              <p class="cg-desc cg-desc--md">点击下方按钮切换到客户端窗口继续操作。</p>
              <button class="cg-btn-primary" :disabled="isLaunching" @click="handleManualOpen">
                <SvgZap v-if="!isLaunching" />
                <SvgSpinner v-else class="cg-svg cg-svg--xs cg-svg--primary cg-spinner" />
                {{ isLaunching ? '切换中…' : '切换到客户端' }}
              </button>
              <!-- 次要：回到下载页（用户想换平台 / 重新下载时） -->
              <button type="button" class="cg-btn-link" @click="handleBackToIntro">
                重新下载 / 选择其它版本
              </button>
            </template>

            <!-- 还没探测到客户端：等待用户手动安装 -->
            <template v-else>
              <div class="cg-pending-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--xxl cg-svg--amber">
                  <path d="M12 2v4" />
                  <path d="m16.2 7.8 2.9-2.9" />
                  <path d="M18 12h4" />
                  <path d="m16.2 16.2 2.9 2.9" />
                  <path d="M12 18v4" />
                  <path d="m4.9 19.1 2.9-2.9" />
                  <path d="M2 12h4" />
                  <path d="m4.9 4.9 2.9 2.9" />
                </svg>
              </div>
              <h3 class="cg-title cg-title--md">安装包已下载</h3>
              <p class="cg-desc cg-desc--md">
                请打开下载目录，{{ installHint }}。安装完成后本页面会自动检测到客户端，也可点击下方按钮手动启动。
              </p>
              <button class="cg-btn-primary" :disabled="isLaunching" @click="handleManualOpen">
                <SvgZap v-if="!isLaunching" />
                <SvgSpinner v-else class="cg-svg cg-svg--xs cg-svg--primary cg-spinner" />
                {{ isLaunching ? '正在尝试唤起客户端…' : '我已完成安装，立即启动' }}
              </button>
              <!-- 次要：回到下载页（用户下错版本 / 想换平台 / 想重新下载时） -->
              <button type="button" class="cg-btn-link" @click="handleBackToIntro">
                重新下载 / 选择其它版本
              </button>
              <div class="cg-probe-hint">
                <span class="cg-probe-dot" />
                正在自动检测客户端启动状态…
              </div>
            </template>
          </div>
        </Transition>
      </div>

      <!-- ========== Mac 芯片选择弹框 ========== -->
      <Teleport to="body">
        <Transition name="cg-mac-modal">
          <div v-if="isMacModalOpen" class="cg-mac-overlay">
            <div class="cg-mac-backdrop" @click="isMacModalOpen = false" />
            <div class="cg-mac-modal">
              <button class="cg-mac-close" aria-label="关闭" @click="isMacModalOpen = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--md">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>

              <div class="cg-mac-inner">
                <div class="cg-mac-header">
                  <h2 class="cg-mac-title">选择适合你 Mac 的版本</h2>
                  <p class="cg-mac-desc">
                    下载适合你 MAC 芯片的桌面版会让使用体验更加顺畅。如果不确定你的 Mac 使用哪个芯片类型，可直接下载
                    <span class="cg-mac-emph">Intel 芯片版</span>，确保正常使用。
                  </p>
                </div>

                <div class="cg-mac-guide">
                  <h3 class="cg-mac-guide-title">如何确定 Mac 电脑芯片类型？</h3>

                  <div class="cg-mac-steps">
                    <!-- step 1 -->
                    <div class="cg-mac-step">
                      <div class="cg-mac-step-bar"><span /><span /><span /></div>
                      <div class="cg-mac-step-content">
                        <SvgApple class="cg-svg cg-svg--xxl cg-svg--neutral-300" />
                        <div class="cg-mac-step-lines">
                          <div class="cg-mac-line cg-mac-line--full" />
                          <div class="cg-mac-line cg-mac-line--3of4" />
                          <div class="cg-mac-line cg-mac-line--1of2" />
                        </div>
                      </div>
                      <div class="cg-mac-step-tag">Step 1：点击左上角  图标</div>
                    </div>

                    <div class="cg-mac-arrow">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round" class="cg-svg cg-svg--md cg-svg--neutral-200">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>

                    <!-- step 2: intel -->
                    <div class="cg-mac-step">
                      <div class="cg-mac-step-strip" />
                      <div class="cg-mac-step-content cg-mac-step-content--chip">
                        <div class="cg-mac-os-name">macOS Monterey</div>
                        <div class="cg-mac-version cg-mac-version--intel"><span>12.1</span></div>
                        <div class="cg-mac-chip-tag cg-mac-chip-tag--intel">处理器：Intel Core i5</div>
                      </div>
                      <div class="cg-mac-step-tag">Intel 芯片示例</div>
                    </div>

                    <div class="cg-mac-or">或</div>

                    <!-- step 3: apple -->
                    <div class="cg-mac-step">
                      <div class="cg-mac-step-strip" />
                      <div class="cg-mac-step-content cg-mac-step-content--chip">
                        <div class="cg-mac-os-name">macOS Monterey</div>
                        <div class="cg-mac-version cg-mac-version--apple"><span>12.2.1</span></div>
                        <div class="cg-mac-chip-tag cg-mac-chip-tag--apple">芯片：Apple M1 Pro</div>
                      </div>
                      <div class="cg-mac-step-tag">Apple 芯片示例</div>
                    </div>
                  </div>

                  <div class="cg-mac-instructions">
                    <div class="cg-mac-instr-row">
                      <span class="cg-mac-instr-num">1</span>
                      <span>
                        点击左上角
                        <span class="cg-mac-instr-link">图标</span>，选择
                        <span class="cg-mac-instr-strong">关于本机</span>
                      </span>
                    </div>
                    <div class="cg-mac-instr-row">
                      <span class="cg-mac-instr-num">2</span>
                      <span>
                        在概览页面的
                        <span class="cg-mac-instr-strong">处理器 / 芯片</span>
                        信息中，可以看到芯片类型是 Intel 还是 Apple
                      </span>
                    </div>
                  </div>
                </div>

                <div class="cg-mac-actions">
                  <button class="cg-btn-primary cg-btn-primary--lg" @click="handleStartDownload('mac-intel')">
                    下载 Intel 芯片版
                  </button>
                  <button class="cg-btn-outline cg-btn-outline--lg" @click="handleStartDownload('mac-apple')">
                    下载 Apple 芯片版
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<script setup>
/**
 * /client-launcher —— Electron 客户端唤起 + 下载引导（合并入口）
 *
 * UI 状态机（3 态）：
 *   waiting-init  iframe 父页未推 init payload，spinner 等（30s 超时降级到 intro）
 *   intro         默认下载引导页（也是唤起失败 / 等待父页超时的兜底页）
 *   completed     用户点了下载按钮：浏览器接管下载（自带下载栏），
 *                 本页面后台每 2s 探测客户端进程，探到就切到"已启动"
 *
 * deep link 唤起作为**后台静默任务**跑（isLaunching 标识）：
 *   • 成功 → 客户端窗口被推到前台，本页焦点切走，用户看不到状态变化
 *   • 失败 → 自动回到 intro 并在 errorMsg 里提示
 *   • UI 上"打开客户端"按钮在 launching 期间显示 spinner + disabled，不需要专门页面
 *
 * 业务接入：
 *   • iframe 父页（i 人事招聘工作台）通过 IframeMessenger 推 'init' 事件
 *   • useClientLauncher.tryLaunch 走 deep link → /__ikuaizhao/health 轮询
 *   • 在 Electron 客户端里访问 → 立即 router.replace('/') 避免套娃
 *
 * URL query 参数：
 *   • ?mock=1           开发期 mock，用测试 payload 自动唤起
 *   • ?intent=open-chat 进入客户端后直达哪个业务（默认 sso）
 *
 * 详见 docs/client-launcher-flow.md
 */
import { onMounted, onUnmounted, ref, computed, getCurrentInstance, h } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useClientLauncher, probeClient } from 'src/hooks/useClientLauncher';
import { isElectronClient } from 'src/util/openChannelLoginUrl';
import {
  detectOS,
  osLabel as osLabelOf,
  isInsideEmbeddedWebview
} from 'src/util/clientPlatform';

const router = useRouter();
const route = useRoute();
const { proxy } = getCurrentInstance();
const iframeMsg = proxy.$iframeMessenger;
const { tryLaunch } = useClientLauncher();

// ============ 渠道展示用 ============

const CHANNELS = [
  { name: '智联招聘', color: '#3b82f6' },
  { name: '前程无忧', color: '#f97316' },
  { name: 'BOSS直聘', color: '#14b8a6' }
  // 猎聘暂未支持，后续接入：{ name: '猎聘', color: '#2563eb' }
];

// ============ 下载链接 ============

// 客户端发版渠道（决定 ClientLauncher 下载链接走哪个 COS 目录 + 文件名前缀）：
//   - 'release' (默认)  → ikuaizhao/        + "i快招"      （生产）
//   - 'qa2'             → ikuaizhao-qa2/    + "i快招 QA2"  （非生产）
// 文件名前缀必须跟 electron/electron-builder*.yml 的 productName 保持一致
// （electron-builder artifactName 模板：${productName}-${version}-${arch}.${ext}）。
//
// 渠道判定优先级（高 → 低）：
//   1. VUE_APP_RELEASE_CHANNEL —— CI 显式指定（如 export VUE_APP_RELEASE_CHANNEL=qa2）
//   2. VUE_APP_ENV             —— CI 部署环境标识（test/qa/sit/staging → qa2；production → release）
//   3. VUE_APP_API_BASE_URL    —— 兜底按 API 域名反推
//   4. NODE_ENV === 'development' —— 本地 `quasar dev` 时（production build 时 NODE_ENV
//      会被 vite 强制覆盖成 'production'，仅 dev 时此判定生效，让本地联调默认走 qa2 包）
//   5. 'release'               —— 最终默认值
function inferChannelFromEnv() {
  const env = (process.env.VUE_APP_ENV || '').toLowerCase();
  if (env) {
    if (env === 'production' || env === 'prod' || env === 'release') return 'release';
    // test / qa / qa2 / sit / staging / stg / dev / development → 非生产，走 qa2 包
    return 'qa2';
  }
  const api = (process.env.VUE_APP_API_BASE_URL || '').toLowerCase();
  if (/(test|qa|sit|stg|staging|dev)\.ihire365/.test(api)) return 'qa2';
  // 本地 `quasar dev` 模式（vite production build 时 NODE_ENV 会被强制 'production'）
  if (process.env.NODE_ENV === 'development') return 'qa2';
  return 'release';
}
const RELEASE_CHANNEL =
  process.env.VUE_APP_RELEASE_CHANNEL || inferChannelFromEnv();
const CHANNEL_CONFIG = {
  release: {
    base: 'http://download.ihr360.com/ikuaizhao',
    productName: 'i快招'
  },
  qa2: {
    base: 'http://download.ihr360.com/ikuaizhao-qa2',
    productName: 'i快招 QA2'
  }
};
const _ch = CHANNEL_CONFIG[RELEASE_CHANNEL] || CHANNEL_CONFIG.release;
const DOWNLOAD_BASE = _ch.base;
const PRODUCT_NAME = _ch.productName;
console.log(`[ClientLauncher] 当前发版渠道=${RELEASE_CHANNEL} | base=${DOWNLOAD_BASE} | productName=${PRODUCT_NAME}`);

// 下载链接是 ref，启动时去 CDN 拉 latest.yml / latest-mac.yml 提取真实 version。
// 拉之前先用 fallback 1.0.0 兜底（保证用户即使 CDN 抽风也能看到一个可用链接）。
// publish-cos 会把这两个 yml 文件跟 dmg/exe 一起发，所以 yml 永远跟最新包同步。
//
// 文件名约定与 electron-builder.yml 的 dmg.artifactName / nsis.artifactName 对齐：
//   ${productName}-${version}-${arch}.${ext}
const FALLBACK_VERSION = '1.0.0';
function buildDownloadUrls(version) {
  return {
    win: `${DOWNLOAD_BASE}/${PRODUCT_NAME}-${version}-setup.exe`,
    'mac-intel': `${DOWNLOAD_BASE}/${PRODUCT_NAME}-${version}-x64.dmg`,
    'mac-apple': `${DOWNLOAD_BASE}/${PRODUCT_NAME}-${version}-arm64.dmg`
  };
}
const DOWNLOAD_URLS = ref(buildDownloadUrls(FALLBACK_VERSION));
const clientVersion = ref(FALLBACK_VERSION);

/**
 * 拉 electron-updater 的 latest.yml / latest-mac.yml 解析出最新 version。
 *
 * yml 格式（electron-builder 生成）：
 *   version: 1.0.7
 *   files:
 *     - url: i快招 QA2-1.0.7-arm64.dmg
 *       sha512: ...
 *   path: i快招 QA2-1.0.7-arm64.dmg
 *   sha512: ...
 *   releaseDate: '...'
 *
 * 简单 regex 提 version 字段就够（不需要装 yaml 库）。
 * 解析失败 / CORS 失败 → 静默 fallback 到 hardcoded 1.0.0，不影响其它逻辑。
 *
 * ⚠️ CORS 要求：CDN（download.ihr360.com）必须给 yml 文件设
 *    `Access-Control-Allow-Origin: *`，否则前端 fetch 跨域被拦。
 */
async function fetchLatestVersion() {
  // Windows 用 latest.yml，macOS 用 latest-mac.yml；两个文件 version 字段一般相同（一起发布的）
  // 这里取 mac 那份，没拿到再 fallback win 那份
  const candidates = [`${DOWNLOAD_BASE}/latest-mac.yml`, `${DOWNLOAD_BASE}/latest.yml`];
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) continue;
      const text = await resp.text();
      const m = text.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m);
      if (m && m[1]) {
        console.log(`[ClientLauncher] fetchLatestVersion ok url=${url} version=${m[1]}`);
        return m[1];
      }
    } catch (e) {
      console.warn(`[ClientLauncher] fetchLatestVersion fail url=${url}:`, e?.message || e);
    }
  }
  return null;
}

function isMacAvailable() {
  return !!(DOWNLOAD_URLS.value['mac-intel'] || DOWNLOAD_URLS.value['mac-apple']);
}

// ============ 状态 ============

/** @type {'waiting-init' | 'intro' | 'downloading' | 'completed'} */
const state = ref('waiting-init');
const errorMsg = ref('');
const initPayload = ref(null);

// 是否正在后台唤起客户端（用于"打开客户端"按钮的 spinner+disabled 状态）
const isLaunching = ref(false);
const LAUNCH_TIMEOUT_MS = 8000;

/** @type {'win' | 'mac-intel' | 'mac-apple' | null} */
const selectedPlatform = ref(null);
const isMacModalOpen = ref(false);

// completed 状态下：是否探测到客户端已在跑（每 2s 跑一次 probeClient）
const clientDetected = ref(false);

let currentLaunchHandle = null;
let waitingTimer = null;
let probeTimer = null;

// ============ 计算属性 ============

const isEmbedded = computed(() => isInsideEmbeddedWebview());
const osLabel = computed(() => osLabelOf());
const hasInitData = computed(() => !!initPayload.value);
const canRelaunch = computed(() => !isEmbedded.value);
const isMockMode = computed(() => route.query.mock === '1' || route.query.mock === 'true');
const macAvailable = computed(() => isMacAvailable());
const installHint = computed(() => {
  if (selectedPlatform.value === 'win') return '双击 .exe 安装程序按提示完成安装';
  if (selectedPlatform.value?.startsWith('mac')) {
    return '双击 .dmg 镜像，将 i 快招拖到「应用程序」即可';
  }
  return '运行下载的安装包完成安装';
});

/**
 * 唤起后客户端要直达的 SPA 业务（intent）
 *   - 默认 'sso'（必经 SSO 登录页）
 *   - 'open-chat' / 'import-resume' 等需要主进程 KNOWN_ACTIONS 同步开放
 *   - 用户从 intro 直接点"打开客户端"且无 init 时，传 'open' 走轻量 deep link
 */
const intent = computed(() => {
  const v = route.query.intent;
  if (typeof v === 'string' && v) return v;
  return 'sso';
});

// ============ 探测 i 人事 manage 父页 origin ============

/**
 * 客户端模式下"加入人才库/分配职位"等业务调用需要知道 i 人事 manage 系统的 URL，
 * 才能用 ses.fetch + cookie 直接调网关。
 *
 * launcher 跑在 iframe 里（父页 = i 人事 manage），从下面几条线索探测父页 origin：
 *   1. window.location.ancestorOrigins[0]    （Chrome/Edge 支持，最准）
 *   2. document.referrer                     （所有浏览器，常用）
 *   3. 没拿到就返回 undefined，客户端走默认值（qa2 / vip 兜底）
 *
 * 返回 origin（含协议），如 'https://qa2-vip.ihr360.com'
 */
function detectIhrManageOrigin() {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.ancestorOrigins) {
      const ao = window.location.ancestorOrigins;
      if (ao && ao.length > 0) {
        return ao[0];
      }
    }
  } catch (_e) {
    /* ignore */
  }
  try {
    if (typeof document !== 'undefined' && document.referrer) {
      const u = new URL(document.referrer);
      return u.origin;
    }
  } catch (_e) {
    /* ignore */
  }
  return undefined;
}

/**
 * 通过 postMessage 让 i 人事 manage 父页代调 client/launch 拿 accessToken。
 *
 * 为什么不在 iframe 里直接 fetch（旧方案）？
 *   - launcher iframe 跑在 i 快招 SPA 域（如 http://localhost:8080 / https://login.ihire365.com）
 *   - manage 后端在另一个域（如 http://localhost:5001 / https://qa2-vip.ihr360.com）
 *   - 浏览器跨域 + credentials:'include' 要求后端配 Access-Control-Allow-Origin: <iframe-origin>
 *     + Allow-Credentials: true，未配会被 CORS 拦截
 *   - 让父页代调：父页和 manage 后端同源，cookies 自动带，零 CORS 风险
 *
 * 协议：iframe → parent 发 'request-launch-token'，parent handler 调
 *   `POST /gateway/recruit/api/candidate/AiManager/client/launch` 后把结果 return 回来
 *   （IframeMessenger 自动 wrap 成 isResponse:true 的回包）
 *
 * 父页需要在 ihr360-recruit-static 的 RecruitAssistant.watchMessage 里加：
 *   messenger.on('request-launch-token', async () => {
 *     const r = await fetch('/gateway/recruit/api/candidate/AiManager/client/launch', {
 *       method: 'POST', credentials: 'include',
 *       headers: { 'Content-Type': 'application/json' }, body: '{}'
 *     });
 *     const j = await r.json();
 *     const body = j?.data ?? j;
 *     return {
 *       accessToken: body?.accessToken,
 *       accessTokenExpireAt: body?.accessTokenExpireAt,
 *       tokenParamName: body?.tokenParamName || 'accessToken'
 *     };
 *   });
 *
 * 详见 docs/07-ihr-client-usage.md §3 + docs/client-launcher-flow.md。
 *
 * @returns {Promise<null | { accessToken: string, accessTokenExpireAt?: string, tokenParamName?: string }>}
 */
async function tryFetchAccessToken() {
  if (!iframeMsg || typeof iframeMsg.post !== 'function') {
    console.warn('[ClientLauncher] iframeMsg.post unavailable, skip launch token');
    return null;
  }
  try {
    const res = await iframeMsg.post('request-launch-token', {});
    // IframeMessenger 把 handler 的 return 值包成 { data: <result> }
    const body = res?.data;
    if (body?.error) {
      console.warn('[ClientLauncher] parent reported launch error:', body.error);
      return null;
    }
    if (!body || !body.accessToken) {
      console.warn(
        '[ClientLauncher] request-launch-token returned empty token (父页 handler 未注册 / 未登录 / 接口失败)'
      );
      return null;
    }
    console.log(
      `[ClientLauncher] got accessToken via postMessage (expireAt=${body.accessTokenExpireAt})`
    );
    return {
      accessToken: body.accessToken,
      accessTokenExpireAt: body.accessTokenExpireAt,
      tokenParamName: body.tokenParamName || 'accessToken'
    };
  } catch (e) {
    // 常见原因：父页没注册 handler / 15s 超时 / 父页 fetch 失败
    console.warn('[ClientLauncher] request-launch-token failed:', e?.message || e);
    return null;
  }
}

// ============ 唤起逻辑（后台静默执行） ============

/**
 * 在后台尝试唤起客户端：
 *   • UI 立刻切到 intro（除非已经在 downloading / completed 等下载流程）
 *   • isLaunching=true → "打开客户端"按钮显示 spinner + disabled
 *   • 成功：客户端窗口拿到焦点，本页焦点切走，用户看不到
 *   • 失败：errorMsg 显示提示，按钮恢复
 */
async function launchWithPayload(payload) {
  if (payload && !payload.ssoConfig) {
    state.value = 'intro';
    errorMsg.value = '启动数据不完整（缺少 ssoConfig），请刷新工作台后重试。';
    return;
  }

  // 切到 intro 状态显示下载页（如果当前还在 waiting-init），让用户立刻看到下载入口
  // 不切到 'launching' 状态（已废弃）；唤起进度由 isLaunching 标识
  if (state.value === 'waiting-init') {
    state.value = 'intro';
  }
  isLaunching.value = true;
  errorMsg.value = '';

  // 让 manage 父页代调 client/launch 换 accessToken（zero CORS）。
  // 决策：放弃 dumpClientSession + 客户端复用 SESSION cookie 的旧方案，
  //      改用后端签发的 JWT accessToken 通过 deep link 传到客户端，由客户端调
  //      /candidate/AiManager/client/noauth/** 系列包装接口（详见 docs/07-ihr-client-usage.md）。
  //
  // 拿不到也不影响主流程（父页 handler 未注册 / 用户未登录 / 接口失败都会返回 null），
  // 后续 ihrBridge 调用会得到 errorCode='NOT_LOGGED_IN' → 弹 IhrAuthModal 引导用户
  // 回到招聘工作台触发新一轮 client/launch。
  const manageOrigin = detectIhrManageOrigin();
  const tokenInfo = await tryFetchAccessToken();

  const dlPayload = payload
    ? {
        intent: intent.value,
        ssoConfig: payload.ssoConfig,
        sysConfig: payload.sysConfig,
        companyConfig: payload.companyConfig,
        positionIds: Array.isArray(payload.positionList)
          ? payload.positionList.map((p) => p?.positionId).filter(Boolean)
          : payload.positionIds,
        ihrManageUrl: manageOrigin,
        // accessToken / accessTokenExpireAt 由客户端主进程 ihrBridge 接收，
        // 所有 /candidate/AiManager/client/noauth/** 调用都会自动拼 ?accessToken=
        ...(tokenInfo
          ? {
              accessToken: tokenInfo.accessToken,
              accessTokenExpireAt: tokenInfo.accessTokenExpireAt,
              tokenParamName: tokenInfo.tokenParamName
            }
          : {})
      }
    : {
        intent: 'open',
        ihrManageUrl: manageOrigin,
        ...(tokenInfo
          ? {
              accessToken: tokenInfo.accessToken,
              accessTokenExpireAt: tokenInfo.accessTokenExpireAt,
              tokenParamName: tokenInfo.tokenParamName
            }
          : {})
      };

  try {
    const handle = tryLaunch(dlPayload.intent || 'sso', dlPayload, {
      timeoutMs: LAUNCH_TIMEOUT_MS
    });
    currentLaunchHandle = handle;
    const ok = await handle.promise;
    currentLaunchHandle = null;
    isLaunching.value = false;
    if (!ok) {
      errorMsg.value = isEmbedded.value
        ? '当前在内嵌浏览器中，无法唤起客户端，请用系统浏览器访问。'
        : '未检测到 i 快招客户端，请确认已安装；如未安装请下载。';
    }
    // 成功时不显示任何提示——焦点已切到客户端窗口
  } catch (e) {
    console.error('[ClientLauncher] tryLaunch failed:', e);
    currentLaunchHandle = null;
    isLaunching.value = false;
    errorMsg.value = e?.message || '唤起客户端时发生错误';
  }
}

// intro 状态下点"打开 i快招 客户端"
async function handleManualOpen() {
  await launchWithPayload(initPayload.value);
}

/**
 * completed 态下点"重新下载 / 选择其它版本"：回到 intro，让用户重新选平台/重下载。
 *
 * 不停 probe —— 探测器仍在后台跑，万一用户在别处装好客户端，回到 intro 还能继续走唤起。
 * 不清 errorMsg —— 让用户看到为何被卡在 completed（如果之前有 launch 错误）。
 */
function handleBackToIntro() {
  state.value = 'intro';
}

// ============ 下载流程（来自 ClientGuide UI） ============

/** 触发浏览器原生下载 */
function triggerNativeDownload(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// completed 状态下每 2s 探测一次客户端进程
// 探测命中 → clientDetected=true，UI 切到"客户端已启动"
// 持续探测，方便用户关闭客户端后回来再启动
function startClientHealthProbe() {
  stopClientHealthProbe();
  // 立即探测一次（用户可能在下载前就装好了）
  void doProbe();
  probeTimer = setInterval(doProbe, 2000);
}

function stopClientHealthProbe() {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

async function doProbe() {
  const info = await probeClient();
  clientDetected.value = !!info;
}

/**
 * 触发下载：
 *   • 直接用浏览器原生 <a download>，浏览器自带下载栏会显示真实进度
 *   • 点击后立即进 completed 状态（橙色"等待安装"+ 真客户端探测）
 *   • 不再做假进度条——浏览器跨域 fetch 拿真进度需要 CORS，且 fetch+Blob 会
 *     把整个文件读进内存（400MB dmg 可能 OOM）。让浏览器接管下载是最稳妥的方案。
 */
function handleStartDownload(platform) {
  selectedPlatform.value = platform;
  isMacModalOpen.value = false;

  const url = DOWNLOAD_URLS.value[platform];
  if (!url) {
    console.warn('[ClientLauncher] no download url for platform:', platform);
    return;
  }

  const fileName = url.split('/').pop();
  triggerNativeDownload(url, fileName);

  // 立即进 completed，启动客户端健康探测
  errorMsg.value = '';
  state.value = 'completed';
  startClientHealthProbe();
}

// ============ Mock 测试用 ============

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

// ============ 生命周期 ============

onMounted(() => {
  // 已在 Electron 客户端里跑 → 直接走主页
  if (isElectronClient()) {
    void router.replace('/');
    return;
  }

  // 异步拉 CDN latest yml 拿最新 version 更新 DOWNLOAD_URLS
  // 失败时保留 fallback 1.0.0 不影响其它流程
  void (async () => {
    const v = await fetchLatestVersion();
    if (v) {
      clientVersion.value = v;
      DOWNLOAD_URLS.value = buildDownloadUrls(v);
      console.log(`[ClientLauncher] DOWNLOAD_URLS 已更新到 version=${v}`);
    } else {
      console.warn(`[ClientLauncher] 没拉到最新 version，保留 fallback=${FALLBACK_VERSION}`);
    }
  })();

  // 开发期 mock：用测试 payload 直接唤起
  if (isMockMode.value) {
    console.log('[ClientLauncher] mock mode — using test payload');
    const payload = buildMockPayload();
    initPayload.value = payload;
    void launchWithPayload(payload);
    return;
  }

  // 直接访问 /client-launcher（无 iframe 父页）→ 不等了，立刻进 intro
  // 通过 referrer 简单判定：iframe 内访问会有非空且和当前 host 不同的 referrer
  const insideIframe = window.self !== window.top;
  if (!insideIframe) {
    state.value = 'intro';
    errorMsg.value = '';
    return;
  }

  // 注册 init 监听
  iframeMsg?.on?.('init', (data, context) => {
    if (context?.from && context.from !== 'ihr-recruit-assistant') {
      console.warn('[ClientLauncher] ignore init from unknown source:', context.from);
      return Promise.resolve(false);
    }
    initPayload.value = data;
    void launchWithPayload(data);
    return Promise.resolve(true);
  });

  // 30s 仍在 waiting-init → 视为父页面没推 init，降级到 intro
  waitingTimer = setTimeout(() => {
    if (state.value === 'waiting-init') {
      state.value = 'intro';
      errorMsg.value = '未收到启动数据。若你是直接访问本页面，请下载客户端或从招聘工作台进入。';
    }
  }, 30000);
});

onUnmounted(() => {
  if (waitingTimer) {
    clearTimeout(waitingTimer);
    waitingTimer = null;
  }
  stopClientHealthProbe();
  iframeMsg?.off?.('init');
});

// ============ 子组件：复用 SVG（避免重复定义） ============

const SvgSpinner = {
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: 'cg-svg cg-svg--xl cg-svg--primary cg-spinner'
      },
      [h('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' })]
    );
  }
};

const SvgZap = {
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: 'cg-svg cg-svg--xs'
      },
      [
        h('path', {
          d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'
        })
      ]
    );
  }
};

const SvgApple = {
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: this.$attrs.class || 'cg-svg cg-svg--md'
      },
      [
        h('path', {
          d: 'M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z'
        }),
        h('path', { d: 'M10 2c1 .5 2 2 2 5' })
      ]
    );
  },
  inheritAttrs: false
};
</script>

<style scoped lang="scss">
/* ============ 设计令牌（对齐 UI 项目 tailwind） ============ */
$primary-400: #2dd4bf;
$primary-500: #14b8a6;
$primary-600: #0d9488;
$primary-50: #f0fdfa;
$primary-200: #99f6e4;
$teal-500: #14b8a6;

$neutral-50: #fafafa;
$neutral-100: #f5f5f5;
$neutral-200: #e5e5e5;
$neutral-300: #d4d4d4;
$neutral-400: #a3a3a3;
$neutral-500: #737373;
$neutral-600: #525252;
$neutral-700: #404040;
$neutral-800: #262626;
$neutral-900: #171717;

$green-50: #f0fdf4;
$green-500: #22c55e;

$purple-200: #e9d5ff;
$pink-200: #fbcfe8;
$indigo-200: #c7d2fe;
$blue-200: #bfdbfe;

/* ============ 外壳：始终全屏（iframe 内/外都合适） ============ */

.cg-shell {
  width: 100%;
  min-height: 100vh;
  background: $neutral-50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', PingFang SC,
    Microsoft YaHei, sans-serif;
}

.cg-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  border: 1px solid $neutral-100;
  overflow: hidden;
  /* 铺满父容器（i 人事嵌入 iframe 时容器可能 1000+px 宽，不再限制 520px 居中）
     内部 .cg-body 里的内容仍然受 max-width 约束保证阅读体验 */
  width: 100%;
  animation: cg-scale-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cg-scale-in {
  from {
    transform: scale(0.95) translateY(20px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* ============ Header ============ */

.cg-header {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 128px;
  background: linear-gradient(135deg, $primary-500, $teal-500);
}

.cg-header-pattern {
  position: absolute;
  inset: 0;
  opacity: 0.1;
  background-image: url('https://www.transparenttextures.com/patterns/carbon-fibre.png');
}

.cg-header-icons {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
}

.cg-header-icon-frosted {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: inset 0 2px 8px rgba(255, 255, 255, 0.2);
}

.cg-header-icon-globe {
  color: rgba(255, 255, 255, 0.5);
  animation: cg-pulse 2s ease-in-out infinite;
}

.cg-header-icon-white {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

@keyframes cg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ============ Body ============ */

.cg-body {
  /* card 铺满父容器，但内容限宽居中（避免大屏文字过宽难读） */
  padding: 40px 32px;
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}

.cg-title {
  font-size: 24px;
  font-weight: 900;
  color: $neutral-800;
  margin: 0 0 8px;
  text-align: center;
  &--sm { font-size: 18px; }
  &--md { font-size: 20px; }
}

.cg-desc {
  font-size: 14px;
  color: $neutral-500;
  margin: 0 0 32px;
  line-height: 1.7;
  font-weight: 500;
  text-align: center;
  &--sm { margin-bottom: 32px; color: $neutral-400; }
  &--md { margin-bottom: 40px; font-weight: 500; }
}

/* ============ Status step（waiting-init） ============ */

.cg-step-status,
.cg-step-completed,
.cg-step-intro {
  text-align: center;
}

.cg-step-status {
  padding: 8px 0 16px;
  .cg-spinner-bg { margin: 0 auto 24px; }
}

/* ============ Intro 渠道 ============ */

.cg-channels {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 40px;
}

.cg-channel {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cg-channel-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 900;
  font-size: 10px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.cg-channel-label {
  font-size: 10px;
  font-weight: 700;
  color: $neutral-400;
}

/* ============ 下载按钮 ============ */

.cg-download-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.cg-btn-win,
.cg-btn-mac {
  padding: 16px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 200ms;
  border: 0;
  &:active { transform: scale(0.98); }
  .cg-svg { transition: transform 200ms; }
  &:hover .cg-svg { transform: scale(1.1); }
}

.cg-btn-win {
  background: $neutral-900;
  color: #fff;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
  &:hover { background: #000; }
}

.cg-btn-mac {
  background: #fff;
  border: 2px solid $neutral-900;
  color: $neutral-900;
  &:hover:not(:disabled) { background: $neutral-50; }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
    border-color: $neutral-300;
    color: $neutral-400;
    box-shadow: none;
    &:hover .cg-svg { transform: none; }
  }
}

.cg-btn-win:disabled {
  cursor: not-allowed;
  opacity: 0.4;
  box-shadow: none;
  &:hover .cg-svg { transform: none; }
}

.cg-btn-subtext {
  font-size: 10px;
  opacity: 0.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  margin-top: 4px;
  font-weight: 500;
}

/* ============ 唤起按钮（intro） ============ */

.cg-divider {
  padding-top: 24px;
  border-top: 1px solid $neutral-100;
}

.cg-btn-launch {
  width: 100%;
  padding: 16px;
  border: 2px solid $primary-500;
  color: $primary-500;
  border-radius: 12px;
  font-weight: 900;
  font-size: 14px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 200ms;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover:not(:disabled) { background: $primary-50; }
  &:active:not(:disabled) { transform: scale(0.98); }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.cg-error-msg {
  margin-top: 16px;
  padding: 12px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid #fed7aa;
  text-align: left;
  line-height: 1.6;
}

.cg-platform-tip {
  margin-top: 16px;
  font-size: 12px;
  color: $neutral-400;
  text-align: center;
}

/* ============ Spinner ============ */

.cg-spinner-bg {
  width: 80px;
  height: 80px;
  background: $primary-50;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.cg-spinner { animation: cg-spin 1s linear infinite; }

@keyframes cg-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ============ Completed / Succeeded ============ */

.cg-step-completed { padding: 40px 0; }

.cg-success-icon,
.cg-pending-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}
.cg-success-icon { background: $green-50; }
.cg-pending-icon {
  background: #fffbeb;     // amber-50
  .cg-svg { animation: cg-spin 8s linear infinite; }
}

.cg-svg--amber { color: #f59e0b; }

.cg-probe-hint {
  margin-top: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: $neutral-400;
}

.cg-probe-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  animation: cg-pulse 1.4s ease-in-out infinite;
}

.cg-btn-primary {
  width: 100%;
  padding: 16px;
  background: $primary-500;
  color: #fff;
  border-radius: 12px;
  font-weight: 900;
  font-size: 14px;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 200ms;
  box-shadow: 0 10px 15px -3px rgba(20, 184, 166, 0.2);
  &:hover { background: $primary-600; }
  &:active { transform: scale(0.98); }
  &--lg {
    width: auto;
    height: 56px;
    padding: 0 40px;
    font-size: 16px;
  }
}

/* 次要文字按钮（completed 态下"重新下载 / 选择其它版本"等次要操作）
   跟 cg-btn-primary 同宽，但视觉上明显次要，避免抢主操作的注意力 */
.cg-btn-link {
  width: 100%;
  margin-top: 8px;
  padding: 8px 0;
  background: transparent;
  border: 0;
  color: $neutral-500;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 200ms;
  &:hover { color: $neutral-700; }
}

.cg-btn-outline {
  background: #fff;
  border: 2px solid $primary-500;
  color: $primary-500;
  border-radius: 12px;
  font-weight: 900;
  font-size: 14px;
  cursor: pointer;
  transition: all 200ms;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  &:hover { background: $primary-50; }
  &:active { transform: scale(0.98); }
  &--lg {
    height: 56px;
    padding: 0 40px;
    font-size: 16px;
  }
}

/* ============ SVG 工具 ============ */

.cg-svg {
  display: block;
  width: 24px;
  height: 24px;
  &--xs { width: 16px; height: 16px; }
  &--sm { width: 16px; height: 16px; }
  &--md { width: 24px; height: 24px; }
  &--lg { width: 32px; height: 32px; }
  &--xl { width: 40px; height: 40px; }
  &--xxl { width: 48px; height: 48px; }
  &--primary { color: $primary-500; }
  &--primary-light { color: $primary-400; }
  &--green { color: $green-500; }
  &--neutral-200 { color: $neutral-200; }
  &--neutral-300 { color: $neutral-300; }
}

/* ============ Step Transition ============ */

.cg-step-enter-active,
.cg-step-leave-active {
  transition: opacity 240ms ease, transform 240ms ease;
}
.cg-step-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.cg-step-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* ============ Mac 弹框 ============ */

.cg-mac-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cg-mac-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
}

.cg-mac-modal {
  position: relative;
  width: 100%;
  max-width: 896px;
  background: #f9fbfe;
  border-radius: 24px;
  box-shadow: 0 32px 64px -16px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}

.cg-mac-close {
  position: absolute;
  top: 24px;
  right: 24px;
  padding: 8px;
  border-radius: 50%;
  background: transparent;
  border: 0;
  color: $neutral-400;
  cursor: pointer;
  transition: background 200ms;
  &:hover { background: $neutral-100; }
}

.cg-mac-inner { padding: 48px; }

.cg-mac-header {
  text-align: center;
  margin-bottom: 48px;
}

.cg-mac-title {
  font-size: 32px;
  font-weight: 900;
  color: $neutral-800;
  margin: 0 0 16px;
  letter-spacing: -0.025em;
}

.cg-mac-desc {
  font-size: 14px;
  color: $neutral-500;
  max-width: 672px;
  margin: 0 auto;
  line-height: 1.7;
  font-weight: 500;
}

.cg-mac-emph {
  color: $primary-500;
  font-weight: 700;
}

.cg-mac-guide { margin-bottom: 48px; }

.cg-mac-guide-title {
  font-size: 18px;
  font-weight: 900;
  color: $neutral-800;
  margin: 0 0 32px;
  display: flex;
  align-items: center;
}

.cg-mac-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  position: relative;
}

.cg-mac-step {
  flex: 1;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  border: 1px solid $neutral-100;
  height: 192px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.cg-mac-step-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 24px;
  background: $neutral-100;
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $neutral-300;
  }
}

.cg-mac-step-strip {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: $primary-500;
}

.cg-mac-step-content {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  &--chip { margin-top: 0; }
}

.cg-mac-step-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 120px;
}

.cg-mac-line {
  height: 6px;
  border-radius: 9999px;
}
.cg-mac-line--full { width: 100%; background: $neutral-100; }
.cg-mac-line--3of4 { width: 75%; background: $neutral-100; }
.cg-mac-line--1of2 { width: 50%; background: $primary-200; }

.cg-mac-step-tag {
  position: absolute;
  bottom: 16px;
  left: 16px;
  font-size: 10px;
  font-weight: 900;
  color: $neutral-400;
}

.cg-mac-arrow,
.cg-mac-or { flex-shrink: 0; }

.cg-mac-or {
  font-size: 12px;
  font-weight: 900;
  color: $neutral-300;
  font-style: italic;
}

.cg-mac-os-name {
  font-size: 10px;
  font-weight: 900;
  color: $neutral-400;
  margin-bottom: 8px;
}

.cg-mac-version {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  span {
    font-size: 8px;
    font-weight: 700;
    color: $neutral-800;
  }
  &--intel { background: linear-gradient(135deg, $purple-200, $pink-200); }
  &--apple { background: linear-gradient(135deg, $indigo-200, $blue-200); }
}

.cg-mac-chip-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  &--intel {
    background: $neutral-100;
    color: $neutral-600;
  }
  &--apple {
    background: $primary-50;
    color: $primary-600;
  }
}

.cg-mac-instructions {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cg-mac-instr-row {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: $neutral-600;
}

.cg-mac-instr-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: $neutral-200;
  color: $neutral-800;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 900;
  margin-right: 12px;
  flex-shrink: 0;
}

.cg-mac-instr-link {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: rgba(20, 184, 166, 0.3);
}

.cg-mac-instr-strong {
  color: $neutral-800;
  font-weight: 700;
}

.cg-mac-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

/* ============ Mac Modal Transition ============ */

.cg-mac-modal-enter-active,
.cg-mac-modal-leave-active {
  transition: opacity 200ms ease;
  .cg-mac-modal { transition: transform 200ms ease, opacity 200ms ease; }
}
.cg-mac-modal-enter-from,
.cg-mac-modal-leave-to {
  opacity: 0;
  .cg-mac-modal {
    transform: scale(0.95) translateY(30px);
    opacity: 0;
  }
}

/* ============ 响应式 ============ */

@media (max-width: 768px) {
  .cg-mac-inner { padding: 24px; }
  .cg-mac-title { font-size: 22px; }
  .cg-mac-steps {
    flex-direction: column;
    gap: 16px;
  }
  .cg-mac-step { width: 100%; }
  .cg-mac-actions {
    flex-direction: column;
    gap: 12px;
    .cg-btn-primary--lg,
    .cg-btn-outline--lg { width: 100%; padding: 0; }
  }
}
</style>
