<!--
  TaskCompletionCard.vue

  渲染 "该职位聚合搜索已全部完成" 卡片（messageType=TASK_COMPLETION_CARD）。

  设计：
    - 本组件是**纯渲染器**：接收完整的 HTML 字符串 props.html，v-html 渲染，
      同时挂 click 代理处理按钮 action（data-action 协议）
    - 不做模板替换 / 数据 → HTML 转换。这些工作在外面完成：
        · 后端 SSE / chatHistory：直接推完整 HTML 字符串作为 message.content
        · 前端 mock 测试：用 src/util/taskCompletionTemplate.js 的 renderTaskCompletionTemplate(cardData) 生成 html

  统一的好处：
    - SSE 推过来的 / chatHistory 拉回来的 / mock 出来的，都走同一个 props.html 入口
    - 单一职责：组件只管"画"，不管数据怎么来
    - 模板源 task-completion-card.html 也是发给后端的字符串，前后端共用一份

  按钮 action 协议（data-action 值 → 前端事件分发）：
    "view-result"         → emit('view-result',         { actionCode, html, cardData })
    "clear-and-restart"   → emit('clear-and-restart',   { actionCode, html, cardData })
    "keep-and-increment"  → emit('keep-and-increment',  { actionCode, html, cardData })
    其它 actionCode       → emit('unknown-action',      { actionCode, html, cardData })

  cardData 通过模板根 div 的 `data-*` 属性提取得到（后端用 mustache 把 {{taskId}} /
  {{taskChannelId}} 等占位填进去），包含：
    { taskId, taskChannelId, taskChannelIds, searchConditionId, searchConditionIds, chatId,
      messageType, resultSetId? }
  消费端（IndexPage）拿到 cardData 后调 /search/resultSet/query 拉任务级结果集渲染。
-->
<template>
  <div
    ref="wrapRef"
    :class="['task-completion-card-wrap', showRetryActions ? '' : 'hide-retry-actions']"
    @click="onActionClick"
    v-html="html"
  ></div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  /**
   * 完整 HTML 字符串。来源：
   *   - SSE 推过来的 message.content（后端已用 mustache 替换好占位）
   *   - chatHistory 拉回的历史消息 content
   *   - mock 测试时，用 util.renderTaskCompletionTemplate(cardData) 生成
   */
  html: { type: String, default: "" },
  /**
   * 是否显示"清空重新搜索 / 保留增量搜索"两个再发起按钮。
   *
   * 只有聊天里**最新**的那张完成卡才显示（=true）；历史完成卡只保留"查看结果"，
   * 隐藏再发起按钮（避免用户对旧任务误触发重新搜索）。由 ChatCard 计算后传入。
   * "查看结果"按钮不受影响（任何完成卡都能查看对应结果）。
   */
  showRetryActions: { type: Boolean, default: true }
});

const emit = defineEmits([
  "view-result",
  "clear-and-restart",
  "keep-and-increment",
  // 兜底：data-action 是未识别的 code 时抛 unknown-action，让上层决定是否警告/降级
  "unknown-action"
]);

const wrapRef = ref(null);

/**
 * 从模板根 div 的 data-* 属性提取本卡片携带的任务上下文。
 *
 * 模板根 div 有 data-task-id / data-task-channel-id / data-task-channel-ids /
 * data-search-condition-id / data-search-condition-ids / data-chat-id / data-message-type
 * 等属性（后端 mustache 已用真实值替换占位）。
 *
 * 返回值会作为 payload.cardData 一起 emit，让消费端能调
 * `/search/resultSet/query` 拉任务级结果集（按 chatId 或 resultSetId 查询）。
 */
function extractCardDataFromDom() {
  const wrap = wrapRef.value;
  if (!wrap) return {};
  // 模板根 div 是 wrap 的第一个有 data-message-type 的子节点
  const root =
    wrap.querySelector("[data-message-type]") ||
    wrap.firstElementChild ||
    null;
  if (!root || !root.dataset) return {};
  const ds = root.dataset;
  // dataset 字段名是 camelCase（data-task-id → ds.taskId）
  const pick = (v) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    if (!s || s === "{{}}" || /^\{\{.+\}\}$/.test(s)) return undefined;
    return s;
  };
  return {
    taskId: pick(ds.taskId),
    taskChannelId: pick(ds.taskChannelId),
    taskChannelIds: pick(ds.taskChannelIds),
    // 搜索 / 推荐 渠道 taskChannelId（后端按 businessChannel 拆开填）。
    // 用于「清空重新搜索 / 保留增量搜索」复原原任务的渠道构成（有搜索才搜、有推荐才推荐），
    // 不依赖前端 SearchTasks store（历史卡 / 刷新后 store 里可能查不到原任务）。
    searchTaskChannelId: pick(ds.searchTaskChannelId),
    searchTaskChannelIds: pick(ds.searchTaskChannelIds),
    recommendTaskChannelId: pick(ds.recommendTaskChannelId),
    recommendTaskChannelIds: pick(ds.recommendTaskChannelIds),
    searchConditionId: pick(ds.searchConditionId),
    searchConditionIds: pick(ds.searchConditionIds),
    chatId: pick(ds.chatId),
    resultSetId: pick(ds.resultSetId), // 后端如果加了这个占位，自动拿到；没有也不报错
    messageType: pick(ds.messageType)
  };
}

/**
 * Click 事件代理。从触发节点向上找最近的 [data-action] 元素，
 * 把 actionCode 翻译成对应 emit 事件。
 *
 * 之所以代理而不是逐个按钮绑事件：HTML 是 v-html 注入的，Vue 不会编译里面的 @click，
 * 只能靠原生事件冒泡 + closest 选择器拿。
 *
 * 业务层（ChatCard / IndexPage）负责具体的事件响应（切视图 / 调接口 / 等等）。
 */
function onActionClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== "function") return;
  const trigger = target.closest("[data-action]");
  if (!trigger) return;

  const actionCode = trigger.getAttribute("data-action");
  if (!actionCode) return;

  event.preventDefault?.();
  event.stopPropagation?.();

  const cardData = extractCardDataFromDom();
  const payload = { actionCode, html: props.html, cardData };
  switch (actionCode) {
    case "view-result":
      emit("view-result", payload);
      return;
    case "clear-and-restart":
      emit("clear-and-restart", payload);
      return;
    case "keep-and-increment":
      emit("keep-and-increment", payload);
      return;
    default:
      console.warn(`[TaskCompletionCard] 未知 actionCode=${actionCode}`);
      emit("unknown-action", payload);
  }
}
</script>

<style scoped>
.task-completion-card-wrap {
  width: 100%;
}

/*
 * 历史完成卡隐藏"清空重新搜索 / 保留增量搜索"两个再发起按钮（只保留"查看结果"）。
 * HTML 由 v-html 注入，用 :deep() 才能命中卡片内部的 data-action 元素。
 */
.hide-retry-actions :deep([data-action="clear-and-restart"]),
.hide-retry-actions :deep([data-action="keep-and-increment"]) {
  display: none !important;
}
</style>
