<!--
  客户端工作台容器（右侧大白卡片）

  1:1 对照 ihraisaas/src/App.tsx 第 958-1020 行：
    - 外层 wrapper：flex-1 border-l border-neutral-100 flex flex-col overflow-hidden
    - 灰底 padding 容器：flex-1 flex flex-col p-6 bg-[#f0f2f5] overflow-hidden
    - 白色大卡片：flex-1 bg-white rounded-2xl shadow-xl border border-neutral-100 flex flex-col overflow-hidden relative

  顶部：workspace-toolbar（h-12 + bg-white/50 + backdrop-blur-md + border-b border-neutral-50）
    左：职位名 h2 + code badge
    右：触发失败 / 清空对话（条件渲染）

  主体：default slot —— 调用方放 ChatCard / AISearch（view 互斥切换由调用方控制）
-->
<template>
  <div class="workspace-outer">
    <div class="workspace-padding">
      <div class="workspace-card">
        <!--
          Workspace Toolbar
          1:1 对照 ihraisaas/src/components/layout/ClientLayout.tsx 第 284-345 行
          左：title + code badge + "同步已就绪" 绿色 badge（autoSearchCompleted 时显示）
          右：触发失败（白底带边）+ 刷新 圆形按钮
        -->
        <div class="workspace-toolbar">
          <div class="toolbar-left">
            <h2 class="toolbar-title">{{ title || 'AI 聚合控制台' }}</h2>
            <template v-if="code">
              <span class="toolbar-job-code">{{ code }}</span>
              <span v-if="autoSearchCompleted" class="toolbar-sync-ready">
                <span class="dot"></span>
                <span>同步已就绪</span>
              </span>
            </template>
          </div>
          <div class="toolbar-right">
            <slot name="toolbar-right">
              <!-- 触发失败 / 锁定失败：1:1 对照 ihraisaas 第 305-316 行 -->
              <button
                v-if="showFailButton"
                type="button"
                class="tb-action-btn"
                :class="{ 'tb-action-active': simulateFail }"
                @click="$emit('toggle-simulate-fail')"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" :fill="simulateFail ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
                </svg>
                <span>{{ simulateFail ? '锁定失败' : '触发失败' }}</span>
              </button>
              <!-- 刷新按钮（圆形，ihraisaas 第 317-326 行：RefreshCcw + p-2 hover:bg-neutral-100 rounded-xl） -->
              <button
                v-if="showClearChat"
                type="button"
                class="tb-icon-btn"
                title="清空当前对话"
                @click="$emit('clear-chat')"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              </button>
            </slot>
          </div>
        </div>

        <!-- 主体（view 切换由调用方通过 v-show 控制） -->
        <div class="workspace-body">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  /** 顶部标题（一般是职位名），空时回退到 'AI 聚合控制台' */
  title: { type: String, default: '' },
  /** 标题旁的代码 badge */
  code: { type: String, default: '' },
  /** 同步已就绪状态（绿色 badge）—— 对应 ihraisaas selectedJob.isAutoSearchCompleted */
  autoSearchCompleted: { type: Boolean, default: false },
  /** 是否显示"触发失败"按钮 */
  showFailButton: { type: Boolean, default: false },
  /** 是否显示"清空对话"按钮（一般 view='chat' 且有消息时显示） */
  showClearChat: { type: Boolean, default: false },
  /** 触发失败按钮的激活状态 */
  simulateFail: { type: Boolean, default: false }
});

defineEmits(['clear-chat', 'toggle-simulate-fail']);
</script>

<style scoped lang="scss">
/* ===== 外层结构（1:1 ihraisaas App.tsx 958-960） ===== */
.workspace-outer {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* border-l 在 q-drawer 已经提供右边线，这里不重复 */
}
.workspace-padding {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px; /* p-6 */
  background: #f0f2f5;
  overflow: hidden;
}
.workspace-card {
  flex: 1;
  background: #fff;
  border-radius: 16px; /* rounded-2xl = 1rem (16px) Tailwind v4 default */
  /* ihraisaas 在 index.css @theme 里把 --color-neutral-100 设为 #F3F4F6 */
  border: 1px solid #f3f4f6;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 8px 10px -6px rgba(0, 0, 0, 0.1); /* Tailwind v4 默认 shadow-xl 第二段是 0.1（不是 0.05） */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ===== Workspace Toolbar（1:1 ihraisaas App.tsx 975） ===== */
.workspace-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #fafafa;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.toolbar-title {
  margin: 0;
  font-size: 14px;
  font-weight: 900;
  color: #262626;
  letter-spacing: -0.025em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toolbar-job-code {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 2px 8px;
  background: #f3f4f6; /* bg-neutral-100 (ihraisaas index.css) */
  color: #6b7280; /* text-neutral-500 */
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  line-height: 1.4;
  flex-shrink: 0;
}

/* "同步已就绪" badge：text-[9px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-black + 圆点 */
.toolbar-sync-ready {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: #f0fdf4; /* bg-green-50 */
  color: #16a34a; /* text-green-600 */
  border-radius: 9999px; /* rounded-full */
  font-size: 9px;
  font-weight: 900;
  flex-shrink: 0;
  line-height: 1.4;
  .dot {
    width: 6px;
    height: 6px;
    background: #22c55e; /* green-500 */
    border-radius: 50%;
    display: inline-block;
  }
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 触发失败 按钮 */
.tb-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 900;
  color: #737373;
  margin-right: 8px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.tb-action-btn:hover {
  border-color: #93c5fd;
}
.tb-action-btn.tb-action-active {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 0 0 2px #fee2e2;
}

/* 刷新 / 清空对话 圆形 icon 按钮：1:1 对照 ihraisaas line 319-323
   p-2 hover:bg-neutral-100 rounded-xl text-neutral-400 hover:text-red-500 */
.tb-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  border-radius: 12px; /* rounded-xl = 12px */
  color: #9ca3af; /* text-neutral-400 */
  cursor: pointer;
  transition: all 0.15s;
}
.tb-icon-btn:hover {
  background: #f3f4f6; /* bg-neutral-100 */
  color: #ef4444; /* text-red-500 */
}

/* ===== 主体 ===== */
.workspace-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #fff;
}
</style>
