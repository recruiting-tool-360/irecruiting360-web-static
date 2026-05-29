<template>
  <!--
    自动更新弹框（Electron 客户端）
    1:1 视觉还原 ihraisaas/src/components/AIAssistant/UpdateModal.tsx
    （三阶段：info / downloading / completed）

    跟 UI 项目的差异：
      - 进度走真实事件：window.api.appUpdater.on('progress' / 'downloaded' / 'error')
      - 完成后调 window.api.appUpdater.quitAndInstall() 真正重启安装
      - 主进程 setupAutoUpdater 已不再弹 Electron dialog，本组件是唯一 UI 入口

    用法：
      <UpdateModal
        v-model="updateModalOpen"
        :new-version="newVersionAvailable"
        :is-forced="false"
      />
  -->
  <Teleport to="body">
    <Transition name="um-modal">
      <div
        v-if="visible"
        class="um-overlay"
        @click.self="handleBackdropClick"
      >
        <div class="um-card">
          <!-- 头部：上升圆环 icon + 标题 -->
          <div class="um-header">
            <div class="um-header-icon-wrap">
              <svg
                class="um-header-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m16 12-4-4-4 4" />
                <path d="M12 16V8" />
              </svg>
            </div>
            <h3 class="um-title">
              {{ isForced ? '发现核心版本' : '发现新版本' }}
            </h3>
          </div>

          <!-- ===== info：未开始下载 ===== -->
          <div v-if="stage === 'info'" class="um-stage-info">
            <div class="um-info-body">
              <p class="um-info-text">建议立即更新以获得最佳体验</p>
              <div v-if="newVersion" class="um-info-version">v{{ stripVPrefix(newVersion) }}</div>
              <div v-if="isForced" class="um-forced-badge-wrap">
                <span class="um-forced-badge">核心升级</span>
              </div>
            </div>
            <button
              type="button"
              class="um-primary-btn"
              @click="handleUpdate"
            >
              <svg
                class="um-primary-btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>立即更新</span>
            </button>
            <button
              v-if="!isForced"
              type="button"
              class="um-secondary-btn"
              @click="handleLater"
            >
              稍后再说
            </button>
          </div>

          <!-- ===== downloading：下载中 ===== -->
          <div v-else-if="stage === 'downloading'" class="um-stage-downloading">
            <div class="um-progress-circle-wrap">
              <svg class="um-loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <div class="um-progress-text">{{ Math.floor(progress) }}%</div>
            </div>
            <p class="um-downloading-tip">正在为您下载更新资源...</p>
            <div class="um-progress-bar-wrap">
              <div class="um-progress-bar-fill" :style="{ width: progress + '%' }" />
            </div>
            <p v-if="speedText" class="um-progress-meta">{{ speedText }}</p>
          </div>

          <!-- ===== completed：下载完成等重启 ===== -->
          <div v-else-if="stage === 'completed'" class="um-stage-completed">
            <div class="um-completed-icon-wrap">
              <svg
                class="um-completed-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h4 class="um-completed-title">更新已就绪</h4>
            <p class="um-completed-tip">
              {{
                restartCountdown > 0
                  ? `${restartCountdown} 秒后自动重启`
                  : "正在重启应用..."
              }}
            </p>
            <div class="um-completed-actions">
              <button
                type="button"
                class="um-primary-btn um-primary-btn--compact"
                @click="handleInstallNow"
              >
                立即重启
              </button>
              <button
                type="button"
                class="um-secondary-btn um-secondary-btn--compact"
                @click="handleInstallLater"
              >
                稍后再说
              </button>
            </div>
          </div>

          <!-- ===== unsigned-fallback：签名校验失败，回落到"浏览器手动下载" ===== -->
          <div v-else-if="stage === 'unsigned-fallback'" class="um-stage-fallback">
            <div class="um-fallback-icon-wrap">
              <svg
                class="um-fallback-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <h4 class="um-fallback-title">自动安装暂不可用</h4>
            <p class="um-fallback-tip">
              安装包签名校验未通过（常见于测试包 / 证书过期），无法自动安装。<br />
              请点下面按钮在浏览器中下载，然后双击安装包手动完成更新。
            </p>
            <div class="um-completed-actions">
              <button
                type="button"
                class="um-primary-btn um-primary-btn--compact"
                @click="handleOpenDownloadInBrowser"
              >
                在浏览器中下载
              </button>
              <button
                type="button"
                class="um-secondary-btn um-secondary-btn--compact"
                @click="handleLater"
              >
                稍后再说
              </button>
            </div>
          </div>

          <!-- 错误信息（任何阶段都可叠加显示） -->
          <p v-if="errorMessage" class="um-error">{{ errorMessage }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  newVersion: { type: String, default: "" },
  isForced: { type: Boolean, default: false }
});
const emit = defineEmits(["update:modelValue"]);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v)
});

const stage = ref("info"); // 'info' | 'downloading' | 'completed'
const progress = ref(0);
const speedText = ref(""); // "1.2 MB / 35.0 MB · 480 KB/s"
const errorMessage = ref("");
const restartCountdown = ref(0); // completed 阶段倒计时，0 = 立即触发 / 已触发

const RESTART_COUNTDOWN_SEC = 3; // 进入 completed 后 3 秒自动 quitAndInstall

const isElectron = typeof window !== "undefined" && !!window.api?.appUpdater;

let offProgress = null;
let offDownloaded = null;
let offError = null;
let offUnsignedFallback = null;
let restartTickTimer = null; // setInterval 句柄，每秒减倒计时
let progressPollTimer = null; // ★ downloading 阶段的轮询兜底（事件丢失时仍能拿到进度）

/**
 * `v1.0.0` → `1.0.0`（避免显示 `vv1.0.0`，因为模板里已经写了 `v` 前缀）
 */
function stripVPrefix(v) {
  if (!v) return "";
  return String(v).replace(/^v/i, "");
}

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n.toFixed(0) + " B";
}

/**
 * 完整重置组件内部状态（modal 关闭 / open 但已是新一轮时）
 */
function resetState() {
  stage.value = "info";
  progress.value = 0;
  speedText.value = "";
  errorMessage.value = "";
  restartCountdown.value = 0;
  stopRestartCountdown();
  stopProgressPoll();
}

/**
 * 同步主进程当前状态（解决"已经在 downloading / downloaded 时再次打开 modal"的场景）。
 * 比如：用户首次点了立即更新 → 下到一半关掉 modal → 再打开 → 应该接着展示 downloading%。
 */
async function hydrateFromMain() {
  if (!isElectron) return;
  try {
    const st = await window.api.appUpdater.getStatus();
    console.log("[UpdateModal] hydrate getStatus →", st);
    if (!st) return;
    if (st.phase === "downloading") {
      stage.value = "downloading";
      if (st.progress) {
        progress.value = st.progress.percent || 0;
        speedText.value = buildSpeedText(st.progress);
      }
      startProgressPoll(); // 二次打开 modal 时如果正在下载，启 poll 兜底
    } else if (st.phase === "downloaded") {
      stage.value = "completed";
      scheduleAutoInstall();
    } else if (st.phase === "unsignedFallback") {
      // 主进程已 fallback：直接展示"浏览器下载"流，不显示通用 error 文案
      stage.value = "unsigned-fallback";
      stopProgressPoll();
    } else if (st.phase === "error") {
      errorMessage.value = st.error || "更新失败";
    }
  } catch (e) {
    console.warn("[UpdateModal] getStatus 失败:", e?.message || e);
  }
}

function buildSpeedText(p) {
  if (!p) return "";
  const trans = fmtBytes(p.transferred || 0);
  const total = fmtBytes(p.total || 0);
  const speed = fmtBytes(p.bytesPerSecond || 0) + "/s";
  return `${trans} / ${total} · ${speed}`;
}

function subscribeEvents() {
  if (!isElectron) return;
  offProgress = window.api.appUpdater.on("progress", (p) => {
    console.log("[UpdateModal] event progress:", p);
    stage.value = "downloading";
    progress.value = Math.max(0, Math.min(100, Number(p?.percent) || 0));
    speedText.value = buildSpeedText(p);
  });
  offDownloaded = window.api.appUpdater.on("downloaded", () => {
    console.log("[UpdateModal] event downloaded");
    progress.value = 100;
    stage.value = "completed";
    stopProgressPoll();
    scheduleAutoInstall();
  });
  offError = window.api.appUpdater.on("error", (p) => {
    console.warn("[UpdateModal] event error:", p);
    const msg = p?.message || "更新失败，请稍后再试";
    errorMessage.value = msg;
    if (stage.value === "downloading") {
      stage.value = "info";
      progress.value = 0;
      stopProgressPoll();
    }
  });
  // 签名校验失败 fallback：主进程把这个事件单独走 'unsigned-fallback' channel
  offUnsignedFallback = window.api.appUpdater.on("unsigned-fallback", (p) => {
    console.warn("[UpdateModal] event unsigned-fallback:", p);
    stopProgressPoll();
    stopRestartCountdown();
    progress.value = 0;
    // 这条不是通用 error，清掉 errorMessage 避免红字跟新文案重叠
    errorMessage.value = "";
    stage.value = "unsigned-fallback";
  });
}

function unsubscribeEvents() {
  offProgress?.();
  offDownloaded?.();
  offError?.();
  offUnsignedFallback?.();
  offProgress = offDownloaded = offError = offUnsignedFallback = null;
}

/**
 * 进度轮询兜底（500ms）：
 *   - 防止主进程 webContents.send 在 dev hot reload / contextIsolation 边缘场景下丢事件
 *   - 一旦 stage 离开 'downloading' 立刻停（不浪费资源）
 *   - 拉到 phase='downloaded' 时主动切 completed，等价 downloaded 事件的兜底
 */
function startProgressPoll() {
  if (progressPollTimer || !isElectron) return;
  progressPollTimer = setInterval(async () => {
    if (stage.value !== "downloading") {
      stopProgressPoll();
      return;
    }
    try {
      const st = await window.api.appUpdater.getStatus();
      if (!st) return;
      if (st.phase === "downloading" && st.progress) {
        const pct = Math.max(0, Math.min(100, Number(st.progress.percent) || 0));
        // 只在 poll 的进度更新时才覆盖，避免 race 倒退
        if (pct > progress.value || progress.value === 0) {
          progress.value = pct;
          speedText.value = buildSpeedText(st.progress);
        }
      } else if (st.phase === "downloaded") {
        progress.value = 100;
        stage.value = "completed";
        stopProgressPoll();
        scheduleAutoInstall();
      } else if (st.phase === "error") {
        errorMessage.value = st.error || "更新失败";
        stage.value = "info";
        progress.value = 0;
        stopProgressPoll();
      }
    } catch (e) {
      console.warn("[UpdateModal] progress poll 失败:", e?.message || e);
    }
  }, 500);
}

function stopProgressPoll() {
  if (progressPollTimer) {
    clearInterval(progressPollTimer);
    progressPollTimer = null;
  }
}

/**
 * 进入 completed 后启动倒计时（每秒减 1），到 0 自动 triggerQuitAndInstall。
 * 用户可手动点「立即重启」短路；点「稍后再说」关 modal。
 */
function scheduleAutoInstall() {
  stopRestartCountdown();
  restartCountdown.value = RESTART_COUNTDOWN_SEC;
  restartTickTimer = setInterval(() => {
    restartCountdown.value -= 1;
    if (restartCountdown.value <= 0) {
      stopRestartCountdown();
      triggerQuitAndInstall();
    }
  }, 1000);
}

function stopRestartCountdown() {
  if (restartTickTimer) {
    clearInterval(restartTickTimer);
    restartTickTimer = null;
  }
}

async function triggerQuitAndInstall() {
  if (!isElectron) {
    visible.value = false;
    return;
  }
  try {
    const res = await window.api.appUpdater.quitAndInstall();
    console.log("[UpdateModal] quitAndInstall →", res);
    if (res?.devMode) {
      // dev 模式：app 已经 quit，不会真安装。等用户重启 dev server 看效果。
      errorMessage.value = res.message || "dev 模式仅 app.quit()，不会安装";
    } else if (!res?.ok) {
      errorMessage.value = "重启安装失败：" + (res?.message || "未知错误");
    }
    // 成功 case：app 已 quit，本组件马上就被销毁了，不用再做什么
  } catch (e) {
    console.warn("[UpdateModal] quitAndInstall 失败:", e?.message || e);
    errorMessage.value = "重启安装失败：" + (e?.message || e);
  }
}

function handleInstallNow() {
  stopRestartCountdown();
  restartCountdown.value = 0;
  triggerQuitAndInstall();
}

function handleInstallLater() {
  stopRestartCountdown();
  // 不重置 stage，因为下次打开 modal 时 hydrateFromMain 会看到 phase=downloaded 重新进 completed
  // 主进程 autoInstallOnAppQuit=true，用户下次退出 app 时仍会自动安装
  visible.value = false;
}

async function handleUpdate() {
  errorMessage.value = "";
  stage.value = "downloading";
  progress.value = 0;
  if (!isElectron) {
    // 非客户端环境：模拟进度（仅 dev 调试 / web 预览用）
    let p = 0;
    const t = setInterval(() => {
      p += 15;
      progress.value = Math.min(100, p);
      if (p >= 100) {
        clearInterval(t);
        stage.value = "completed";
        scheduleAutoInstall();
      }
    }, 300);
    return;
  }
  // ★ 启 poll 兜底再 invoke download；invoke 会一直挂到下载完，期间 poll 也在跑
  startProgressPoll();
  try {
    const res = await window.api.appUpdater.download();
    if (!res?.ok) {
      errorMessage.value = res?.message || "下载失败，请稍后再试";
      stage.value = "info";
      stopProgressPoll();
    }
    // 成功时 stage 由 downloaded 事件 / poll 切到 completed
  } catch (e) {
    errorMessage.value = e?.message || "下载失败";
    stage.value = "info";
    stopProgressPoll();
  }
}

function handleLater() {
  visible.value = false;
}

/**
 * unsigned-fallback 阶段："在浏览器中下载"按钮回调。
 * 调主进程 shell.openExternal(downloadUrl) 让系统浏览器下载安装包，用户手动双击完成更新。
 * 成功后关 modal（用户已离开本流程去浏览器下载，没必要继续占着 UI）。
 */
async function handleOpenDownloadInBrowser() {
  if (!isElectron) return;
  try {
    const res = await window.api.appUpdater.openDownloadInBrowser();
    console.log("[UpdateModal] openDownloadInBrowser →", res);
    if (res?.ok) {
      visible.value = false;
    } else {
      errorMessage.value = res?.message || "打开浏览器失败，请稍后再试";
    }
  } catch (e) {
    errorMessage.value = e?.message || "打开浏览器失败";
  }
}

function handleBackdropClick() {
  if (props.isForced) return;
  if (stage.value === "downloading") return; // 下载中不关
  visible.value = false;
}

watch(visible, (v) => {
  if (v) {
    resetState();
    hydrateFromMain();
  } else {
    // 关闭 modal 不取消下载（autoInstallOnAppQuit=true 兜底退出时安装），
    // 仅清掉本组件内部的状态与定时器
    stopRestartCountdown();
    stopProgressPoll();
  }
});

onMounted(() => {
  subscribeEvents();
});

onUnmounted(() => {
  unsubscribeEvents();
  stopProgressPoll();
  stopRestartCountdown();
});
</script>

<style scoped lang="scss">
/*
 * 调色板（Tailwind 别名）
 *   primary-50  #F0FDFA   primary-100 #CCFBF1   primary-500 #15B8A6   primary-600 #0D9488
 *   neutral-100 #F5F5F5   neutral-300 #D4D4D4   neutral-400 #A3A3A3   neutral-500 #737373
 *   neutral-800 #262626   neutral-900 #171717
 *   emerald-50  #ECFDF5   emerald-100 #D1FAE5   emerald-500 #10B981
 *   red-500     #EF4444
 */

// ===== overlay：bg-neutral-900/60 backdrop-blur-sm + 居中 =====
.um-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;            // 比 ClearChatConfirmModal(10000) 高，确保叠加时优先
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;             // p-4
  background: rgba(23, 23, 23, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

// ===== 卡片：max-w-[320px] rounded-2xl shadow-2xl border border-neutral-100 p-8 =====
.um-card {
  position: relative;
  width: 100%;
  max-width: 320px;
  background: #ffffff;
  border-radius: 16px;       // rounded-2xl
  padding: 32px;             // p-8
  border: 1px solid #f5f5f5;
  overflow: hidden;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 10px 20px -5px rgba(0, 0, 0, 0.1);
}

// ===== 头部 =====
.um-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.um-header-icon-wrap {
  width: 48px;
  height: 48px;
  margin-bottom: 20px;       // mb-5
  border-radius: 16px;       // rounded-2xl
  background: #f0fdfa;       // primary-50
  border: 1px solid rgba(204, 251, 241, 0.5); // primary-100/50
  color: #15b8a6;            // primary-500
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.um-header-icon {
  width: 24px;
  height: 24px;
}
.um-title {
  margin: 0;
  font-size: 18px;           // text-lg
  font-weight: 900;          // font-black
  color: #262626;            // neutral-800
  letter-spacing: -0.025em;  // tracking-tight
  line-height: 1.3;
}

// ===== info 阶段 =====
.um-stage-info {
  margin-top: 8px;
}
.um-info-body {
  padding: 24px 0;           // py-6
  text-align: center;
}
.um-info-text {
  margin: 0;
  font-size: 14px;
  font-weight: 700;          // font-bold
  color: #737373;            // neutral-500
  letter-spacing: -0.025em;
  line-height: 1.625;        // leading-relaxed
}
.um-info-version {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 800;
  color: #15b8a6;            // primary-500
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.01em;
}
.um-forced-badge-wrap {
  margin-top: 12px;
}
.um-forced-badge {
  display: inline-block;
  font-size: 9px;
  color: #0d9488;            // primary-600
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;     // tracking-widest
  background: #f0fdfa;       // primary-50
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(204, 251, 241, 0.5);
}

.um-primary-btn {
  width: 100%;
  padding: 14px 0;           // py-3.5
  background: #15b8a6;       // primary-500
  color: #ffffff;
  border: none;
  border-radius: 12px;       // rounded-xl
  font-weight: 900;          // font-black
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 8px 16px -4px rgba(21, 184, 166, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s, transform 0.1s;
  &:hover {
    background: #0d9488;     // primary-600
  }
  &:active {
    transform: scale(0.97);
  }
}
.um-primary-btn-icon {
  width: 14px;               // 3.5
  height: 14px;
}

.um-secondary-btn {
  width: 100%;
  margin-top: 8px;
  padding: 8px 0;            // py-2
  background: transparent;
  color: #a3a3a3;            // neutral-400
  border: none;
  font-size: 11px;
  font-weight: 700;          // font-bold
  cursor: pointer;
  transition: color 0.15s;
  &:hover {
    color: #525252;          // neutral-600
  }
}

// ===== downloading 阶段 =====
.um-stage-downloading {
  margin-top: 24px;          // mt-6
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;                 // space-y-5
}
.um-progress-circle-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.um-loader {
  width: 40px;
  height: 40px;
  color: #15b8a6;            // primary-500
  opacity: 0.2;
  animation: um-spin 1s linear infinite;
}
.um-progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;           // text-xs
  font-weight: 900;          // font-black
  color: #15b8a6;
}
.um-downloading-tip {
  margin: 0;
  font-size: 11px;
  font-weight: 900;
  color: #262626;            // neutral-800
}
.um-progress-bar-wrap {
  width: 100%;
  height: 4px;               // h-1
  background: #f5f5f5;       // neutral-100
  border-radius: 9999px;
  overflow: hidden;
}
.um-progress-bar-fill {
  height: 100%;
  background: #15b8a6;
  box-shadow: 0 0 8px rgba(21, 184, 166, 0.5);
  transition: width 0.3s ease;
}
.um-progress-meta {
  margin: 0;
  font-size: 11px;
  color: #a3a3a3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.01em;
}

// ===== completed 阶段 =====
.um-stage-completed {
  margin-top: 8px;
  padding: 16px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.um-completed-icon-wrap {
  width: 56px;               // w-14
  height: 56px;
  margin-bottom: 20px;
  border-radius: 9999px;     // rounded-full
  background: #ecfdf5;       // emerald-50
  border: 1px solid rgba(209, 250, 229, 0.5);
  color: #10b981;            // emerald-500
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.um-completed-icon {
  width: 28px;               // w-7
  height: 28px;
}
.um-completed-title {
  margin: 0;
  font-size: 16px;           // text-base
  font-weight: 900;          // font-black
  color: #262626;
}
.um-completed-tip {
  margin: 8px 0 0;
  font-size: 11px;
  color: #a3a3a3;            // neutral-400
  font-weight: 500;
  letter-spacing: -0.025em;
  animation: um-pulse 2s ease-in-out infinite;
}

// ===== unsigned-fallback 阶段（签名校验失败，回落浏览器手动下载）=====
.um-stage-fallback {
  margin-top: 8px;
  padding: 16px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.um-fallback-icon-wrap {
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  border-radius: 9999px;
  background: #fffbeb;           // amber-50
  border: 1px solid rgba(254, 243, 199, 0.6); // amber-100/60
  color: #f59e0b;                // amber-500
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.um-fallback-icon {
  width: 28px;
  height: 28px;
}
.um-fallback-title {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: #262626;
}
.um-fallback-tip {
  margin: 8px 0 0;
  font-size: 11px;
  color: #737373;                // neutral-500
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.6;
}

// completed 阶段下方的双按钮（立即重启 / 稍后再说）
.um-completed-actions {
  width: 100%;
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.um-primary-btn--compact {
  padding: 10px 0;          // 比首屏立即更新按钮稍紧凑（completed 阶段视觉重点是 ✓）
  font-size: 13px;
  box-shadow: 0 6px 14px -4px rgba(21, 184, 166, 0.28);
}
.um-secondary-btn--compact {
  margin-top: 0;
  padding: 6px 0;
  font-size: 11px;
}

// ===== 错误信息 =====
.um-error {
  margin: 12px 0 0;
  font-size: 11px;
  text-align: center;
  color: #ef4444;            // red-500
  font-weight: 600;
}

// ===== 动画 =====
@keyframes um-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes um-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

// ===== 进入 / 离开过渡（跟 ihraisaas framer-motion 接近）=====
.um-modal-enter-active,
.um-modal-leave-active {
  transition: opacity 0.18s ease;
}
.um-modal-enter-active .um-card,
.um-modal-leave-active .um-card {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.um-modal-enter-from,
.um-modal-leave-to {
  opacity: 0;
}
.um-modal-enter-from .um-card,
.um-modal-leave-to .um-card {
  opacity: 0;
  transform: scale(0.95) translateY(20px);
}
</style>
