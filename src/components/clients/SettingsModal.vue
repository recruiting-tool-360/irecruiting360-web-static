<template>
  <!--
    1:1 视觉还原 ihraisaas/src/components/AIAssistant/SettingsModal.tsx
    放弃 Tailwind 类（Quasar 项目里 preflight 关掉 + 跟 q-* 冲突，很多类失效），
    全部用自定义 SCSS。颜色严格按 Tailwind neutral / primary 调色板对齐。
  -->
  <Teleport to="body">
    <Transition name="settings-modal">
      <div v-if="visible" class="sm-overlay" @click.self="handleBackdropClick">
        <div class="sm-card">
          <!-- 头部 -->
          <div class="sm-header">
            <div class="sm-header-left">
              <svg
                class="sm-header-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <h3 class="sm-header-title">聚合搜索配置</h3>
            </div>
            <button type="button" class="sm-close-btn" @click="handleClose">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- 主体 -->
          <div class="sm-body">
            <!-- 加载中 -->
            <div v-if="loading" class="sm-loading">
              <q-spinner color="primary" size="2em" />
              <span class="sm-loading-text">正在加载配置...</span>
            </div>

            <!-- 加载失败 -->
            <div v-else-if="loadError" class="sm-error">
              <svg
                class="sm-error-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div class="sm-error-content">
                <div class="sm-error-title">加载失败</div>
                <div class="sm-error-msg">{{ loadError }}</div>
                <button type="button" class="sm-error-retry" @click="loadConfig">
                  点击重试
                </button>
              </div>
            </div>

            <!-- 正常内容 -->
            <template v-else>
              <!-- 工作时间段设置 -->
              <div class="sm-section">
                <div class="sm-section-title">
                  <svg
                    class="sm-section-title-icon primary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>工作时间段设置</span>
                </div>

                <div class="sm-panel">
                  <!-- 子区块标题 + 任务执行中 chip -->
                  <div class="sm-panel-header">
                    <div class="sm-panel-header-left">
                      <svg
                        class="sm-panel-header-icon blue"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span class="sm-panel-label">执行工作时段</span>
                    </div>
                    <span v-if="hasRunningTask" class="sm-running-chip">
                      任务执行中，暂不可修改
                    </span>
                  </div>

                  <!-- 时段卡片列表（多选） -->
                  <div class="sm-slot-list">
                    <div
                      v-for="slot in WORK_SLOTS"
                      :key="slot.id"
                      :class="[
                        'sm-slot-card',
                        selectedSlots.includes(slot.id) ? 'is-selected' : '',
                        hasRunningTask ? 'is-disabled' : ''
                      ]"
                      @click="toggleSlot(slot.id)"
                    >
                      <div class="sm-slot-left">
                        <div
                          :class="[
                            'sm-slot-icon-box',
                            selectedSlots.includes(slot.id) ? 'is-selected' : ''
                          ]"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        </div>
                        <div class="sm-slot-meta">
                          <span
                            :class="[
                              'sm-slot-name',
                              selectedSlots.includes(slot.id) ? 'is-selected' : ''
                            ]"
                          >
                            {{ slot.name }} {{ slot.start }}-{{ slot.end }}
                          </span>
                          <span class="sm-slot-duration">
                            持续时长 {{ slot.duration }}h
                          </span>
                        </div>
                      </div>
                      <svg
                        v-if="selectedSlots.includes(slot.id)"
                        class="sm-slot-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                  </div>

                  <!-- 包含周末及节假日（后端硬编码 false，UI 只读） -->
                  <div class="sm-holidays">
                    <div
                      class="sm-holidays-row is-disabled"
                      title="当前由系统统一管理，不支持前端修改"
                    >
                      <div class="sm-holidays-left">
                        <div
                          :class="[
                            'sm-checkbox',
                            includeHolidays ? 'is-checked' : ''
                          ]"
                        >
                          <svg
                            v-if="includeHolidays"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <span class="sm-holidays-label">包含周末及节假日</span>
                      </div>
                      <span class="sm-holidays-hint">由系统统一管理</span>
                    </div>
                  </div>

                  <p class="sm-foot-hint">
                    每天必须勾选 1-2 个时段。排队中的任务将在下个已选时段开始执行。
                  </p>

                  <p v-if="validationError" class="sm-validation-error">
                    {{ validationError }}
                  </p>
                </div>
              </div>
            </template>
          </div>

          <!-- 底部按钮 -->
          <div class="sm-footer">
            <button
              type="button"
              class="sm-btn sm-btn-cancel"
              :disabled="saving"
              @click="handleClose"
            >
              取消
            </button>
            <button
              type="button"
              :class="[
                'sm-btn sm-btn-primary',
                !canSave ? 'is-disabled' : ''
              ]"
              :disabled="!canSave || saving"
              @click="handleSave"
            >
              <q-spinner v-if="saving" size="14px" class="sm-btn-spinner" />
              <span>{{ saving ? '保存中…' : '保存配置' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 运行策略设置弹框（iHR / 客户端模式底部「设置功能」按钮触发）
 *
 * 视觉 1:1 还原 ihraisaas/src/components/AIAssistant/SettingsModal.tsx
 * 接口对接 docs/05-api-contract.md §「查询/保存运行策略配置」(line 334-410)
 *
 * 时段适配（UI ↔ 后端）：
 *   - UI 用 WORK_SLOTS 预设让用户多选 1-2 个
 *   - GET：把后端 workPeriods → 反查 WORK_SLOTS → 设 selectedSlots
 *   - PUT：把 selectedSlots → 转回 workPeriods 数组提交
 *
 * allowWeekend / allowHoliday：后端硬编码 false 不接收前端修改，UI 显示但 disabled
 */

import { ref, computed, watch, reactive } from "vue";
import { useQuasar } from "quasar";
import { useStore } from "vuex";
import {
  getRuntimePolicyConfig,
  putRuntimePolicyConfig
} from "src/api/runtimePolicyApi";

const props = defineProps({
  modelValue: { type: Boolean, default: false }
});
const emit = defineEmits(["update:modelValue", "saved"]);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v)
});

const $q = useQuasar();
const store = useStore();

const WORK_SLOTS = [
  { id: "morning", name: "上午", start: "09:00", end: "12:00", duration: 3 },
  { id: "afternoon", name: "下午", start: "13:00", end: "18:00", duration: 5 },
  { id: "evening", name: "晚上", start: "19:00", end: "23:00", duration: 4 }
];

const loading = ref(false);
const saving = ref(false);
const loadError = ref("");
const validationError = ref("");
const includeHolidays = ref(false);
const selectedSlots = reactive([]);

const hasRunningTask = computed(() => {
  const runningId = store.state?.SearchTasks?.runningTaskId;
  if (runningId) return true;
  const queueItems = store.state?.SearchTasks?.taskQueue?.items || [];
  return queueItems.some((it) => it?.taskStatus === "RUNNING");
});

const canSave = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    !hasRunningTask.value &&
    !validationError.value &&
    selectedSlots.length >= 1 &&
    selectedSlots.length <= 2
);

watch(visible, (val) => {
  if (val) loadConfig();
});

async function loadConfig() {
  loading.value = true;
  loadError.value = "";
  selectedSlots.splice(0);
  try {
    const res = await getRuntimePolicyConfig();
    const data = res?.data || {};
    includeHolidays.value = !!(data.allowHoliday || data.allowWeekend);

    const periods = Array.isArray(data.workPeriods) ? data.workPeriods : [];
    const matchedIds = periods
      .map((p) => {
        const slot = WORK_SLOTS.find(
          (s) => s.start === p.startTime && s.end === p.endTime
        );
        return slot ? slot.id : null;
      })
      .filter(Boolean);

    if (matchedIds.length === 0) {
      selectedSlots.push("morning", "afternoon");
    } else {
      selectedSlots.push(...matchedIds);
    }
  } catch (e) {
    console.error("[SettingsModal] loadConfig failed:", e);
    loadError.value = e?.response?.data?.message || e?.message || "加载配置失败";
  } finally {
    loading.value = false;
  }
}

function toggleSlot(id) {
  if (hasRunningTask.value) return;
  const idx = selectedSlots.indexOf(id);
  if (idx >= 0) {
    if (selectedSlots.length <= 1) return;
    selectedSlots.splice(idx, 1);
  } else {
    if (selectedSlots.length >= 2) return;
    selectedSlots.push(id);
  }
  validateSelection();
}

function validateSelection() {
  validationError.value = "";
  if (selectedSlots.length < 1 || selectedSlots.length > 2) {
    validationError.value = "请勾选 1-2 个工作时段";
    return;
  }
  const picked = selectedSlots
    .map((id) => WORK_SLOTS.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({ s: toMin(s.start), e: toMin(s.end) }))
    .sort((a, b) => a.s - b.s);
  for (let i = 1; i < picked.length; i++) {
    if (picked[i].s < picked[i - 1].e) {
      validationError.value = "所选时段存在重叠，请重新选择";
      return;
    }
  }
}

function toMin(hhmm) {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

async function handleSave() {
  if (!canSave.value) return;
  validateSelection();
  if (validationError.value) {
    $q.notify({
      type: "negative",
      message: validationError.value,
      position: "top"
    });
    return;
  }
  if (hasRunningTask.value) {
    $q.notify({
      type: "warning",
      message: "当前有正在执行的任务，请等待任务结束后再修改",
      position: "top"
    });
    return;
  }

  saving.value = true;
  try {
    const payload = {
      workPeriods: selectedSlots
        .map((id) => WORK_SLOTS.find((s) => s.id === id))
        .filter(Boolean)
        .sort((a, b) => toMin(a.start) - toMin(b.start))
        .map((s) => ({ startTime: s.start, endTime: s.end }))
    };
    const res = await putRuntimePolicyConfig(payload);
    $q.notify({
      type: "positive",
      message: "配置已保存",
      position: "top",
      timeout: 1500
    });
    emit("saved", res?.data || payload);
    visible.value = false;
  } catch (e) {
    console.error("[SettingsModal] save failed:", e);
    const msg =
      e?.response?.data?.message || e?.message || "保存失败，请稍后重试";
    $q.notify({ type: "negative", message: msg, position: "top", timeout: 3000 });
  } finally {
    saving.value = false;
  }
}

function handleClose() {
  if (saving.value) return;
  visible.value = false;
}

function handleBackdropClick() {
  handleClose();
}
</script>

<style scoped lang="scss">
/*
 * 颜色对照（Tailwind neutral / primary 调色板）
 *   neutral-50  #fafafa     neutral-500 #737373
 *   neutral-100 #f5f5f5     neutral-600 #525252
 *   neutral-200 #e5e5e5     neutral-700 #404040
 *   neutral-300 #d4d4d4     neutral-800 #262626
 *   neutral-400 #a3a3a3
 *   primary-200 #99F6E4     primary-500 #15B8A6     primary-600 #0D9488
 *   amber-50    #fffbeb     amber-500   #f59e0b
 *   blue-500    #3b82f6
 */

// ===== overlay + 卡片 =====
.sm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.sm-card {
  width: 600px;
  max-width: 95vw;
  max-height: 90vh;
  background: #ffffff;
  border-radius: 12px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 10px 20px -5px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// ===== 头部 =====
.sm-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.sm-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sm-header-icon {
  width: 20px;
  height: 20px;
  color: #15b8a6;
}
.sm-header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #262626;
  line-height: 1.2;
}
.sm-close-btn {
  background: transparent;
  border: none;
  color: #a3a3a3;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;
  border-radius: 4px;

  svg {
    width: 20px;
    height: 20px;
  }
  &:hover {
    color: #525252;
  }
}

// ===== 主体 =====
.sm-body {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  max-height: 70vh;
}

.sm-loading {
  padding: 48px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #737373;
}
.sm-loading-text {
  font-size: 12px;
  margin-top: 12px;
}

.sm-error {
  padding: 32px 16px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  display: flex;
  align-items: flex-start;
  gap: 12px;

  .sm-error-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .sm-error-content {
    flex: 1;
    font-size: 14px;
  }
  .sm-error-title {
    font-weight: 700;
    margin-bottom: 4px;
  }
  .sm-error-msg {
    font-size: 12px;
  }
  .sm-error-retry {
    margin-top: 8px;
    background: none;
    border: none;
    color: #dc2626;
    text-decoration: underline;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    &:hover {
      color: #991b1b;
    }
  }
}

// ===== section =====
.sm-section + .sm-section {
  margin-top: 32px;
}
.sm-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.sm-section-title-icon {
  width: 16px;
  height: 16px;
  &.primary {
    color: #15b8a6;
  }
}
.sm-section-title span {
  font-size: 14px;
  font-weight: 700;
  color: #404040;
}

// ===== panel（灰底圆角内容卡）=====
.sm-panel {
  background: #fafafa;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #f5f5f5;
}

.sm-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.sm-panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sm-panel-header-icon {
  width: 14px;
  height: 14px;
  &.blue {
    color: #3b82f6;
  }
}
.sm-panel-label {
  font-size: 11px;
  font-weight: 700;
  color: #525252;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.sm-running-chip {
  font-size: 9px;
  color: #f59e0b;
  background: #fffbeb;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}

// ===== 时段卡片 =====
.sm-slot-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.sm-slot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(.is-selected):not(.is-disabled) {
    border-color: #d4d4d4;
  }
  &.is-selected {
    background: #ffffff;
    border-color: #15b8a6;
    // 模拟 Tailwind ring-1 ring-primary-500/20
    box-shadow: 0 0 0 1px rgba(21, 184, 166, 0.2);
  }
  &.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.sm-slot-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sm-slot-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #a3a3a3;
  transition: background 0.15s, color 0.15s;

  svg {
    width: 16px;
    height: 16px;
  }
  &.is-selected {
    background: #15b8a6;
    color: #ffffff;
  }
}
.sm-slot-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}
.sm-slot-name {
  font-size: 12px;
  font-weight: 700;
  color: #737373;
  &.is-selected {
    color: #262626;
  }
}
.sm-slot-duration {
  font-size: 9px;
  color: #a3a3a3;
}
.sm-slot-check {
  width: 16px;
  height: 16px;
  color: #15b8a6;
  flex-shrink: 0;
}

// ===== 节假日复选框 =====
.sm-holidays {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(229, 229, 229, 0.6);
}
.sm-holidays-row {
  display: flex;
  align-items: center;
  justify-content: space-between;

  &.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.sm-holidays-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sm-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid #d4d4d4;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  transition: all 0.15s;

  svg {
    width: 12px;
    height: 12px;
    color: #ffffff;
  }
  &.is-checked {
    background: #15b8a6;
    border-color: #15b8a6;
  }
}
.sm-holidays-label {
  font-size: 12px;
  font-weight: 700;
  color: #404040;
}
.sm-holidays-hint {
  font-size: 10px;
  color: #a3a3a3;
}

// ===== 底部 hint + 校验错误 =====
.sm-foot-hint {
  margin: 16px 0 0;
  font-size: 9px;
  color: #a3a3a3;
  line-height: 1.2;
}
.sm-validation-error {
  margin: 8px 0 0;
  font-size: 10px;
  color: #dc2626;
  font-weight: 700;
  line-height: 1.2;
}

// ===== 底部按钮 =====
.sm-footer {
  padding: 16px 24px;
  background: #fafafa;
  border-top: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}
.sm-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  border: 1px solid transparent;

  &:disabled {
    cursor: not-allowed;
  }
}
.sm-btn-cancel {
  background: #ffffff;
  border-color: #e5e5e5;
  color: #525252;
  font-weight: 500;
  &:hover:not(:disabled) {
    background: #f5f5f5;
  }
}
.sm-btn-primary {
  background: #15b8a6;
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

  &:hover:not(.is-disabled):not(:disabled) {
    background: #0d9488;
  }
  &.is-disabled {
    background: #e5e5e5;
    color: #a3a3a3;
    box-shadow: none;
    cursor: not-allowed;
  }
}
.sm-btn-spinner {
  margin-right: 4px;
}

// ===== 进入 / 离开过渡 =====
.settings-modal-enter-active,
.settings-modal-leave-active {
  transition: opacity 0.2s ease;
}
.settings-modal-enter-active .sm-card,
.settings-modal-leave-active .sm-card {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.settings-modal-enter-from,
.settings-modal-leave-to {
  opacity: 0;
}
.settings-modal-enter-from .sm-card,
.settings-modal-leave-to .sm-card {
  transform: scale(0.95);
}
</style>
