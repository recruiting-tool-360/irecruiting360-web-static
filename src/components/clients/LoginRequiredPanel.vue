<template>
  <!--
    客户端模式：渠道未全登录时，覆盖在聊天区上方的"请先登录招聘渠道"提示面板。
    1:1 参考 ihraisaas/src/components/AIAssistant/LoginRequiredModal.tsx
    （但去掉了原版的 modal 弹层背板，改成 inline 面板嵌入聊天容器）

    数据来源：Vuex store.getters.getChannelConf —— 与 ClientHeader / AISearch 共用同一份数据，
              checkChannelLoginStatus / refreshChannelLogin 触发的状态更新自动反映到这里。

    Emits:
      complete()  全部登录完成后用户点"开始搜索"
      dismiss()   用户点"稍后再说"暂时关掉（外部可决定是否记忆）
  -->
  <Teleport to="body">
   <div class="lrp-root" :style="rootStyle">
    <div class="lrp-card">
      <!-- Header: 图标 + 标题 -->
      <div class="lrp-header">
        <div class="lrp-shield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" class="lrp-icon-shield">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <div class="lrp-title-wrap">
          <h3 class="lrp-title">未检测到登录状态</h3>
          <p class="lrp-subtitle">运行前，请先登录以下招聘渠道</p>
        </div>
      </div>

      <!-- Notice -->
      <div class="lrp-notice">
        <p>
          系统模拟人工操作。为确保搜索成功及账号安全，请确保在客户端内已完成对应渠道的登录。系统运行期间，请勿在其他地方同时操作该账号。
        </p>
      </div>

      <!-- 渠道列表（参考 ihraisaas LoginRequiredModal：可勾选启用/禁用 + 去登录） -->
      <div class="lrp-section">
        <p class="lrp-section-label">选择并登录渠道</p>
        <div class="lrp-channels">
          <div
            v-for="ch in displayChannels"
            :key="ch.id"
            :class="[
              'lrp-channel',
              ch.enabled
                ? { 'lrp-channel--logged-in': ch.loggedIn }
                : 'lrp-channel--disabled'
            ]"
          >
            <!-- 勾选框：点击切换「启用/禁用」（与渠道设置弹框同一数据源） -->
            <div
              :class="['lrp-check', { 'lrp-check--off': !ch.enabled }]"
              role="checkbox"
              :aria-checked="ch.enabled"
              @click="toggleChannel(ch)"
            >
              <svg
                v-if="ch.enabled"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="lrp-icon-check"
              >
                <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            </div>

            <!-- 中间：渠道名 + 状态 -->
            <div class="lrp-channel-body">
              <div class="lrp-channel-name-row">
                <span :class="['lrp-channel-name', { 'lrp-channel-name--off': !ch.enabled }]">
                  {{ ch.name }}
                </span>
                <svg
                  v-if="ch.enabled && ch.loggedIn"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="lrp-icon-check-sm"
                >
                  <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
              </div>

              <!-- 右侧：仅启用时显示 去登录链接 / 已登录标签 -->
              <template v-if="ch.enabled">
                <button v-if="!ch.loggedIn" class="lrp-link" @click="handleOpenChannel(ch)">
                  <span>去登录</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" class="lrp-icon-link">
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </button>
                <span v-else class="lrp-badge-logged">已登录</span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer 按钮 -->
      <div class="lrp-footer">
        <button class="lrp-btn-secondary" @click="$emit('dismiss')">稍后再说</button>
        <button
          class="lrp-btn-primary"
          :disabled="!isReady"
          @click="handleComplete"
        >
          <svg
            v-if="isReady"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lrp-icon-check-sm"
          >
            <path d="M21.801 10A10 10 0 1 1 17 3.335" />
            <path d="m9 11 3 3L22 4" />
          </svg>
          <span>{{ isReady ? '已完成登录，开始搜索' : '请完成登录' }}</span>
        </button>
      </div>
    </div>
   </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useStore } from 'vuex';
import { openChannelLoginUrl } from 'src/util/openChannelLoginUrl';
import { pluginAllUrls } from 'src/pluginSrc/config/PluginRequestManager';
import { applyChannelEnableConfig } from 'src/util/applyChannelEnable';

const emit = defineEmits(['complete', 'dismiss']);

const store = useStore();

/**
 * 遮罩从「全局顶部 header（ClientHeader / 普通 header）下方」开始铺满整个内容区
 * （含左侧职位菜单）。Teleport 到 body 后用 fixed 定位，top 取实时测量的 header 高度。
 */
const headerOffset = ref(0);
const rootStyle = computed(() => ({ top: `${headerOffset.value}px` }));
function measureHeader() {
  try {
    const el = document.querySelector('.q-header');
    headerOffset.value = el ? Math.round(el.getBoundingClientRect().height) : 0;
  } catch {
    headerOffset.value = 0;
  }
}
onMounted(() => {
  measureHeader();
  // 头部高度可能在首帧后才稳定（banner 渲染 / 字体加载）→ 下一帧再量一次
  nextTick(measureHeader);
  window.addEventListener('resize', measureHeader);
});
onUnmounted(() => {
  window.removeEventListener('resize', measureHeader);
});

// 字段名跟 ClientHeader / 原 channel/*JobInfo.vue 保持一致；name 跟「渠道设置弹框」默认值一致
const CHANNEL_CONFIGS = [
  {
    storeKey: 'BOSS',
    channel: 'boss',
    name: 'boss直聘',
    loginUrl: pluginAllUrls?.BOSS?.loginUrl || 'https://www.zhipin.com/web/user/'
  },
  {
    storeKey: 'ZHILIAN',
    channel: 'zhilian',
    name: '智联招聘',
    loginUrl: pluginAllUrls?.ZHILIAN?.baseUrl || 'https://rd6.zhaopin.com'
  },
  {
    storeKey: 'JOB51',
    channel: 'job51',
    name: '前程无忧',
    loginUrl: pluginAllUrls?.JOB51?.loginURL || 'https://ehire.51job.com/Revision/login'
  }
];

const channelConf = computed(() => store.getters.getChannelConf || {});

// 渠道启用配置（"渠道设置"里勾选的）—— 与渠道设置弹框共用同一数据源
const userChannelConfig = computed(() => store.getters.getUserChannelConfig || []);

function isChannelEnabled(storeKey) {
  const list = userChannelConfig.value;
  if (!Array.isArray(list) || list.length === 0) return true;
  const entry = list.find((c) => c.key === storeKey);
  return entry ? !!entry.enableConfig : true;
}

// 展示**全部**渠道（含禁用的，禁用置灰），每个渠道带启用态 + 登录态
const displayChannels = computed(() =>
  CHANNEL_CONFIGS.map((cfg) => {
    const conf = channelConf.value[cfg.storeKey] || {};
    return {
      id: cfg.channel,
      key: cfg.storeKey,
      channel: cfg.channel,
      name: conf.name || cfg.name || cfg.storeKey,
      url: cfg.loginUrl,
      enabled: isChannelEnabled(cfg.storeKey),
      loggedIn: !!conf.login
    };
  })
);

/**
 * 是否「可以开始搜索」：至少启用了一个渠道，且所有**已启用**渠道都已登录。
 * （没启用任何渠道 → 不可开始，按钮 disabled，与 ihraisaas 一致）
 */
const isReady = computed(() => {
  const enabled = displayChannels.value.filter((ch) => ch.enabled);
  return enabled.length > 0 && enabled.every((ch) => ch.loggedIn);
});

/** 切换某渠道启用/禁用：构建全量配置 → applyChannelEnableConfig（同渠道设置弹框的数据源+副作用） */
function toggleChannel(ch) {
  if (!ch) return;
  const nextConfig = CHANNEL_CONFIGS.map((cfg) => ({
    key: cfg.storeKey,
    name: channelConf.value[cfg.storeKey]?.name || cfg.name || cfg.storeKey,
    enableConfig:
      cfg.storeKey === ch.key ? !isChannelEnabled(cfg.storeKey) : isChannelEnabled(cfg.storeKey)
  }));
  applyChannelEnableConfig(store, nextConfig);
}

function handleOpenChannel(ch) {
  if (!ch?.url) return;
  openChannelLoginUrl(ch.channel, ch.url);
}

function handleComplete() {
  if (!isReady.value) return;
  emit('complete');
}
</script>

<style scoped lang="scss">
/* ============ 颜色令牌（对齐 UI 项目 tailwind primary = teal） ============ */
$primary-50: #f0fdfa;
$primary-100: #ccfbf1;
$primary-500: #14b8a6;
$primary-600: #0d9488;
$primary-700: #0f766e;

$teal-50: #f0fdfa;
$teal-100: #ccfbf1;
$teal-700: #0f766e;

$neutral-50: #fafafa;
$neutral-100: #f5f5f5;
$neutral-200: #e5e5e5;
$neutral-300: #d4d4d4;
$neutral-400: #a3a3a3;
$neutral-500: #737373;
$neutral-700: #404040;
$neutral-800: #262626;

$amber-50: #fffbeb;
$amber-100: #fef3c7;
$amber-500: #f59e0b;

$green-50: #f0fdf4;
$green-200: #bbf7d0;
$green-500: #22c55e;
$green-600: #16a34a;

/* ============ Root：Teleport 到 body + fixed 铺满「header 以下」整个内容区 ============ */
/* 需求：遮罩覆盖全局顶部 header 以下的整个区域（含左侧职位菜单），做成大遮罩弹框。
   top 由 JS 实时测量 header 高度后通过内联 style 设置；left/right/bottom 贴边。 */
.lrp-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0; /* 实际值由内联 :style 的 header 高度覆盖 */
  /* 高于 q-drawer(左侧菜单) / 内容；低于不需要，header 因 top 偏移本身不会被盖住 */
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  /* 半透明黑色 + 背板模糊 */
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px) saturate(120%);
  -webkit-backdrop-filter: blur(8px) saturate(120%);
  /* 创建独立的 stacking context，避免被祖先的 transform / filter 破坏 backdrop-filter */
  isolation: isolate;
  animation: lrp-fade-in 0.3s ease;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', sans-serif;
}

/* 浏览器不支持 backdrop-filter 时兜底：加深黑色背景 */
@supports not (
  (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
) {
  .lrp-root {
    background: rgba(0, 0, 0, 0.7);
  }
}

@keyframes lrp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* bg-white max-w-md rounded-2xl shadow-2xl border border-neutral-200 */
.lrp-card {
  width: 100%;
  max-width: 480px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid $neutral-200;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  padding: 24px;
  animation: lrp-zoom-in 0.2s ease;
}

@keyframes lrp-zoom-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ============ Header ============ */
.lrp-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

/* bg-amber-50 p-2 rounded-xl border border-amber-100 italic */
.lrp-shield {
  background: $amber-50;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid $amber-100;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: $amber-500;
}

.lrp-icon-shield {
  /* w-6 h-6 */
  width: 24px;
  height: 24px;
}

.lrp-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lrp-title {
  /* text-lg font-black text-neutral-800 */
  font-size: 18px;
  font-weight: 900;
  color: $neutral-800;
  margin: 0;
  line-height: 1.3;
}

.lrp-subtitle {
  /* text-xs text-neutral-500 font-medium */
  font-size: 12px;
  color: $neutral-500;
  font-weight: 500;
  margin: 0;
}

/* ============ Notice ============ */
/* bg-teal-50/50 p-4 rounded-xl border border-teal-100 mb-6 */
.lrp-notice {
  background: rgba(240, 253, 250, 0.5);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid $teal-100;
  margin-bottom: 24px;

  p {
    /* text-[11px] text-teal-700 leading-relaxed font-medium */
    font-size: 11px;
    color: $teal-700;
    line-height: 1.7;
    font-weight: 500;
    margin: 0;
  }
}

/* ============ Section ============ */
.lrp-section {
  margin-bottom: 32px;
}

/* text-[10px] text-neutral-400 font-black uppercase tracking-wider pl-1 */
.lrp-section-label {
  font-size: 10px;
  color: $neutral-400;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding-left: 4px;
  margin: 0 0 8px;
}

/* grid grid-cols-1 gap-2 */
.lrp-channels {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* flex items-center gap-3 p-3 border rounded-xl */
.lrp-channel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid $neutral-200;
  border-radius: 12px;
  background: #ffffff;
  transition: background-color 0.18s, border-color 0.18s;

  &--logged-in {
    /* bg-green-50/30 border-green-200 */
    background: rgba(240, 253, 244, 0.3);
    border-color: $green-200;
  }

  /* 禁用渠道：置灰（对应 ihraisaas bg-neutral-50 border-neutral-100 grayscale opacity-60） */
  &--disabled {
    background: $neutral-50;
    border-color: $neutral-100;
    filter: grayscale(1);
    opacity: 0.6;
  }
}

/* w-5 h-5 rounded border border-primary-500 bg-primary-500 text-white，可点击切换启用 */
.lrp-check {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid $primary-500;
  background: $primary-500;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.18s, border-color 0.18s;

  /* 未启用：空心框（border-neutral-300 bg-white） */
  &--off {
    border-color: $neutral-300;
    background: #ffffff;
    color: transparent;
  }
}

/* 未启用渠道名：弱化为 neutral-400 */
.lrp-channel-name--off {
  color: $neutral-400 !important;
}

.lrp-icon-check {
  width: 16px;
  height: 16px;
}

.lrp-channel-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.lrp-channel-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* text-sm font-bold text-neutral-700 */
.lrp-channel-name {
  font-size: 14px;
  font-weight: 700;
  color: $neutral-700;
}

.lrp-icon-check-sm {
  width: 14px;
  height: 14px;
  color: $green-500;
}

/* 右侧"去登录"按钮 */
/* flex items-center gap-1.5 text-primary-500 hover:text-primary-600 */
.lrp-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  color: $primary-500;
  cursor: pointer;
  padding: 0;
  font: inherit;
  transition: color 0.18s;

  &:hover {
    color: $primary-600;
  }

  span {
    /* text-[10px] font-bold underline */
    font-size: 10px;
    font-weight: 700;
    text-decoration: underline;
  }
}

.lrp-icon-link {
  width: 14px;
  height: 14px;
  transition: transform 0.18s;
  .lrp-link:hover & {
    transform: scale(1.1);
  }
}

/* "已登录" 徽章 */
/* text-[10px] font-black text-green-600 uppercase */
.lrp-badge-logged {
  font-size: 10px;
  font-weight: 900;
  color: $green-600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ============ Footer ============ */
/* flex gap-3 */
.lrp-footer {
  display: flex;
  gap: 12px;
}

/* flex-1 py-3 text-sm font-bold text-neutral-500 rounded-xl border border-neutral-200 */
.lrp-btn-secondary {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: 1px solid $neutral-200;
  border-radius: 12px;
  color: $neutral-500;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.18s;

  &:hover {
    background: $neutral-50;
  }
}

/* flex-[2] py-3 bg-primary-500 text-white font-black rounded-xl shadow-lg */
.lrp-btn-primary {
  flex: 2;
  padding: 12px 16px;
  background: $primary-500;
  color: #ffffff;
  border: 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 15px -3px rgba(20, 184, 166, 0.2);
  transition: background-color 0.18s, transform 0.12s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background: $primary-600;
  }
  &:active:not(:disabled) {
    transform: scale(0.97);
  }
  &:disabled {
    background: $neutral-200;
    color: #ffffff;
    cursor: not-allowed;
    box-shadow: none;
  }
}
</style>
