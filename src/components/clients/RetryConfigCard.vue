<template>
  <!--
    再次启动聚合搜索的配置卡（点击「保留增量」/「清空重新」按钮后插入）
    1:1 视觉还原 ihraisaas/src/components/AIAssistant/Chat/ConfigCard.tsx

    用法：
      <RetryConfigCard
        :card-data="msg.cardData"
        @start="onStart(msg, $event)"
      />

    cardData 结构（ChatCard 写入 msg.cardData）：
      {
        configType: 'CONTINUE' | 'RESTART',         // 决定 title / description / 按钮文案
        chatId,
        originalTaskId,
        selectedModules: { search, recommend },
        matchedBossJobId,                            // 原职位不可用时为 null，由用户重新选择
        initialResumeCount: number,                  // 从原任务复原的默认值
        actionExecuted: boolean,                     // 已点过启动 → 锁定 input + 按钮文字变化
      }

    emit:
      start({ resumeCount, matchedBossJobId })  用户点「启动聚合搜索」时携带最终配置
  -->
  <div class="rcc-root">
    <!-- 头部：闪电 icon + 标题 -->
    <div class="rcc-header">
      <svg
        class="rcc-icon-zap"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
        />
      </svg>
      <span class="rcc-title">{{ titleText }}</span>
    </div>

    <!-- 描述（teal 色调） -->
    <p v-if="descriptionText" class="rcc-desc">{{ descriptionText }}</p>

    <!-- 输入区：浅 teal 框 + 简历数输入 + 时间预估 -->
    <div class="rcc-input-block">
      <div v-if="isRecommend" class="rcc-select-row">
        <div class="rcc-select-label-wrap">
          <svg
            class="rcc-icon-target"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <label class="rcc-select-label">匹配 BOSS直聘职位</label>
        </div>
        <div class="rcc-select-cell">
          <div class="rcc-select-wrap">
          <select
            v-model="matchedBossJobId"
            class="rcc-select"
            :class="{ 'rcc-select--unset': matchedBossJobId === null }"
            :disabled="actionExecuted || bossJobOptions.length === 0"
          >
            <option :value="null" disabled>
              {{ bossJobOptions.length ? "请选择匹配的 BOSS 职位" : "暂无 BOSS 我的职位" }}
            </option>
            <option v-for="option in bossJobOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <svg
            class="rcc-select-caret"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          </div>
        </div>
      </div>

      <div class="rcc-input-row">
        <div class="rcc-label-wrap">
          <svg
            class="rcc-icon-users"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <label class="rcc-label">期望找到的合格简历数</label>
        </div>
        <div class="rcc-input-cell">
          <input
            type="text"
            inputmode="numeric"
            :value="actionExecuted
              ? Math.min(Number(cardData.initialResumeCount) || 0, MAX_TARGET_COUNT)
              : resumeCount"
            :disabled="actionExecuted"
            class="rcc-input"
            @input="onInput"
            @blur="onResumeCountBlur"
          />
          <span class="rcc-unit">份</span>
        </div>
      </div>

      <div v-if="isRecommend" class="rcc-filter-row">
        <label class="rcc-filter-label">BOSS活跃度</label>
        <q-select
          v-model="bossFilters.activeness"
          :options="BOSS_ACTIVE_OPTIONS"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          options-dense
          hide-bottom-space
          :disable="actionExecuted"
          class="rcc-filter-select"
          @update:model-value="onBossFilterChange"
        />
      </div>

      <div v-if="isRecommend" class="rcc-filter-row">
        <label class="rcc-filter-label">近期没有看过</label>
        <q-select
          v-model="bossFilters.viewResume"
          :options="BOSS_NOT_VIEWED_OPTIONS"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          options-dense
          hide-bottom-space
          :disable="actionExecuted"
          class="rcc-filter-select"
          @update:model-value="onBossFilterChange"
        />
      </div>

      <div v-if="isRecommend" class="rcc-filter-row">
        <label class="rcc-filter-label">是否与同事交换简历</label>
        <q-select
          v-model="bossFilters.exchangeResume"
          :options="BOSS_RESUME_EXCHANGE_OPTIONS"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          options-dense
          hide-bottom-space
          :disable="actionExecuted"
          class="rcc-filter-select"
          @update:model-value="onBossFilterChange"
        />
      </div>

      <!--
        时间预估子块（1:1 ihraisaas ConfigCard line 80-174）
        - 份数 > 0 才显示
        - 已 actionExecuted（任务已发起）只显示"预计本次时长"，不显示开始/结束（值意义不大）
        - 算法：scheduleEstimator.predictSchedule
      -->
      <div v-if="effectiveCount > 0" class="rcc-estimate-block">
        <div class="rcc-estimate-row">
          <span class="rcc-estimate-label">预计本次时长:</span>
          <span class="rcc-estimate-value">{{ estimatedDurationDisplay }}</span>
        </div>
        <template v-if="!actionExecuted">
          <div class="rcc-estimate-row">
            <span class="rcc-estimate-label">预计开始时间:</span>
            <span class="rcc-estimate-value">{{ scheduledStartDisplay }}</span>
          </div>
          <div class="rcc-estimate-row">
            <span class="rcc-estimate-label">预计结束时间:</span>
            <span class="rcc-estimate-value">{{ scheduledEndDisplay }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- 主按钮 -->
    <button class="rcc-primary-btn" :disabled="!canStart" @click="handleStart">
      <svg
        class="rcc-icon-play"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
      <span>{{ buttonText }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useStore } from "vuex";
import { formatScheduleTime } from "src/util/scheduleEstimator";
import { estimateSearchTask } from "src/api/searchTaskApi";
import { buildEstimatePayload, MAX_TARGET_COUNT } from "src/util/searchTaskPayloadBuilder";
import notify from "src/util/notify";
import {
  BOSS_FILTER_DEFAULTS,
  BOSS_ACTIVE_OPTIONS,
  BOSS_NOT_VIEWED_OPTIONS,
  BOSS_RESUME_EXCHANGE_OPTIONS,
  extractBossFilters
} from "src/util/bossSearchFilters";
import { getCondition } from "src/api/search/SearchApi";

const props = defineProps({
  cardData: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["start"]);

const store = useStore();

// 用户当前在 input 里编辑的份数（默认从 cardData.initialResumeCount 来）
function normalizeResumeCount(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.min(n, MAX_TARGET_COUNT);
}
const resumeCount = ref(normalizeResumeCount(props.cardData?.initialResumeCount));

// cardData 是 reactive prop —— 父端可能改 actionExecuted / initialResumeCount，
// 这里 watch 同步 resumeCount 默认值（仅在还没改过 input 时）
watch(
  () => props.cardData?.initialResumeCount,
  (n) => {
    if (typeof n === "number" && resumeCount.value === "") {
      resumeCount.value = normalizeResumeCount(n);
    }
  }
);

const actionExecuted = computed(() => !!props.cardData?.actionExecuted);
const isRecommend = computed(() => !!props.cardData?.selectedModules?.recommend);

const bossJobOptions = computed(() =>
  (store.getters.getBossJobList || [])
    .filter((job) => Number(job?.jobStatus) === 0)
    .map((job) => ({
      value: job.encryptJobId || job.encryptId || String(job.jobId || ""),
      label: `${job.jobName || job.positionName || "未命名职位"}${
        job.salaryDesc ? ` (${job.salaryDesc})` : ""
      }`
    }))
    .filter((option) => option.value)
);

const matchedBossJobId = ref(props.cardData?.matchedBossJobId || null);
watch(
  () => props.cardData?.matchedBossJobId,
  (value) => {
    matchedBossJobId.value = value || null;
  }
);

const bossFilters = ref(extractBossFilters(props.cardData?.bossFilters || BOSS_FILTER_DEFAULTS));
const bossFiltersTouched = ref(false);
let conditionLoadSeq = 0;

function onBossFilterChange() {
  bossFiltersTouched.value = true;
}

async function hydrateBossFilters() {
  const searchConditionId = props.cardData?.searchConditionId;
  const seq = ++conditionLoadSeq;
  if (!searchConditionId) return;
  try {
    const response = await getCondition(searchConditionId, "BOSS");
    if (seq !== conditionLoadSeq) return;
    if (bossFiltersTouched.value) return;
    bossFilters.value = extractBossFilters(response?.data || response);
  } catch (error) {
    console.warn("[任务流程] [RetryConfigCard] 读取 BOSS 筛选条件失败:", error?.message || error);
  }
}
watch(
  () => [props.cardData?.searchConditionId, props.cardData?.bossFilters],
  () => {
    bossFiltersTouched.value = false;
    bossFilters.value = extractBossFilters(props.cardData?.bossFilters || BOSS_FILTER_DEFAULTS);
    hydrateBossFilters();
  },
  { immediate: true, deep: true }
);

const titleText = computed(() =>
  props.cardData?.configType === "CONTINUE" ? "保留增量搜索配置" : "清空重新搜索配置"
);

const descriptionText = computed(() => {
  if (props.cardData?.configType === "CONTINUE") {
    return "系统已为您锁定当前人才漏斗，接下来的搜索将在现有漏斗基础上进行增量更新。";
  }
  return "系统检测到您选择了清空重搜。在此模式下，系统将重置所有聚合节点状态，重新执行关键词库生成与全网画像匹配任务。";
});

const buttonText = computed(() => {
  if (actionExecuted.value) return "简历搜索已启动";
  return "简历搜索";
});

const canStart = computed(() => {
  if (actionExecuted.value) return false;
  const n = Number(resumeCount.value);
  return (
    Number.isFinite(n) &&
    n > 0 &&
    n <= MAX_TARGET_COUNT &&
    (!isRecommend.value || Boolean(matchedBossJobId.value))
  );
});

/* ===== 时间预估 =====
 * 跟 AIProfileActionPanel 一致：**只调 POST /search/task/estimate 接口拿预估**，
 * 不再用本地 predictSchedule 公式兜底（避免先闪一个本地默认值再被接口覆盖）。
 *
 * effectiveCount: 已启动 → 用 cardData.initialResumeCount（锁定值）；未启动 → 用 input 实时值
 */
const effectiveCount = computed(() => {
  const val = actionExecuted.value ? props.cardData?.initialResumeCount : resumeCount.value;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_TARGET_COUNT) : 0;
});

const cfgList = computed(() => store.getters.getUserChannelConfig || []);
const positionId = computed(
  () => props.cardData?.positionId || store.getters.getLatestPositionId || ""
);

/** estimate 用的 taskType：CONTINUE（保留增量）/ RESTART（清空重搜） */
const estimateTaskType = computed(() =>
  props.cardData?.configType === "RESTART" ? "RESTART" : "CONTINUE"
);

/** 接口返回的预估结果 { durationMin, startISO, endISO } | null */
const estimateRemote = ref(null);
const estimateLoading = ref(false);

let _estimateTimer = null;
let _estimateSeq = 0; // 防 race：晚返回的旧请求丢弃
function scheduleEstimate() {
  if (_estimateTimer) clearTimeout(_estimateTimer);
  // 立刻进入"计算中"态，debounce 窗口内也显示占位，避免先闪本地默认值
  if (effectiveCount.value > 0) {
    estimateRemote.value = null;
    estimateLoading.value = true;
  } else {
    estimateRemote.value = null;
    estimateLoading.value = false;
  }
  _estimateTimer = setTimeout(runEstimate, 300);
}
async function runEstimate() {
  if (effectiveCount.value <= 0) {
    estimateRemote.value = null;
    estimateLoading.value = false;
    return;
  }
  const payload = buildEstimatePayload({
    chatId: props.cardData?.chatId || "",
    positionId: positionId.value,
    cfgList: cfgList.value,
    selectedModules: props.cardData?.selectedModules || {},
    matchedBossJobId: matchedBossJobId.value,
    bossFilters: bossFilters.value,
    resumeCount: effectiveCount.value,
    targetCount: effectiveCount.value,
    taskType: estimateTaskType.value
  });
  if (!payload) {
    estimateRemote.value = null; // 没有启用渠道
    estimateLoading.value = false;
    return;
  }
  const seq = ++_estimateSeq;
  estimateLoading.value = true;
  try {
    const res = await estimateSearchTask(payload);
    if (seq !== _estimateSeq) return; // 已被新请求覆盖
    // 接口业务失败（如"最大简历数请填写 0-80 之间的整数"）→ 显示后端 errorMessage + 清空预估
    if (!res || res.success !== "success") {
      const msg = res?.errorMessage || res?.message || "预估失败";
      notify.warning(msg, { group: "estimate-error" });
      estimateRemote.value = null;
      return;
    }
    const data = res?.data || {};
    estimateRemote.value = {
      durationMin: Number(data.estimatedDurationMinutes) || 0,
      startISO: data.estimatedStartTime || null,
      endISO: data.estimatedEndTime || null
    };
  } catch (e) {
    if (seq !== _estimateSeq) return;
    console.warn("[任务流程] [RetryConfigCard] estimate 接口失败:", e?.message || e);
    estimateRemote.value = null;
  } finally {
    if (seq === _estimateSeq) estimateLoading.value = false;
  }
}

// 份数 / 渠道配置 / BOSS 职位变化都重新预估（debounce 300ms）
watch([effectiveCount, cfgList, matchedBossJobId, bossFilters, positionId], scheduleEstimate, {
  immediate: true,
  deep: true
});

onBeforeUnmount(() => {
  if (_estimateTimer) clearTimeout(_estimateTimer);
});

/* 展示用：只用接口值，没就绪显示占位（计算中… / --） */
const SCHEDULE_PENDING = "计算中…";
const SCHEDULE_EMPTY = "--";
const schedulePlaceholder = computed(() =>
  estimateLoading.value ? SCHEDULE_PENDING : SCHEDULE_EMPTY
);
const estimatedDurationDisplay = computed(() => {
  if (estimateRemote.value?.durationMin) {
    // 按分钟展示（向上取整，至少 1 分钟）
    const min = Math.max(1, Math.ceil(estimateRemote.value.durationMin));
    return `${min}分钟`;
  }
  return schedulePlaceholder.value;
});
const scheduledStartDisplay = computed(() =>
  estimateRemote.value?.startISO
    ? formatScheduleTime(estimateRemote.value.startISO)
    : schedulePlaceholder.value
);
const scheduledEndDisplay = computed(() =>
  estimateRemote.value?.endISO
    ? formatScheduleTime(estimateRemote.value.endISO)
    : schedulePlaceholder.value
);

function onInput(e) {
  // 输入过程中允许超过 80，失焦时再统一收敛。
  const raw = String(e?.target?.value ?? "").replace(/[^\d]/g, "");
  resumeCount.value = raw === "" ? "" : Number(raw);
  e.target.value = raw;
}
function onResumeCountBlur(e) {
  const raw = String(e?.target?.value ?? "").replace(/[^\d]/g, "");
  if (raw === "") return;
  const bounded = Math.min(Number(raw), MAX_TARGET_COUNT);
  resumeCount.value = bounded;
  e.target.value = String(bounded);
}

function handleStart() {
  if (!canStart.value) return;
  emit("start", {
    resumeCount: Number(resumeCount.value),
    matchedBossJobId: matchedBossJobId.value,
    bossFilters: { ...bossFilters.value }
  });
}
</script>

<style scoped lang="scss">
/* ============ 颜色（对齐 tailwind teal / neutral） ============ */
$primary-50: #f0fdfa;
$primary-100: #ccfbf1;
$primary-500: #15b8a6;
$primary-600: #0d9488;

$teal-50: $primary-50;
$teal-500: $primary-500;

$neutral-100: #f5f5f5;
$neutral-200: #e5e5e5;
$neutral-300: #d4d4d4;
$neutral-400: #a3a3a3;
$neutral-500: #737373;
$neutral-700: #404040;
$neutral-800: #262626;

/* ============ Root ============ */
/* space-y-4 w-full */
.rcc-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei",
    sans-serif;
}

/* ============ Header ============ */
/* flex items-center space-x-2 text-primary-600 mb-2 */
.rcc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: $primary-600;
}
.rcc-icon-zap {
  /* w-5 h-5 */
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.rcc-title {
  /* font-black text-sm tracking-tight italic uppercase */
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.025em;
  font-style: italic;
  text-transform: uppercase;
  line-height: 1.3;
}

/* ============ Description ============ */
/* text-xs text-neutral-500 mb-4 */
.rcc-desc {
  font-size: 12px;
  color: $neutral-500;
  margin: 0;
  line-height: 1.65;
}

/* ============ 输入区 ============ */
/* bg-[#f0fcfc] p-4 rounded-lg border border-[#CCFBF1] */
.rcc-input-block {
  background: #f0fcfc;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid $primary-100;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rcc-select-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rcc-select-label {
  color: $neutral-700;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.rcc-select-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.rcc-icon-target {
  width: 16px;
  height: 16px;
  color: $primary-500;
  flex-shrink: 0;
}
.rcc-select-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  min-width: 0;
}
.rcc-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: min(240px, 100%);
  max-width: 280px;
}
.rcc-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 100%;
  height: 32px;
  min-height: 32px;
  padding: 6px 28px 6px 10px;
  color: $neutral-700;
  background: #ffffff;
  border: 1px solid $neutral-200;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: $primary-500;
    box-shadow: 0 0 0 3px rgba(21, 184, 166, 0.15);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.rcc-select-caret {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: #71717a;
}
.rcc-select--unset {
  color: #a1a1aa;
  border-color: #fcd34d;
}
.rcc-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rcc-filter-label {
  color: $neutral-700;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.rcc-filter-select {
  width: 240px;
  max-width: 280px;
  font-size: 12px;
}
.rcc-filter-select :deep(.q-field__control) {
  height: 32px;
  min-height: 32px;
  border-radius: 6px;
  background: #fff;
  padding-right: 4px;
}
.rcc-filter-select :deep(.q-field__native) {
  height: 30px;
  min-height: 30px;
  font-size: 12px;
  font-weight: 600;
  color: $neutral-700;
}
.rcc-filter-select :deep(.q-field__append) {
  padding-left: 4px;
  color: #a3a3a3;
}
.rcc-filter-select :deep(.q-icon) {
  color: #a3a3a3;
}
.rcc-filter-select :deep(.q-field--outlined .q-field__control:before) {
  border-color: $neutral-200;
}
.rcc-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rcc-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rcc-icon-users {
  /* w-4 h-4 text-[#15B8A6] */
  width: 16px;
  height: 16px;
  color: $primary-500;
  flex-shrink: 0;
}
.rcc-label {
  /* text-xs font-bold text-neutral-700 */
  font-size: 13px;
  font-weight: 600;
  color: $neutral-700;
}
.rcc-input-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rcc-input {
  /* w-16 bg-white border border-neutral-200 rounded px-2 py-1 text-xs font-mono font-bold text-[#15B8A6] */
  width: 64px;
  height: 32px;
  background: #ffffff;
  border: 1px solid $neutral-200;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  color: $primary-500;
  outline: none;
  text-align: right;
  transition: box-shadow 0.18s;

  &:focus {
    box-shadow: 0 0 0 3px rgba(21, 184, 166, 0.15);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.rcc-unit {
  /* text-xs text-neutral-400 font-bold */
  font-size: 12px;
  font-weight: 700;
  color: $neutral-400;
}

/* 时间预估子块 —— 1:1 ihraisaas ConfigCard 内"预计本次时长 / 开始 / 结束"
   space-y-2 p-3 bg-white/60 border border-[#CCFBF1] rounded-lg */
.rcc-estimate-block {
  padding: 12px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid $primary-100;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* flex justify-between items-center text-[10px] */
.rcc-estimate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
}
/* text-neutral-500 font-medium */
.rcc-estimate-label {
  color: $neutral-500;
  font-weight: 500;
}
/* font-bold text-neutral-800 */
.rcc-estimate-value {
  color: $neutral-800;
  font-weight: 700;
}

/* ============ 主按钮 ============ */
/* w-full h-10 bg-gradient-to-r from-primary-500 to-teal-500 text-white rounded-lg
   text-xs font-black shadow-md shadow-primary-100 */
.rcc-primary-btn {
  width: 100%;
  height: 40px;
  background: linear-gradient(to right, $primary-500, $teal-500);
  color: #ffffff;
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 6px -1px rgba(204, 251, 241, 0.6);
  transition: box-shadow 0.18s, transform 0.12s, filter 0.18s;

  &:hover:not(:disabled) {
    box-shadow: 0 10px 15px -3px rgba(21, 184, 166, 0.25);
  }
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
  &:disabled {
    opacity: 0.6;
    filter: grayscale(0.6);
    cursor: not-allowed;
  }
}
.rcc-icon-play {
  /* w-4 h-4 */
  width: 16px;
  height: 16px;
}
</style>
