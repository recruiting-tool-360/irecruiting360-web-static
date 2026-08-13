<!--
  TaskResultsView.vue

  TaskCompletionCard 点"查看结果"后渲染任务级查询结果。

  数据来源：handleViewResults 调 /search/task/results/query 后**已经按 channelSubType 分组**，
  传进来的 props.results.grouped 形态：
    {
      ALL:    [...all],
      BOSS:   [...],
      ZHILIAN: [...],
      JOB51:  [...],
      LIEPIN: [...]
    }

  本组件**跟原来的 AISearch 数据流完全隔离**：不读 ChannelConfig，不写任何 store。
  tab 切换 = `props.results.grouped[activeTabKey]`，无 filter。

  Tab 视觉跟原 AISearch 顶部 q-tabs 保持一致（同一套 q-tab + q-avatar）。
-->
<template>
  <div class="task-results-view">
    <!-- tab 头：复用 AISearch 的 q-tabs 样式 -->
    <q-tabs
      v-model="activeTabKey"
      dense
      inline-label
      no-caps
      class="channel-tabs bg-white text-grey-9 text-bold shadow-2 flex justify-lg-start"
      active-color="primary"
      align="left"
      indicator-color="primary"
      :breakpoint="0"
    >
      <q-tab
        v-for="tab in tabs"
        :key="tab.key"
        :name="tab.key"
        class="channel-tab"
      >
        <!-- 渠道聚合：蓝色圆形 + 首字母；其他渠道：logo -->
        <q-avatar
          v-if="tab.key === 'ALL'"
          size="sm"
          color="primary"
          text-color="white"
          class="q-mr-sm"
        >渠</q-avatar>
        <q-avatar v-else size="xs" color="white" text-color="primary" class="q-mr-sm">
          <img :src="tab.logo" />
        </q-avatar>
        <span class="text-subtitle2">{{ tab.label }}</span>
        <q-badge v-if="tab.count > 0" color="red-5" floating>{{ tab.count }}</q-badge>
      </q-tab>
    </q-tabs>

    <!-- 卡片列表 -->
    <div v-if="!activeList || activeList.length === 0" class="trv-empty">
      <q-avatar square size="100px">
        <img src="/image/notData.png" />
      </q-avatar>
      <div class="trv-empty-text">该渠道暂无数据</div>
    </div>

    <div v-else class="trv-list">
      <!--
        ⚠️ 不要再传 read-only=true！
          read-only 原本是为 RecommendList（BOSS 推荐牛人匿名 id = encryptGeekId，
          i 人事后端不认识）保守 disable 所有联动按钮。
          任务级查询结果（/search/task/results/query）返回的是真实 ResumeBlindVO 投影
          + taskResumeId，跟老 AISearch 的简历数据形态完全一致，"分配职位 / 加入人才库 /
          相似简历 / 立即沟通" 这一套联动逻辑可以直接走通（ResumeCard 内部 assignJob /
          addToTalentPool 自包含，只依赖 resume.id 和 store 里的 planInfo）。
        @updateCollectResumeLoading 透传给 IndexPage 维持 loading 提示能力（可选）
      -->
      <ResumeCard
        v-for="item in activeList"
        :key="item.taskResumeId || item.id"
        :resume="item"
        :is-read="!!item.isRead"
        :tab-str="activeTabLabel"
        :search-condition-id-override="item.searchConditionId || null"
        @updateCollectResumeLoading="(v) => emit('update-loading', v)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import ResumeCard from 'src/components/resume/ResumeCard.vue';

const props = defineProps({
  /** { grouped: { ALL, BOSS, ZHILIAN, ... }, taskId, totalCount, fetchedAt } */
  results: { type: Object, required: true }
});

const emit = defineEmits([
  // 透传 ResumeCard.updateCollectResumeLoading（加入人才库 / 分配职位时的 loading 切换）
  // IndexPage 可选监听用于全局 loading UI；未监听也不影响功能。
  'update-loading'
]);

/**
 * tab 顺序：渠道聚合 → BOSS → 智联 → 51 → 猎聘
 * logo 跟 ChannelConfig store 里的渠道 logo 保持一致
 */
const TAB_DEFS = [
  { key: 'ALL',     label: '渠道聚合' },
  { key: 'BOSS',    label: 'BOSS直聘',  logo: '/index/header/searchPage/boss.ico' },
  { key: 'ZHILIAN', label: '智联招聘',  logo: '/index/header/searchPage/zhilian.svg' },
  { key: 'JOB51',   label: '前程无忧',  logo: '/index/header/searchPage/job51.svg' },
  { key: 'LIEPIN',  label: '猎聘',     logo: '/index/header/searchPage/liepin.svg' }
];

/**
 * 从已分好组的 grouped 里反查 tabs：
 *   - ALL 永远显示
 *   - 其他渠道只在 grouped[key]?.length > 0 时显示
 */
const tabs = computed(() => {
  const grouped = props.results?.grouped || {};
  return TAB_DEFS
    .filter((t) => t.key === 'ALL' || (grouped[t.key]?.length || 0) > 0)
    .map((t) => ({ ...t, count: grouped[t.key]?.length || 0 }));
});

const activeTabKey = ref('ALL');
const activeTabLabel = computed(() => {
  const t = tabs.value.find((x) => x.key === activeTabKey.value);
  return t?.label || '渠道聚合';
});

/** 直接按 key 取，不 filter */
const activeList = computed(() => {
  return props.results?.grouped?.[activeTabKey.value] || [];
});
</script>

<style scoped lang="scss">
.task-results-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

/* 跟 AISearch.vue 顶部 channel-tab 样式对齐 */
.channel-tabs {
  width: 100%;
}

.channel-tab {
  transition: all 0.3s;
  position: relative;
}

.channel-tab :deep(.q-tab__label) {
  font-size: 14px;
}

.channel-tab:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.trv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #999;
}

.trv-empty-text {
  margin-top: 12px;
  font-size: 14px;
}

.trv-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
