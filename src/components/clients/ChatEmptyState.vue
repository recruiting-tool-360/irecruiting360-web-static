<!--
  聊天空状态卡片

  1:1 对照 ihraisaas/src/components/AIAssistant/Chat/ChatEmptyState.tsx
  当用户没选中任何职位时（client/嵌入式模式下）显示，引导用户从左侧列表选职位。
-->
<template>
  <div class="chat-empty-state">
    <!-- BrainCircuit 大图标圆角方框 -->
    <div class="empty-icon-box">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        width="40"
        height="40"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
        <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
        <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
        <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
        <path d="M6 18a4 4 0 0 1-1.967-.516" />
        <path d="M19.967 17.484A4 4 0 0 1 18 18" />
      </svg>
    </div>

    <h3 class="empty-title">你好，我是你的 AI 招聘助理</h3>
    <p class="empty-desc">
      {{
        selectedJob
          ? `当前已选择 ${selectedJob.name || selectedJob.title}。你可以发送指令让我修改职位画像，或者直接启动全网聚合搜索任务。`
          : '你可以发送指令让我修改职位画像、调整搜索策略，或者直接启动全网聚合搜索任务。'
      }}
    </p>

    <!-- 未选中职位：黄色警告卡片 -->
    <div v-if="!selectedJob" class="empty-warning">
      <p class="warning-text">⚠️ 请先从左侧列表选择一个职位开始</p>
    </div>

    <!-- 已选职位时：渲染 CTA 按钮（slot 供调用方传入业务） -->
    <slot v-else name="cta" />
  </div>
</template>

<script setup>
defineProps({
  /** 当前选中的职位（chat 对象），无则显示"请先选择"提示 */
  selectedJob: { type: Object, default: null }
});
</script>

<style scoped lang="scss">
.chat-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 500px;
  text-align: center;
  padding: 0 40px; /* px-10 */
}

/* 1:1 对照 ihraisaas：w-20 h-20 bg-primary-100 rounded-[2rem] shadow-inner */
.empty-icon-box {
  width: 80px;
  height: 80px;
  background: #ccfbf1; /* primary-100 (teal-100 ish) */
  border-radius: 32px; /* 2rem */
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px; /* mb-8 */
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05); /* shadow-inner */
}
.empty-icon {
  color: #0d9488; /* text-primary-600 */
  animation: empty-icon-pulse 2s ease-in-out infinite;
}
@keyframes empty-icon-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* text-xl font-black text-neutral-800 mb-3 tracking-tight */
.empty-title {
  margin: 0 0 12px 0;
  font-size: 20px;
  font-weight: 900;
  color: #1f2937; /* neutral-800 */
  letter-spacing: -0.025em;
}

/* text-neutral-500 text-sm max-w-sm mb-12 leading-relaxed */
.empty-desc {
  margin: 0 0 48px 0;
  font-size: 14px;
  color: #6b7280; /* neutral-500 */
  max-width: 384px; /* max-w-sm */
  line-height: 1.625; /* leading-relaxed */
}

/* bg-amber-50 border border-amber-200 p-4 rounded-xl mb-12 */
.empty-warning {
  background: #fffbeb; /* amber-50 */
  border: 1px solid #fde68a; /* amber-200 */
  padding: 16px;
  border-radius: 12px; /* rounded-xl */
  margin-bottom: 48px;
}
.warning-text {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #b45309; /* amber-700 */
}
</style>
