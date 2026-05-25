<template>
  <!--
    清空对话记录确认弹框
    1:1 视觉还原 ihraisaas/src/components/layout/ModalsContainer.tsx 第 111-147 行
    （isChatClearConfirmOpen 那段）

    用法：<ClearChatConfirmModal v-model="visible" @confirm="onConfirm" />
  -->
  <Teleport to="body">
    <Transition name="cc-modal">
      <div
        v-if="visible"
        class="cc-overlay"
        @click.self="handleCancel"
      >
        <div class="cc-card">
          <!-- 顶部红色圆角图标（RefreshCcw） -->
          <div class="cc-icon-wrap">
            <svg
              class="cc-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </div>

          <h3 class="cc-title">清空对话记录</h3>
          <p class="cc-desc">
            确定要清空当前职位的所有对话记录吗？此操作不可撤销。
          </p>

          <div class="cc-actions">
            <button
              type="button"
              class="cc-btn cc-btn-cancel"
              @click="handleCancel"
            >
              取消
            </button>
            <button
              type="button"
              class="cc-btn cc-btn-confirm"
              @click="handleConfirm"
            >
              确认清空
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false }
});
const emit = defineEmits(["update:modelValue", "confirm", "cancel"]);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v)
});

function handleCancel() {
  emit("cancel");
  visible.value = false;
}

function handleConfirm() {
  emit("confirm");
  visible.value = false;
}
</script>

<style scoped lang="scss">
/*
 * 颜色对照（Tailwind 调色板）
 *   neutral-100 #f5f5f5  neutral-200 #e5e5e5  neutral-500 #737373
 *   neutral-600 #525252  neutral-800 #262626  neutral-900 #171717
 *   red-50      #fef2f2  red-500     #ef4444  red-600     #dc2626
 */

// ===== overlay（bg-neutral-900/60 backdrop-blur-sm）=====
.cc-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;            // 比 SettingsModal 9999 高一点，确保叠加时优先
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;             // p-4
  background: rgba(23, 23, 23, 0.6);     // neutral-900/60
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

// ===== 卡片（max-w-sm rounded-3xl p-8 shadow-2xl border border-neutral-100 text-center）=====
.cc-card {
  width: 100%;
  max-width: 384px;          // max-w-sm
  background: #ffffff;
  border-radius: 24px;       // rounded-3xl
  padding: 32px;             // p-8
  border: 1px solid #f5f5f5; // neutral-100
  text-align: center;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 10px 20px -5px rgba(0, 0, 0, 0.1);
}

// ===== 顶部图标 wrap（w-16 h-16 bg-red-50 rounded-2xl text-red-500 mb-6）=====
.cc-icon-wrap {
  width: 64px;
  height: 64px;
  margin: 0 auto 24px;
  border-radius: 16px;       // rounded-2xl
  background: #fef2f2;       // red-50
  color: #ef4444;            // red-500
  display: flex;
  align-items: center;
  justify-content: center;
}
.cc-icon {
  width: 32px;               // w-8 h-8
  height: 32px;
}

// ===== 标题（text-xl font-black text-neutral-800 mb-2）=====
.cc-title {
  margin: 0 0 8px;
  font-size: 20px;           // text-xl
  font-weight: 900;          // font-black
  color: #262626;            // neutral-800
  line-height: 1.4;
}

// ===== 描述（text-sm text-neutral-500 mb-8 font-medium leading-relaxed）=====
.cc-desc {
  margin: 0 0 32px;          // mb-8
  font-size: 14px;           // text-sm
  font-weight: 500;          // font-medium
  color: #737373;            // neutral-500
  line-height: 1.625;        // leading-relaxed
}

// ===== 按钮区（flex space-x-3）=====
.cc-actions {
  display: flex;
  gap: 12px;                 // space-x-3
}
.cc-btn {
  flex: 1;
  padding: 16px 0;           // py-4
  border-radius: 16px;       // rounded-2xl
  font-size: 14px;           // text-sm
  font-weight: 900;          // font-black
  cursor: pointer;
  border: none;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}
.cc-btn-cancel {
  background: #f5f5f5;       // neutral-100
  color: #525252;            // neutral-600
  &:hover {
    background: #e5e5e5;     // neutral-200
  }
}
.cc-btn-confirm {
  background: #ef4444;       // red-500
  color: #ffffff;
  box-shadow:
    0 20px 25px -5px rgba(239, 68, 68, 0.2),
    0 10px 10px -5px rgba(239, 68, 68, 0.1);
  &:hover {
    background: #dc2626;     // red-600
  }
  &:active {
    transform: scale(0.95);  // active:scale-95
  }
}

// ===== 进入 / 离开过渡（跟 ihraisaas framer-motion 一致：fade + scale）=====
.cc-modal-enter-active,
.cc-modal-leave-active {
  transition: opacity 0.18s ease;
}
.cc-modal-enter-active .cc-card,
.cc-modal-leave-active .cc-card {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.cc-modal-enter-from,
.cc-modal-leave-to {
  opacity: 0;
}
.cc-modal-enter-from .cc-card,
.cc-modal-leave-to .cc-card {
  opacity: 0;
  transform: scale(0.9);
}
</style>
