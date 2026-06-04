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
        matchedBossJobId,
        initialResumeCount: number,                  // 从原任务复原的默认值
        actionExecuted: boolean,                     // 已点过启动 → 锁定 input + 按钮文字变化
      }

    emit:
      start({ resumeCount })  用户点「启动聚合搜索」时携带最终份数
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
          <label class="rcc-label">本次期望最大推荐牛人"简历数"</label>
        </div>
        <div class="rcc-input-cell">
          <input
            type="text"
            inputmode="numeric"
            :value="actionExecuted ? cardData.initialResumeCount : resumeCount"
            :disabled="actionExecuted"
            class="rcc-input"
            @input="onInput"
          />
          <span class="rcc-unit">份</span>
        </div>
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
import { buildEstimatePayload } from "src/util/searchTaskPayloadBuilder";
import notify from "src/util/notify";

const props = defineProps({
  cardData: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["start"]);

const store = useStore();

// 用户当前在 input 里编辑的份数（默认从 cardData.initialResumeCount 来）
const resumeCount = ref(
  typeof props.cardData?.initialResumeCount === "number" ? props.cardData.initialResumeCount : ""
);

// cardData 是 reactive prop —— 父端可能改 actionExecuted / initialResumeCount，
// 这里 watch 同步 resumeCount 默认值（仅在还没改过 input 时）
watch(
  () => props.cardData?.initialResumeCount,
  (n) => {
    if (typeof n === "number" && resumeCount.value === "") {
      resumeCount.value = n;
    }
  }
);

const actionExecuted = computed(() => !!props.cardData?.actionExecuted);

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
  if (actionExecuted.value) return "聚合搜索已启动";
  return "启动聚合搜索";
});

const canStart = computed(() => {
  if (actionExecuted.value) return false;
  const n = Number(resumeCount.value);
  return Number.isFinite(n) && n > 0;
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
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const cfgList = computed(() => store.getters.getUserChannelConfig || []);
const positionId = computed(() => store.getters.getLatestPositionId || "");

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
    matchedBossJobId: props.cardData?.matchedBossJobId || null,
    resumeCount: effectiveCount.value,
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
    // 接口业务失败（如"最大简历数请填写 0-100 之间的整数"）→ 显示后端 errorMessage + 清空预估
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
    console.warn("[RetryConfigCard] estimate 接口失败:", e?.message || e);
    estimateRemote.value = null;
  } finally {
    if (seq === _estimateSeq) estimateLoading.value = false;
  }
}

// 份数 / 渠道配置变化都重新预估（debounce 300ms）
watch([effectiveCount, cfgList], scheduleEstimate, { immediate: true, deep: true });

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
    const h = Math.round((estimateRemote.value.durationMin / 60) * 10) / 10;
    return `${h}h`;
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
  const val = e?.target?.value ?? "";
  if (val === "") {
    resumeCount.value = "";
    return;
  }
  const num = parseInt(val, 10);
  if (!Number.isNaN(num)) resumeCount.value = num;
}

function handleStart() {
  if (!canStart.value) return;
  emit("start", { resumeCount: Number(resumeCount.value) });
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
  font-size: 12px;
  font-weight: 700;
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
  background: #ffffff;
  border: 1px solid $neutral-200;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  color: $primary-500;
  outline: none;
  text-align: center;
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
  margin-top: 12px;
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
