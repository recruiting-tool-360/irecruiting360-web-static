<template>
  <!--
    客户端模式 status banner — 1:1 还原 ihraisaas/.../ClientStatusBanner.tsx
    Tailwind → SCSS, lucide-react → inline SVG, React → Vue

    布局（justify-between）：
      Left (flex-1)：盾牌 icon + 提示文字 + "使用说明" 链接
      Right (shrink-0)：3 个渠道按钮 + 设置齿轮
  -->
  <div class="csb-root">
    <!-- ========== Left: Global Warning / Tip ========== -->
    <div class="csb-left">
      <template v-if="channelError">
        <!-- 错误状态 -->
        <div class="csb-error">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="csb-icon-md csb-color-red csb-pulse"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p class="csb-error-text">
            检测到「{{ channelError }}」账号异常/已下线，相关任务已自动停止。请重新登录后恢复。
          </p>
          <button class="csb-error-btn" :disabled="rechecking" @click="handleResume">
            <svg
              v-if="!rechecking"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="csb-icon-xs"
            >
              <path d="M21.801 10A10 10 0 1 1 17 3.335" />
              <path d="m9 11 3 3L22 4" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="csb-icon-xs csb-spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>{{ rechecking ? "检查中…" : "恢复任务" }}</span>
          </button>
        </div>
      </template>

      <template v-else>
        <!-- 盾牌图标（teal 50 背景 + 100 边框） -->
        <div class="csb-shield">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="csb-icon-shield"
          >
            <path
              d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
            />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>

        <!-- 提示文字 + 使用说明链接 -->
        <div class="csb-tip-row">
          <p class="csb-tip-text">
            执行搜索任务请<span class="csb-tip-em">保持渠道登录/不要关机等</span
            >。系统模拟人工，请<span class="csb-tip-em">避开人工同时操作</span>。
          </p>
          <a :href="HELP_URL" target="_blank" rel="noreferrer" class="csb-help">
            <span>使用说明</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="csb-icon-xxs"
            >
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </a>
        </div>
      </template>
    </div>

    <!-- ========== Right: Channels + Settings ========== -->
    <div class="csb-right">
      <button
        v-for="ch in displayChannels"
        :key="ch.id"
        :class="['csb-channel', `csb-channel--${ch.status}`]"
        :title="
          ch.status === 'error'
            ? `${ch.name} 异常，点击重新登录`
            : ch.status === 'logged_in'
            ? `${ch.name} 已登录，点击切换`
            : `点击登录/切换 ${ch.name}`
        "
        @click="handleOpenChannel(ch)"
      >
        <span :class="['csb-dot', `csb-dot--${ch.status}`]" />
        <span class="csb-channel-name">{{ ch.name }}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="csb-icon-xxs csb-channel-ext"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </button>

      <button
        class="csb-settings"
        :class="{ 'csb-settings--disabled': anyTaskActive }"
        :disabled="anyTaskActive"
        :title="anyTaskActive ? '任务进行中，暂不能修改渠道设置' : '渠道选择与设置'"
        @click="$emit('openSettings')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="csb-icon-md"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * 客户端模式 mini header (status banner)
 *
 * 1:1 还原自 ihraisaas/src/components/AIAssistant/ClientStatusBanner.tsx
 *
 * 数据：从 Vuex store.getters.getChannelConf 读取渠道登录态
 *      AISearch.setupClientChannelStatusListener 触发的登录态变化自动反映到这里
 *
 * Emits:
 *   openSettings()  右侧齿轮（待绑定渠道设置弹窗）
 *   continue()      错误状态下点"恢复任务"
 */
import { computed, ref } from "vue";
import { useStore } from "vuex";
import { useQuasar } from "quasar";
import { openChannelLoginUrl } from "src/util/openChannelLoginUrl";
import { pluginAllUrls } from "src/pluginSrc/config/PluginRequestManager";
import {
  CHANNEL_DISPLAY_NAME,
  checkChannelLogin,
  clearChannelExpired
} from "src/util/channelLoginGuard";

defineEmits(["openSettings"]);

const store = useStore();
const $q = useQuasar();
const HELP_URL =
  "https://wxvsfhdklsi.feishu.cn/docx/DmgmdkHqto1QbcxPmIGcfZKcnLd?from=from_copylink";

/**
 * 当前异常渠道展示名（来源 vuex store.channelError），从 store 直接订阅，
 * 任何位置（IndexPage 启动前 recheck 失败 / doFetchRecommend 运行时检测 LOGIN_EXPIRED）
 * 调 `commit('setChannelError', name)` 都会自动反映到这里。
 */
const channelError = computed(() => store.getters.getChannelError);

/**
 * 是否有任务正在进行（RUNNING 或 AI 评分中）→ 禁用「渠道选择与设置」齿轮：
 * 任务跑中途改渠道启用/禁用会打断/扰乱正在进行的任务，所以进行中不允许操作渠道设置。
 */
const anyTaskActive = computed(() => {
  try {
    if (store.state?.SearchTasks?.runningTaskId) return true;
    if (store.getters.getAiAnalyzingActive === true) return true;
  } catch {
    /* ignore */
  }
  return false;
});

/**
 * "恢复任务"按钮：recheck 异常渠道的登录态：
 *   - 登录已恢复 → clearChannelError 关闭横幅；用户可以自己重新点搜索（不自动重跑，更安全）
 *   - 仍未登录 → 弹 notify 提示用户先去点对应渠道按钮登录
 */
const rechecking = ref(false);
async function handleResume() {
  const errName = channelError.value;
  if (!errName) return;

  // 反查 storeKey
  const entry = Object.entries(CHANNEL_DISPLAY_NAME).find(([, name]) => name === errName);
  const key = entry?.[0];
  if (!key) {
    clearChannelExpired(store);
    return;
  }

  // ★ 该异常渠道已被用户禁用 → 不再要求它登录：直接清 banner + 触发 resumeFromCurrent。
  //   resumeFromCurrent 会对「已禁用」的渠道 finish(status=FAILED, errorCode=CHANNEL_DISABLED)，
  //   并用剩余「已启用」渠道继续/重建任务，任务正常进行下去（不被这个未登录渠道卡住）。
  if (!isChannelEnabled(key)) {
    clearChannelExpired(store);
    $q.notify({
      message: `已禁用「${errName}」，任务将跳过该渠道继续`,
      color: "positive",
      icon: "check_circle",
      position: "top",
      timeout: 2000
    });
    try {
      await store.dispatch("SearchTasks/resumeFromCurrent");
    } catch (e) {
      console.warn("[ClientHeader] handleResume: resumeFromCurrent 失败:", e?.message || e);
    }
    return;
  }

  rechecking.value = true;
  try {
    const ok = await checkChannelLogin(store, key);
    if (ok) {
      clearChannelExpired(store);
      $q.notify({
        message: `${errName} 已重新登录，可以继续搜索`,
        color: "positive",
        icon: "check_circle",
        position: "top",
        timeout: 2000
      });
    } else {
      $q.notify({
        message: `${errName} 仍未登录，请点击右上角「${errName}」按钮在客户端中重新登录`,
        color: "warning",
        icon: "warning",
        position: "top",
        timeout: 3000
      });
    }
  } finally {
    rechecking.value = false;
  }
}

// 当前展示的渠道（猎聘暂未支持，跟 ClientLauncher 保持一致）
// 字段名跟原项目 channel/*JobInfo.vue 的 goToLogin 实现 1:1 对齐：
//   - BOSS:     pluginAllUrls.BOSS.loginUrl     （小写 u 的 url）
//   - ZHILIAN:  pluginAllUrls.ZHILIAN.baseUrl   （智联没有 loginURL 字段，原项目用 baseUrl）
//   - JOB51:    pluginAllUrls.JOB51.loginURL    （大写 URL）
// channel 入参一律小写（'boss' / 'zhilian' / 'job51'），跟主进程 SITE_PARTITION 一致
const DISPLAY_CHANNELS = [
  {
    storeKey: "BOSS",
    channel: "boss",
    loginUrl: pluginAllUrls?.BOSS?.loginUrl || "https://www.zhipin.com/web/user/"
  },
  {
    storeKey: "ZHILIAN",
    channel: "zhilian",
    loginUrl: pluginAllUrls?.ZHILIAN?.baseUrl || "https://rd6.zhaopin.com"
  },
  {
    storeKey: "JOB51",
    channel: "job51",
    loginUrl: pluginAllUrls?.JOB51?.mainUrl || "https://ehire.51job.com/Revision/navigate/"
  }
];

const channelConf = computed(() => store.getters.getChannelConf || {});

// 渠道启用配置（用户在"渠道设置"弹窗里勾选的）
// 数据形态：[{ key: 'BOSS', name: 'boss直聘', enableConfig: true }, ...]
// 默认为空 → 没配置时全部启用
const userChannelConfig = computed(() => store.getters.getUserChannelConfig || []);

function isChannelEnabled(storeKey) {
  const list = userChannelConfig.value;
  if (!Array.isArray(list) || list.length === 0) return true; // 没配置 → 全启用
  const entry = list.find((c) => c.key === storeKey);
  return entry ? !!entry.enableConfig : true;
}

const displayChannels = computed(() =>
  DISPLAY_CHANNELS.filter((cfg) => isChannelEnabled(cfg.storeKey)).map((cfg) => {
    const conf = channelConf.value[cfg.storeKey] || {};
    return {
      key: cfg.storeKey,
      id: cfg.channel,
      channel: cfg.channel,
      name: conf.name || cfg.storeKey,
      url: cfg.loginUrl,
      status: channelError.value === conf.name ? "error" : conf.login ? "logged_in" : "logged_out"
    };
  })
);

function handleOpenChannel(ch) {
  if (!ch?.url) return;
  // channel 用小写（'boss' / 'zhilian' / 'job51'），跟主进程 partition map 对齐
  openChannelLoginUrl(ch.channel, ch.url);
}
</script>

<style scoped lang="scss">
/* ============ 颜色令牌（对齐 ihraisaas tailwind） ============ */
$teal-50: #f0fdfa;
$teal-100: #ccfbf1;
$teal-500: #14b8a6;
$teal-600: #0d9488;
$teal-700: #0f766e;

$neutral-50: #fafafa;
$neutral-100: #f5f5f5;
$neutral-200: #e5e5e5;
$neutral-300: #d4d4d4;
$neutral-400: #a3a3a3;
$neutral-500: #737373;
$neutral-700: #404040;
$neutral-800: #262626;

$red-50: #fef2f2;
$red-100: #fee2e2;
$red-200: #fecaca;
$red-500: #ef4444;
$red-600: #dc2626;
$red-700: #b91c1c;

$green-50: #f0fdf4;
$green-200: #bbf7d0;
$green-500: #22c55e;
$green-700: #15803d;

$primary-50: $teal-50;
$primary-500: $teal-500;

/* ============ Root ============ */
/* w-full bg-white border-b border-teal-100 px-4 py-1.5
   flex items-center justify-between shadow-sm min-h-[40px] */
.csb-root {
  width: 100%;
  background: #ffffff;
  border-bottom: 1px solid $teal-100;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei",
    sans-serif;
}

/* ============ Left ============ */
/* flex items-center gap-3 flex-1 overflow-hidden */
.csb-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

/* 盾牌 icon 外框 */
/* bg-teal-50 p-1 rounded-md border border-teal-100 shrink-0 */
.csb-shield {
  background: $teal-50;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid $teal-100;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: $teal-600;
}

.csb-icon-shield {
  /* w-3.5 h-3.5 */
  width: 14px;
  height: 14px;
  display: block;
}

/* 提示文字 + 使用说明 容器 */
/* flex items-center gap-3 */
.csb-tip-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

/* 提示文字 */
/* text-[11px] text-teal-600 font-medium whitespace-nowrap */
.csb-tip-text {
  font-size: 11px;
  color: $teal-600;
  font-weight: 500;
  white-space: nowrap;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* font-bold underline mx-0.5 */
.csb-tip-em {
  font-weight: 700;
  text-decoration: underline;
  margin: 0 2px;
}

/* "使用说明" 链接（sm:flex 小屏隐藏） */
/* hidden sm:flex items-center gap-1 text-[10px] text-teal-500 hover:text-teal-700 font-bold
   bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100 transition-colors */
.csb-help {
  display: none;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: $teal-500;
  font-weight: 700;
  background: $teal-50;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid $teal-100;
  text-decoration: none;
  flex-shrink: 0;
  transition: color 0.18s;

  &:hover {
    color: $teal-700;
  }
}
@media (min-width: 640px) {
  .csb-help {
    display: inline-flex;
  }
}

/* ============ 错误状态 ============ */
/* flex items-center gap-2 bg-red-50 px-3 py-1 rounded-lg border border-red-100 */
.csb-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: $red-50;
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid $red-100;
  animation: csb-slide-in 0.3s ease;
}

@keyframes csb-slide-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* text-[11px] text-red-700 font-black */
.csb-error-text {
  font-size: 11px;
  color: $red-700;
  font-weight: 900;
  margin: 0;
}

/* ml-2 px-3 py-1 bg-red-500 text-white text-[10px] font-black rounded-md
   hover:bg-red-600 active:scale-95 flex items-center gap-1 shadow-sm shadow-red-200 */
.csb-error-btn {
  margin-left: 8px;
  padding: 4px 12px;
  background: $red-500;
  color: #ffffff;
  font-size: 10px;
  font-weight: 900;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 1px 2px 0 rgba(252, 165, 165, 0.5);
  transition: background-color 0.18s, transform 0.12s;

  &:hover {
    background: $red-600;
  }
  &:active {
    transform: scale(0.95);
  }
}

/* ============ Right ============ */
/* flex items-center gap-4 shrink-0 */
.csb-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* 渠道按钮（外层 flex items-center gap-1） — 本组件直接平铺在 csb-right 里，间距用 gap-1 */
/* flex items-center gap-1 px-2 py-1 rounded border transition-all hover:bg-neutral-50 active:scale-95 */
.csb-channel {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.18s, transform 0.12s;

  &:hover {
    background: $neutral-50;
  }
  &:active {
    transform: scale(0.95);
  }

  &--logged_in {
    /* bg-green-50/20 border-green-200 text-green-700 */
    background: rgba(240, 253, 244, 0.2);
    border-color: $green-200;
    color: $green-700;
  }
  &--error {
    /* bg-red-50 border-red-200 text-red-600 */
    background: $red-50;
    border-color: $red-200;
    color: $red-600;
  }
  &--logged_out {
    /* bg-neutral-50/50 border-neutral-200 text-neutral-500 */
    background: rgba(250, 250, 250, 0.5);
    border-color: $neutral-200;
    color: $neutral-500;
  }
}

/* text-[10px] font-bold */
.csb-channel-name {
  font-size: 10px;
  font-weight: 700;
}

/* w-1 h-1 rounded-full + 状态色 */
.csb-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  flex-shrink: 0;

  &--logged_in {
    background: $green-500;
    animation: csb-pulse-dot 1.5s ease-in-out infinite;
  }
  &--error {
    background: $red-500;
  }
  &--logged_out {
    background: $neutral-300;
  }
}

@keyframes csb-pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(0.9);
  }
}

/* w-2.5 h-2.5 opacity-40 group-hover:opacity-100 */
.csb-channel-ext {
  opacity: 0.4;
  transition: opacity 0.18s;
  .csb-channel:hover & {
    opacity: 1;
  }
}

/* 设置按钮 */
/* p-1 text-neutral-400 hover:text-primary-500 hover:bg-primary-50 rounded-md ml-1 */
.csb-settings {
  padding: 4px;
  color: $neutral-400;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition: color 0.18s, background-color 0.18s;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: $primary-500;
    background: $primary-50;
  }

  /* 任务进行中：禁用态（置灰 + 不可点 + hover 不变色） */
  &.csb-settings--disabled,
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &.csb-settings--disabled:hover,
  &:disabled:hover {
    color: $neutral-400;
    background: transparent;
  }
}

/* ============ icon 尺寸辅助 ============ */
.csb-icon-md {
  width: 16px;
  height: 16px;
}
.csb-icon-xs {
  width: 12px;
  height: 12px;
}
.csb-icon-xxs {
  width: 10px;
  height: 10px;
}

.csb-color-red {
  color: $red-500;
}
.csb-pulse {
  animation: csb-pulse-icon 1.5s ease-in-out infinite;
}
@keyframes csb-pulse-icon {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
.csb-spin {
  animation: csb-spin-anim 1s linear infinite;
}
@keyframes csb-spin-anim {
  to {
    transform: rotate(360deg);
  }
}
</style>
