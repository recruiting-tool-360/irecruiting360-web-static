<!--
  聚合搜索执行进度卡片

  1:1 对照 ihraisaas/src/components/AIAssistant/Chat/ExecutionLog.tsx
  step.status:
    - 'complete'  : 已完成（青色实心圆 + 加粗深色文字）
    - 'processing': 进行中（浅青色脉冲 + 青色深色字）
    - 'pending'   : 等待（灰色圆 + 浅灰字）
    - 'skipped'   : 跳过（同 pending）

  data.isStopped: 整个流程被用户中断 → 已停止角标，进行中 step 不再脉冲

  常见用法（搜索牛人 / 推荐牛人）：
    content: '搜索牛人数据获取流程'
    steps: [
      { title: '正在分析画像关键词...', status: 'complete' },
      ...
    ]
-->
<template>
  <div class="execution-log">
    <!-- Header：标题 + Loader / CheckCircle -->
    <div class="exec-header">
      <span class="exec-title">
        <svg
          class="exec-loader"
          :class="{ spinning: isProcessing }"
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        {{ content }}
      </span>
      <!-- 全部完成：✓ -->
      <svg
        v-if="isAllComplete"
        class="exec-check"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21.801 10A10 10 0 1 1 17 3.335" />
        <path d="m9 11 3 3L22 4" />
      </svg>
      <!-- 中断：已中断 -->
      <span v-else-if="data?.isStopped" class="exec-stopped">已中断</span>
    </div>

    <!-- 竖排步骤列表（左侧有一条灰色 rail） -->
    <div class="exec-steps">
      <div class="exec-rail"></div>
      <div v-for="(step, idx) in steps" :key="idx" class="exec-step">
        <div
          class="exec-dot"
          :class="{
            'dot-complete': step.status === 'complete',
            'dot-processing': step.status === 'processing' && !data?.isStopped,
            'dot-pending':
              step.status !== 'complete' && (step.status !== 'processing' || data?.isStopped)
          }"
        ></div>
        <span
          class="exec-step-text"
          :class="{
            'text-complete': step.status === 'complete',
            'text-processing': step.status === 'processing' && !data?.isStopped,
            'text-pending':
              step.status !== 'complete' && (step.status !== 'processing' || data?.isStopped)
          }"
        >
          {{ step.title }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  /** 卡片顶部标题（如 "搜索牛人数据获取流程"） */
  content: { type: String, required: true },
  /** 步骤数组 */
  steps: {
    type: Array,
    default: () => [],
    validator: (arr) =>
      Array.isArray(arr) &&
      arr.every(
        (s) =>
          s &&
          typeof s.title === "string" &&
          ["complete", "processing", "pending", "skipped"].includes(s.status)
      )
  },
  /** 额外数据（isStopped 等） */
  data: { type: Object, default: () => ({}) }
});

const isProcessing = computed(
  () =>
    Array.isArray(props.steps) &&
    props.steps.some((s) => s.status === "processing") &&
    !props.data?.isStopped
);

const isAllComplete = computed(
  () =>
    Array.isArray(props.steps) &&
    props.steps.length > 0 &&
    props.steps.every((s) => s.status === "complete")
);
</script>

<style scoped lang="scss">
$accent-500: #14b8a6;
$accent-600: #0d9488;
$accent-300: #5eead4;

/*
  外壳（背景 / 边框 / 圆角 / 阴影 / padding）由父级 .chat-message-bubble 统一提供，
  跟 ihraisaas/src/components/AIAssistant/Chat/MessageItem.tsx 一致
  （bubble 内直接渲染 ExecutionLog，子组件不重复加外壳）。
*/
.execution-log {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.exec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.exec-title {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 900;
  color: #a3a3a3; /* neutral-400 */
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.exec-loader {
  margin-right: 6px;
  color: #d4d4d8;
  transition: color 0.2s;
}
.exec-loader.spinning {
  color: $accent-500;
  animation: exec-spin 1s linear infinite;
}
@keyframes exec-spin {
  to {
    transform: rotate(360deg);
  }
}

.exec-check {
  color: $accent-500;
}

.exec-stopped {
  font-size: 8px;
  background: #f5f5f5;
  color: #a3a3a3;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
}

/* ===== 步骤列表 ===== */
.exec-steps {
  position: relative;
  padding-left: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.exec-rail {
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: #f5f5f5;
  border-radius: 9999px;
}

.exec-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.exec-dot {
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 50%;
  z-index: 10;
  transition: all 0.5s;
  flex-shrink: 0;
}
.dot-complete {
  background: $accent-500;
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(21, 184, 166, 0.4);
}
.dot-processing {
  background: $accent-300;
  animation: exec-pulse 1.5s ease-in-out infinite;
}
.dot-pending {
  background: #e5e7eb; /* neutral-200 */
}
@keyframes exec-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.15);
  }
}

.exec-step-text {
  font-size: 11px;
  line-height: 1.5;
  transition: color 0.3s;
  white-space: nowrap; /* 一行显示完整，跟 ihraisaas 视觉一致 */
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.text-complete {
  color: #404040; /* neutral-700 */
  font-weight: 700;
}
.text-processing {
  color: $accent-600;
  font-weight: 900;
}
.text-pending {
  color: #a3a3a3; /* neutral-400 */
  font-weight: 500;
}
</style>
