<!--
  AI 职位画像深度解析 - 卡片（结构化 1:1 复刻 ihraisaas）

  外层 wrapper class（按用户给定，等价 Tailwind）：
    p-4 rounded-2xl shadow-sm relative w-full bg-white border border-neutral-100 text-neutral-700

  内部布局参考 ihraisaas/src/components/AIAssistant/ChatPanel.tsx 第 902-1042 行：
    - Basic Info Rows：2 列 grid，职位 / 工作地点 / 工作经验 / 学历要求；薪资范围 col-span-2，等宽字体 primary 色
    - Tags 三组：专业技能（蓝）/ 软实力要求（绿）/ 相关经历（黄）
    - 底部 default slot 给 ActionPanel 用（搜索牛人/推荐牛人 + 配置卡片）

  入参 profile 形态见 src/util/parseAISearchJD.js 返回值
-->
<template>
  <div class="ai-profile-card">
    <!-- Header：标题 + 复制 / 编辑（1:1 对照 ihraisaas ChatPanel.tsx 874-887） -->
    <div class="profile-header">
      <div class="header-title">
        <!-- Sparkles (lucide) - w-5 h-5 (20px) text-primary-600 -->
        <svg
          class="header-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
        <span class="header-text">AI 职位画像深度解析</span>
      </div>
      <div class="header-actions">
        <button class="hdr-btn" type="button" @click="$emit('copy')">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          <span>复制</span>
        </button>
        <button class="hdr-btn" type="button" @click="$emit('edit')">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          <span>编辑</span>
        </button>
      </div>
    </div>

    <!-- Basic Info Rows -->
    <div class="basic-info">
      <div class="bi-cell">
        <p class="bi-label">职位：</p>
        <p class="bi-value">{{ profile.position || '—' }}</p>
      </div>
      <div class="bi-cell">
        <p class="bi-label">工作地点：</p>
        <p class="bi-value">{{ profile.location || '—' }}</p>
      </div>
      <div class="bi-cell">
        <p class="bi-label">工作经验：</p>
        <p class="bi-value">{{ profile.experience || '—' }}</p>
      </div>
      <div class="bi-cell">
        <p class="bi-label">学历要求：</p>
        <p class="bi-value">{{ profile.education || '—' }}</p>
      </div>
      <div class="bi-cell bi-col-span-2">
        <p class="bi-label">薪资范围：</p>
        <p class="bi-value bi-salary">{{ profile.salary || '—' }}</p>
      </div>
    </div>

    <!-- Tags -->
    <div class="tags-section">
      <div class="tag-group">
        <p class="tag-label">
          <!-- BrainCircuit (lucide) -->
          <svg class="tag-label-icon tag-icon-blue" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
          </svg>
          专业技能
        </p>
        <div class="tag-list">
          <span
            v-for="(s, i) in profile.skills || []"
            :key="`sk-${i}`"
            class="tag-chip tag-chip-blue"
          >{{ s }}</span>
        </div>
      </div>

      <div class="tag-group">
        <p class="tag-label">
          <!-- CheckCircle2 (lucide) -->
          <svg class="tag-label-icon tag-icon-emerald" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.801 10A10 10 0 1 1 17 3.335" />
            <path d="m9 11 3 3L22 4" />
          </svg>
          软实力要求
        </p>
        <div class="tag-list">
          <span
            v-for="(s, i) in profile.softSkills || []"
            :key="`ss-${i}`"
            class="tag-chip tag-chip-emerald"
          >{{ s }}</span>
        </div>
      </div>

      <div class="tag-group">
        <p class="tag-label">
          <!-- Plus (lucide) -->
          <svg class="tag-label-icon tag-icon-amber" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          相关经历
        </p>
        <div class="tag-list">
          <span
            v-for="(s, i) in profile.relatedExperience || []"
            :key="`re-${i}`"
            class="tag-chip tag-chip-amber"
          >{{ s }}</span>
        </div>
      </div>
    </div>

    <!-- ActionPanel slot：搜索牛人 / 推荐牛人 + 配置卡片 -->
    <slot name="action" />
  </div>
</template>

<script setup>
defineProps({
  /** parseAISearchJD 的返回值 */
  profile: {
    type: Object,
    required: true
  }
});
defineEmits(['copy', 'edit']);
</script>

<style scoped lang="scss">
/* p-4 rounded-2xl shadow-sm relative w-full bg-white border border-neutral-100 text-neutral-700 */
.ai-profile-card {
  position: relative;
  width: 100%;
  padding: 16px;
  background: #fff;
  border: 1px solid #f5f5f5;
  border-radius: 16px;
  color: #404040;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 20px; /* 等价 space-y-5 */
  font-size: 12px;
  line-height: 1.5;
}

/* ===== Header（对照 ihraisaas ChatPanel.tsx 874-887） ===== */
.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* mb-2：但外层 .ai-profile-card 用 gap: 20px 接管，这里不再独立加 margin */
}
.header-title {
  display: flex;
  align-items: center;
  gap: 8px; /* space-x-2 */
  color: #0d9488; /* text-primary-600 (teal-600) */
}
.header-icon {
  color: inherit; /* 跟随 .header-title 的 #0d9488 */
  flex-shrink: 0;
}
.header-text {
  font-size: 14px; /* text-sm */
  font-weight: 900; /* font-black */
  letter-spacing: -0.025em; /* tracking-tight */
  font-style: italic; /* italic */
  text-transform: uppercase; /* uppercase（中文不受影响，英文/数字大写） */
  color: inherit; /* #0d9488 */
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px; /* space-x-2 */
}
.hdr-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px; /* mr-1 on icon */
  padding: 4px 8px; /* px-2 py-1 */
  border: 0;
  background: transparent;
  border-radius: 4px; /* rounded */
  font-size: 10px; /* text-[10px] */
  font-weight: 700; /* font-bold */
  color: #737373; /* text-neutral-500 */
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  line-height: 1;
}
.hdr-btn:hover {
  background: #f0fdfa; /* bg-primary-50 (teal-50) */
  color: #14b8a6; /* text-primary-500 */
}
.hdr-btn svg {
  flex-shrink: 0;
}

/* ===== Basic Info ===== */
.basic-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  row-gap: 16px;
  column-gap: 32px;
  padding: 0 4px;
}
.bi-cell {
  min-width: 0;
}
.bi-col-span-2 {
  grid-column: span 2;
}
.bi-label {
  font-size: 12px;
  font-weight: 700;
  color: #262626; /* neutral-800 */
  margin: 0 0 4px 0;
}
.bi-value {
  font-size: 12px;
  color: #525252; /* neutral-600 */
  margin: 0;
  word-break: break-word;
}
.bi-salary {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #0d9488; /* primary-600 (teal-600) */
  font-weight: 700;
}

/* ===== Tags ===== */
.tags-section {
  display: flex;
  flex-direction: column;
  gap: 16px; /* space-y-4 */
}
.tag-group {
  min-width: 0;
}
.tag-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 900;
  color: #a3a3a3; /* neutral-400 */
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 8px 0;
}
.tag-label-icon {
  flex-shrink: 0;
}
.tag-icon-blue {
  color: #3b82f6;
}
.tag-icon-emerald {
  color: #10b981;
}
.tag-icon-amber {
  color: #f59e0b;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-chip {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}
.tag-chip-blue {
  background: #eff6ff; /* blue-50 */
  border: 1px solid #dbeafe; /* blue-100 */
  color: #2563eb; /* blue-600 */
}
.tag-chip-emerald {
  background: #ecfdf5; /* emerald-50 */
  border: 1px solid #d1fae5; /* emerald-100 */
  color: #059669; /* emerald-600 */
}
.tag-chip-amber {
  background: #fffbeb; /* amber-50 */
  border: 1px solid #fef3c7; /* amber-100 */
  color: #d97706; /* amber-600 */
}
</style>
