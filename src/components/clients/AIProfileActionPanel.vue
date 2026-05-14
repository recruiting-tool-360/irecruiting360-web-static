<!--
  AI 职位画像深度解析 - 动作面板

  跟随每条带 [&AI_SEARCH&] 标记的 bot 消息渲染在气泡下方，提供：
    1. 顶部一行：搜索牛人 / 推荐牛人 两个圆形对勾（默认都选中）+ 右侧"配置已自动锁定"
    2. 选中"推荐牛人"时展开青色配置卡片：
       - 匹配 Boss 直聘职位（下拉，数据来自 store.getters.getBossJobList）
       - 本次期望最大搜索"简历数"（数字输入 + "份"）

  视觉 1:1 参考 ihraisaas/src/components/AIAssistant/ChatPanel.tsx 第 926-1042 行：
    - 主色 #15B8A6 / 浅青底 #f0fcfc / 浅青边 #CCFBF1
    - 用原生 select / input 而非 Quasar 组件，避免 Quasar 默认重样式破坏视觉

  数据过滤：
    - BossData.jobList 里只展示 jobStatus === 0（招聘中）的职位，3=已关闭 直接过滤
-->
<template>
  <div class="ai-panel">
    <!-- 模块勾选 + 锁定提示 -->
    <div class="modules-row">
      <div class="modules-left">
        <span
          class="module-item"
          :class="{ active: selectedModules.search }"
          @click="toggleModule('search')"
        >
          <span class="check-circle">
            <svg
              v-if="selectedModules.search"
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="module-text">搜索牛人</span>
        </span>
        <span
          class="module-item"
          :class="{ active: selectedModules.recommend }"
          @click="toggleModule('recommend')"
        >
          <span class="check-circle">
            <svg
              v-if="selectedModules.recommend"
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="module-text">推荐牛人</span>
        </span>
      </div>
      <span class="lock-hint">配置已自动锁定</span>
    </div>

    <!-- 推荐牛人 配置卡片 -->
    <div v-if="selectedModules.recommend" class="config-card">
      <!-- 行 1：匹配 Boss 直聘职位 -->
      <div class="config-row">
        <div class="config-left">
          <svg
            class="row-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="2"></circle>
          </svg>
          <span class="row-label">匹配 Boss 直聘职位</span>
        </div>
        <div class="select-wrap">
          <select
            v-model="matchedBossJobId"
            class="native-select"
            :disabled="bossJobOptions.length === 0"
          >
            <option v-if="bossJobOptions.length === 0" :value="null">暂无 BOSS 我的职位</option>
            <option v-for="opt in bossJobOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <svg
            class="select-caret"
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

      <!-- 行 2：本次期望最大搜索"简历数" -->
      <div class="config-row">
        <div class="config-left">
          <svg
            class="row-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span class="row-label">本次期望最大搜索"简历数"</span>
        </div>
        <div class="config-right">
          <input
            v-model="resumeCountInput"
            class="native-input"
            type="text"
            inputmode="numeric"
            maxlength="4"
            @input="onResumeCountInput"
          />
          <span class="config-unit">份</span>
        </div>
      </div>

      <!-- 行 3：输入简历数后展开 Schedule Info（参考 ihraisaas predictSchedule 简化版） -->
      <div v-if="resumeCountNum > 0" class="schedule-info">
        <div class="schedule-row">
          <span class="schedule-label">预计本次时长:</span>
          <span class="schedule-value">{{ estimatedDurationDisplay }}</span>
        </div>
        <div class="schedule-row">
          <span class="schedule-label">预计开始时间:</span>
          <span class="schedule-value">{{ scheduledStartDisplay }}</span>
        </div>
        <div class="schedule-row">
          <span class="schedule-label">预计结束时间:</span>
          <span class="schedule-value">{{ scheduledEndDisplay }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['change']);

const store = useStore();

const selectedModules = ref({
  search: true,
  recommend: true
});

function toggleModule(key) {
  selectedModules.value = {
    ...selectedModules.value,
    [key]: !selectedModules.value[key]
  };
}

// BOSS 职位下拉：仅展示开放（jobStatus === 0）的职位
const bossJobList = computed(() => store.getters.getBossJobList || []);
const bossJobOptions = computed(() =>
  bossJobList.value
    .filter((job) => Number(job.jobStatus) === 0) // 0 = 招聘中；3 = 已关闭
    .map((job) => ({
      value: job.encryptJobId || job.encryptId || String(job.jobId || job.positionName || job.jobName),
      label: `${job.jobName || job.positionName || '未命名职位'}${job.salaryDesc ? ` (${job.salaryDesc})` : ''}`,
      raw: job
    }))
);

const matchedBossJobId = ref(null);
watch(
  bossJobOptions,
  (opts) => {
    if (!opts.length) {
      matchedBossJobId.value = null;
      return;
    }
    // 当前选中的 id 已不在选项里 → 重置成第一个
    if (!opts.some((o) => o.value === matchedBossJobId.value)) {
      matchedBossJobId.value = opts[0].value;
    }
  },
  { immediate: true }
);

const resumeCountInput = ref('');
function onResumeCountInput(e) {
  // 限制只能输入数字
  const v = String(e.target.value || '').replace(/[^\d]/g, '');
  resumeCountInput.value = v;
}

const resumeCountNum = computed(() => {
  const n = Number(resumeCountInput.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

/**
 * 时长估算（小时）：
 *   - 推荐 + 搜索（同时跑）：每份简历 ~5s
 *   - 仅搜索：每份简历 ~5s
 *   - 仅推荐：每份简历 ~3s
 * 与 ihraisaas calculateEstimatedDuration 同口径，结果四舍五入到 0.1h，下限 0.1h。
 */
const estimatedDurationH = computed(() => {
  if (resumeCountNum.value <= 0) return 0;
  const onlyRecommend = !selectedModules.value.search && selectedModules.value.recommend;
  const perSec = onlyRecommend ? 3 : 5;
  const hours = (resumeCountNum.value * perSec) / 3600;
  return Math.max(0.1, Math.round(hours * 10) / 10);
});

const estimatedDurationDisplay = computed(() => `${estimatedDurationH.value}h`);

function pad2(n) {
  return String(n).padStart(2, '0');
}
function formatMMddHHmm(date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const nowTick = ref(Date.now());
let nowTimer = null;
// 每分钟刷新一次"预计开始时间"，让时间显示随时间推移而更新
function startNowTimer() {
  if (nowTimer) return;
  nowTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 60_000);
}
function stopNowTimer() {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
}

const scheduledStartDisplay = computed(() => {
  // 简化口径：当前时间即开始；如果需要排队 / 工作时段，可在后端返回真实预计时间后改这里
  void nowTick.value;
  return formatMMddHHmm(new Date());
});
const scheduledEndDisplay = computed(() => {
  void nowTick.value;
  const ms = estimatedDurationH.value * 3600 * 1000;
  return formatMMddHHmm(new Date(Date.now() + ms));
});

onMounted(() => startNowTimer());
onBeforeUnmount(() => stopNowTimer());

watch(
  () => ({
    selectedModules: selectedModules.value,
    matchedBossJobId: matchedBossJobId.value,
    resumeCount: resumeCountInput.value === '' ? null : Number(resumeCountInput.value)
  }),
  (val) => emit('change', val),
  { deep: true }
);

void props;
</script>

<style scoped lang="scss">
$accent: #15b8a6;
$accent-hover: #0d9488;
$accent-bg: #f0fcfc;
$accent-border: #ccfbf1;

.ai-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e4e4e7;
  font-size: 12px;
}

/* ===== 模块勾选行 ===== */
.modules-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modules-left {
  display: flex;
  align-items: center;
  gap: 22px;
}
.module-item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;

  .check-circle {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid #d4d4d8;
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    color: #fff;
  }
  .module-text {
    font-size: 13px;
    font-weight: 600;
    color: #71717a;
    transition: color 0.15s;
    letter-spacing: -0.01em;
  }

  &.active {
    .check-circle {
      background: $accent;
      border-color: $accent;
      box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.12);
    }
    .module-text {
      color: $accent;
    }
  }
  &:hover:not(.active) .check-circle {
    border-color: lighten($accent, 10%);
  }
}
.lock-hint {
  font-size: 11px;
  font-style: italic;
  color: #a1a1aa;
}

/* ===== 推荐牛人 配置卡片 ===== */
.config-card {
  margin-top: 14px;
  background: $accent-bg;
  border: 1px solid $accent-border;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.config-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: $accent;
}
.row-icon {
  flex-shrink: 0;
  color: $accent;
}
.row-label {
  font-size: 13px;
  font-weight: 600;
  color: #3f3f46;
}
.config-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* select */
.select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.native-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 26px 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
  cursor: pointer;
  outline: none;
  min-width: 200px;
  max-width: 280px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover:not(:disabled) {
    border-color: lighten($accent, 10%);
  }
  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
  }
  &:disabled {
    background: #f4f4f5;
    color: #a1a1aa;
    cursor: not-allowed;
  }
}
.select-caret {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: #71717a;
}

/* input */
.native-input {
  appearance: none;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 10px;
  width: 64px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  font-size: 12px;
  color: $accent;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
  }
}
.config-unit {
  font-size: 12px;
  font-weight: 700;
  color: #a1a1aa;
}

/* schedule info sub-card（输入简历数后展开） */
.schedule-info {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid $accent-border;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.schedule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}
.schedule-label {
  color: #71717a;
  font-weight: 500;
}
.schedule-value {
  color: #27272a;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
