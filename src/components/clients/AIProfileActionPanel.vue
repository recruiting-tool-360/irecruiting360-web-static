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
    <!--
      模块勾选 + 锁定提示

      显示逻辑（设置里 BOSS 未启用时简化 UI）：
        - bossEnabled=true（默认 / 设置里启用了 BOSS）：显示「搜索牛人」+「推荐牛人」两个勾选框
        - bossEnabled=false（设置里禁用了 BOSS）：
            · 「推荐牛人」依赖 BOSS 渠道，无意义
            · 只剩「搜索牛人」一个选项，让用户勾选也无意义
            · 「配置已自动锁定」单独留着也没意义
            → 整行隐藏，直接进配置卡片 / 启动按钮区
            （selectedModules 由 watch(bossEnabled) 自动改为 { search:true, recommend:false }）

      数据来源：store.getters.getUserChannelConfig → [{ key:'BOSS', enableConfig: bool }, ...]
    -->
    <div v-if="bossEnabled" class="modules-row">
      <div class="modules-left">
        <!--
          模块勾选项（1:1 对照 ihraisaas ChatPanel.tsx 929-953）：
            - w-6 h-6 rounded-lg border shadow-sm（24×24 方框圆角 8px + 浅阴影）
            - active：bg-primary-500 + border-primary-500 + ring-4 ring-primary-50
            - 勾：w-4 h-4 text-white（16×16 白色 Check）
            - 文字：text-xs font-black tracking-tight；active text-primary-600 / inactive text-neutral-500
        -->
        <span
          class="module-item"
          :class="{ active: selectedModules.search }"
          @click="toggleModule('search')"
        >
          <span class="check-box">
            <svg
              v-if="selectedModules.search"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
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
          <span class="check-box">
            <svg
              v-if="selectedModules.recommend"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
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

    <!--
      推荐牛人配置区域：
        外层 .recommend-section 提供 dotted 顶部分隔线（跟上面"模块勾选行"分开）
        内层 .config-card 才是真正的青色背景卡片
      用 <Transition> 让展开/收起平滑（透明度 + 高度 + 顶部 padding/border）
    -->
    <Transition name="rec-slide">
      <div v-if="selectedModules.recommend" class="recommend-section">
        <div class="config-card">
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
    </Transition>

    <!-- 底部 CTA：基于深度画像准备搜索策略 + 查看结果（测试） + 启动聚合搜索 -->
    <div class="bottom-action">
      <p class="bottom-hint">基于深度画像准备搜索策略</p>
      <div class="bottom-action-buttons">
        <button
          type="button"
          class="aggregate-btn"
          :disabled="aggregateDisabled"
          @click="$emit('aggregate', getState())"
        >
          <svg
            class="aggregate-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
            />
            <path
              d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
            />
          </svg>
          <span>启动聚合搜索</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useStore } from "vuex";

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["change", "aggregate", "view-results"]);

const store = useStore();

/**
 * 设置里"BOSS 渠道"是否启用 —— 决定整个推荐牛人 UI 是否可用。
 *
 * 数据来源：store.getters.getUserChannelConfig 返回数组 [{ key:'BOSS', enableConfig:bool }, ...]
 * （注：项目里 getChannelDisable() 函数名反语义，实际 enableConfig=true 表示启用）
 *
 * 联动效果（详见 template 的 v-if）：
 *   - bossEnabled=true：显示"搜索牛人 / 推荐牛人"两个勾选框（默认都勾）
 *   - bossEnabled=false：两个勾选框都隐藏；selectedModules 强制为 { search:true, recommend:false }
 */
const userChannelConfig = computed(() => store.getters.getUserChannelConfig || []);
const bossEnabled = computed(() => {
  const cfg = userChannelConfig.value.find((c) => c?.key === "BOSS");
  // 兼容：cfg 缺失时默认启用（避免 store 还没 hydrate 完时整块 UI 闪烁消失）
  if (!cfg) return true;
  return cfg.enableConfig !== false;
});

const selectedModules = ref({
  search: true,
  recommend: true
});

/**
 * BOSS 切到禁用时：自动收敛 selectedModules 到 { search:true, recommend:false }
 * BOSS 切到启用时：恢复默认 { search:true, recommend:true }（用户随后可手动改）
 *
 * 用 watch immediate:true 保证初次挂载时立刻同步，避免出现"BOSS 禁用 + recommend=true"
 * 的非法组合传给 aggregate 事件。
 */
watch(
  bossEnabled,
  (enabled) => {
    if (!enabled) {
      // BOSS 关了：只能搜索；推荐自动收起
      if (selectedModules.value.recommend || !selectedModules.value.search) {
        selectedModules.value = { search: true, recommend: false };
      }
    } else {
      // BOSS 开了：恢复默认（之前用户可能手动改成纯推荐，这里不强行覆盖搜索状态）
      if (!selectedModules.value.search && !selectedModules.value.recommend) {
        selectedModules.value = { search: true, recommend: true };
      }
    }
  },
  { immediate: true }
);

function toggleModule(key) {
  // BOSS 禁用时 UI 上根本看不到勾选框（v-if 隐藏），点击不可达；
  // 但万一上层用 ref 强调 toggleModule 时也得防御一下，禁止打开 recommend
  if (key === "recommend" && !bossEnabled.value) return;
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
      value:
        job.encryptJobId || job.encryptId || String(job.jobId || job.positionName || job.jobName),
      label: `${job.jobName || job.positionName || "未命名职位"}${
        job.salaryDesc ? ` (${job.salaryDesc})` : ""
      }`,
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

const resumeCountInput = ref("");
function onResumeCountInput(e) {
  // 限制只能输入数字
  const v = String(e.target.value || "").replace(/[^\d]/g, "");
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
  return String(n).padStart(2, "0");
}
function formatMMddHHmm(date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
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

function getState() {
  return {
    selectedModules: selectedModules.value,
    matchedBossJobId: matchedBossJobId.value,
    resumeCount: resumeCountInput.value === "" ? null : Number(resumeCountInput.value)
  };
}

/**
 * **immediate: true** —— mount 时也 emit 一次。
 *
 * 必要性：ChatCard 用 actionPanelStateByMsgId[msg.id] 记录每条 AI_SEARCH 消息的勾选状态。
 *        AIProfileActionPanel 挂载时如果 BOSS 禁用，watch(bossEnabled) 会立刻把
 *        selectedModules 改成 { search:true, recommend:false }；但若不 immediate,
 *        ChatCard 那边 state 一直是 undefined，handleSearch 走 fallback
 *        { search:true, recommend:true } —— 会触发推荐牛人进度卡片误显示。
 */
watch(getState, (val) => emit("change", val), { deep: true, immediate: true });

/** 启动按钮禁用条件：两个模块都没勾 / 勾了推荐牛人但没填简历数 */
const aggregateDisabled = computed(() => {
  if (!selectedModules.value.search && !selectedModules.value.recommend) return true;
  if (selectedModules.value.recommend && resumeCountNum.value <= 0) return true;
  return false;
});

defineExpose({ getState });

void props;
</script>

<style scoped lang="scss">
$accent: #15b8a6;
$accent-hover: #0d9488;
$accent-bg: #f0fcfc;
$accent-border: #ccfbf1;

/*
  ActionPanel 整体结构（参考 ihraisaas ChatPanel.tsx 926-1075）：
    1. 顶部 dotted 分隔线 + 模块勾选行
    2. 仅 recommend=true 时插入 .recommend-section（自带 dotted 顶部分隔线）
    3. .bottom-action（自带 dotted 顶部分隔线）+ "启动聚合搜索"
  即三段全部用 dotted 顶部分隔线，统一颜色 #e5e7eb (neutral-200)
*/
.ai-panel {
  padding-top: 16px;
  border-top: 1px dotted #e5e7eb;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px; /* space-y-4 */
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
  gap: 24px; /* space-x-6 */
}
.module-item {
  display: inline-flex;
  align-items: center;
  gap: 10px; /* space-x-2.5 */
  cursor: pointer;
  user-select: none;

  /* 1:1 对照 ihraisaas: w-6 h-6 rounded-lg border shadow-sm */
  .check-box {
    width: 24px;
    height: 24px;
    border-radius: 8px; /* rounded-lg */
    border: 1px solid #d4d4d8; /* border-neutral-300 */
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    color: #fff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* shadow-sm */
    flex-shrink: 0;
  }
  .module-text {
    font-size: 12px; /* text-xs */
    font-weight: 900; /* font-black */
    color: #737373; /* text-neutral-500 */
    letter-spacing: -0.025em; /* tracking-tight */
    transition: color 0.15s;
  }

  &.active {
    .check-box {
      background: $accent; /* bg-primary-500 */
      border-color: $accent; /* border-primary-500 */
      /* ring-4 ring-primary-50 */
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 0 0 4px #f0fdfa;
    }
    .module-text {
      color: #0d9488; /* text-primary-600 */
    }
  }
  &:hover:not(.active) .check-box {
    border-color: #2dd4bf; /* group-hover:border-primary-400 */
  }
}
.lock-hint {
  font-size: 10px; /* text-[10px] */
  font-style: italic;
  font-weight: 500;
  color: #a3a3a3; /* text-neutral-400 */
}

/* ===== 推荐牛人 配置区域：外层提供 dotted 顶部分隔线（跟"模块勾选行"分开） ===== */
.recommend-section {
  padding-top: 16px;
  border-top: 1px dotted #e5e7eb;
  overflow: hidden; /* 收起时 max-height 配合 overflow 才能裁剪内部 config-card */
}

/*
  <Transition name="rec-slide"> 的进入/离开动画
    收起：opacity → 0，max-height → 0，padding-top → 0，border 消失
    展开：反之
  max-height 给 600px 足够容纳 config-card（行 1 + 行 2 + schedule-info）
*/
.rec-slide-enter-active,
.rec-slide-leave-active {
  transition: opacity 0.22s ease, max-height 0.28s cubic-bezier(0.2, 0.8, 0.4, 1),
    padding-top 0.22s ease, border-top-color 0.18s ease, transform 0.22s ease;
  will-change: opacity, max-height, padding-top, transform;
}
.rec-slide-enter-from,
.rec-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  border-top-color: transparent;
  transform: translateY(-4px);
}
.rec-slide-enter-to,
.rec-slide-leave-from {
  opacity: 1;
  max-height: 600px;
  padding-top: 16px;
  border-top-color: #e5e7eb;
  transform: translateY(0);
}

/* ===== 推荐牛人 配置卡片（青色背景，外层 recommend-section 已经提供分隔线） ===== */
.config-card {
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
    border-color: #2dd4bf; /* teal-400，与 $accent 浅 10% 等价；避免用已弃用的 lighten() */
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

/* ===== 底部 CTA：启动聚合搜索（自带 dotted 顶部分隔线） ===== */
.bottom-action {
  padding-top: 16px;
  border-top: 1px dotted #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bottom-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 调试 / 测试用按钮：查看结果（切到 results 视图） */
.view-results-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed #d4d4d8;
  border-radius: 10px;
  background: #fff;
  color: #737373;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.view-results-btn:hover {
  border-color: $accent;
  color: $accent;
  background: #f0fdfa;
}
.bottom-hint {
  margin: 0;
  font-size: 11px;
  font-style: italic;
  color: #a1a1aa;
}
.aggregate-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(90deg, #15b8a6 0%, #2dd4bf 50%, #14b8a6 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: -0.01em;
  cursor: pointer;
  box-shadow: 0 8px 16px -4px rgba(20, 184, 166, 0.35);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.aggregate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px -4px rgba(20, 184, 166, 0.5);
}
.aggregate-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.aggregate-btn:disabled {
  background: #d4d4d8;
  box-shadow: none;
  cursor: not-allowed;
}
.aggregate-icon {
  flex-shrink: 0;
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
