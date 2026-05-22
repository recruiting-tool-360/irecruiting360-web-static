<template>
  <Teleport to="body">
    <Transition name="ihr-auth-modal">
      <div v-if="visible" class="ihr-auth-overlay">
        <div class="ihr-auth-backdrop" @click="handleClose" />

        <div class="ihr-auth-card">
          <!-- 关闭按钮 -->
          <div class="ihr-auth-toolbar">
            <button class="ihr-auth-close" aria-label="关闭" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div class="ihr-auth-content">
            <!-- 顶部图标（Sparkles + 圆角方块 + pulse 光晕） -->
            <div class="ihr-auth-icon-wrap">
              <span class="ihr-auth-icon-pulse" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="ihr-auth-icon-sparkles"
              >
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                <path d="M20 3v4" />
                <path d="M22 5h-4" />
                <path d="M4 17v2" />
                <path d="M5 18H3" />
              </svg>
            </div>

            <!-- 标题 + 描述 -->
            <div class="ihr-auth-title-wrap">
              <h2 class="ihr-auth-title">AI 聚合搜索</h2>
              <p class="ihr-auth-desc">
                检测到您的认证信息已过期，请通过 i人事 账号授权以继续使用全网深度聚合搜索功能
              </p>
            </div>

            <!-- 登录按钮 -->
            <div class="ihr-auth-actions">
              <button
                class="ihr-auth-btn"
                :disabled="loading"
                @click="handleLogin"
              >
                <svg
                  v-if="!loading"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="ihr-auth-btn-icon"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
                <svg
                  v-else
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="ihr-auth-btn-icon ihr-auth-spinner"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>{{ loading ? '正在打开浏览器…' : '前往浏览器版' }}</span>
              </button>

              <p class="ihr-auth-hint">
                客户端访问令牌已过期。点击按钮将用系统浏览器打开 i 人事招聘工作台，工作台会自动签发新的 accessToken 并通过深链送回客户端。
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * i 人事账号授权弹框（客户端模式专用）
 *
 * 触发：ihrBridge 业务调用返回 errorCode='NOT_LOGGED_IN' 时由 electronMessengerShim 触发
 *       store.commit('setIhrAuthModalVisible', true)
 *
 * 设计：1:1 参考 ihraisaas/src/components/AIAssistant/LoginModal.tsx step='modal'
 *       Tailwind 类 → SCSS（不引入 tailwind/motion 等依赖）
 *
 * 行为：
 *   点击"登录账号"按钮 → window.api.ihrBridge.openManageLoginTab({
 *     useSystemBrowser: true,
 *     loginPath: '/web/page/single/#/recruit/recruit-assistant?menu=60000&subMenu=60070&thirdMenu='
 *   })
 *   → Electron 主进程 shell.openExternal 唤起系统默认浏览器
 *   → 用户在浏览器里完成 i 人事 manage 登录
 *   → 回到客户端再次触发业务（modal 自动关闭，由调用方再次调 API 后判定）
 */
import { ref, computed } from 'vue';
import { useStore } from 'vuex';

const store = useStore();
const loading = ref(false);

const visible = computed(() => store.getters.getIhrAuthModalVisible);

// 与 i 人事 RecruitAssistant 页面路径一致
const LOGIN_PATH =
  '/web/page/single/#/recruit/recruit-assistant?menu=60000&subMenu=60070&thirdMenu=';

function handleClose() {
  if (loading.value) return; // 正在打开浏览器期间不让关
  store.commit('setIhrAuthModalVisible', false);
}

async function handleLogin() {
  if (loading.value) return;
  loading.value = true;
  try {
    const api = window?.api?.ihrBridge;
    if (api?.openManageLoginTab) {
      const res = await api.openManageLoginTab({
        useSystemBrowser: true,
        loginPath: LOGIN_PATH
      });
      console.log('[IhrAuthModal] openManageLoginTab result:', res);
    } else {
      // 客户端外（fallback）：跳浏览器同路径，能跑就跑（实际不会走到这里，
      // 因为这个 modal 设计就是只在客户端模式触发的）
      const fallbackUrl =
        (window.location.origin || '') + LOGIN_PATH;
      window.open(fallbackUrl, '_blank', 'noopener');
    }
  } catch (e) {
    console.warn('[IhrAuthModal] open browser failed:', e);
  } finally {
    loading.value = false;
    // 让用户去浏览器登录，关闭弹框（保留它阻拦后续业务的话也行，但用户体验不好）
    store.commit('setIhrAuthModalVisible', false);
  }
}
</script>

<style scoped lang="scss">
/* 颜色对齐 UI 项目 tailwind primary-500 = #14b8a6（teal） */
$primary-50: #f0fdfa;
$primary-500: #14b8a6;
$primary-600: #0d9488;

$neutral-100: #f5f5f5;
$neutral-200: #e5e5e5;
$neutral-400: #a3a3a3;
$neutral-800: #262626;
$neutral-900: #171717;

.ihr-auth-overlay {
  // 全局浮层：Teleport to="body" 脱离父容器 + 高 z-index 盖在任何业务面板之上。
  // Quasar Dialog 默认 z-index 是 6000；FloatingActionPanel / 各招聘站 tab 蒙层
  // 也可能用比较高的 z-index。这里取 9999 保证 i 人事登录授权弹框始终是 top-most。
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: auto;
}

.ihr-auth-backdrop {
  // 用 fixed 而不是 absolute，确保 backdrop 一定盖满整个 viewport
  // （即使 .ihr-auth-overlay 因为某些祖先样式异常没占满）
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(23, 23, 23, 0.4); /* neutral-900/40 */
  backdrop-filter: blur(4px);
}

.ihr-auth-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border-radius: 24px;
  border: 1px solid $neutral-100;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', sans-serif;
}

.ihr-auth-toolbar {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px;
}

.ihr-auth-close {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: transparent;
  border: 0;
  color: $neutral-400;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.18s;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: $neutral-100;
  }
}

.ihr-auth-content {
  padding: 0 40px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 顶部图标 */
.ihr-auth-icon-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  background: $primary-50;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.ihr-auth-icon-pulse {
  position: absolute;
  inset: 0;
  border-radius: 24px;
  background: rgba(20, 184, 166, 0.1);
  animation: ihr-auth-pulse 2s ease-in-out infinite;
}

.ihr-auth-icon-sparkles {
  position: relative;
  z-index: 1;
  width: 40px;
  height: 40px;
  color: $primary-500;
}

@keyframes ihr-auth-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.04); }
}

/* 标题 + 描述 */
.ihr-auth-title-wrap {
  text-align: center;
  margin-bottom: 40px;
}

.ihr-auth-title {
  font-size: 24px;
  font-weight: 900;
  color: $neutral-800;
  margin: 0 0 8px;
  line-height: 1.2;
}

.ihr-auth-desc {
  font-size: 14px;
  color: $neutral-400;
  font-weight: 500;
  line-height: 1.6;
  margin: 0;
  padding: 0 16px;
}

/* 登录按钮 */
.ihr-auth-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ihr-auth-btn {
  width: 100%;
  height: 56px;
  border-radius: 16px;
  background: $primary-500;
  color: #ffffff;
  font-size: 16px;
  font-weight: 900;
  border: 0;
  cursor: pointer;
  box-shadow: 0 16px 32px -8px rgba(20, 184, 166, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition:
    background-color 0.18s,
    transform 0.12s;

  &:hover:not(:disabled) {
    background: $primary-600;
  }
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
  &:disabled {
    opacity: 0.7;
    cursor: progress;
  }
}

.ihr-auth-btn-icon {
  width: 20px;
  height: 20px;
}

.ihr-auth-spinner {
  animation: ihr-auth-spin 1s linear infinite;
}

@keyframes ihr-auth-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ihr-auth-hint {
  font-size: 10px;
  text-align: center;
  color: $neutral-400;
  padding: 0 24px;
  line-height: 1.7;
  margin: 0;
}

/* 进入/退出过渡 */
.ihr-auth-modal-enter-active,
.ihr-auth-modal-leave-active {
  transition: opacity 0.24s ease;
  .ihr-auth-card {
    transition: transform 0.24s ease, opacity 0.24s ease;
  }
  .ihr-auth-backdrop {
    transition: opacity 0.24s ease;
  }
}

.ihr-auth-modal-enter-from,
.ihr-auth-modal-leave-to {
  opacity: 0;
  .ihr-auth-card {
    transform: scale(0.95) translateY(20px);
    opacity: 0;
  }
}
</style>
